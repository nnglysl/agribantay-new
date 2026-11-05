import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { createServer } from 'vite'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
let server, utils, api, Document, makeFixture
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  utils = await server.ssrLoadModule('/src/utils/farmPrint.js')
  api = (await server.ssrLoadModule('/src/api/axios.js')).default
  Document = (await server.ssrLoadModule('/src/components/farm-print/FarmPrintDocument.jsx')).default
  makeFixture = (await server.ssrLoadModule('/tests/farm-print-fixture.js')).makePrintFixture
})
after(async () => { await server?.close() })
function transport(fixture, alter = value => value) {
  const calls = []
  api.post = async (url, body) => {
    calls.push({ url, body })
    if (url.endsWith('/print-preview')) return { data: { data: fixture.manifest } }
    const rows = fixture.records[body.section].filter(row => row.id > body.after_id)
    const items = rows.slice(0, 500)
    return { data: { data: alter({ farm_id: 1, section: body.section, items, expected_total: fixture.manifest.streams[body.section].total, next_after_id: items.at(-1)?.id || body.after_id, has_more: rows.length > 500 }) } }
  }
  return calls
}
test('native page settings are the default and explicit legacy preferences stay bounded', () => {
  assert.ok(!utils.printCss().includes('@page'))
  for (const paper of ['A4','Letter','Legal','A3','browser']) for (const orientation of ['portrait','landscape']) {
    if (paper === 'browser') assert.ok(!utils.printCss(paper, orientation).includes('@page'))
    else assert.ok(utils.printCss(paper, orientation).includes(`size: ${paper} ${orientation}`))
    assert.ok(utils.paperDimensions(paper,orientation)[0] > 0)
  }
  assert.ok(!utils.printCss('x; color:red','bad').includes('color:red'))
})

test('print separates incomplete current severity from retained historical classifications', () => {
  const fixture = makeFixture({ sections: ['monitoring', 'readings'], count: 1 })
  fixture.manifest.snapshots.monitoring_assessment = { condition: 'Warning', incomplete_data: true, complete_devices: 0, total_devices: 1 }
  Object.assign(fixture.manifest.snapshots.monitoring[0], { moisture: null, primary_assessment: { incomplete_data: true } })
  Object.assign(fixture.records.readings[0], { moisture: null, primary_assessment: { incomplete_data: true } })
  const before = JSON.stringify(fixture)
  const html = renderToStaticMarkup(React.createElement(Document, { report: { ...fixture.manifest, records: fixture.records } }))
  assert.ok(html.includes('Farm condition: Warning') && html.includes('Incomplete Data') && html.includes('0 of 1 devices have both primary readings'))
  assert.ok(html.includes('Not assessed (stored status: Safe)'))
  assert.equal(JSON.stringify(fixture), before)
})
test('dates reject missing, impossible and reversed custom ranges', () => {
  for (const pair of [['',''],['2026-02-30','2026-03-01'],['2026-11-02','2026-11-01']]) assert.ok(utils.printRange('custom',...pair).error)
  assert.equal(utils.printRange('all','','').error,'')
  assert.equal(utils.printRange('custom','2024-02-29','2024-02-29').error,'')
})
test('complete batching retrieves 1001 rows beyond the first page and discards the ticket', async () => {
  const fixture = makeFixture({ sections: ['readings'] }), calls = transport(fixture), progress = []
  const report = await utils.loadFarmPrintData(1,{sections:['readings'],dateMode:'all'}, { onProgress: p=>progress.push(p) })
  assert.equal(report.records.readings.length,1001); assert.equal(calls.length,4)
  assert.equal(report.ticket,undefined); assert.equal(progress.at(-1).received,1001)
})
test('partial, repeated and wrong-farm batches never produce printable data', async () => {
  for (const change of [batch=>({...batch,farm_id:2}),batch=>({...batch,items:[],has_more:false,next_after_id:0}),batch=>({...batch,next_after_id:0})]) {
    transport(makeFixture({sections:['readings']}),change)
    await assert.rejects(utils.loadFarmPrintData(1,{sections:['readings'],dateMode:'all'}))
  }
})
test('canceled retrieval never returns a completed preview', async () => {
  transport(makeFixture({sections:['readings']})); const controller = new AbortController()
  await assert.rejects(utils.loadFarmPrintData(1,{sections:['readings'],dateMode:'all'}, { signal:controller.signal,onProgress:()=>controller.abort() }))
})
test('document renders only selected sections with escaped text, stored conditions and private URLs omitted', () => {
  const { manifest, records } = makeFixture({ count:2,sections:['readings','documents','services'] })
  manifest.farm.farm_name = '<script>do-not-run</script>'
  const html = renderToStaticMarkup(React.createElement(Document,{report:{...manifest,records}}))
  assert.ok(html.includes('&lt;script&gt;do-not-run&lt;/script&gt;') && html.includes('Warning: 2'))
  assert.ok(html.includes('Historical retired service: Odor Control Request') && html.includes('Blood Test Request'))
  assert.ok(!html.includes('<script>') && !html.includes('synthetic-ticket') && !html.includes('/file') && !/<a(?:\s|>)/.test(html))
  assert.ok(!html.includes('<h2>Farm Information'))
})

