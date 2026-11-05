import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from 'vite'

test('Staff Reports Overview renders scoped API metrics, chronological charts and a compact responsive layout', { timeout: 60000 }, async () => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), 'agribantay-staff-reports-overview-vite-'))
  const server = await createServer({ cacheDir, optimizeDeps: { entries: ['tests/staff-reports-overview-browser.html'], include: ['react', 'react-dom/client', 'react-router-dom', 'axios'] }, server: { host: '127.0.0.1', port: 0, hmr: false } })
  await server.listen()
  const port = server.httpServer.address().port
  const profile = await mkdtemp(path.join(tmpdir(), 'agribantay-staff-reports-overview-browser-'))
  const browser = spawn(process.env.STAFF_REPORTS_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
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
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/tests/staff-reports-overview-browser.html` })
    let result
    for (let i = 0; i < 300; i++) {
      result = await evaluate('window.staffReportsOverviewResults')
      if (result) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.ok(result, 'Staff reports fixture must finish')
    assert.equal(result.error, undefined, result.error)
    assert.equal(result.passed.length, 8)
    for (const scenario of result.passed) console.log('PASS:', scenario)

    const directory = await mkdtemp(path.join(tmpdir(), 'agribantay-staff-reports-overview-preview-'))
    for (const width of [1440, 1100, 900, 768, 390, 320]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 720 })
      await evaluate('window.staffReportsOverview.preview()')
      const geometry = await evaluate(`(() => {
        const root = document.querySelector('.staff-reports'), chart = root.querySelector('canvas').getBoundingClientRect()
        const cards = [...root.querySelectorAll('.staff-overview-stats .rp-stat-card')]
        const boxes = cards.map(card => card.getBoundingClientRect())
        const toolbar = root.querySelector('.rp-filter-toolbar').getBoundingClientRect()
        const button = root.querySelector('.rp-filter-toolbar button[aria-controls]').getBoundingClientRect()
        return { overflow: document.documentElement.scrollWidth > innerWidth,
          darkGreen: cards.every(card => getComputedStyle(card).backgroundColor === 'rgb(35, 74, 53)' && getComputedStyle(card.firstElementChild).color === 'rgb(255, 255, 255)'),
          icons: cards.reduce((count, card) => count + card.querySelectorAll('svg,img').length, 0),
          equalHeights: boxes.every(box => Math.abs(box.height - boxes[0].height) < 1),
          columns: boxes.filter(box => Math.abs(box.top - boxes[0].top) < 1).length,
          chartHeight: chart.height, chartFits: chart.left >= 0 && chart.right <= innerWidth,
          filterFits: button.left >= 0 && button.right <= innerWidth && button.top >= toolbar.top && button.bottom <= toolbar.bottom,
          font: getComputedStyle(root).fontFamily }
      })()`)
      assert.equal(geometry.overflow, false, 'No horizontal overflow at ' + width)
      assert.ok(geometry.darkGreen && geometry.icons === 0 && geometry.equalHeights, 'Balanced dark-green KPI cards without icons')
      assert.ok(geometry.chartFits && geometry.filterFits, 'Chart and existing filter controls fit')
      assert.ok(geometry.chartHeight >= 220 && geometry.chartHeight <= 280, 'Compact responsive chart height')
      assert.match(geometry.font, /Inter/, 'Existing Inter typography')
      if (width === 1440) assert.equal(geometry.columns, 4, 'Desktop has four current cards in one row')
      if (width < 720) assert.equal(geometry.columns, 2, 'Mobile has two cards per row')
      await writeFile(path.join(directory, `staff-reports-overview-${width}.png`), Buffer.from((await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })).data, 'base64'))
      console.log('PASS: Staff reports responsive layout', width, JSON.stringify(geometry))

      await evaluate('window.staffReportsOverview.inspectionsPreview(true)')
      const inspectionGeometry = await evaluate(`(() => {
        const root = document.querySelector('.staff-reports'), body = root.querySelector('.staff-inspections-report')
        const cards = [...root.querySelectorAll('.staff-inspection-stats .rp-stat-card')]
        const boxes = cards.map(card => card.getBoundingClientRect()), canvas = body.querySelector('canvas').getBoundingClientRect()
        const mobile = body.querySelector('.rp-cards'), mobileVisible = getComputedStyle(mobile).display !== 'none'
        const table = body.querySelector('table'), badges = [...table.tBodies[0].rows].map(row => row.cells[5].firstElementChild)
        return { overflow: document.documentElement.scrollWidth > innerWidth,
          darkGreen: cards.every(card => getComputedStyle(card).backgroundColor === 'rgb(35, 74, 53)' && getComputedStyle(card.firstElementChild).color === 'rgb(255, 255, 255)'),
          equalHeights: boxes.every(box => Math.abs(box.height - boxes[0].height) < 1),
          columns: boxes.filter(box => Math.abs(box.top - boxes[0].top) < 1).length,
          chartHeight: canvas.height, chartFits: canvas.left >= 0 && canvas.right <= innerWidth,
          tableColumns: table.tHead.rows[0].cells.length,
          compactCells: getComputedStyle(table.tBodies[0].rows[0].cells[0]).paddingTop === '11px',
          completedBadges: badges.every(badge => badge.textContent === 'Completed' && getComputedStyle(badge).backgroundColor === 'rgb(234, 243, 236)'),
          mobileVisible,
          cardsFit: !mobileVisible || [...mobile.children].every(card => card.scrollWidth <= card.clientWidth),
          footerFits: body.querySelector('.agb-table-footer').scrollWidth <= body.querySelector('.agb-table-footer').clientWidth }
      })()`)
      assert.equal(inspectionGeometry.overflow, false, 'Inspection tab has no horizontal overflow at ' + width)
      assert.ok(inspectionGeometry.darkGreen && inspectionGeometry.equalHeights, 'Three compact dark-green inspection KPI cards')
      assert.equal(inspectionGeometry.columns, width < 720 ? 2 : 3, 'Responsive three-KPI layout')
      assert.ok(inspectionGeometry.chartFits && inspectionGeometry.chartHeight >= 200 && inspectionGeometry.chartHeight <= 240, 'Compact responsive type chart')
      assert.equal(inspectionGeometry.tableColumns, 6, 'All inspection columns retained')
      assert.ok(inspectionGeometry.compactCells && inspectionGeometry.completedBadges && inspectionGeometry.cardsFit && inspectionGeometry.footerFits, 'Readable table/mobile cards and existing footer fit, including long names')
      if (width < 720) assert.ok(inspectionGeometry.mobileVisible, 'Mobile uses the existing card fallback')
      await writeFile(path.join(directory, `staff-reports-inspections-${width}.png`), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
      console.log('PASS: Staff inspection responsive layout', width, JSON.stringify(inspectionGeometry))

      await evaluate('window.staffReportsOverview.alertsPreview(true)')
      const alertGeometry = await evaluate(`(() => {
        const root = document.querySelector('.staff-reports'), body = root.querySelector('.staff-alerts-report')
        const cards = [...root.querySelectorAll('.staff-alert-stats .rp-stat-card')], boxes = cards.map(card => card.getBoundingClientRect())
        const region = body.querySelector('.staff-alert-chart-scroll'), rect = region.getBoundingClientRect()
        const legend = body.querySelector('.staff-alert-chart-legend').getBoundingClientRect()
        const canvas = body.querySelector('canvas').getBoundingClientRect(), mobile = body.querySelector('.rp-cards')
        const mobileVisible = getComputedStyle(mobile).display !== 'none'
        return { overflow: document.documentElement.scrollWidth > innerWidth,
          darkGreen: cards.every(card => getComputedStyle(card).backgroundColor === 'rgb(35, 74, 53)' && getComputedStyle(card.firstElementChild).color === 'rgb(255, 255, 255)'),
          equalHeights: boxes.every(box => Math.abs(box.height - boxes[0].height) < 1),
          columns: boxes.filter(box => Math.abs(box.top - boxes[0].top) < 1).length,
          chartHeight: canvas.height, regionFits: rect.left >= 0 && rect.right <= innerWidth,
          legendFits: legend.left >= 0 && legend.right <= innerWidth,
          tableColumns: body.querySelector('table').tHead.rows[0].cells.length,
          mobileCardsFit: !mobileVisible || [...mobile.children].every(card => card.scrollWidth <= card.clientWidth),
          footerFits: body.querySelector('.agb-table-footer').scrollWidth <= body.querySelector('.agb-table-footer').clientWidth }
      })()`)
      assert.equal(alertGeometry.overflow, false, 'Alert tab has no horizontal page overflow')
      assert.ok(alertGeometry.darkGreen && alertGeometry.equalHeights, 'Three balanced dark-green alert cards')
      assert.equal(alertGeometry.columns, width < 720 ? 2 : 3, 'Responsive alert card layout')
      assert.ok(alertGeometry.chartHeight >= 220 && alertGeometry.chartHeight <= 260 && alertGeometry.regionFits && alertGeometry.legendFits, 'Compact grouped chart and fixed legend fit')
      assert.ok(alertGeometry.tableColumns === 6 && alertGeometry.mobileCardsFit && alertGeometry.footerFits, 'Compact alert table/card/footer preserve all columns without overflow')
      const alertState = await evaluate('window.staffReportsOverview.alertState()')
      assert.ok(alertState.grouped && alertState.pairGaps.every(gap => gap >= 0 && gap <= 8), 'Sensor bars form clear adjacent pairs at all sizes')
      await writeFile(path.join(directory, `staff-reports-alerts-${width}.png`), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
      console.log('PASS: Staff alerts responsive layout', width, JSON.stringify(alertGeometry))
    }

    for (const timezoneId of ['America/Los_Angeles', 'Pacific/Kiritimati', 'Asia/Manila']) {
      await send('Emulation.setTimezoneOverride', { timezoneId })
      await evaluate('window.staffReportsOverview.preview()')
      const state = await evaluate('window.staffReportsOverview.state()')
      assert.deepEqual(state.labels, ['Jun 2026', 'Jul 2026', 'Aug 2026', 'Sep 2026', 'Oct 2026'])
      assert.deepEqual(state.values, [2, 0, 4, 1, 0])
      assert.equal(state.min, 0)
      assert.ok(state.ticks.every(Number.isInteger), 'Real chart ticks are integer only')
      assert.equal(state.tooltip, '1 completed inspection')
      assert.equal(state.color, '#234A35')
    }
    console.log('PASS: Manila chart month boundaries, integer ticks and tooltips across browser timezones')

    await evaluate('window.staffReportsOverview.filter()')
    assert.ok(await evaluate(`document.querySelector('[aria-label="Filter By"]') !== null`), 'Existing filter opens')
    await evaluate(`document.querySelector('[aria-label="Filter By"]').focus()`)
    await key('Escape', 'Escape', 27)
    assert.ok(await evaluate(`!document.querySelector('[aria-label="Filter By"]') && document.activeElement.getAttribute('aria-expanded') === 'false'`), 'Escape closes the filter and restores its trigger focus')
    console.log('PASS: reporting filter remains keyboard accessible with safe focus return')
    await evaluate('window.staffReportsOverview.alertsYearPreview()')
    await evaluate('document.querySelector(".staff-alert-chart-scroll").focus()')
    await key('ArrowRight', 'ArrowRight', 39)
    await new Promise(resolve => setTimeout(resolve, 150))
    assert.ok(await evaluate('document.querySelector(".staff-alert-chart-scroll").scrollLeft > 0'), 'Long monthly charts can be scrolled with the keyboard')
    assert.ok(await evaluate('document.querySelector(".staff-alert-chart-legend").getBoundingClientRect().right <= innerWidth'), 'Sensor legend stays visible outside the scrolling plot')
    console.log('PASS: long monthly sensor timelines scroll by keyboard while the legend stays readable')
    console.log('Verified Staff Reports Overview screenshots:', directory)
  } finally {
    socket?.close()
    browser.kill()
    await server.close()
  }
})
