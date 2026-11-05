import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from 'vite'

test('Automatic complete farm printing in an isolated headless browser', async () => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), 'agribantay-phase9-vite-'))
  const server = await createServer({ cacheDir, optimizeDeps: { entries: ['tests/farm-print-browser.html'], include: ['react', 'react-dom/client', 'axios'] }, server: { host: '127.0.0.1', port: 0, hmr: false } })
  await server.listen()
  const port = server.httpServer.address().port
  const profile = await mkdtemp(path.join(tmpdir(), 'agribantay-phase9-browser-'))
  const browser = spawn(process.env.PHASE9_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
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
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/tests/farm-print-browser.html` })
    let result
    for (let i = 0; i < 550; i++) {
      const evaluation = await send('Runtime.evaluate', { expression: 'window.phase9Results', returnByValue: true, timeout: 1500 })
      result = evaluation.result?.value
      if (result) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    if (result?.error) console.log('Completed before failure:', result.passed, 'Unexpected:', result.unexpected, 'Runtime:', result.runtimeErrors)
    assert.ok(result, 'Browser fixture must finish')
    assert.equal(result.error, undefined, result.error)
    assert.equal(result.passed.length, 8)
    if (process.env.PHASE9_SCREENSHOTS === '1' || process.env.PHASE9_UI_SCREENSHOTS === '1') {
      const directory = await mkdtemp(path.join(tmpdir(), 'agribantay-phase9-preview-'))
      const documents = []
      for (const [paper, orientation] of process.env.PHASE9_SCREENSHOTS === '1' ? [['A4','portrait'],['Letter','landscape']] : []) {
        await send('Runtime.evaluate',{expression:'window.phase9Preview({longHistory:true})',awaitPromise:true,returnByValue:true})
        const html = (await send('Runtime.evaluate',{expression:'window.phase9DocumentHtml()',returnByValue:true})).result.value
        assert.ok(!html.includes('private-fixture-ticket') && !html.includes('FIXTURE-DEVICE-CREDENTIAL'))
        documents.push({paper,orientation,html})
      }
      for (const width of [1440,900,390,320]) {
        await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<=600})
        await send('Runtime.evaluate',{expression:'window.phase9Open("super_admin")',awaitPromise:true,returnByValue:true})
        const geometry=(await send('Runtime.evaluate',{expression:'(() => { const el=document.querySelector(".fp-dialog"),r=el.getBoundingClientRect();return {width:r.width,height:r.height,left:r.left,right:r.right,overflow:el.scrollWidth>el.clientWidth}; })()',returnByValue:true})).result.value
        assert.ok(geometry.left>=0&&geometry.right<=width&&!geometry.overflow,'Compact dialog must fit '+width+'px viewport')
        assert.ok(width<600||geometry.width>=500&&geometry.width<=600,'Desktop dialog stays compact')
        assert.ok(geometry.height<400,'Default dialog height follows its short content')
        await writeFile(path.join(directory,`configuration-${width}.png`),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'))
        console.log('Compact modal:',width,JSON.stringify(geometry))
      }
      await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
      await send('Runtime.evaluate',{expression:'window.phase9Header()',awaitPromise:true,returnByValue:true})
      await writeFile(path.join(directory,'farm-header-mobile.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'))
      await send('Runtime.evaluate',{expression:'window.phase9Preview({role:"admin",count:2})',awaitPromise:true,returnByValue:true})
      const bounds = await send('Runtime.evaluate',{expression:'document.querySelector(".fp-dialog").getBoundingClientRect().right <= innerWidth && document.querySelector(".fp-dialog").getBoundingClientRect().left >= 0',returnByValue:true})
      assert.ok(bounds.result.value,'Configuration must fit mobile viewport')
      const previewScroll=(await send('Runtime.evaluate',{expression:'(() => { const el=document.querySelector(".fp-preview-viewport");return el.clientHeight<=innerHeight*.55+1&&el.scrollHeight>el.clientHeight; })()',returnByValue:true})).result.value
      assert.ok(previewScroll,'Complete preview remains scrollable within its allocated height')
      await writeFile(path.join(directory,'configuration-mobile.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'))
      const diagnostics=(await send('Runtime.evaluate',{expression:'window.phase9Diagnostics()',returnByValue:true})).result.value
      assert.deepEqual(diagnostics,[],'Responsive print preview must not produce runtime errors')
      const measurements=[]
      for (const {paper,orientation,html} of documents) {
        const {frameTree}=await send('Page.getFrameTree')
        await send('Page.setDocumentContent',{frameId:frameTree.frame.id,html})
        const assets=await send('Runtime.evaluate',{expression:'Promise.all([...document.images].map(image => image.decode())).then(() => !!document.querySelector(".print-signatures"))',awaitPromise:true,returnByValue:true})
        assert.equal(assets.result?.value,true,'Shared report branding must load before rendering PDF')
        await send('Emulation.setEmulatedMedia',{media:'print'})
        const dimensions={A4:[210,297],Letter:[215.9,279.4],Legal:[215.9,355.6],A3:[297,420]}[paper]
        if(orientation==='landscape')dimensions.reverse()
        const printed = await send('Page.printToPDF',{printBackground:true,preferCSSPageSize:false,displayHeaderFooter:false,paperWidth:dimensions[0]/25.4,paperHeight:dimensions[1]/25.4,marginTop:.5,marginBottom:.5,marginLeft:.5,marginRight:.5})
        const bytes = Buffer.from(printed.data,'base64'), raw=bytes.toString('latin1')
        assert.equal(bytes.subarray(0,5).toString(),'%PDF-')
        const box=raw.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/), pages=(raw.match(/\/Type\s*\/Page\b/g)||[]).length
        assert.ok(box&&pages>1,'Long records must produce multiple complete printed pages')
        assert.ok(Math.abs(Number(box[1])-dimensions[0]*72/25.4)<2&&Math.abs(Number(box[2])-dimensions[1]*72/25.4)<2,'PDF paper size/orientation must follow native browser preferences')
        await writeFile(path.join(directory,`${paper}-${orientation}.pdf`),bytes)
        measurements.push({paper,orientation,pages,widthPt:Number(box[1]),heightPt:Number(box[2])})
      }
      await writeFile(path.join(directory,'measurements.json'),JSON.stringify(measurements,null,2))
      console.log(documents.length?'Verified native browser PDFs:':'Verified compact modal previews:',directory,JSON.stringify(measurements))
    }
    for(const scenario of result.passed)console.log('PASS:',scenario)
  } finally { socket?.close(); browser.kill(); await server.close() }
})
