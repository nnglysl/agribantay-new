import { DISPLAY_TIME_ZONE } from './formatDate'

export function manilaDay(value = new Date()) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: DISPLAY_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const part = type => parts.find(p => p.type === type).value
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function defaultReportPeriod() {
  const today = manilaDay()
  return { mode: 'all', year: today.slice(0, 4), month: today.slice(5, 7), from: '', to: '' }
}

export function resolveReportPeriod(value) {
  const { mode, year, month, from, to } = value
  if (mode === 'all') return { from: '', to: '', error: '' }
  if (mode === 'month' || mode === 'year') {
    if (!/^\d{4}$/.test(String(year)) || Number(year) < 1900) return { error: 'Enter a valid year.' }
    if (mode === 'year') return { from: `${year}-01-01`, to: `${year}-12-31`, error: '' }
    if (!Number.isInteger(Number(month)) || Number(month) < 1 || Number(month) > 12) return { error: 'Choose a month.' }
    const m = String(month).padStart(2, '0')
    const last = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate()
    return { from: `${year}-${m}-01`, to: `${year}-${m}-${last}`, error: '' }
  }
  if (mode !== 'custom') return { error: 'Choose a reporting period.' }
  if (!from && !to) return { error: 'Choose at least one date.' }
  const valid = date => {
    if (!date) return true
    const parsed = new Date(`${date}T00:00:00Z`)
    return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
  }
  if (!valid(from) || !valid(to)) return { error: 'Enter valid dates.' }
  if (from && to && from > to) return { error: 'The start date cannot be after the end date.' }
  return { from, to, error: '' }
}

export function filterReportFiles(files, from, to) {
  return files.filter(file => (!from || (file.period_end || file.period_start) >= from) && (!to || file.period_start <= to))
}

export function matchesReportPeriod(data, from = '', to = '') {
  return !!data && (data.report_period?.from || '') === from && (data.report_period?.to || '') === to
}
