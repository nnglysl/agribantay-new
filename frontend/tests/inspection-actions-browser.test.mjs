import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from 'vite'

test('Inspection actions preserve contracts, safe saving, accessible dismissal and compact responsive layout', { timeout: 60000 }, async () => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), 'agribantay-inspection-actions-vite-'))
  const server = await createServer({ cacheDir, optimizeDeps: { entries: ['tests/inspection-actions-browser.html'], include: ['react', 'react-dom/client', 'react-router-dom', 'axios'] }, server: { host: '127.0.0.1', port: 0, hmr: false } })
  await server.listen()
  const port = server.httpServer.address().port
  const profile = await mkdtemp(path.join(tmpdir(), 'agribantay-inspection-actions-browser-'))
  const browser = spawn(process.env.INSPECTION_ACTIONS_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
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
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/tests/inspection-actions-browser.html` })
    let result
    for (let i = 0; i < 250; i++) {
      result = await evaluate('window.inspectionActionsResults')
      if (result) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.ok(result, 'Action fixture must finish')
    assert.equal(result.error, undefined, result.error)
    assert.equal(result.passed.length, 6)
    for (const scenario of result.passed) console.log('PASS:', scenario)

    await evaluate('window.inspectionActions.preview()')
    assert.ok(await evaluate('document.activeElement.tagName === "TEXTAREA"'), 'Findings receive initial keyboard focus')
    await key('Tab', 'Tab', 9)
    assert.ok(await evaluate('document.activeElement.textContent === "Cancel"'), 'Findings tab to Cancel')
    await key('Tab', 'Tab', 9)
    assert.ok(await evaluate('document.activeElement.textContent === "Mark as Completed"'), 'Cancel tabs to primary action')
    await key('Tab', 'Tab', 9)
    assert.ok(await evaluate('document.activeElement.getAttribute("aria-label") === "Close Complete Inspection"'), 'Tab wraps within the dialog')
    await key('Tab', 'Tab', 9, 8)
    assert.ok(await evaluate('document.activeElement.textContent === "Mark as Completed"'), 'Shift+Tab wraps within the dialog')
    await key('Escape', 'Escape', 27)
    assert.ok(await evaluate('!document.querySelector("dialog[open]") && document.activeElement.textContent === "Complete" && document.body.style.overflow !== "hidden"'), 'Safe Escape restores opener focus and scrolling')

    await evaluate('window.inspectionActions.preview()')
    const before = await evaluate('window.inspectionActions.count()')
    await evaluate('window.inspectionActions.begin()')
    await key('Escape', 'Escape', 27)
    assert.ok(await evaluate('!!document.querySelector("dialog[open]")'), 'Escape is blocked while processing')
    await key('Tab', 'Tab', 9)
    await key('Tab', 'Tab', 9, 8)
    assert.ok(await evaluate('document.activeElement.tagName === "TEXTAREA"'), 'Focus stays in the form while buttons are disabled')
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 1, y: 1, button: 'left', clickCount: 1 })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 1, y: 1, button: 'left', clickCount: 1 })
    assert.ok(await evaluate('!!document.querySelector("dialog[open]")'), 'Native backdrop click is blocked while saving')
    assert.equal(await evaluate('window.inspectionActions.count()'), before + 1, 'Only one pending request')
    await evaluate('window.inspectionActions.reject()')
    await key('Escape', 'Escape', 27)
    assert.ok(await evaluate('!document.querySelector("dialog[open]") && document.activeElement.textContent === "Complete"'), 'Escape works again after failure')
    console.log('PASS: native keyboard navigation, focus restoration, and busy Escape/backdrop lock')

    await evaluate('window.inspectionActions.previewCancel()')
    await key('Tab', 'Tab', 9)
    assert.ok(await evaluate('document.activeElement.textContent === "Keep Inspection"'), 'Reason tabs to Keep Inspection')
    await key('Tab', 'Tab', 9)
    assert.ok(await evaluate('document.activeElement.getAttribute("aria-label") === "Close Cancel Inspection"'), 'Disabled destructive action is skipped and focus remains contained')
    await key('Tab', 'Tab', 9, 8)
    assert.ok(await evaluate('document.activeElement.textContent === "Keep Inspection"'), 'Cancellation Shift+Tab wraps safely')
    await key('Escape', 'Escape', 27)
    assert.ok(await evaluate('!document.querySelector("dialog[open]") && document.activeElement.textContent === "Cancel" && document.body.style.overflow !== "hidden"'), 'Safe cancellation Escape restores focus and page scrolling')
    await evaluate('window.inspectionActions.previewCancel()')
    const beforeCancel = await evaluate('window.inspectionActions.count()')
    await evaluate('window.inspectionActions.beginCancel()')
    await key('Escape', 'Escape', 27)
    await key('Tab', 'Tab', 9)
    await key('Tab', 'Tab', 9, 8)
    assert.ok(await evaluate('!!document.querySelector("dialog[open]") && document.activeElement.tagName === "TEXTAREA"'), 'Cancellation Escape and Tab remain safe during processing')
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 1, y: 1, button: 'left', clickCount: 1 })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 1, y: 1, button: 'left', clickCount: 1 })
    assert.ok(await evaluate('!!document.querySelector("dialog[open]")'), 'Native cancellation backdrop is locked while pending')
    assert.equal(await evaluate('window.inspectionActions.count()'), beforeCancel + 1, 'One pending cancellation request')
    await evaluate('window.inspectionActions.reject()')
    await key('Escape', 'Escape', 27)
    assert.ok(await evaluate('!document.querySelector("dialog[open]") && document.activeElement.textContent === "Cancel"'), 'Failed cancellation restores safe Escape dismissal')
    console.log('PASS: cancellation native keyboard navigation, focus restoration and pending dismissal lock')

    const directory = await mkdtemp(path.join(tmpdir(), 'agribantay-inspection-actions-preview-'))
    for (const [width, height] of [[1440, 1000], [768, 900], [520, 844], [390, 844], [320, 568], [844, 320]]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width <= 560 })
      await evaluate('window.inspectionActions.preview()')
      const geometry = await evaluate(`(() => {
        const dialog = document.querySelector('dialog[open]'), rect = dialog.getBoundingClientRect()
        const textarea = dialog.querySelector('textarea'), field = textarea.getBoundingClientRect()
        const buttons = [...dialog.querySelectorAll('.inspection-action-actions button')].map(element => element.getBoundingClientRect())
        const close = dialog.querySelector('.inspection-details-close').getBoundingClientRect()
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height,
          overflow: dialog.scrollWidth > dialog.clientWidth || dialog.querySelector('.inspection-action-body').scrollWidth > dialog.querySelector('.inspection-action-body').clientWidth,
          textareaHeight: field.height, focusOutline: getComputedStyle(textarea).outlineStyle,
          buttonRows: Math.abs(buttons[0].top - buttons[1].top) < 1 ? 1 : 2,
          buttonsVisible: buttons.every(button => button.top >= rect.top && button.bottom <= rect.bottom),
          rightAligned: Math.abs(buttons[1].right - (rect.right - (innerWidth <= 560 ? 17 : 25))) < 1,
          closeSize: [close.width, close.height], font: getComputedStyle(dialog).fontFamily,
          primaryColor: getComputedStyle(dialog.querySelector('.inspection-action-primary')).backgroundColor }
      })()`)
      assert.ok(geometry.left >= 0 && geometry.right <= width && geometry.top >= 0 && geometry.bottom <= height, 'Modal fits ' + width + 'x' + height)
      assert.equal(geometry.overflow, false, 'No horizontal overflow')
      assert.equal(geometry.buttonRows, width <= 420 ? 2 : 1, 'Responsive buttons')
      assert.ok(geometry.buttonsVisible && geometry.rightAligned, 'Actions stay visible and right aligned')
      assert.ok(geometry.closeSize.every(size => size >= 44), 'X has a 44px target')
      assert.ok(geometry.textareaHeight >= 110 && geometry.textareaHeight <= 130, 'Comfortable compact textarea')
      assert.equal(geometry.focusOutline, 'solid', 'Visible field focus')
      assert.match(geometry.font, /Inter/, 'Existing Inter font')
      assert.equal(geometry.primaryColor, 'rgb(35, 74, 53)', 'Existing dark-green primary action')
      if (width >= 768) { assert.equal(geometry.width, 500, 'Compact desktop width'); assert.ok(geometry.height < 420, 'No excessive default height') }
      await writeFile(path.join(directory, `complete-inspection-${width}x${height}.png`), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
      console.log('PASS: completion responsive layout', width, height, JSON.stringify(geometry))
      await key('Escape', 'Escape', 27)

      await evaluate('window.inspectionActions.previewCancel()')
      const cancellationGeometry = await evaluate(`(() => {
        const dialog = document.querySelector('dialog[open]'), rect = dialog.getBoundingClientRect()
        const field = dialog.querySelector('textarea'), fieldRect = field.getBoundingClientRect()
        const body = dialog.querySelector('.inspection-action-body'), label = dialog.querySelector('label').getBoundingClientRect()
        const buttons = [...dialog.querySelectorAll('.inspection-action-actions button')].map(element => element.getBoundingClientRect())
        const destructive = getComputedStyle(dialog.querySelector('.inspection-action-destructive'))
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width,
          overflow: dialog.scrollWidth > dialog.clientWidth || body.scrollWidth > body.clientWidth,
          textareaHeight: fieldRect.height, labelAbove: label.bottom <= fieldRect.top,
          buttonRows: Math.abs(buttons[0].top - buttons[1].top) < 1 ? 1 : 2,
          buttonsVisible: buttons.every(button => button.top >= rect.top && button.bottom <= rect.bottom),
          rightAligned: Math.abs(buttons[1].right - (rect.right - (innerWidth <= 560 ? 17 : 25))) < 1,
          destructiveColor: destructive.backgroundColor, destructiveText: destructive.color }
      })()`)
      assert.ok(cancellationGeometry.left >= 0 && cancellationGeometry.right <= width && cancellationGeometry.top >= 0 && cancellationGeometry.bottom <= height, 'Cancellation fits the viewport')
      assert.equal(cancellationGeometry.overflow, false, 'Cancellation has no horizontal overflow')
      assert.ok(cancellationGeometry.labelAbove && cancellationGeometry.textareaHeight >= 100 && cancellationGeometry.textareaHeight <= 120, 'Cancellation has a full-width compact field below its label')
      assert.equal(cancellationGeometry.buttonRows, width <= 420 ? 2 : 1, 'Cancellation responsive buttons')
      assert.ok(cancellationGeometry.buttonsVisible && cancellationGeometry.rightAligned, 'Cancellation footer is visible and aligned')
      assert.equal(cancellationGeometry.destructiveColor, 'rgb(185, 28, 28)', 'Existing destructive red')
      assert.equal(cancellationGeometry.destructiveText, 'rgb(255, 255, 255)', 'Destructive button has white text')
      if (width >= 768) assert.equal(cancellationGeometry.width, 500, 'Cancellation shares the 500px action width')
      await writeFile(path.join(directory, `cancel-inspection-${width}x${height}.png`), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
      console.log('PASS: cancellation responsive layout', width, height, JSON.stringify(cancellationGeometry))
      await key('Escape', 'Escape', 27)
    }

    await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 568, deviceScaleFactor: 1, mobile: true })
    await evaluate('window.inspectionActions.longError()')
    assert.ok(await evaluate(`(() => {
      const dialog = document.querySelector('dialog[open]'), body = dialog.querySelector('.inspection-action-body')
      body.scrollTop = body.scrollHeight
      const close = dialog.querySelector('.inspection-details-close').getBoundingClientRect()
      const action = dialog.querySelector('.inspection-action-primary').getBoundingClientRect()
      return body.scrollTop > 0 && body.scrollWidth === body.clientWidth && close.top >= 0 && action.bottom <= innerHeight && dialog.textContent.includes('Detailed validation feedback.')
    })()`), 'Long farm names and validation feedback wrap/scroll with X and actions visible')
    await writeFile(path.join(directory, 'complete-inspection-long-error.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
    await key('Escape', 'Escape', 27)
    console.log('PASS: long names and validation feedback remain readable and scrollable')
    await evaluate('window.inspectionActions.longCancellationError()')
    assert.ok(await evaluate(`(() => {
      const dialog = document.querySelector('dialog[open]'), body = dialog.querySelector('.inspection-action-body')
      body.scrollTop = body.scrollHeight
      const close = dialog.querySelector('.inspection-details-close').getBoundingClientRect()
      const action = dialog.querySelector('.inspection-action-destructive').getBoundingClientRect()
      return body.scrollTop > 0 && body.scrollWidth === body.clientWidth && close.top >= 0 && action.bottom <= innerHeight && dialog.textContent.includes('Detailed cancellation feedback.')
    })()`), 'Long owner names and cancellation errors wrap and scroll with actions visible')
    await writeFile(path.join(directory, 'cancel-inspection-long-error.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
    await key('Escape', 'Escape', 27)
    console.log('PASS: long cancellation names and errors remain readable and scrollable')
    console.log('Verified inspection action screenshots:', directory)
  } finally {
    socket?.close()
    browser.kill()
    await server.close()
  }
})
