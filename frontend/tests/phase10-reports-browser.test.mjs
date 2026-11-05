import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from 'vite'

test('Role-specific Reports behavior and responsive layouts in an isolated headless browser', async () => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), 'agribantay-phase10Reports-vite-'))
  const server = await createServer({ cacheDir, optimizeDeps: { entries: ['tests/phase10-reports-browser.html'], include: ['react', 'react-dom/client', 'axios'] }, server: { host: '127.0.0.1', port: 0, hmr: false } })
  await server.listen()
  const port = server.httpServer.address().port
  const profile = await mkdtemp(path.join(tmpdir(), 'agribantay-phase10Reports-browser-'))
  const browser = spawn(process.env.PHASE10_REPORTS_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
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
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/tests/phase10-reports-browser.html` })
    let result
    for (let i = 0; i < 550; i++) {
      const evaluation = await send('Runtime.evaluate', { expression: 'window.phase10ReportsResults', returnByValue: true, timeout: 1500 })
      result = evaluation.result?.value
      if (result) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    if (result?.error) console.log('Completed before failure:', result.passed, 'Unexpected:', result.unexpected, 'Runtime:', result.runtimeErrors)
    assert.equal(result?.error, undefined, result?.error)
    for(const timezoneId of ['America/Los_Angeles','Pacific/Kiritimati','UTC','Asia/Manila']) {
      await send('Emulation.setTimezoneOverride',{timezoneId})
      const calendar=await send('Runtime.evaluate',{expression:'window.phase10CalendarPreview()',awaitPromise:true,returnByValue:true})
      assert.equal(calendar.result.value?.correctDay,true,'Manila midnight inspection must appear on October 1 in '+timezoneId)
      assert.equal(calendar.result.value?.correctLabel,true,'Selected day must retain its Manila calendar label')
      assert.ok(calendar.result.value?.events>=2,'Selected-day history must include its scheduled inspection')
      assert.deepEqual(calendar.result.value?.errors,[])
    }
    await send('Emulation.setTimezoneOverride',{timezoneId:'Asia/Manila'})
    console.log('PASS: inspection day tiles and selected-day history retain Manila dates in four browser timezones')
    const directory = await mkdtemp(path.join(tmpdir(), 'agribantay-phase10-reports-preview-'))
    for (const role of ['admin', 'super_admin', 'vet']) {
      for (const width of [1440, 900, 390]) {
        await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 720 })
        await send('Runtime.evaluate', { expression: 'window.phase10ReportsPreview('+JSON.stringify(role)+')', awaitPromise: true, returnByValue: true })
        const geometry = await send('Runtime.evaluate', { expression: '({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,errors:window.phase10ReportsResults.runtimeErrors})', returnByValue: true })
        assert.ok(geometry.result.value.scrollWidth <= width+1, role+' Reports must fit '+width+'px viewport')
        assert.deepEqual(geometry.result.value.errors, [])
        await writeFile(path.join(directory,role+'-'+width+'.png'), Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'))
      }
    }
    console.log('Verified responsive report screenshots:', directory)
    assert.ok(result, 'Browser fixture did not finish')
    assert.equal(result.error, undefined, result.error)
    assert.equal(result.passed.length, 7)
    for (const scenario of result.passed) console.log('PASS:', scenario)
  } finally {
    socket?.close()
    browser.kill()
    await server.close()
  }
})
