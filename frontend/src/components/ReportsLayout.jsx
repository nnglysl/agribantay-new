import { useState } from 'react'
import { serviceTypeBadgeStyle, serviceTypeLabel, requestStatusBadgeStyle } from '../utils/serviceBadgeStyle'
import SharedPagination from './Pagination'

export { serviceTypeBadgeStyle, serviceTypeLabel, requestStatusBadgeStyle }

export const SANS = "'Inter', sans-serif"

export const C = {
  card: '#234A35',        // dashboard stat-card green
  cardBorder: '#1c3c2b',
  cardLabel: '#eaf3ec',
  cardFoot: 'rgba(234,243,236,0.7)',
  dark: '#16311d',        // dashboard heading ink
  green: '#2c8047',
  greenDeep: '#256b3d',
  amber: '#b45309',
  red: '#b91c1c',
  bg: '#f3f4ef',
  border: '#e7e8e0',
  grid: '#f2f3ed',
  ink: '#33413a',
  body: '#4b5a50',
  mute: '#6b7770',
  faint: '#9aa79d',
  label: '#8a968d',
}

export const PRESETS = [
  { label: '7 Days', days: 7 },
  { label: '30 Days', days: 30 },
  { label: '3 Months', days: 90 },
  { label: '1 Year', days: 365 },
]

export const PAGE_SIZE_OPTIONS = [10, 25, 50]

/* ---------------- date helpers ---------------- */

const pad = n => String(n).padStart(2, '0')
export const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const todayIso = () => iso(new Date())

export const shiftDays = days => {
  const d = new Date()
  d.setDate(d.getDate() - days + 1)
  return iso(d)
}

export const MONTH_NAMES = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleString('en-PH', { month: 'long' }))

/** First/last day of the given 1-indexed month, as YYYY-MM-DD. */
export const monthBounds = (month, year) => ({
  from: iso(new Date(year, month - 1, 1)),
  to: iso(new Date(year, month, 0)),
})

export const dayOf = v => (v ? String(v).slice(0, 10) : '')

export const fmtDate = v => {
  const day = dayOf(v)
  if (!day) return '—'
  const d = new Date(`${day}T09:00:00`)
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

export const makeInRange = (from, to) => v => {
  const day = dayOf(v)
  if (!day) return false
  if (from && day < from) return false
  if (to && day > to) return false
  return true
}

export const rangeLabelOf = (from, to) => {
  if (!from && !to) return 'All records'
  if (from && to) return `${fmtDate(from)} – ${fmtDate(to)}`
  return from ? `From ${fmtDate(from)}` : `Up to ${fmtDate(to)}`
}

// Plain, user-facing sentence describing what's currently on screen — used
// in place of any text that explains filter/backend mechanics (e.g. "stat
// cards show all-time totals"). Says only what the user is looking at.
export const scopeLabelOf = (from, to) => {
  if (!from && !to) return 'Showing all records'
  if (from && to) return `Showing records from ${fmtDate(from)} to ${fmtDate(to)}`
  return from ? `Showing records from ${fmtDate(from)}` : `Showing records up to ${fmtDate(to)}`
}

export const activePresetOf = (from, to) => {
  if (to !== todayIso()) return null
  const hit = PRESETS.find(p => from === shiftDays(p.days))
  return hit ? hit.label : null
}

/** Completed-per-month buckets for the 6 months ending at `endMonth`/`endYear` (defaults to the current month). */
export const monthlyBuckets = (rows, dateKey, endMonth, endYear) => {
  const months = []
  const anchor = (endMonth && endYear) ? new Date(endYear, endMonth - 1, 1) : new Date()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(anchor)
    d.setMonth(d.getMonth() - i)
    months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleString('en-PH', { month: 'short' }), count: 0 })
  }
  rows.forEach(r => {
    const day = dayOf(r[dateKey])
    if (!day) return
    const d = new Date(`${day}T09:00:00`)
    const b = months.find(m => m.key === `${d.getFullYear()}-${d.getMonth()}`)
    if (b) b.count += 1
  })
  return months
}