test('automatic section inclusion follows available implemented sources in document order', () => {
  const sections = Object.keys(utils.PRINT_SECTIONS).reverse().map(key => ({ key, available: key !== 'documents' }))
  sections.push({ key: 'unimplemented', available: true })
  assert.deepEqual(utils.availablePrintSections({ sections }), Object.keys(utils.PRINT_SECTIONS).filter(key => key !== 'documents'))
})

test('historical sensor summaries preserve valid counts, zeros, missing values, stored conditions and mock separation', () => {
  const rows = [
    { device_name: 'Device A', ammonia: 0, moisture: null, conditions: { ammonia: 'Safe', moisture: 'Safe' } },
    { device_name: 'Device A', ammonia: '12.50', moisture: 30, conditions: { ammonia: 'Critical', moisture: 'Warning' } },
    { device_name: 'Device A', ammonia: '', moisture: 'bad', conditions: { ammonia: 'Warning' } },
    { device_name: 'Device A', ammonia: 100, is_mock: true },
    { device_name: 'Device B', ammonia: 5 },
  ]
  const before = JSON.stringify(rows), groups = utils.summarizeReadings(rows)
  assert.equal(groups.length, 3)
  assert.equal(groups.reduce((sum, group) => sum + group.count, 0), rows.length)
  const metric = groups[0].metrics.ammonia
  assert.deepEqual([metric.count, metric.missing, metric.min, metric.average, metric.max], [2, 1, 0, 6.25, 12.5])
  assert.deepEqual(metric.conditions, { Safe: 1, Critical: 1 })
  assert.deepEqual(metric.unassessed, { Warning: 1 })
  assert.equal(groups[0].metrics.moisture.missing, 2)
  assert.equal(groups[1].is_mock, true)
  assert.equal(groups[1].metrics.ammonia.average, 100)
  assert.equal(JSON.stringify(rows), before)
})

test('a thousand historical readings print compact summaries while all other records retain original rows', () => {
  const { manifest, records } = makeFixture()
  manifest.snapshots.monitoring[0].ammonia = '999.00'
  const html = renderToStaticMarkup(React.createElement(Document, { report: { ...manifest, records } }))
  assert.ok(html.includes('1,001 matching historical readings') && html.includes('Warning: 1001'))
  assert.equal((html.match(/<table class="print-table" data-section="readings"/g) || []).length, 1)
  for (const section of ['inspections', 'cleanouts', 'disposal', 'services', 'documents', 'alerts']) {
    const table = html.match(new RegExp(`<table[^>]*data-section="${section}"[\\s\\S]*?</table>`))[0]
    assert.equal((table.match(/data-record-id=/g) || []).length, records[section].length)
  }
  assert.ok(html.includes('18.25') && html.includes('999.00') && html.includes('Current snapshot'))
})

test('missing requested sections or record sources never yield a complete report', async () => {
  for (const change of [fixture => fixture.manifest.sections.pop(), fixture => delete fixture.manifest.streams.readings]) {
    const fixture = makeFixture()
    change(fixture); const calls = transport(fixture)
    await assert.rejects(utils.loadFarmPrintData(1, { sections: Object.keys(utils.PRINT_SECTIONS), dateMode: 'all' }))
    assert.equal(calls.length, 1)
  }
})
test('offline and unassigned monitoring and unknown compliance stay explicitly unavailable', () => {
  for (const mode of ['offline','unassigned','unknown']) {
    const {manifest,records}=makeFixture({mode,sections:['monitoring','compliance']})
    const html=renderToStaticMarkup(React.createElement(Document,{report:{...manifest,records}}))
    assert.ok(!html.includes('Current condition: Safe'))
    if(mode==='unassigned') assert.ok(html.includes('Pending device setup'))
    if(mode==='unknown') assert.ok(html.includes('Undetermined') && html.includes('Registration date cannot be established'))
  }
})
