import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from 'vite'

test('table state and report pagination in an isolated headless browser', async () => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), 'agribantay-phase4-vite-'))
  const server = await createServer({ cacheDir, optimizeDeps: { entries: ['tests/table-browser.html'], include: ['react', 'react-dom/client', 'axios'] }, server: { host: '127.0.0.1', port: 0, hmr: false } })
  await server.listen()
  const port = server.httpServer.address().port
  const profile = await mkdtemp(path.join(tmpdir(), 'agribantay-phase4-browser-'))
  const browser = spawn(process.env.PHASE4_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
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
    }
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const requestId = ++id
      const timeout = setTimeout(() => { pending.delete(requestId); reject(Error('DevTools timeout: ' + method)) }, 15000)
      pending.set(requestId, result => { clearTimeout(timeout); result.error ? reject(Error(JSON.stringify(result.error))) : resolve(result.result) })
      socket.send(JSON.stringify({ id: requestId, method, params, ...(sessionId ? { sessionId } : {}) }))
    })
    await send('Runtime.enable')
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/tests/table-browser.html` })
    let result
    for (let i = 0; i < 300; i++) {
      const evaluation = await send('Runtime.evaluate', { expression: 'window.phase4Results', returnByValue: true, timeout: 1500 })
      result = evaluation.result?.value
      if (result) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.ok(result, 'Browser fixture did not finish')
    assert.equal(result.error, undefined, result.error)
    assert.equal(result.passed.length, 6)
    for (const scenario of result.passed) console.log('PASS:', scenario)
  } finally {
    socket?.close()
    browser.kill()
    await server.close()
  }
})
