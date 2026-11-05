import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from 'vite'

test('Farm Details four-tab behavior in an isolated headless browser', async () => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), 'agribantay-phase5-vite-'))
  const server = await createServer({ cacheDir, optimizeDeps: { entries: ['tests/farm-details-browser.html'], include: ['react', 'react-dom/client', 'axios'] }, server: { host: '127.0.0.1', port: 0, hmr: false } })
  await server.listen()
  const port = server.httpServer.address().port
  const profile = await mkdtemp(path.join(tmpdir(), 'agribantay-phase5-browser-'))
  const browser = spawn(process.env.PHASE5_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-extensions', '--disable-background-networking',
      '--disable-features=RendererCodeIntegrity,msEdgeSidebarV2', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
      '--remote-allow-origins=*', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
  let socket
  try {
    const endpoint = await new Promise((resolve, reject) => {
      let stderr = ''
      const timer = setTimeout(() => reject(Error('Headless browser startup timed out')), 15000)
      browser.on('error', reject)
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
    const pending = new Map()
    const interceptionErrors = []
    socket.onmessage = event => {
      const message = JSON.parse(event.data)
      if (message.method === 'Runtime.exceptionThrown') console.log('Browser exception:', JSON.stringify(message.params.exceptionDetails))
      if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id) }
      if (message.method === 'Fetch.requestPaused') {
        // Preview maps use synthetic coordinates; fulfill public assets locally.
        void send('Fetch.fulfillRequest', { requestId: message.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'image/svg+xml' }], body: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e9eee5"/><path d="M0 110L256 170M95 0L130 256" stroke="#d5dfce" stroke-width="14"/></svg>').toString('base64') })
          .catch(error => { if (!error.message.includes('Invalid InterceptionId')) interceptionErrors.push(error.message) }) // The page can cancel map tiles while switching fixtures.
      }
    }
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const requestId = ++id
      const timeout = setTimeout(() => { pending.delete(requestId); reject(Error('DevTools timeout: ' + method)) }, 15000)
      pending.set(requestId, result => { clearTimeout(timeout); result.error ? reject(Error(JSON.stringify(result.error))) : resolve(result.result) })
      socket.send(JSON.stringify({ id: requestId, method, params, ...(sessionId ? { sessionId } : {}) }))
    })
    await send('Runtime.enable')
    await send('Fetch.enable', { patterns: [{ urlPattern: 'https://*' }, { urlPattern: 'http://*.tile.openstreetmap.org/*' }] })
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1060, deviceScaleFactor: 1, mobile: false })
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/tests/farm-details-browser.html` })
    let result
    for (let i = 0; i < 550; i++) {
      const evaluation = await send('Runtime.evaluate', { expression: 'window.phase5Results', returnByValue: true, timeout: 1500 })
      result = evaluation.result?.value
      if (result) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    if (result?.error) console.log('Completed before failure:', result.passed, 'Unexpected:', result.unexpected, 'Runtime:', result.runtimeErrors)
    if (process.env.PHASE5_SCREENSHOTS === '1') {
      const directory = await mkdtemp(path.join(tmpdir(), 'agribantay-phase5-preview-'))
      await mkdir(directory, { recursive: true })
      for (const [name, width, height, options] of [
        ['overview-desktop', 1440, 1060, { tab: 'Overview' }],
        ['monitoring-desktop', 1440, 1060, { tab: 'Monitoring' }],
        ['monitoring-wide', 1920, 1080, { tab: 'Monitoring', role: 'super_admin' }],
        ['monitoring-tablet', 900, 1100, { tab: 'Monitoring' }],
        ['monitoring-sidebar-boundary', 1025, 1060, { tab: 'Monitoring' }],
        ['offline-desktop', 1440, 1060, { tab: 'Monitoring', variant: 'offline' }],
        ['partial-desktop', 1440, 1060, { tab: 'Monitoring', variant: 'partial' }],
        ['incomplete-warning-desktop', 1440, 1060, { tab: 'Monitoring', variant: 'missing-ammonia-Warning' }],
        ['compliance-desktop', 1440, 1060, { tab: 'Compliance' }],
        ['records-desktop', 1440, 1060, { tab: 'Records', role: 'super_admin' }],
        ['staff-records-desktop', 1440, 1060, { tab: 'Records' }],
        ['manure-records-desktop', 1440, 1060, { tab: 'Records', record: 'Manure Records' }],
        ['super-manure-records-desktop', 1440, 1060, { tab: 'Records', record: 'Manure Records', role: 'super_admin' }],
        ['manure-records-tablet', 900, 1100, { tab: 'Records', record: 'Manure Records' }],
        ['disposal-records-desktop', 1440, 1060, { tab: 'Records', record: 'Manure Records', recordView: 'Disposal Records' }],
        ['disposal-records-tablet', 900, 1100, { tab: 'Records', record: 'Manure Records', recordView: 'Disposal Records' }],
        ['alerts-records-desktop', 1440, 1060, { tab: 'Records', record: 'Alerts' }],
        ['inspection-records-tablet', 900, 1100, { tab: 'Records' }],
        ['monitoring-mobile', 390, 844, { tab: 'Monitoring' }],
        ['monitoring-small-mobile', 320, 844, { tab: 'Monitoring' }],
        ['offline-mobile', 390, 844, { tab: 'Monitoring', variant: 'offline' }],
        ['no-readings-mobile', 390, 844, { tab: 'Monitoring', variant: 'new-assignment' }],
        ['incomplete-critical-mobile', 390, 844, { tab: 'Monitoring', variant: 'missing-moisture-Critical' }],
        ['overview-mobile', 390, 844, { tab: 'Overview' }],
        ['compliance-mobile', 390, 844, { tab: 'Compliance' }],
        ['records-mobile', 390, 844, { tab: 'Records', role: 'super_admin' }],
        ['staff-records-small-mobile', 320, 844, { tab: 'Records' }],
        ['manure-records-mobile', 390, 844, { tab: 'Records', record: 'Manure Records' }],
        ['manure-records-small-mobile', 320, 844, { tab: 'Records', record: 'Manure Records' }],
        ['disposal-records-mobile', 390, 844, { tab: 'Records', record: 'Manure Records', recordView: 'Disposal Records' }],
        ['disposal-records-small-mobile', 320, 844, { tab: 'Records', record: 'Manure Records', recordView: 'Disposal Records' }],
        ['alerts-records-mobile', 390, 844, { tab: 'Records', record: 'Alerts' }],
        ['overview-tablet', 900, 1100, { tab: 'Overview', role: 'super_admin' }],
      ]) {
        await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 720 })
        await send('Runtime.evaluate', { expression: `window.phase5Preview(${JSON.stringify(options)})`, awaitPromise: true, returnByValue: true })
        await new Promise(resolve => setTimeout(resolve, 200))
        const layout = await send('Page.getLayoutMetrics')
        const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: Math.min(2600, Math.max(height, layout.cssContentSize.height)), scale: 1 } })
        await writeFile(path.join(directory, name + '.png'), Buffer.from(shot.data, 'base64'))
        const geometry = await send('Runtime.evaluate', { expression: '({width:innerWidth,scrollWidth:document.documentElement.scrollWidth})', returnByValue: true })
        assert.ok(geometry.result.value.scrollWidth <= width + 1, name + ' must not overflow horizontally')
        if (options.tab === 'Records') {
          const records = (await send('Runtime.evaluate', { expression: `(() => {
            const tabs = document.querySelector('.fd-subtabs')
            const navigation = document.querySelector('.fd-record-navigation')
            const heading = document.querySelector('.fd-record-heading')
            return {
              tabs: tabs.getBoundingClientRect().width,
              tabSpan: tabs.lastElementChild.getBoundingClientRect().right - tabs.firstElementChild.getBoundingClientRect().left,
              panel: document.querySelector('#farm-panel-records').getBoundingClientRect().width,
              controls: [...document.querySelectorAll('.fd-record-controls input,.fd-record-controls select,.fd-record-controls button,.agb-table-footer button,.agb-table-footer select')].map(element => { const r=element.getBoundingClientRect(); return {left:r.left,right:r.right} }),
              activePage: document.querySelector('.agb-pagination [aria-current=page]') != null,
              filtersLeft: document.querySelector('.fd-record-controls')?.getBoundingClientRect().left,
              headingRight: document.querySelector('.fd-record-heading-copy')?.getBoundingClientRect().right,
              navigationInCard: navigation?.parentElement === heading.parentElement,
              navigationBottom: navigation?.getBoundingClientRect().bottom,
              headingTop: heading.getBoundingClientRect().top
            }
          })()`, returnByValue: true })).result.value
          assert.ok(Math.abs(records.tabs - records.panel) < 1, name + ': neutral navigation surface spans the panel')
          if (width > 720) assert.ok(records.tabSpan < records.panel * .8, name + ': secondary tabs stay compact and left-aligned')
          if (options.record === 'Manure Records') {
            assert.ok(records.navigationInCard && records.navigationBottom <= records.headingTop, name + ': manure tabs stay above the heading inside one card')
          }
          assert.ok(records.controls.every(control => control.left >= -1 && control.right <= width + 1), name + ': filters and pagination fit the viewport')
          assert.ok(records.activePage, name + ': current page remains highlighted')
          if (width > 1250 && records.filtersLeft != null) assert.ok(records.filtersLeft >= records.headingRight - 1, name + ': filters align to the right of the heading')
        }
        if (options.tab === 'Monitoring') {
          const cards = (await send('Runtime.evaluate', { expression: '[...document.querySelectorAll(".fd-reading")].map(element => { const r=element.getBoundingClientRect(); return {x:r.x,width:r.width,height:r.height,overflow:element.scrollWidth>element.clientWidth}; })', returnByValue: true })).result.value
          assert.equal(new Set(cards.map(card => Math.round(card.x))).size, width > 1200 ? 4 : width > 600 ? 2 : 1, name + ': responsive sensor column count')
          assert.ok(cards.every(card => Math.abs(card.width-cards[0].width)<1 && Math.abs(card.height-cards[0].height)<1 && !card.overflow), name + ': equal sensor cards without clipped content')
        }
      }
      console.log('Verified responsive screenshots:', directory)
    }
    assert.ok(result, 'Browser fixture did not finish')
    assert.equal(result.error, undefined, result.error)
    assert.deepEqual(interceptionErrors, [], 'Only canceled map asset requests may be discarded')
    assert.equal(result.passed.length, 18)
    for (const scenario of result.passed) console.log('PASS:', scenario)
  } finally {
    socket?.close()
    browser.kill()
    await server.close()
  }
})
