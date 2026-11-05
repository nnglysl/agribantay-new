import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from 'vite'

test('Farmer readings tabs, filters, pagination and isolation', async () => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), 'agribantay-farmer-readings-vite-'))
  const server = await createServer({ cacheDir, optimizeDeps: { entries: ['tests/farmer-readings-browser.html'], include: ['react', 'react-dom/client', 'axios'] },
  server: { host: '127.0.0.1', port: 0, hmr: false } })
  await server.listen()
  const profile = await mkdtemp(path.join(tmpdir(), 'agribantay-farmer-readings-browser-'))
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
    await send('Page.navigate', { url: `http://127.0.0.1:${server.httpServer.address().port}/tests/farmer-readings-browser.html` })
    let result
    for (let attempt = 0; attempt < 350; attempt++) {
      result = await evaluate('window.farmerReadingsResults')
      if (result) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.ok(result, 'Browser fixture must finish')
    assert.equal(result.error, undefined, JSON.stringify(result, null, 2))
    assert.equal(result.passed.length, 7)
    result.passed.forEach(scenario => console.log('PASS:', scenario))
    const directory = await mkdtemp(path.join(tmpdir(), 'agribantay-farmer-readings-previews-'))
    for (const width of [1440, 1024, 768, 390, 320]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 720 })
      for (const view of ['current', 'history', 'offline']) {
        await evaluate('window.farmerReadingsPreview(' + JSON.stringify(view) + ')')
        const geometry = await evaluate(`(() => {
          const panel = document.querySelector('.fr-panel:not([hidden])'), rect = panel.getBoundingClientRect();
          const scroll = panel.querySelector('.fr-table-scroll'), footer = panel.querySelector('.agb-table-footer');
          const controls = [...panel.querySelectorAll('select,input,button')].map(node => node.getBoundingClientRect().toJSON());
          return { left: rect.left, right: rect.right, bodyWidth: document.documentElement.scrollWidth, count: panel.querySelectorAll('tbody tr').length,
            controls, footerWidth: footer?.scrollWidth, footerClient: footer?.clientWidth, tableScrollable: scroll.scrollWidth > scroll.clientWidth };
        })()`)
        assert.ok(geometry.left >= 0 && geometry.right <= width + 1 && geometry.bodyWidth <= width + 1, view + ' fits ' + width + 'px: ' + JSON.stringify(geometry))
        assert.equal(geometry.count, view === 'offline' ? 1 : 10)
        assert.ok(geometry.controls.every(rect => rect.left >= 0 && rect.right <= width + 1), 'Filters and pagination stay within ' + width + 'px')
        if (geometry.footerWidth) assert.ok(geometry.footerWidth <= geometry.footerClient + 1, 'Pagination never overflows at ' + width + 'px')
        if (width <= 768) assert.ok(geometry.tableScrollable, 'The readings table scrolls inside its card on small screens')
        const metrics = await send('Page.getLayoutMetrics')
        await writeFile(path.join(directory, view + '-' + width + '.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: Math.ceil(metrics.cssContentSize.height), scale: 1 } })).data, 'base64'))
      }
    }
    console.log('Verified Farmer Readings screenshots:', directory)
  } finally {
    socket?.close()
    browser.kill()
    await server.close()
  }
})
