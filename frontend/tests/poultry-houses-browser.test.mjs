import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from 'vite'

test('Poultry house management and registration use isolated browser fixtures', async () => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), 'agribantay-house-phase3-vite-'))
  const server = await createServer({ cacheDir, plugins: [{ name: 'isolated-registration-entry-export', transform(source, id) {
    if (/\/src\/pages\/(admin|superadmin)\/Farms.jsx$/.test(id.split('?')[0].replaceAll('\\', '/'))) return source + '\nexport { FarmEntry };\n'
  } }], optimizeDeps: { entries: ['tests/poultry-houses-browser.html'], include: ['react', 'react-dom/client', 'axios'] },
  server: { host: '127.0.0.1', port: 0, hmr: false } })
  await server.listen()
  const profile = await mkdtemp(path.join(tmpdir(), 'agribantay-house-phase3-browser-'))
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
    await send('Page.navigate', { url: `http://127.0.0.1:${server.httpServer.address().port}/tests/poultry-houses-browser.html` })
    let result
    for (let attempt = 0; attempt < 350; attempt++) {
      result = await evaluate('window.housePhase3Results')
      if (result) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.ok(result, 'Browser fixture must finish')
    assert.equal(result.error, undefined, result.error)
    assert.equal(result.passed.length, 7)
    result.passed.forEach(scenario => console.log('PASS:', scenario))
    const directory = await mkdtemp(path.join(tmpdir(), 'agribantay-house-phase3-previews-'))
    for (const width of [1440, 900, 390, 320]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 720 })
      await evaluate('window.housePhase3Preview()')
      const geometry = await evaluate(`(() => { const panel=document.querySelector('.ph-section'), r=panel.getBoundingClientRect(), scroll=panel.querySelector('.ph-scroll'); return { left:r.left,right:r.right,width:r.width,viewport:innerWidth,bodyWidth:document.documentElement.scrollWidth,tableFits:scroll.scrollWidth<=scroll.clientWidth+1 }; })()`)
      assert.ok(geometry.left >= 0 && geometry.right <= width + 1 && geometry.bodyWidth <= width + 1, 'House section fits ' + width + 'px: ' + JSON.stringify(geometry))
      assert.ok(geometry.tableFits, 'Standard house names and actions remain fully visible at ' + width + 'px')
      await writeFile(path.join(directory, `poultry-houses-${width}.png`), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
    }
    console.log('Verified house-section screenshots:', directory)
  } finally {
    socket?.close()
    browser.kill()
    await server.close()
  }
})
