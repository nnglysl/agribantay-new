import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from 'vite'

test('Super Admin summary data, unchanged map and exact Staff card styles at responsive sizes', async () => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), 'agribantay-superadmin-dashboard-vite-'))
  const server = await createServer({ cacheDir, optimizeDeps: { entries: ['tests/superadmin-dashboard-browser.html'], include: ['react', 'react-dom/client', 'axios'] }, server: { host: '127.0.0.1', port: 0, hmr: false } })
  let browser, socket
  try {
    await server.listen()
    const profile = await mkdtemp(path.join(tmpdir(), 'agribantay-superadmin-dashboard-browser-'))
    browser = spawn(process.env.PHASE5_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-extensions', '--disable-background-networking', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--remote-allow-origins=*', `--user-data-dir=${profile}`, 'about:blank'],
      { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
    const endpoint = await new Promise((resolve, reject) => {
      let stderr = ''
      const timer = setTimeout(() => reject(Error('Headless browser startup timed out')), 15000)
      browser.once('error', error => { clearTimeout(timer); reject(error) })
      browser.stderr.on('data', chunk => {
        stderr += chunk.toString()
        const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)
        if (match) { clearTimeout(timer); resolve(match[1]) }
      })
    })
    const targets = await (await fetch(`http://${new URL(endpoint).host}/json/list`)).json()
    socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl)
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
    let id = 0
    const pending = new Map(), interceptionErrors = []
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const requestId = ++id
      const timeout = setTimeout(() => { pending.delete(requestId); reject(Error('DevTools timeout: ' + method)) }, 15000)
      pending.set(requestId, message => { clearTimeout(timeout); message.error ? reject(Error(JSON.stringify(message.error))) : resolve(message.result) })
      socket.send(JSON.stringify({ id: requestId, method, params }))
    })
    socket.onmessage = event => {
      const message = JSON.parse(event.data)
      if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id) }
      if (message.method === 'Fetch.requestPaused') {
        void send('Fetch.fulfillRequest', { requestId: message.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'image/svg+xml' }], body: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e9eee5"/><path d="M0 110L256 170M95 0L130 256" stroke="#d5dfce" stroke-width="14"/></svg>').toString('base64') })
          .catch(error => { if (!error.message.includes('Invalid InterceptionId')) interceptionErrors.push(error.message) })
      }
    }
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails))
      return result.result?.value
    }
    await send('Fetch.enable', { patterns: [{ urlPattern: 'https://*' }] })
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1060, deviceScaleFactor: 1, mobile: false })
    await send('Page.navigate', { url: `http://127.0.0.1:${server.httpServer.address().port}/tests/superadmin-dashboard-browser.html` })
    let result
    for (let index = 0; index < 500; index++) {
      result = await evaluate('window.superadminDashboardResults')
      if (result) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.ok(result, 'Browser fixture did not finish')
    assert.equal(result.error, undefined, JSON.stringify(result))
    assert.equal(result.passed.length, 4)
    for (const scenario of result.passed) console.log('PASS:', scenario)

    const directory = await mkdtemp(path.join(tmpdir(), 'agribantay-superadmin-dashboard-preview-'))
    const snapshot = `(() => {
      const grid = document.querySelector('.superadmin-dashboard-stats,.staff-dashboard-stats')
      const style = (element, keys) => Object.fromEntries(keys.map(key => [key, getComputedStyle(element)[key]]))
      const statCards = [...grid.children]
      const card = element => ({
        box: style(element, ['backgroundColor','backgroundImage','border','borderRadius','padding','minHeight','fontFamily','display','gap']),
        heading: style(element.querySelector('h2'), ['fontSize','fontWeight','color','lineHeight','minHeight','gap']),
        numbers: [...element.querySelectorAll('.superadmin-dashboard-stat-value,.staff-dashboard-stat-value,dd')].map(number => style(number, ['fontSize','fontWeight','lineHeight','letterSpacing','color','margin'])),
        icon: style(element.querySelector('svg'), ['width','height']),
        width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height
      })
      return { grid: style(grid, ['gridTemplateColumns','gap','marginBottom']), cards: statCards.map(card),
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        clipped: statCards.some(element => element.scrollWidth > element.clientWidth + 1),
        rows: statCards.map(element => element.getBoundingClientRect().top) }
    })()`
    for (const width of [1440, 900, 390, 320]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 1060, deviceScaleFactor: 1, mobile: width <= 768 })
      await evaluate('window.superadminDashboardPreview({role:"admin"})')
      const staff = await evaluate(snapshot)
      await evaluate('window.superadminDashboardPreview()')
      const actual = await evaluate(snapshot)
      assert.deepEqual(actual.grid, staff.grid, `${width}: match Staff grid and spacing`)
      assert.deepEqual(actual.cards, staff.cards, `${width}: match Staff card dimensions, padding, font, icons, colors and split values`)
      assert.ok(!actual.overflow && !actual.clipped, `${width}: no horizontal overflow`)
      assert.equal(actual.cards.length, 3)
      assert.equal(new Set(actual.rows).size, width > 768 ? 1 : 2, `${width}: match Staff responsive rows`)
      const map = await evaluate(`(() => { const map = document.querySelector('.leaflet-container'); const parent = map.parentElement.parentElement; const panel = parent.lastElementChild; return { height:map.getBoundingClientRect().height, beside:panel.getBoundingClientRect().left >= map.getBoundingClientRect().right - 1, summary:panel.textContent.includes('Critical Alerts') }; })()`)
      assert.equal(map.height, width <= 768 ? 320 : 520, `${width}: existing map height`)
      assert.ok(map.summary && (width <= 768 || map.beside), `${width}: existing Summary stays beside the map on desktop/tablet`)
      const layout = await send('Page.getLayoutMetrics')
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: Math.max(1060, layout.cssContentSize.height), scale: 1 } })
      await writeFile(path.join(directory, `superadmin-${width}.png`), Buffer.from(shot.data, 'base64'))
      await evaluate('window.superadminDashboardPreview({variant:"large"})')
      const large = await evaluate(snapshot)
      assert.ok(!large.overflow && !large.clipped, `${width}: growing counts stay readable`)
    }
    assert.deepEqual(interceptionErrors, [])
    console.log('PASS: exact Staff style comparison at 1440, 900, 390 and 320px; map proportions and growing counts preserved')
    console.log('Verified responsive screenshots:', directory)
  } finally {
    socket?.close()
    browser?.kill()
    await server.close()
  }
})