/** Per-day buckets inside the current filter, oldest first. */
export const dailyBuckets = (rows, dateKey) => {
  const out = []
  ;[...rows]
    .sort((a, b) => dayOf(a[dateKey]).localeCompare(dayOf(b[dateKey])))
    .forEach(r => {
      const label = fmtDate(r[dateKey]).replace(/,? \d{4}$/, '')
      const hit = out.find(b => b.label === label)
      if (hit) hit.count += 1
      else out.push({ label, count: 1 })
    })
  return out
}

/** One point per day of the given month (1-indexed), zero-filled for days with no rows — for a daily trend line scoped to a single Month+Year filter. */
export const dailyBucketsForMonth = (rows, dateKey, month, year) => {
  const daysInMonth = new Date(year, month, 0).getDate()
  const days = Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, label: String(i + 1), count: 0 }))
  rows.forEach(r => {
    const day = dayOf(r[dateKey])
    if (!day) return
    const d = new Date(`${day}T09:00:00`)
    if (d.getMonth() + 1 === month && d.getFullYear() === year) {
      days[d.getDate() - 1].count += 1
    }
  })
  return days
}

/** Per-month buckets inside the current filter, oldest first (unlike monthlyBuckets, not fixed to "last 6 months"). */
export const monthlyBucketsInRange = (rows, dateKey) => {
  const out = []
  ;[...rows]
    .sort((a, b) => dayOf(a[dateKey]).localeCompare(dayOf(b[dateKey])))
    .forEach(r => {
      const day = dayOf(r[dateKey])
      if (!day) return
      const d = new Date(`${day}T09:00:00`)
      const key = `${d.getFullYear()}-${d.getMonth()}`
      const hit = out.find(b => b.key === key)
      if (hit) hit.count += 1
      else out.push({ key, label: d.toLocaleString('en-PH', { month: 'short', year: 'numeric' }), count: 1 })
    })
  return out
}

/* ---------------- Chart.js theme ---------------- */

export const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: C.dark,
      titleFont: { family: SANS, size: 12, weight: '700' },
      bodyFont: { family: SANS, size: 12 },
      padding: 10,
      displayColors: false,
    },
  },
  scales: {
    y: {
      beginAtZero: true,
      ticks: { precision: 0, color: C.label, font: { family: SANS, size: 12 } },
      grid: { color: C.grid, drawBorder: false },
    },
    x: {
      ticks: { color: C.label, font: { family: SANS, size: 12 }, maxRotation: 0, autoSkipPadding: 12 },
      grid: { display: false, drawBorder: false },
    },
  },
}

export const donutOptions = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: '68%',
  plugins: {
    legend: { display: false },
    tooltip: { backgroundColor: C.dark, bodyFont: { family: SANS, size: 12 }, padding: 10, displayColors: false },
  },
}

export const lineDataset = (values, color) => ({
  data: values,
  borderColor: color,
  backgroundColor: color,
  pointBackgroundColor: '#fff',
  pointBorderColor: color,
  pointBorderWidth: 2,
  pointRadius: 4,
  borderWidth: 2.4,
  tension: 0.3,
})

/* ---------------- icons ---------------- */

export const IconPrint = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M6 9V3h12v6" /><rect x="4" y="9" width="16" height="8" rx="1.5" /><path d="M7 17h10v4H7z" /></svg>
)
export const IconFile = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" /><path d="M14 3v5h5" /></svg>
)
export const IconFilter = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 5h16l-6 8v6l-4-2v-4L4 5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
)

/* ---------------- shared stylesheet ---------------- */

