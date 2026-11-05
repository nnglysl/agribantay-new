import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from 'vite'

test('House monitoring preserves independent readings, history and farm isolation', async () => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), 'agribantay-house-phase5-vite-'))
  const server = await createServer({ cacheDir, optimizeDeps: { entries: ['tests/house-monitoring-browser.html'], include: ['react', 'react-dom/client', 'axios'] },
  server: { host: '127.0.0.1', port: 0, hmr: false } })
  await server.listen()
  const profile = await mkdtemp(path.join(tmpdir(), 'agribantay-house-phase5-browser-'))
  const browser = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-extensions', '--disable-background-networking', '--no-first-run',
      '--no-default-browser-check', '--remote-debugging-port=0', '--remote-allow-origins=*', `--user-data-dir=${profile}`, 'about:blank'],
    { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
  let socket
  try {
    const endpoint = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Browser startup timed out')), 15000)
      browser.on('error', reject)
      browser.stderr.on('data', chunk => {
        const match = chunk.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/)
        if (match) { clearTimeout(timer); resolve(match[1]) }
      })
    })
    const targets = await (await fetch(`http://${new URL(endpoint).host}/json/list`)).json()
    socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl)
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
    let id = 0
    const pending = new Map()
    socket.onmessage = event => {
      const message = JSON.parse(event.data)
      if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id) }
      if (message.method === 'Fetch.requestPaused') void send('Fetch.fulfillRequest', { requestId: message.params.requestId,
        responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'image/svg+xml' }],
        body: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#edf3ef"/></svg>').toString('base64') }).catch(() => {})
    }
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const requestId = ++id
      const timer = setTimeout(() => { pending.delete(requestId); reject(Error('Browser request timed out: ' + method)) }, 15000)
      pending.set(requestId, result => { clearTimeout(timer); result.error ? reject(Error(JSON.stringify(result.error))) : resolve(result.result) })
      socket.send(JSON.stringify({ id: requestId, method, params }))
    })
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails))
      return result.result.value
    }
    await send('Fetch.enable', { patterns: [{ urlPattern: 'https://*' }] })
    await send('Page.navigate', { url: `http://127.0.0.1:${server.httpServer.address().port}/tests/house-monitoring-browser.html` })
    let result
    for (let attempt = 0; attempt < 350; attempt++) {
      result = await evaluate('window.housePhase5Results')
      if (result) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.ok(result, 'Browser fixture must finish')
    assert.equal(result.error, undefined, result.error)
    assert.equal(result.passed.length, 9)
    result.passed.forEach(scenario => console.log('PASS:', scenario))
    const directory = await mkdtemp(path.join(tmpdir(), 'agribantay-house-phase5-previews-'))
    for (const width of [1440, 900, 390, 320]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 720 })
      for (const view of ['cards', 'current', 'history', 'vet']) {
        await evaluate(`window.housePhase5Preview(${JSON.stringify(view)})`)
        const geometry = await evaluate(`(() => { const panel=document.querySelector('.hm-panel,.vm'), r=panel.getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,tabsBottom:document.querySelector('.hm [role="tablist"]')?.getBoundingClientRect().bottom,bodyWidth:document.documentElement.scrollWidth, controls:[...document.querySelectorAll('.hm button,.hm select,.hm input,.vm button,.vm select')].map(element=>({left:element.getBoundingClientRect().left,right:element.getBoundingClientRect().right})), hasConditionFilter:!!document.querySelector('[aria-label="Monitoring condition"]')}; })()`)
        assert.ok(geometry.left >= 0 && geometry.right <= width + 1 && geometry.bodyWidth <= width + 1 && !geometry.hasConditionFilter, view + ' fits ' + width + 'px: ' + JSON.stringify(geometry))
        assert.ok(geometry.controls.every(rect=>rect.left>=0 && rect.right<=width+1), 'Tabs, filters and pagination fit ' + width + 'px')
        if (['current','history'].includes(view)) assert.ok(geometry.tabsBottom <= geometry.top, 'Tabs stay above the content card at ' + width + 'px: ' + JSON.stringify(geometry))
        if (view === 'vet') {
          const vet = await evaluate('({cards:document.querySelectorAll(".vm-sensor").length,tables:document.querySelectorAll(".vm table").length,canvas:!!document.querySelector(".vm canvas"),clipped:[...document.querySelectorAll(".vm-sensor,.vm-highlights li")].some(node=>node.scrollWidth>node.clientWidth+1)})')
          assert.ok(vet.cards === 4 && vet.tables === 0 && vet.canvas && !vet.clipped, 'Vet summary/cards/chart fit ' + width + 'px')
        }
        const layout = await send('Page.getLayoutMetrics')
        await writeFile(path.join(directory, `${view}-${width}.png`), Buffer.from((await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: Math.max(900, layout.cssContentSize.height), scale: 1 } })).data, 'base64'))
      }
    }
    console.log('Verified house monitoring screenshots:', directory)
  } finally {
    socket?.close()
    browser.kill()
    await server.close()
  }
})
