import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from 'vite'

test('Annual compliance and farm isolation in an isolated headless browser', async () => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), 'agribantay-phase8-vite-'))
  const server = await createServer({ cacheDir, optimizeDeps: { entries: ['tests/annual-compliance-browser.html'], include: ['react', 'react-dom/client', 'axios'] }, server: { host: '127.0.0.1', port: 0, hmr: false } })
  await server.listen()
  const port = server.httpServer.address().port
  const profile = await mkdtemp(path.join(tmpdir(), 'agribantay-phase8-browser-'))
  const browser = spawn(process.env.PHASE8_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
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
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/tests/annual-compliance-browser.html` })
    let result
    for (let i = 0; i < 550; i++) {
      const evaluation = await send('Runtime.evaluate', { expression: 'window.phase8Results', returnByValue: true, timeout: 1500 })
      result = evaluation.result?.value
      if (result) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    if (result?.error) console.log('Completed before failure:', result.passed, 'Unexpected:', result.unexpected, 'Runtime:', result.runtimeErrors)
    if (process.env.PHASE8_SCREENSHOTS === '1') {
      const directory = await mkdtemp(path.join(tmpdir(), 'agribantay-phase8-preview-'))
      await mkdir(directory, { recursive: true })
      for (const [name, width, height, options] of [
        ['annual-cleanout-farmer-desktop', 1440, 1060, { page: 'manure' }],
        ['annual-cleanout-staff-desktop', 1440, 1060, { role: 'admin' }],
        ['annual-cleanout-superadmin-desktop', 1440, 1060, { role: 'super_admin' }],
        ['farmer-services-desktop', 1440, 1060, { page: 'services' }],
        ['staff-dashboard-desktop', 1440, 1060, { role: 'admin', page: 'dashboard' }],
        ['staff-dashboard-undetermined', 1440, 1060, { role: 'admin', page: 'dashboard', undetermined: true }],
        ['staff-dashboard-tablet', 900, 1100, { role: 'admin', page: 'dashboard' }],
        ['staff-dashboard-mobile', 390, 844, { role: 'admin', page: 'dashboard' }],
        ['staff-dashboard-small-mobile', 320, 844, { role: 'admin', page: 'dashboard' }],
        ['annual-overdue-desktop', 1440, 1060, { role: 'admin', page: 'overdue' }],
        ['annual-overdue-details', 1440, 1060, { role: 'admin', page: 'maintenance-details' }],
        ['annual-cleanout-farmer-mobile', 390, 844, { page: 'manure', farmId: 2 }],
        ['annual-cleanout-staff-mobile', 390, 844, { role: 'admin' }],
        ['farmer-services-mobile', 390, 844, { page: 'services' }],
        ['annual-overdue-mobile', 390, 844, { role: 'admin', page: 'overdue' }],
      ]) {
        await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 720 })
        await send('Runtime.evaluate', { expression: `window.phase8Preview(${JSON.stringify(options)})`, awaitPromise: true, returnByValue: true })
        await new Promise(resolve => setTimeout(resolve, 200))
        const layout = await send('Page.getLayoutMetrics')
        const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: Math.min(2600, Math.max(height, layout.cssContentSize.height)), scale: 1 } })
        await writeFile(path.join(directory, name + '.png'), Buffer.from(shot.data, 'base64'))
        const geometry = await send('Runtime.evaluate', { expression: '({width:innerWidth,scrollWidth:document.documentElement.scrollWidth})', returnByValue: true })
        assert.ok(geometry.result.value.scrollWidth <= width + 1, name + ' must not overflow horizontally')
        if (options.page === 'dashboard') {
          const map = (await send('Runtime.evaluate', { expression: `(() => {
            const map = document.querySelector('.leaflet-container')
            const layout = map.parentElement.parentElement
            const panel = layout.lastElementChild
            const rect = element => { const r=element.getBoundingClientRect(); return {width:r.width,height:r.height,left:r.left} }
            return {map:rect(map),layout:rect(layout),panel:rect(panel)}
          })()`, returnByValue:true })).result.value
          assert.equal(map.map.height, width <= 768 ? 320 : 520, 'Existing map height is preserved')
          assert.equal(map.panel.width, width <= 768 ? map.layout.width : 300, 'Existing side-panel proportions are preserved')
          console.log('Staff map geometry:', width, JSON.stringify(map))
          const cards = (await send('Runtime.evaluate', { expression:'[...document.querySelectorAll(".staff-dashboard-stat")].map(element=>{const r=element.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,height:r.height,width:r.width,background:getComputedStyle(element).backgroundColor}})', returnByValue:true })).result.value
          assert.equal(cards.length, 3, 'Three Staff summary cards are present')
          assert.ok(cards.every(card=>card.left>=0&&card.right<=width&&card.background==='rgb(35, 74, 53)'), 'Green summary cards stay inside the viewport')
          if (width > 768) {
            assert.equal(new Set(cards.map(card=>card.top)).size, 1, 'Desktop summary cards share one row')
            assert.equal(new Set(cards.map(card=>card.height)).size, 1, 'Desktop summary cards have equal heights')
            assert.ok(cards.every(card=>card.height<(options.undetermined?160:138)), 'Refined cards remove the previous excess height')
          } else {
            assert.equal(cards[0].top, cards[1].top, 'Mobile counts share the first row')
            assert.ok(cards[2].top>cards[0].top&&cards[2].width>cards[0].width, 'Mobile compliance card wraps without squeezing its counts')
          }
          const icons = (await send('Runtime.evaluate', {expression:'[...document.querySelectorAll(".staff-dashboard-stat h2 svg")].map(icon=>({width:icon.getBoundingClientRect().width,height:icon.getBoundingClientRect().height}))',returnByValue:true})).result.value
          assert.equal(icons.length,3,'Each summary has one subtle outline icon')
          assert.ok(icons.every(icon=>icon.width===16&&icon.height===16),'Summary icons stay small')
        }
        const panels = await send('Runtime.evaluate', { expression: 'Array.from(document.querySelectorAll(".annual-compliance,.control-documents,.fd-panel,.cd-modal")).map(element => ({left:element.getBoundingClientRect().left,right:element.getBoundingClientRect().right})).every(rect => rect.left >= -1 && rect.right <= innerWidth + 1)', returnByValue: true })
        assert.ok(panels.result.value, name + ' panels must fit the viewport even when the shell hides overflow')
      }
      console.log('Verified responsive screenshots:', directory)
    }
    assert.ok(result, 'Browser fixture did not finish')
    assert.equal(result.error, undefined, result.error)
    assert.equal(result.passed.length, 8)
    for (const scenario of result.passed) console.log('PASS:', scenario)
  } finally {
    socket?.close()
    browser.kill()
    await server.close()
  }
})