export function ReportStyles() {
  return (
    <style>{`
      .rp { container-type: inline-size; max-width: 100%; font-family: ${SANS}; }

      .rp-tabs { display: flex; flex-wrap: wrap; gap: 2px; border-bottom: 1px solid #e0e2d9; margin-top: 20px; }
      .rp-tab { appearance: none; background: transparent; border: none; border-bottom: 2px solid transparent;
                padding: 11px 14px; margin-bottom: -1px; font-family: ${SANS}; font-size: 13.5px; font-weight: 600;
                color: ${C.mute}; cursor: pointer; }
      .rp-tab:hover { color: ${C.dark}; }
      .rp-tab[aria-selected="true"] { border-bottom-color: ${C.green}; color: ${C.dark}; font-weight: 700; }

      .rp-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 16px; }
      .rp-two { display: grid; grid-template-columns: 1.45fr 1fr; gap: 18px; align-items: stretch; }
      .rp-two > * { min-width: 0; }

      .rp-table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
      .rp-table { width: 100%; border-collapse: collapse; min-width: 620px; }
      .rp-cards { display: none; flex-direction: column; gap: 10px; }

      @container (max-width: 900px) {
        .rp-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
        .rp-two { grid-template-columns: 1fr; }
      }
      @container (max-width: 620px) {
        .rp-table-scroll { display: none; }
        .rp-cards { display: flex; }
        .rp-actions { width: 100%; display: grid; grid-template-columns: repeat(3, 1fr); }
        .rp-actions > button { width: 100%; padding: 0 8px; }
      }

      .print-view { position: absolute; left: -9999px; top: 0; width: 800px; padding: 40px; box-sizing: border-box;
                    font-family: Georgia, 'Times New Roman', serif; color: #000; background: #fff; }
      .print-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
      .print-table th, .print-table td { border: 1px solid #000; padding: 6px 10px; text-align: left; font-size: 12px; }
      .print-table th { background: #fff; font-weight: bold; }
      .print-section-title { font-size: 13px; font-weight: bold; text-transform: uppercase; margin: 24px 0 8px;
                             border-bottom: 1px solid #000; padding-bottom: 4px; }
      @media print {
        .screen-view { display: none !important; }
        .print-view { position: static; left: auto; }
      }

      @media print {
        body.gr-printing * { visibility: hidden; }
        body.gr-printing .gr-print-area, body.gr-printing .gr-print-area * { visibility: visible; }
        body.gr-printing .gr-print-area { position: absolute; left: 0; top: 0; width: 100%; }
      }

      .gr-hidden-capture { position: absolute; left: -9999px; top: 0; width: 800px; padding: 40px; box-sizing: border-box;
                            font-family: Georgia, 'Times New Roman', serif; color: #000; background: #fff; }

      .gr-doc { width: 800px; max-width: 100%; margin: 0 auto; padding: 40px; box-sizing: border-box;
                font-family: Georgia, 'Times New Roman', serif; color: #000; background: #fff;
                border: 1px solid ${C.border}; border-radius: 10px; }
    `}</style>
  )
}

/* ---------------- building blocks ---------------- */

/** Dashboard-matched stat card: dark green fill, white value, light-green label. */
// `onClick` makes the card a toggle button; `active` marks the selected one.
// Both optional — pages that don't pass them render exactly as before.
export function StatCard({ value, label, foot, onClick, active = false }) {
  const clickable = typeof onClick === 'function'
  return (
    <div
      style={{ ...styles.statCard, ...(clickable ? styles.statCardClickable : {}), ...(active ? styles.statCardActive : {}) }}
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-pressed={clickable ? active : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
    >
      <div style={styles.statValue}>{value ?? 0}</div>
      <div style={styles.statLabel}>{label}</div>
      {foot && <div style={styles.statFoot}>{foot}</div>}
    </div>
  )
}

export function PageHeader({ title, subtitle, onPrint, onCsv, onPdf, exportingPdf, hideActions = false }) {
  return (
    <div style={styles.header}>
      <div style={{ minWidth: 0 }}>
        <h1 style={styles.title}>{title}</h1>
        <p style={styles.subtitle}>{subtitle}</p>
      </div>
      {!hideActions && (
        <div className="rp-actions" style={styles.actions}>
          <button style={styles.secondaryBtn} onClick={onPrint}><IconPrint />Print</button>
          <button style={styles.secondaryBtn} onClick={onCsv}><IconFile />Export CSV</button>
          <button
            style={{ ...styles.primaryBtn, ...(exportingPdf ? styles.btnDisabled : {}) }}
            onClick={onPdf}
            disabled={exportingPdf}
          >
            <IconFile />{exportingPdf ? 'Generating...' : 'Export PDF'}
          </button>
        </div>
      )}
    </div>
  )
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="rp-tabs" role="tablist">
      {tabs.map(t => (
        <button key={t} role="tab" aria-selected={t === active} className="rp-tab" onClick={() => onChange(t)}>
          {t}
        </button>
      ))}
    </div>
  )
}

