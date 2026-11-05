import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from 'vite'

test('Unassign Device confirms once, preserves notices and dismisses without mutations', async () => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), 'agribantay-unassign-device-vite-'))
  const server = await createServer({ cacheDir, optimizeDeps: { entries: ['tests/unassign-device-browser.html'], include: ['react', 'react-dom/client', 'axios'] }, server: { host: '127.0.0.1', port: 0, hmr: false } })
  await server.listen()
  const port = server.httpServer.address().port
  const profile = await mkdtemp(path.join(tmpdir(), 'agribantay-unassign-device-browser-'))
  const browser = spawn(process.env.UNASSIGN_DEVICE_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
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
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/tests/unassign-device-browser.html` })
    let result
    for (let i = 0; i < 200; i++) {
      result = await evaluate('window.unassignDeviceResults')
      if (result) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.ok(result, 'Browser fixture must finish')
    assert.equal(result.error, undefined, result.error)
    assert.equal(result.passed.length, 5)
    for (const scenario of result.passed) console.log('PASS:', scenario)
    const directory = await mkdtemp(path.join(tmpdir(), 'agribantay-unassign-device-preview-'))
    for (const width of [1440, 900, 390, 320]) {
      const height = width < 720 ? 844 : 1000
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 720 })
      await evaluate('window.unassignDevicePreview()')
      const geometry = await evaluate(`(() => {
        const dialog=document.querySelector('[role="alertdialog"]'), rect=dialog.getBoundingClientRect()
        const buttons=[...dialog.querySelectorAll('.unassign-device-actions button')].map(element=>element.getBoundingClientRect())
        return { left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,width:rect.width,height:rect.height,
          centered:Math.abs(rect.left+rect.width/2-innerWidth/2)<1 && Math.abs(rect.top+rect.height/2-innerHeight/2)<1,
          overflow:dialog.scrollWidth>dialog.clientWidth,
          buttonsMatch:Math.abs(buttons[0].height-buttons[1].height)<1 && buttons[0].height>=40 }
      })()`)
      assert.ok(geometry.left>=0 && geometry.right<=width && geometry.top>=0 && geometry.bottom<=height,'Dialog fits '+width+'px')
      assert.ok(geometry.centered && !geometry.overflow,'Confirmation remains centered without overflow')
      assert.ok(geometry.buttonsMatch,'Actions have matching, comfortable heights')
      if(width>=720) assert.ok(geometry.width>=400 && geometry.width<=440,'Use the requested compact desktop width')
      await writeFile(path.join(directory,`unassign-device-${width}.png`), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
      if(width===1440) await writeFile(path.join(directory,'unassign-modal.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png',clip:{x:geometry.left,y:geometry.top,width:geometry.width,height:geometry.height,scale:1}})).data,'base64'))
      console.log('Unassign Device geometry:', width, JSON.stringify(geometry))
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
      assert.ok(await evaluate('!document.querySelector("[role=alertdialog]") && document.activeElement.textContent === "Unassign"'), 'Native Escape restores Unassign focus')
    }
    console.log('Verified responsive Unassign Device screenshots:', directory)
  } finally {
    socket?.close()
    browser.kill()
    await server.close()
  }
})
