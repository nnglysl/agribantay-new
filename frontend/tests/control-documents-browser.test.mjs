import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from 'vite'

test('Control Documents upload and isolation in an isolated headless browser', async () => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), 'agribantay-phase6-vite-'))
  const server = await createServer({ cacheDir, optimizeDeps: { entries: ['tests/control-documents-browser.html'], include: ['react', 'react-dom/client', 'axios'] }, server: { host: '127.0.0.1', port: 0, hmr: false } })
  await server.listen()
  const port = server.httpServer.address().port
  const profile = await mkdtemp(path.join(tmpdir(), 'agribantay-phase6-browser-'))
  const browser = spawn(process.env.PHASE6_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
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
    socket.onmessage = event => {
      const message = JSON.parse(event.data)
      if (message.method === 'Runtime.exceptionThrown') console.log('Browser exception:', JSON.stringify(message.params.exceptionDetails))
      if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id) }
      if (message.method === 'Fetch.requestPaused') {
        // Preview maps use synthetic coordinates; fulfill public assets locally.
        void send('Fetch.fulfillRequest', { requestId: message.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'image/svg+xml' }], body: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e9eee5"/><path d="M0 110L256 170M95 0L130 256" stroke="#d5dfce" stroke-width="14"/></svg>').toString('base64') })
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
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/tests/control-documents-browser.html` })
    let result
    for (let i = 0; i < 550; i++) {
      const evaluation = await send('Runtime.evaluate', { expression: 'window.phase6Results', returnByValue: true, timeout: 1500 })
      result = evaluation.result?.value
      if (result) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    if (result?.error) console.log('Completed before failure:', result.passed, 'Unexpected:', result.unexpected, 'Runtime:', result.runtimeErrors)
    if (process.env.PHASE6_SCREENSHOTS === '1') {
      const directory = await mkdtemp(path.join(tmpdir(), 'agribantay-phase6-preview-'))
      await mkdir(directory, { recursive: true })
      for (const [name, width, height, options] of [
        ['farmer-documents-desktop', 1440, 1060, { role: 'farm_owner' }],
        ['farmer-history-desktop', 1440, 1060, { role: 'farm_owner', view: 'history' }],
        ['upload-desktop', 1440, 1060, { role: 'farm_owner', view: 'upload' }],
        ['staff-compliance-desktop', 1440, 1060, { role: 'admin' }],
        ['staff-compliance-reference', 1774, 1060, { role: 'admin' }],
        ['superadmin-compliance-tablet', 900, 1100, { role: 'super_admin' }],
        ['staff-error-desktop', 1440, 1060, { role: 'admin', view: 'error' }],
        ['farmer-empty-desktop', 1440, 1060, { role: 'farm_owner', farmId: 2 }],
        ['farmer-documents-mobile', 390, 844, { role: 'farm_owner' }],
        ['upload-mobile', 390, 844, { role: 'farm_owner', view: 'upload' }],
        ['staff-compliance-mobile', 390, 844, { role: 'super_admin', view: 'history' }],
        ['staff-empty-mobile', 390, 844, { role: 'admin', farmId: 2 }],
        ['staff-error-mobile', 320, 844, { role: 'admin', view: 'error' }],
      ]) {
        await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 720 })
        await send('Runtime.evaluate', { expression: `window.phase6Preview(${JSON.stringify(options)})`, awaitPromise: true, returnByValue: true })
        await new Promise(resolve => setTimeout(resolve, 200))
        const layout = await send('Page.getLayoutMetrics')
        const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: Math.min(2600, Math.max(height, layout.cssContentSize.height)), scale: 1 } })
        await writeFile(path.join(directory, name + '.png'), Buffer.from(shot.data, 'base64'))
        const geometry = await send('Runtime.evaluate', { expression: '({width:innerWidth,scrollWidth:document.documentElement.scrollWidth})', returnByValue: true })
        assert.ok(geometry.result.value.scrollWidth <= width + 1, name + ' must not overflow horizontally')
        const panels = await send('Runtime.evaluate', { expression: 'Array.from(document.querySelectorAll(".control-documents,.annual-compliance,.cd-modal")).map(element => ({left:element.getBoundingClientRect().left,right:element.getBoundingClientRect().right})).every(rect => rect.left >= -1 && rect.right <= innerWidth + 1)', returnByValue: true })
        assert.ok(panels.result.value, name + ' panels must fit the viewport even when the shell hides overflow')
        if (['admin', 'super_admin'].includes(options.role)) {
          const fields = (await send('Runtime.evaluate', { expression: '[...document.querySelectorAll(".annual-compliance--detail dl > div")].map(element => {const r=element.getBoundingClientRect(); return {left:Math.round(r.left),top:Math.round(r.top),divider:getComputedStyle(element).borderLeftWidth}})', returnByValue: true })).result.value
          assert.equal(fields.length, 4, 'The annual card shows four essential metrics')
          const columns = width > 1200 ? 4 : width > 600 ? 2 : 1
          assert.equal(new Set(fields.map(field => field.left)).size, columns, name + ': responsive compliance columns')
          assert.equal(new Set(fields.map(field => field.top)).size, 4 / columns, name + ': responsive compliance rows')
          if (width > 1200) assert.deepEqual(fields.map(field => field.divider), ['0px','1px','1px','1px'], 'Desktop fields have subtle vertical dividers')
        }
      }
      console.log('Verified responsive screenshots:', directory)
    }
    assert.ok(result, 'Browser fixture did not finish')
    assert.equal(result.error, undefined, result.error)
    assert.equal(result.passed.length, 14)
    for (const scenario of result.passed) console.log('PASS:', scenario)
  } finally {
    socket?.close()
    browser.kill()
    await server.close()
  }
})