export function Panel({ title, subtitle, children, style }) {
  return (
    <section style={{ ...styles.panel, ...style }}>
      {title && <h3 style={styles.panelTitle}>{title}</h3>}
      {subtitle && <p style={styles.panelSubtitle}>{subtitle}</p>}
      {children}
    </section>
  )
}

// `badgeStyle` (a {color, backgroundColor} pair, e.g. from serviceTypeBadgeStyle()
// / requestStatusBadgeStyle()) takes precedence over `tone` when both are given —
// lets callers plug in an exact standardized color instead of picking from the
// fixed green/amber/red palette below.
export function Badge({ text, tone = 'green', dot = true, badgeStyle }) {
  const map = {
    green: { bg: '#eaf3ec', fg: C.greenDeep },
    amber: { bg: '#fdf3e3', fg: C.amber },
    red: { bg: '#fbeaea', fg: C.red },
  }
  const c = badgeStyle ? { bg: badgeStyle.backgroundColor, fg: badgeStyle.color } : (map[tone] || map.green)
  return (
    <span style={{ ...styles.badge, background: c.bg, color: c.fg }}>
      {dot && <span style={{ ...styles.badgeDot, background: c.fg }} />}
      {text}
    </span>
  )
}

/** Cell: { text } | { text, strong } | { text, tone: 'green'|'amber'|'red' } | { text, badgeStyle } | { actions: [{ label, onClick }] } */
function Cell({ cell }) {
  if (cell.actions) {
    return (
      <span style={styles.cellActions}>
        {cell.actions.map((a, i) => (
          <button key={i} type="button" style={styles.cellActionBtn} onClick={a.onClick}>{a.label}</button>
        ))}
      </span>
    )
  }
  if (cell.tone || cell.badgeStyle) return <Badge text={cell.text} tone={cell.tone} dot={cell.dot} badgeStyle={cell.badgeStyle} />
  if (cell.strong) return <span style={styles.cellStrong}>{cell.text}</span>
  return <span>{cell.text}</span>
}

