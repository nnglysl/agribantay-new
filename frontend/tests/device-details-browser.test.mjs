import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from 'vite'

test('Device Details closes with header X, Escape and backdrop while restoring View focus', async () => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), 'agribantay-device-details-vite-'))
  const server = await createServer({ cacheDir, optimizeDeps: { entries: ['tests/device-details-browser.html'], include: ['react', 'react-dom/client', 'axios'] }, server: { host: '127.0.0.1', port: 0, hmr: false } })
  await server.listen()
  const port = server.httpServer.address().port
  const profile = await mkdtemp(path.join(tmpdir(), 'agribantay-device-details-browser-'))
  const browser = spawn(process.env.DEVICE_DETAILS_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
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
      if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id) }
    }
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const requestId = ++id
      const timeout = setTimeout(() => { pending.delete(requestId); reject(Error('DevTools timeout: '+method)) }, 15000)
      pending.set(requestId, result => { clearTimeout(timeout); result.error ? reject(Error(JSON.stringify(result.error))) : resolve(result.result) })
      socket.send(JSON.stringify({ id: requestId, method, params }))
    })
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails))
      return result.result.value
    }
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/tests/device-details-browser.html` })
    let result
    for (let i = 0; i < 200; i++) {
      result = await evaluate('window.deviceDetailsResults')
      if (result) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.ok(result, 'Browser fixture must finish')
    assert.equal(result.error, undefined, result.error)
    assert.equal(result.passed.length, 5)
    for (const scenario of result.passed) console.log('PASS:', scenario)
    const directory = await mkdtemp(path.join(tmpdir(), 'agribantay-device-details-preview-'))
    for (const width of [1440, 900, 390, 320]) {
      const height = width < 720 ? 844 : 1000
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 720 })
      await evaluate('window.deviceDetailsPreview()')
      const geometry = await evaluate(`(() => {
        const dialog=document.querySelector('[role="dialog"]'), rect=dialog.getBoundingClientRect()
        const hint=dialog.lastElementChild.getBoundingClientRect(), style=getComputedStyle(dialog)
        const cells=[...dialog.querySelectorAll('.device-details-grid > div')].map(element => element.getBoundingClientRect())
        const field=dialog.querySelector('.device-key-details-value').getBoundingClientRect()
        return { left:rect.left, right:rect.right, top:rect.top, bottom:rect.bottom, width:rect.width, height:rect.height,
          horizontalCenter:rect.left+rect.width/2, verticalCenter:rect.top+rect.height/2,
          bottomSpace:rect.bottom-hint.bottom, paddingBottom:parseFloat(style.paddingBottom), minHeight:style.minHeight,
          overflow:dialog.scrollWidth>dialog.clientWidth,
          plainDetails:[...dialog.querySelectorAll('.device-details-grid,.device-details-grid > div')].every(element => {
            const style=getComputedStyle(element)
            return style.backgroundColor==='rgba(0, 0, 0, 0)' && ['Top','Bottom','Left','Right'].every(side=>parseFloat(style['border'+side+'Width'])===0)
          }),
          twoColumns:cells.length===5 && Math.abs(cells[0].top-cells[1].top)<1 && Math.abs(cells[0].width-cells[1].width)<1 && cells[2].top>cells[0].top,
          keyFieldHeight:field.height }
      })()`)
      assert.ok(geometry.left >= 0 && geometry.right <= width && geometry.top >= 0 && geometry.bottom <= height, 'Dialog fits '+width+'px')
      assert.ok(Math.abs(geometry.horizontalCenter-width/2) <= 1 && Math.abs(geometry.verticalCenter-height/2) <= 1, 'Dialog remains centered')
      assert.ok(Math.abs(geometry.bottomSpace-geometry.paddingBottom) <= 1, 'Only the original modal padding remains below the hint')
      assert.equal(geometry.overflow, false, 'Modal content must not overflow horizontally')
      if (width >= 720) assert.ok(geometry.width >= 480 && geometry.width <= 520, 'Desktop modal uses the requested compact width')
      assert.ok(geometry.plainDetails, 'Details have no gray cell backgrounds or borders')
      assert.ok(geometry.twoColumns, 'Reference details retain two balanced columns')
      assert.ok(geometry.keyFieldHeight >= 40, 'Device Key has a full-size masked field')
      await writeFile(path.join(directory,`device-details-${width}.png`), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
      console.log('Device Details geometry:', width, JSON.stringify(geometry))
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
      assert.ok(await evaluate('!document.querySelector("[role=dialog]") && document.activeElement.textContent === "View"'), 'Native Escape restores View focus')
    }
    console.log('Verified responsive Device Details screenshots:', directory)
  } finally {
    socket?.close()
    browser.kill()
    await server.close()
  }
})
