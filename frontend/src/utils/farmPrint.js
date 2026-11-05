import api from '../api/axios'
import { resolveReportPeriod } from './reportPeriod'
import { isPrimaryValue } from './primaryMonitoring'

export const PAPER_SIZES = { A4: [210, 297], Letter: [215.9, 279.4], Legal: [215.9, 355.6], A3: [297, 420], browser: [215.9, 279.4] }
export const PRINT_SECTIONS = {
  farm: 'Farm Information', owner: 'Farm Owner Information', monitoring: 'Monitoring Summary',
  readings: 'Sensor Reading Summary', assignments: 'Device Assignment History', inspections: 'Inspection Records',
  cleanouts: 'Manure Clean-out Records', compliance: 'Current Clean-out Compliance', disposal: 'Manure Disposal Records',
  services: 'Service Request Records', documents: 'Control Document Records', alerts: 'Alert History',
}

export function availablePrintSections(options) {
  return Object.keys(PRINT_SECTIONS).filter(key => options.sections.some(section => section.key === key && section.available))
}

// Summarize every verified historical row, never the current monitoring snapshot.
// Keep mock data separate and retain stored classifications without new thresholds.
export function summarizeReadings(rows) {
  const groups = new Map()
  for (const row of rows) {
    const key = JSON.stringify([row.device_name ?? null, !!row.is_mock])
    if (!groups.has(key)) groups.set(key, { device_name: row.device_name, is_mock: !!row.is_mock, count: 0,
      metrics: Object.fromEntries(['ammonia', 'moisture', 'temperature', 'humidity'].map(metric => [metric,
        { count: 0, missing: 0, sum: 0, min: null, max: null, conditions: {}, unassessed: {} }])) })
    const group = groups.get(key)
    group.count++
    for (const [metric, summary] of Object.entries(group.metrics)) {
      const valid = isPrimaryValue(row[metric]), status = row.conditions?.[metric] || 'Not recorded'
      const counts = valid ? summary.conditions : summary.unassessed
      counts[status] = (counts[status] || 0) + 1
      if (!valid) { summary.missing++; continue }
      const value = Number(row[metric])
      summary.count++; summary.sum += value
      summary.min = summary.min === null ? value : Math.min(summary.min, value)
      summary.max = summary.max === null ? value : Math.max(summary.max, value)
    }
  }
  return [...groups.values()].map(group => ({ ...group, metrics: Object.fromEntries(Object.entries(group.metrics)
    .map(([metric, summary]) => [metric, { ...summary, average: summary.count ? summary.sum / summary.count : null }])) }))
}

export function printRange(mode, from, to) {
  if (mode === 'custom' && (!from || !to)) return { error: 'Choose both From Date and To Date.' }
  return resolveReportPeriod({ mode, from, to })
}

export function paperDimensions(paper, orientation) {
  const dimensions = PAPER_SIZES[paper] || PAPER_SIZES.A4
  return orientation === 'landscape' ? [...dimensions].reverse() : dimensions
}