export function FilterBar({ from, to, onFrom, onTo, onPreset, onClear, count, note }) {
  const active = activePresetOf(from, to)
  return (
    <>
      <div style={styles.filterBar}>
        <div style={styles.field}>
          <label style={styles.fieldLabel}>From</label>
          <input type="date" value={from} onChange={e => onFrom(e.target.value)} style={styles.input} />
        </div>
        <div style={styles.field}>
          <label style={styles.fieldLabel}>To</label>
          <input type="date" value={to} onChange={e => onTo(e.target.value)} style={styles.input} />
        </div>
        <div style={styles.field}>
          <label style={styles.fieldLabel}>Quick select</label>
          <div style={styles.chips}>
            {PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => onPreset(p)}
                style={{ ...styles.chip, ...(active === p.label ? styles.chipActive : {}) }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div style={styles.filterRight}>
          <button style={styles.clearBtn} onClick={onClear}>Clear filters</button>
          <div style={styles.countPill}>{count} {count === 1 ? 'record' : 'records'}</div>
        </div>
      </div>
      {note && <p style={styles.filterNote}>{note}</p>}
    </>
  )
}

/** Table with page-size control, mobile card fallback and calm empty state. */
export function DataTable({ title, subtitle, columns, rows, emptyText, paginate = true, minWidth = '620px' }) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const total = rows.length
  const size = paginate ? pageSize : Math.max(total, 1)
  const pages = Math.max(1, Math.ceil(total / size))
  const safe = Math.min(page, pages)
  const start = (safe - 1) * size
  const shown = rows.slice(start, start + size)

  return (
    <Panel title={title} subtitle={subtitle}>
      {total === 0 ? (
        <div style={styles.empty}>{emptyText}</div>
      ) : (
        <>
          <div className="rp-table-scroll">
            <table className="rp-table" style={{ minWidth }}>
              <thead>
                <tr>{columns.map(c => <th key={c} style={styles.th}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {shown.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => <td key={ci} style={styles.td}><Cell cell={cell} /></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rp-cards">
            {shown.map((row, ri) => (
              <div key={ri} style={styles.mCard}>
                {row.map((cell, ci) => (
                  <div key={ci} style={styles.mRow}>
                    <span style={styles.mLabel}>{columns[ci]}</span>
                    <div style={styles.mValue}><Cell cell={cell} /></div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {paginate && total > 0 && (
            <div style={styles.pager}>
              <span style={styles.pagerInfo}>
                Showing {start + 1}–{Math.min(start + size, total)} of {total} records
              </span>
              <div style={styles.pagerBtns}>
                <select
                  value={pageSize}
                  onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
                  style={styles.pageSizeSelect}
                >
                  {PAGE_SIZE_OPTIONS.map(s => <option key={s} value={s}>{s} / page</option>)}
                </select>
                <SharedPagination currentPage={safe} totalPages={pages} onPageChange={setPage} />
              </div>
            </div>
          )}
        </>
      )}
    </Panel>
  )
}

export function ChartFrame({ children, height = 240 }) {
  return <div style={{ position: 'relative', height }}>{children}</div>
}

export function Legend({ items }) {
  return (
    <div style={styles.legend}>
      {items.map(l => (
        <div key={l.label} style={styles.legendRow}>
          <span style={{ ...styles.legendSwatch, background: l.color }} />
          <span style={styles.legendLabel}>{l.label}</span>
          <strong style={styles.legendValue}>{l.value ?? 0}</strong>
        </div>
      ))}
    </div>
  )
}

export function DonutCenter({ total, caption = 'farms' }) {
  return (
    <div style={styles.donutCenter}>
      <div style={styles.donutTotal}>{total ?? 0}</div>
      <div style={styles.donutCaption}>{caption}</div>
    </div>
  )
}

export function Signatures({ right }) {
  return (
    <div style={{ marginTop: 40, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
      <div style={{ borderTop: '1px solid #000', width: 220, paddingTop: 4 }}>Prepared by</div>
      <div style={{ borderTop: '1px solid #000', width: 220, paddingTop: 4 }}>{right}</div>
    </div>
  )
}

export const styles = {
  stateText: { fontFamily: SANS, fontSize: 14, color: C.body },

  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' },
  title: { fontFamily: SANS, fontSize: 24, fontWeight: 800, letterSpacing: '-0.015em', color: C.dark, margin: 0 },
  subtitle: { fontFamily: SANS, fontSize: 13.5, color: C.mute, margin: '5px 0 0' },
  actions: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  body: { paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 18 },
  sectionLabel: { fontFamily: SANS, fontSize: 13, fontWeight: 700, color: C.label, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '10px 0 -4px' },

  primaryBtn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, background: C.green, color: '#fff', border: 'none', borderRadius: 10, padding: '0 16px', height: 40, fontFamily: SANS, fontSize: 11, fontWeight: 700, cursor: 'pointer' },
  secondaryBtn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, background: '#fff', color: C.green, border: '1px solid #cfe0d3', borderRadius: 10, padding: '0 16px', height: 40, fontFamily: SANS, fontSize: 11, fontWeight: 700, cursor: 'pointer' },
  btnDisabled: { opacity: 0.6, cursor: 'not-allowed' },

  // Same Back-button convention used system-wide (Farm Details, Account
  // Details, Farm Maintenance Details) — pill shape, neutral gray/white,
  // 13px/600 text — not the green Reports action-button style above.
  backBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
    borderRadius: 999, border: '1px solid #dcdfd6', backgroundColor: '#fff',
    color: '#33413a', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: SANS,
  },

  previewBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' },

  // Dashboard-matched card
  statCard: { fontFamily: SANS, background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 14, padding: '20px 22px' },
  statCardClickable: { cursor: 'pointer', userSelect: 'none', transition: 'box-shadow .15s, transform .15s' },
  statCardActive: { background: C.greenDeep, border: `1px solid ${C.green}`, boxShadow: `0 0 0 3px rgba(44,128,71,0.35)` },
  statValue: { fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', color: '#fff', lineHeight: 1, fontVariantNumeric: 'tabular-nums' },
  statLabel: { fontSize: 13, fontWeight: 700, color: C.cardLabel, marginTop: 8, lineHeight: 1.35 },
  statFoot: { fontSize: 12, color: C.cardFoot, marginTop: 3 },

  filterBar: { fontFamily: SANS, background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap' },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  fieldLabel: { fontSize: 11.5, fontWeight: 600, color: C.mute },
  input: { height: 38, padding: '0 10px', borderRadius: 8, border: '1px solid #dcdfd6', background: '#fff', fontFamily: SANS, fontSize: 13, color: C.ink },
  chips: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  chip: { height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid #e0e2d9', background: '#fafbf8', color: C.body, fontFamily: SANS, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  chipActive: { border: `1px solid ${C.green}`, background: '#eaf3ec', color: C.greenDeep, fontWeight: 700 },
  filterRight: { display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' },
  clearBtn: { height: 38, padding: '0 14px', borderRadius: 8, border: '1px solid #dcdfd6', background: '#fff', color: C.mute, fontFamily: SANS, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  countPill: { height: 38, display: 'flex', alignItems: 'center', padding: '0 14px', borderRadius: 8, background: C.bg, color: C.dark, fontFamily: SANS, fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' },
  filterNote: { fontFamily: SANS, fontSize: 11.5, color: C.faint, margin: '-8px 0 0', lineHeight: 1.55 },
  filterPopApply: {
    flex: 1, padding: '9px 0', borderRadius: 10, border: 'none',
    background: C.green, color: '#fff', fontFamily: SANS, fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
  },

  // Filter trigger + popover — matches the Filter UI used on Service Requests
  // and Manage Accounts, so the control looks and behaves the same everywhere.
  filterToggleBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 15px',
    borderRadius: 10, border: `1px solid ${C.border}`, background: '#fff',
    color: '#33413a', fontFamily: SANS, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
  },
  filterToggleBtnActive: { borderColor: C.green, color: C.green },
  filterToggleCount: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minWidth: 18, height: 18, borderRadius: 999, background: C.green,
    color: '#fff', fontSize: 11, fontWeight: 700, padding: '0 4px',
  },
  filterPop: {
    position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 40,
    background: '#fff', border: `1px solid ${C.border}`, borderRadius: 14,
    boxShadow: '0 8px 24px rgba(15,38,22,0.12)', padding: 18, width: 280,
  },
  filterPopHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  filterPopTitle: { fontSize: 15, fontWeight: 800, color: C.dark, fontFamily: SANS },
  filterPopClose: { fontSize: 19, cursor: 'pointer', color: C.label, lineHeight: 1 },
  filterPopRow: { display: 'flex', flexDirection: 'column', gap: 14 },
  filterPopLabel: { display: 'block', fontSize: 12, fontWeight: 700, color: C.body, fontFamily: SANS, marginBottom: 7 },
  filterPopSelect: {
    width: '100%', padding: '9px 12px', borderRadius: 10, border: `1px solid ${C.border}`,
    fontSize: 13, color: '#33413a', background: '#fff', cursor: 'pointer',
    fontFamily: SANS, boxSizing: 'border-box',
  },
  filterPopActions: { display: 'flex', gap: 10, marginTop: 20 },
  filterPopClear: {
    flex: 1, padding: '9px 0', borderRadius: 10, border: `1px solid ${C.border}`,
    background: '#fff', color: '#33413a', fontFamily: SANS, fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
  },

  panel: { fontFamily: SANS, background: '#fff', border: `1px solid ${C.border}`, borderRadius: 14, padding: '22px 24px', minWidth: 0 },
  panelTitle: { fontSize: 15, fontWeight: 700, color: C.dark, margin: '0 0 4px' },
  panelSubtitle: { fontSize: 12, color: C.faint, margin: '0 0 14px' },
  empty: { border: '1px dashed #e0e2d9', borderRadius: 10, padding: 26, textAlign: 'center', fontSize: 13.5, color: C.label },

  donutRow: { display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' },
  donutWrap: { position: 'relative', width: 190, height: 190, flexShrink: 0 },
  donutCenter: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' },
  donutTotal: { fontSize: 26, fontWeight: 800, color: C.dark, lineHeight: 1 },
  donutCaption: { fontSize: 11, color: C.label, marginTop: 3 },
  legend: { display: 'flex', flexDirection: 'column', gap: 12, minWidth: 130, flex: 1 },
  legendRow: { display: 'flex', alignItems: 'center', gap: 9 },
  legendSwatch: { width: 9, height: 9, borderRadius: 2, flexShrink: 0 },
  legendLabel: { fontSize: 13, color: C.body, flex: 1 },
  legendValue: { fontSize: 14, color: C.dark, fontVariantNumeric: 'tabular-nums' },

  th: { textAlign: 'left', padding: '12px 16px', fontSize: 13, fontWeight: 600, color: C.label, background: '#fafbf8', borderTop: '1px solid #eceee7', borderBottom: '1px solid #eceee7', whiteSpace: 'nowrap' },
  td: { padding: '13px 16px', fontSize: 12, color: C.body, borderBottom: '1px solid #f2f3ed', verticalAlign: 'middle', whiteSpace: 'nowrap' },
  cellStrong: { fontWeight: 600, color: C.dark },
  cellActions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  cellActionBtn: { appearance: 'none', background: '#fff', border: `1px solid #cfe0d3`, borderRadius: 7,
                   padding: '5px 10px', font: 'inherit', fontFamily: SANS, fontSize: 11.5, fontWeight: 700,
                   color: C.greenDeep, cursor: 'pointer', whiteSpace: 'nowrap' },
  badge: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' },
  badgeDot: { width: 6, height: 6, borderRadius: '50%', flexShrink: 0 },

  mCard: { border: '1px solid #eceee7', borderRadius: 12, padding: '14px 16px', background: '#fcfdfb', display: 'flex', flexDirection: 'column', gap: 8 },
  mRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  mLabel: { fontSize: 13, fontWeight: 600, color: C.faint },
  mValue: { fontSize: 12, color: C.body, textAlign: 'right' },

  pager: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 16 },
  pagerInfo: { fontSize: 12, color: C.faint },
  pagerBtns: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  pageSizeSelect: { height: 34, padding: '0 8px', borderRadius: 8, border: '1px solid #dcdfd6', fontFamily: SANS, fontSize: 12, color: C.body, marginRight: 6 },
  pageBtn: { height: 34, minWidth: 34, padding: '0 11px', borderRadius: 9, border: '1px solid #dcdfd6', background: '#fff', color: C.ink, fontFamily: SANS, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' },
  pageBtnActive: { background: C.green, borderColor: C.green, color: '#fff' },
  ellipsis: { padding: '0 4px', color: C.faint, fontSize: 13 },

  footNote: { fontFamily: SANS, fontSize: 11.5, color: C.faint, margin: '2px 0 0', lineHeight: 1.55 },
  printHead: { fontSize: 18, textAlign: 'center', margin: '16px 0 4px' },
  printSub: { fontSize: 12, textAlign: 'center', margin: '0 0 4px' },
  printMeta: { fontSize: 11, textAlign: 'center', margin: '0 0 16px' },
}