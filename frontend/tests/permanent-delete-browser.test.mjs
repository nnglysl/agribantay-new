import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from 'vite'

test('Permanent Delete requires closure, loss acknowledgement and OTP without automatic unassignment', async () => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), 'agribantay-house-delete-vite-'))
  const server = await createServer({ cacheDir, plugins: [{ name: 'isolated-delete-dialog-export', transform(source, id) {
    if (id.split('?')[0].replaceAll('\\', '/').endsWith('/src/pages/superadmin/Farms.jsx')) return source + '\nexport { DeleteFarmModal };\n'
  } }], optimizeDeps: { entries: ['tests/permanent-delete-browser.html'], include: ['react', 'react-dom/client', 'axios'] },
  server: { host: '127.0.0.1', port: 0, hmr: false } })
  await server.listen()
  const profile = await mkdtemp(path.join(tmpdir(), 'agribantay-house-delete-browser-'))
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
    }
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const requestId = ++id
      const timer = setTimeout(() => { pending.delete(requestId); reject(Error('Browser request timed out')) }, 15000)
      pending.set(requestId, result => { clearTimeout(timer); result.error ? reject(Error(JSON.stringify(result.error))) : resolve(result.result) })
      socket.send(JSON.stringify({ id: requestId, method, params }))
    })
    await send('Page.navigate', { url: `http://127.0.0.1:${server.httpServer.address().port}/tests/permanent-delete-browser.html` })
    let result
    for (let attempt = 0; attempt < 250; attempt++) {
      const evaluation = await send('Runtime.evaluate', { expression: 'window.permanentDeleteResults', returnByValue: true })
      result = evaluation.result.value
      if (result) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.ok(result, 'Browser fixture must finish')
    assert.equal(result.error, undefined, result.error)
    assert.equal(result.passed.length, 4)
    result.passed.forEach(scenario => console.log('PASS:', scenario))
  } finally {
    socket?.close()
    browser.kill()
    await server.close()
  }
})
