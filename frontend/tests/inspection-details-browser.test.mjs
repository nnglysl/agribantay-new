import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from 'vite'

test('Inspection Details preserves all role views with accessible dismissal and responsive scrolling', { timeout: 60000 }, async () => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), 'agribantay-inspection-vite-'))
  const server = await createServer({ cacheDir, optimizeDeps: { entries: ['tests/inspection-details-browser.html'], include: ['react', 'react-dom/client', 'react-router-dom', 'axios'] }, server: { host: '127.0.0.1', port: 0, hmr: false } })
  await server.listen()
  const port = server.httpServer.address().port
  const profile = await mkdtemp(path.join(tmpdir(), 'agribantay-inspection-browser-'))
  const browser = spawn(process.env.INSPECTION_DETAILS_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-extensions', '--disable-background-networking',
      '--disable-features=RendererCodeIntegrity,msEdgeSidebarV2', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
      '--remote-allow-origins=*', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
  let socket
  try {
    const endpoint = await new Promise((resolve, reject) => {
      let stderr = ''
      const timer = setTimeout(() => reject(Error('Headless browser startup timed out')), 15000)
      browser.on('error', error => { clearTimeout(timer); reject(error) })
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
      const timeout = setTimeout(() => { pending.delete(requestId); reject(Error('DevTools timeout: ' + method)) }, 15000)
      pending.set(requestId, result => { clearTimeout(timeout); result.error ? reject(Error(JSON.stringify(result.error))) : resolve(result.result) })
      socket.send(JSON.stringify({ id: requestId, method, params }))
    })
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails))
      return result.result.value
    }
    const key = async (value, code, virtualKey, modifiers = 0) => {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: value, code, windowsVirtualKeyCode: virtualKey, modifiers })
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: value, code, windowsVirtualKeyCode: virtualKey, modifiers })
    }
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/tests/inspection-details-browser.html` })
    let result
    for (let i = 0; i < 250; i++) {
      result = await evaluate('window.inspectionDetailsResults')
      if (result) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.ok(result, 'Browser fixture must finish')
    assert.equal(result.error, undefined, result.error)
    assert.equal(result.passed.length, 6)
    for (const scenario of result.passed) console.log('PASS:', scenario)

    for (const role of ['admin', 'super_admin', 'farm_owner']) {
      await evaluate(`window.inspectionDetails.render('${role}').then(async () => { await window.inspectionDetails.open(); return true })`)
      await key('Tab', 'Tab', 9, 8)
      assert.ok(await evaluate('document.activeElement.classList.contains("inspection-details-body")'), 'Shift+Tab stays in the modal')
      await key('Tab', 'Tab', 9)
      assert.ok(await evaluate('document.activeElement.classList.contains("inspection-details-close")'), 'Tab returns to X')
      await key('Escape', 'Escape', 27)
      assert.ok(await evaluate('!document.querySelector("dialog[open]") && document.activeElement.textContent === "View" && document.body.style.overflow !== "hidden"'), role + ': native Escape restores focus and scrolling')
    }
    console.log('PASS: Native Tab, Shift+Tab and Escape preserve focus for all three roles')

    for (const role of ['admin', 'super_admin']) {
      for (const width of [1280, 390]) {
        await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 560 })
        await evaluate(`window.inspectionDetails.calendar('${role}')`)
        for (const [value, code, virtualKey] of [['Enter', 'Enter', 13], [' ', 'Space', 32]]) {
          await key(value, code, virtualKey)
          assert.ok(await evaluate('document.querySelector("dialog[open] .inspection-details-record")?.textContent.includes("INS-903")'), 'Calendar opens the correct record by keyboard')
          await key('Escape', 'Escape', 27)
          assert.ok(await evaluate('!document.querySelector("dialog[open]") && document.activeElement.classList.contains("inspection-details-trigger")'), 'Calendar opener regains focus')
        }
      }
    }
    console.log('PASS: desktop and mobile calendar openers support Enter, Space and focus restoration')

    const directory = await mkdtemp(path.join(tmpdir(), 'agribantay-inspection-preview-'))
    for (const [width, height] of [[1440, 1000], [768, 900], [560, 844], [390, 844], [320, 568], [844, 390]]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width <= 560 })
      await evaluate('window.inspectionDetails.preview()')
      const geometry = await evaluate(`(() => {
        const dialog = document.querySelector('dialog[open]'), rect = dialog.getBoundingClientRect()
        const body = dialog.querySelector('.inspection-details-body'), close = dialog.querySelector('button').getBoundingClientRect()
        const cells = [...dialog.querySelectorAll('dl > div')].map(element => element.getBoundingClientRect())
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width,
          overflow: dialog.scrollWidth > dialog.clientWidth || body.scrollWidth > body.clientWidth,
          columns: Math.abs(cells[0].top - cells[1].top) < 1 ? 2 : 1,
          closeSize: [close.width, close.height], scrollable: body.scrollHeight > body.clientHeight,
          font: getComputedStyle(dialog).fontFamily }
      })()`)
      assert.ok(geometry.left >= 0 && geometry.right <= width && geometry.top >= 0 && geometry.bottom <= height, 'Modal fits ' + width + 'x' + height)
      assert.equal(geometry.overflow, false, 'No horizontal overflow')
      assert.equal(geometry.columns, width <= 560 ? 1 : 2, 'Responsive information grid')
      assert.ok(geometry.closeSize.every(size => size >= 44), 'X has a 44px target')
      assert.match(geometry.font, /Inter/, 'Existing Inter font')
      if (width >= 768) assert.equal(geometry.width, 640, 'Compact desktop width')
      await writeFile(path.join(directory, `inspection-details-${width}x${height}.png`), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
      console.log('PASS: responsive layout', width, height, JSON.stringify(geometry))
      await key('Escape', 'Escape', 27)
    }

    await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 568, deviceScaleFactor: 1, mobile: true })
    await evaluate('window.inspectionDetails.longPreview()')
    await key('Tab', 'Tab', 9)
    assert.ok(await evaluate('document.activeElement.classList.contains("inspection-details-body")'), 'Content can receive keyboard focus for scrolling')
    await key('End', 'End', 35, 2)
    await new Promise(resolve => setTimeout(resolve, 150))
    assert.ok(await evaluate(`(() => {
      const dialog = document.querySelector('dialog[open]'), body = dialog.querySelector('.inspection-details-body')
      const close = dialog.querySelector('button').getBoundingClientRect()
      return body.scrollTop > 0 && body.scrollHeight > body.clientHeight && body.scrollWidth === body.clientWidth && close.top >= 0 && close.bottom <= innerHeight
    })()`), 'Long findings scroll by keyboard; long words wrap; X stays visible')
    await key('Escape', 'Escape', 27)
    assert.ok(await evaluate('!document.querySelector("dialog[open]") && document.activeElement.textContent === "View long inspection"'), 'Long content restores focus')
    console.log('PASS: long findings, unbroken values, keyboard scrolling and visible close control')
    console.log('Verified Inspection Details screenshots:', directory)
  } finally {
    socket?.close()
    browser.kill()
    await server.close()
  }
})
