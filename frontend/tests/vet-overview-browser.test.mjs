import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFile, spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from 'vite'

test('Veterinarian Overview cards, read-only access, existing navigation and responsive layout', async () => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), 'agribantay-vet-overview-vite-'))
  const fixturePath = path.join(cacheDir, 'role-responses.json')
  const backend = await promisify(execFile)('php', ['vendor/bin/phpunit', '--do-not-cache-result', 'tests/Feature/VetFarmOverviewReadOnlyTest.php'], {
    cwd: path.resolve('../backend'), timeout: 60000, windowsHide: true,
    env: { ...process.env, APP_CONFIG_CACHE: path.join(cacheDir, 'no-config-cache.php'), APP_ENV: 'testing',
      DB_CONNECTION: 'sqlite', DB_DATABASE: ':memory:', DB_URL: '', CACHE_STORE: 'array', SESSION_DRIVER: 'array',
      QUEUE_CONNECTION: 'sync', LOG_CHANNEL: 'stderr', VET_OVERVIEW_FIXTURE_PATH: fixturePath },
  })
  console.log(backend.stdout.trim())
  const roleResponses = await readFile(fixturePath, 'utf8')
  const server = await createServer({ cacheDir, plugins: [{ name: 'synthetic-role-responses', configureServer(server) {
    server.middlewares.use('/__vet-overview-fixture', (_request, response) => {
      response.setHeader('Content-Type', 'application/json'); response.end(roleResponses)
    })
  } }], optimizeDeps: { entries: ['tests/vet-overview-browser.html'], include: ['react', 'react-dom/client', 'axios'] }, server: { host: '127.0.0.1', port: 0, hmr: false } })
  let browser, socket
  try {
    await server.listen()
    const profile = await mkdtemp(path.join(tmpdir(), 'agribantay-vet-overview-browser-'))
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
        // Fulfill external tiles locally; no coordinate or asset request leaves the fixture.
        void send('Fetch.fulfillRequest', { requestId: message.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'image/svg+xml' }], body: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e9eee5"/><path d="M0 110L256 170M95 0L130 256" stroke="#d5dfce" stroke-width="14"/></svg>').toString('base64') })
          .catch(error => { if (!error.message.includes('Invalid InterceptionId')) interceptionErrors.push(error.message) })
      }
    }
    const evaluate = async expression => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value
    await send('Fetch.enable', { patterns: [{ urlPattern: 'https://*' }] })
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1060, deviceScaleFactor: 1, mobile: false })
    await send('Page.navigate', { url: `http://127.0.0.1:${server.httpServer.address().port}/tests/vet-overview-browser.html` })
    let result
    for (let index = 0; index < 500; index++) {
      result = await evaluate('window.vetOverviewResults')
      if (result) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.ok(result, 'Browser fixture did not finish')
    assert.equal(result.error, undefined, JSON.stringify(result))
    assert.equal(result.passed.length, 7)
    for (const scenario of result.passed) console.log('PASS:', scenario)

    const directory = await mkdtemp(path.join(tmpdir(), 'agribantay-vet-overview-preview-'))
    for (const width of [1440, 900, 390, 320]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 1060, deviceScaleFactor: 1, mobile: width < 720 })
      for (const variant of ['current', 'coordinates', 'long']) {
        await evaluate(`window.vetOverviewPreview(${JSON.stringify(variant)})`)
        const geometry = await evaluate(`(() => {
          const cards = [...document.querySelectorAll('.fd-overview-grid > .fd-panel')]
          return { scrollWidth: document.documentElement.scrollWidth,
            columns: new Set(cards.map(element => Math.round(element.getBoundingClientRect().x))).size,
            clipped: [...document.querySelectorAll('.fd-field,.fd-owner,.fd-title')].some(element => element.scrollWidth > element.clientWidth + 1),
            fields: [...document.querySelectorAll('.fd-fields')].map(element => getComputedStyle(element).gridTemplateColumns.split(' ').length),
            editable: document.querySelector('.fd-overview-grid input,.fd-overview-grid select,.fd-overview-grid textarea,.fd-overview-grid [contenteditable=true]') != null }
        })()`)
        assert.ok(geometry.scrollWidth <= width + 1 && !geometry.clipped && !geometry.editable, `${width}/${variant}: readable read-only cards without horizontal overflow`)
        assert.equal(geometry.columns, width > 720 ? 2 : 1, `${width}/${variant}: Staff responsive card columns`)
        assert.ok(geometry.fields.every(columns => columns === 2), `${width}/${variant}: Staff two-column information layout`)
        if (variant !== 'long') {
          const layout = await send('Page.getLayoutMetrics')
          const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: Math.max(1060, layout.cssContentSize.height), scale: 1 } })
          await writeFile(path.join(directory, `${variant}-${width}.png`), Buffer.from(shot.data, 'base64'))
        }
      }
    }
    assert.deepEqual(interceptionErrors, [])
    console.log('PASS: desktop, tablet, mobile and 320px layouts, including long values and synthetic map coordinates')
    console.log('Verified responsive screenshots:', directory)
  } finally {
    socket?.close()
    browser?.kill()
    await server.close()
  }
})
