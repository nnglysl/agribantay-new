import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from 'vite'

test('Farmer summary dashboard uses actual intercepted house records', async () => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), 'agribantay-farmer-summary-vite-'))
  const server = await createServer({ cacheDir, optimizeDeps: { entries: ['tests/farmer-summary-browser.html'], include: ['react', 'react-dom/client', 'axios'] },
  server: { host: '127.0.0.1', port: 0, hmr: false } })
  await server.listen()
  const profile = await mkdtemp(path.join(tmpdir(), 'agribantay-farmer-summary-browser-'))
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
    await send('Page.navigate', { url: `http://127.0.0.1:${server.httpServer.address().port}/tests/farmer-summary-browser.html` })
    let result
    for (let attempt = 0; attempt < 350; attempt++) {
      result = await evaluate('window.farmerSummaryResults')
      if (result) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.ok(result, 'Browser fixture must finish')
    assert.equal(result.error, undefined, result.error)
    assert.equal(result.passed.length, 6)
    result.passed.forEach(scenario => console.log('PASS:', scenario))
    const directory = await mkdtemp(path.join(tmpdir(), 'agribantay-farmer-summary-previews-'))
    for (const width of [1440, 1024, 768, 390, 320]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 720 })
      await evaluate('window.farmerSummaryPreview()')
      await new Promise(resolve => setTimeout(resolve, 450))
      const geometry = await evaluate(`(() => { const rect=selector=>document.querySelector(selector).getBoundingClientRect().toJSON(); const r=rect('.fdb'); const cards=[...document.querySelectorAll('.fdb-stat')].map(el=>{const b=el.getBoundingClientRect();return {top:b.top,height:b.height}}); return {left:r.left,right:r.right,bottom:r.bottom,bodyWidth:document.documentElement.scrollWidth,cards,overview:rect('.fdb-overview'),recommendations:rect('.fdb-recommendations'),compliance:rect('.annual-compliance')}; })()`)
      assert.ok(geometry.left >= 0 && geometry.right <= width + 1 && geometry.bodyWidth <= width + 1, 'House monitoring fits ' + width + 'px: ' + JSON.stringify(geometry))
      assert.equal(geometry.cards.length, 4)
      const tableFits = await evaluate(`(() => { const wrap=document.querySelector('.fdb-table-wrap'); return wrap.scrollWidth <= wrap.clientWidth + 1; })()`)
      assert.ok(tableFits, 'The summary table keeps all three columns within its card at '+width+'px')
      if (width === 1440) {
        assert.equal(new Set(geometry.cards.map(card => card.top)).size, 1, 'All four summary cards occupy one desktop row')
        assert.equal(new Set(geometry.cards.map(card => card.height)).size, 1, 'Summary cards have equal heights')
        assert.equal(geometry.overview.top, geometry.recommendations.top, 'Recommendations stay beside the overview on desktop')
        assert.equal(geometry.overview.height, geometry.recommendations.height, 'The overview and recommendations align vertically')
      }
      assert.ok(Math.abs(geometry.compliance.left - geometry.left) < 1 && Math.abs(geometry.compliance.right - geometry.right) < 1, 'Compliance spans the dashboard width at ' + width + 'px')
      assert.ok(geometry.compliance.top >= Math.max(geometry.overview.bottom, geometry.recommendations.bottom), 'Compliance follows the overview and recommendations')
      const metrics = await send('Page.getLayoutMetrics')
      await writeFile(path.join(directory, `poultry-houses-${width}.png`), Buffer.from((await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: Math.ceil(metrics.cssContentSize.height), scale: 1 } })).data, 'base64'))
    }
    for (const width of [1440, 390]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 720 })
      await evaluate('window.farmerSummaryPreview(true)')
      const empty = await evaluate(`({ overflow: document.documentElement.scrollWidth > innerWidth, count: document.querySelectorAll('.fdb-overview tbody tr').length, values: [...document.querySelectorAll('.fdb-stat strong')].map(node => node.textContent), tips: document.querySelectorAll('.fdb-recommendations li').length })`)
      assert.ok(!empty.overflow && empty.count === 0 && empty.values.every(value => value === '—') && empty.tips === 0, 'Unavailable inventory has unknown counts, no houses, no invented advice and fits ' + width + 'px')
      const metrics = await send('Page.getLayoutMetrics')
      await writeFile(path.join(directory, `inventory-unavailable-${width}.png`), Buffer.from((await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: Math.ceil(metrics.cssContentSize.height), scale: 1 } })).data, 'base64'))
    }
    console.log('Verified Farmer summary screenshots:', directory)
  } finally {
    socket?.close()
    browser.kill()
    await server.close()
  }
})