// Complete ID-keyset traversal. A partial, repeated or mismatched response must
// never become a printable document. The opaque ticket is discarded afterwards.
export async function loadFarmPrintData(farmId, selection, { signal, onProgress = () => {} } = {}) {
  const range = printRange(selection.dateMode, selection.from, selection.to)
  if (range.error) throw Error(range.error)
  if (!selection.sections.length) throw Error('No farm record sections are currently available.')
  const manifest = (await api.post(`/admin/farms/${farmId}/print-preview`, {
    sections: selection.sections, date_mode: selection.dateMode,
    ...(selection.dateMode === 'custom' ? { from: range.from, to: range.to } : {}),
  }, { signal })).data.data
  if (String(manifest.farm?.id) !== String(farmId)) throw Error('The preview returned a different farm. Generate it again.')
  if (!Array.isArray(manifest.sections) || manifest.sections.length !== selection.sections.length
    || new Set(manifest.sections).size !== selection.sections.length
    || selection.sections.some(section => !manifest.sections.includes(section))) throw Error('The complete report is missing requested sections. Generate it again; nothing was printed.')
  const streamSections = ['readings', 'inspections', 'cleanouts', 'disposal', 'services', 'documents', 'alerts']
  if (selection.sections.some(section => streamSections.includes(section)
    ? !Object.hasOwn(manifest.streams, section) : !Object.hasOwn(manifest.snapshots, section))) throw Error('A farm record source is missing. Generate a new preview; nothing was printed.')
  const records = {}
  let received = 0
  const total = Object.values(manifest.streams).reduce((sum, stream) => sum + stream.total, 0)
  onProgress({ received, total })
  for (const [section, stream] of Object.entries(manifest.streams)) {
    let cursor = 0, more = stream.total > 0
    const rows = []
    while (more) {
      if (signal?.aborted) throw new DOMException('Canceled', 'AbortError')
      const batch = (await api.post(`/admin/farms/${farmId}/print-batch`, { ticket: manifest.ticket, section, after_id: cursor }, { signal })).data.data
      if (String(batch.farm_id) !== String(farmId) || batch.section !== section || batch.expected_total !== stream.total || !Array.isArray(batch.items)) throw Error('Print data does not match this preview. Generate it again.')
      for (const row of batch.items) {
        if (!Number.isSafeInteger(row.id) || row.id <= cursor || row.id > stream.max_id) throw Error('Print data order changed. Generate the preview again.')
        cursor = row.id
        rows.push(row)
      }
      if (batch.next_after_id !== cursor || (batch.has_more && !batch.items.length) || rows.length > stream.total) throw Error('Incomplete print data. Generate the preview again.')
      more = batch.has_more
      received += batch.items.length
      onProgress({ received, total })
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    if (rows.length !== stream.total) throw Error('Records changed or retrieval was incomplete. Generate a new preview; nothing was printed.')
    records[section] = rows
  }
  if (signal?.aborted) throw new DOMException('Canceled', 'AbortError')
  const report = { ...manifest }
  delete report.ticket
  return { ...report, records, collected_at: new Date().toISOString() }
}

export function printCss(paper = 'browser', orientation = 'portrait') {
  const safePaper = Object.hasOwn(PAPER_SIZES, paper) ? paper : 'browser'
  const safeOrientation = orientation === 'landscape' ? 'landscape' : 'portrait'
  // Tables, headings, letterhead and signature pagination come from ReportStyles.
  // Omit page preferences by default so native printer/PDF settings take effect.
  return `${safePaper === 'browser' ? '' : `@page { size: ${safePaper} ${safeOrientation}; margin: 14mm 12mm; }`}
    * { box-sizing: border-box; } html, body { margin: 0; background: white; color: #000; font-family: Georgia, 'Times New Roman', serif; }
    body { padding: 14mm 12mm; font-size: 12px; } p { margin: 8px 0; } h3 { font-size: 13px; margin: 16px 0 8px; break-after: avoid; }
    .fp-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 24px; margin: 12px 0; }
    dt { font-size: 11px; color: #4b5a50; } dd { margin: 4px 0 0; font-weight: 600; overflow-wrap: anywhere; }
    .fp-note { font-size: 11px; color: #4b5a50; line-height: 1.5; }
    .fp-document .print-table { table-layout: fixed; } .fp-document td { white-space: pre-wrap; }
    .fp-metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .fp-device { margin: 12px 0 20px; break-inside: avoid; page-break-inside: avoid; }
    .fp-document > section > .fp-note { break-inside: avoid; page-break-inside: avoid; break-after: avoid; page-break-after: avoid; } .fp-fields { break-inside: avoid; page-break-inside: avoid; }
    @media print { html, body { width: auto; min-width: 0; height: auto; overflow: visible; } body { padding: 0; } .no-print { display: none !important; } }
  `
}
