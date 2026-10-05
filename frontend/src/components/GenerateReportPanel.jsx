import { useMemo, useState } from 'react'
import api from '../api/axios'
import { invalidateCache } from '../hooks/useCachedFetch'
import { styles } from './ReportsLayout'

/**
 * On-demand report generation.
 *
 * Reports used to be produced only by a scheduled monthly command. On shared
 * hosting with no cron that command never ran, which is why September 2026 had
 * no report at all — nothing in the UI could create one. The period is chosen
 * here and the archive is written when the user asks for it.
 *
 * Every period is reduced to a plain start/end pair before it is sent; the
 * backend never has to know what "weekly" means, and the stored record is the
 * same shape whichever option was picked.
 */

const PERIODS = [
  { value: 'Daily', label: 'Daily' },
  { value: 'Weekly', label: 'Weekly' },
  { value: 'Monthly', label: 'Monthly' },
  { value: 'Custom', label: 'Custom Date Range' },
]

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** Plain YYYY-MM-DD, built from calendar parts so no timezone shift applies. */
function toDateString(year, monthIndex, day) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function todayDateString() {
  const d = new Date()
  return toDateString(d.getFullYear(), d.getMonth(), d.getDate())
}

/**
 * Monday–Sunday, matching the week the notification dividers use, so "this
 * week" means the same thing everywhere in the app.
 */
function weekBounds(dateString) {
  const [y, m, d] = dateString.split('-').map(Number)
  const picked = new Date(y, m - 1, d)
  const monday = new Date(picked)
  monday.setDate(picked.getDate() - ((picked.getDay() + 6) % 7))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)

  return {
    start: toDateString(monday.getFullYear(), monday.getMonth(), monday.getDate()),
    end: toDateString(sunday.getFullYear(), sunday.getMonth(), sunday.getDate()),
  }
}

function monthBounds(monthValue) {
  const [y, m] = monthValue.split('-').map(Number)
  // Day 0 of the next month is the last day of this one — no month-length table.
  const lastDay = new Date(y, m, 0).getDate()
  return { start: toDateString(y, m - 1, 1), end: toDateString(y, m - 1, lastDay) }
}

/**
 * A period written the way it is spoken: "October 1–4, 2026" rather than
 * "October 1, 2026 – October 4, 2026". The month and the year are stated once
 * when they are the same at both ends, which is the common case and the one
 * that otherwise reads as a mouthful.
 */
function prettyRange(start, end) {
  const [sy, sm, sd] = start.split('-').map(Number)
  const [ey, em, ed] = end.split('-').map(Number)

  if (start === end) return `${MONTH_LABELS[sm - 1]} ${sd}, ${sy}`
  if (sy === ey && sm === em) return `${MONTH_LABELS[sm - 1]} ${sd}–${ed}, ${sy}`
  if (sy === ey) return `${MONTH_LABELS[sm - 1]} ${sd} – ${MONTH_LABELS[em - 1]} ${ed}, ${sy}`

  return `${MONTH_LABELS[sm - 1]} ${sd}, ${sy} – ${MONTH_LABELS[em - 1]} ${ed}, ${ey}`
}

function prettyDate(dateString) {
  const [y, m, d] = dateString.split('-').map(Number)
  return `${MONTH_LABELS[m - 1]} ${d}, ${y}`
}

export default function GenerateReportPanel({ basePath = '/admin/generated-reports' }) {
  const [period, setPeriod] = useState('Monthly')
  const [day, setDay] = useState(todayDateString)
  const [weekOf, setWeekOf] = useState(todayDateString)
  const [month, setMonth] = useState(() => todayDateString().slice(0, 7))
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  // A period that has not started has nothing to report, so the pickers stop
  // at today. The server refuses a future period too ("That reporting period
  // has not started yet"), but being told after pressing Generate is worse
  // than the month simply not being selectable.
  const maxDay = todayDateString()
  const maxMonth = maxDay.slice(0, 7)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  // An archive already covering this period is not a failure — the request
  // was understood and refused on purpose, and the way forward is a choice
  // the user makes. Held apart from `error` so it can be shown as
  // information rather than in the red reserved for things that went wrong.
  const [exists, setExists] = useState(null)

  // The period, resolved to the start/end actually sent and the name the
  // archive is filed under. Null while the inputs are incomplete, which is
  // what disables the button.
  const resolved = useMemo(() => {
    if (period === 'Daily') {
      if (!day) return null
      return { start: day, end: day, name: `${prettyDate(day)} Daily Report` }
    }

    if (period === 'Weekly') {
      if (!weekOf) return null
      const { start, end } = weekBounds(weekOf)
      return { start, end, name: `${prettyDate(start)} – ${prettyDate(end)} Weekly Report` }
    }

    if (period === 'Monthly') {
      if (!month) return null
      const { start, end } = monthBounds(month)
      const [y, m] = month.split('-').map(Number)
      return { start, end, name: `${MONTH_LABELS[m - 1]} ${y} Report` }
    }

    if (!from || !to) return null
    if (from > to) return null
    return { start: from, end: to, name: `${prettyDate(from)} – ${prettyDate(to)} Report` }
  }, [period, day, weekOf, month, from, to])

  // The server clamps a period that is still running back to today, so a
  // report is never HEADED a period it does not actually cover. The panel
  // has to do the same arithmetic or it promises something else: asking for
  // October on the 4th showed "Covers October 1 - October 31" and then filed
  // an archive covering October 1-4. Worse, the duplicate check compares the
  // CLAMPED dates, so the second attempt was refused for clashing with a
  // period the panel had never admitted to.
  //
  // Both are plain YYYY-MM-DD strings, which compare correctly as text.
  const clamped = useMemo(() => {
    if (!resolved) return null
    const end = resolved.end > maxDay ? maxDay : resolved.end
    return { ...resolved, end, inProgress: end !== resolved.end }
  }, [resolved, maxDay])

  const rangeInvalid = period === 'Custom' && from && to && from > to

  // max= greys the dates out in the picker, but it does not stop a value
  // typed straight into the field — so the start is checked here too, and
  // that is what disables the button. Both are plain YYYY-MM-DD strings,
  // which compare correctly as text.
  const notStarted = Boolean(resolved) && resolved.start > maxDay
  const canGenerate = Boolean(resolved) && !notStarted

  const generate = async () => {
    if (!clamped) return

    setBusy(true)
    setError('')
    setNotice('')
    setExists(null)

    try {
      await api.post(basePath, {
        report_name: clamped.name,
        period_start: clamped.start,
        period_end: clamped.end,
        report_type: period,
      })

      // Only after the server confirms. Invalidating wakes the list beside
      // this panel, so the new row appears without a page reload.
      invalidateCache(basePath)
      setNotice(`"${clamped.name}" has been generated.`)
    } catch (err) {
      // 409 is the archive refusing to be overwritten, which is the rule
      // working. Anything else is a genuine failure and keeps the red.
      if (err.response?.status === 409) {
        setExists({ period: prettyRange(clamped.start, clamped.end) })
      } else {
        setError(err.response?.data?.message || 'Could not generate the report. Please try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={local.panel}>
      <div style={styles.sectionLabel}>Generate a report</div>

      <div style={local.row}>
        <div style={local.field}>
          <label style={local.label}>Report Period</label>
          <select
            value={period}
            onChange={e => { setPeriod(e.target.value); setError(''); setNotice(''); setExists(null) }}
            style={local.input}
          >
            {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>

        {period === 'Daily' && (
          <div style={local.field}>
            <label style={local.label}>Date</label>
            <input type="date" max={maxDay} value={day} onChange={e => setDay(e.target.value)} style={local.input} />
          </div>
        )}

        {period === 'Weekly' && (
          <div style={local.field}>
            <label style={local.label}>Any day in the week</label>
            <input type="date" max={maxDay} value={weekOf} onChange={e => setWeekOf(e.target.value)} style={local.input} />
          </div>
        )}

        {period === 'Monthly' && (
          <div style={local.field}>
            <label style={local.label}>Month</label>
            <input type="month" max={maxMonth} value={month} onChange={e => setMonth(e.target.value)} style={local.input} />
          </div>
        )}

        {period === 'Custom' && (
          <>
            <div style={local.field}>
              <label style={local.label}>From</label>
              <input type="date" max={maxDay} value={from} onChange={e => setFrom(e.target.value)} style={local.input} />
            </div>
            <div style={local.field}>
              <label style={local.label}>To</label>
              <input
                type="date"
                max={maxDay}
                value={to}
                onChange={e => setTo(e.target.value)}
                style={{ ...local.input, ...(rangeInvalid ? local.inputInvalid : {}) }}
              />
            </div>
          </>
        )}

        <button
          type="button"
          onClick={generate}
          disabled={!canGenerate || busy}
          style={{ ...styles.primaryBtn, ...local.generateBtn, ...(!canGenerate || busy ? styles.btnDisabled : {}) }}
        >
          {busy ? 'Generating…' : 'Generate Report'}
        </button>
      </div>

      {/* The exact range being asked for, so the user sees what the archive
          will be headed before creating it. */}
      {clamped && (
        <div style={local.preview}>
          {prettyRange(clamped.start, clamped.end)}
          {clamped.inProgress && ' — This period is still ongoing, so the report will include data up to today.'}
        </div>
      )}

      {exists && (
        <div style={local.infoBox}>
          <div style={local.infoTitle}>Report already generated</div>
          <div style={local.infoBody}>
            A report for {exists.period} already exists. Delete the existing report
            if you want to generate a new one.
          </div>
        </div>
      )}

      {rangeInvalid && <div style={local.error}>The start date must be on or before the end date.</div>}
      {notStarted && <div style={local.error}>That reporting period has not started yet.</div>}
      {error && (
        <div style={local.errorBox}>
          <div style={local.errorTitle}>Report not generated</div>
          <div style={local.errorBody}>{error}</div>
        </div>
      )}
      {notice && <div style={local.notice}>{notice}</div>}
    </div>
  )
}

const SANS = "'Inter', sans-serif"

const local = {
  panel: { border: '1px solid #e4e8e1', borderRadius: 14, padding: '16px 18px', marginBottom: 18, backgroundColor: '#fbfcfa' },
  row: { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12, marginTop: 12 },
  // Generate sits at the right end of the row: the fields are what you set,
  // the button is what you then do, and the gap between them is the panel
  // width being used rather than left empty.
  generateBtn: { marginLeft: 'auto' },
  // No max width: the fields share the whole row, the same way the filter bar
  // on Farm Details does. Capping them left a band of empty panel between the
  // last field and the button, which is what "make it full" was about.
  field: { display: 'flex', flexDirection: 'column', gap: 5, flex: '1 1 170px', minWidth: 150 },
  label: { fontFamily: SANS, fontSize: 11.5, fontWeight: 700, color: '#6b7770' },
  input: {
    height: 40, width: '100%', padding: '0 11px', borderRadius: 10, border: '1px solid #dcdfd6',
    backgroundColor: '#fff', color: '#33413a', fontSize: 13, fontFamily: SANS, boxSizing: 'border-box',
  },
  inputInvalid: { borderColor: '#d98a8a', backgroundColor: '#fdf7f7' },
  preview: { fontFamily: SANS, fontSize: 12, color: '#6b7770', marginTop: 10 },
  error: { fontFamily: SANS, fontSize: 12.5, color: '#b91c1c', marginTop: 10 },
  // Neutral, not red. Nothing failed: the archive is doing what it is meant
  // to do, and the next step belongs to the user. Red here taught the reader
  // to mistrust a screen that was behaving correctly.
  infoBox: {
    fontFamily: SANS, marginTop: 10, padding: '10px 13px', borderRadius: 9,
    backgroundColor: '#f6f7f4', border: '1px solid #e3e6dd',
  },
  // The failure twin of infoBox: same shape, red, because this one did go
  // wrong and the reader has to be able to tell the two apart at a glance.
  errorBox: {
    fontFamily: SANS, marginTop: 10, padding: '10px 13px', borderRadius: 9,
    backgroundColor: '#fdf2f2', border: '1px solid #f3cfcf',
  },
  errorTitle: { fontSize: 12.5, fontWeight: 700, color: '#b91c1c', marginBottom: 3 },
  errorBody: { fontSize: 12.5, color: '#8c4b4b', lineHeight: 1.5 },
  infoTitle: { fontSize: 12.5, fontWeight: 700, color: '#16311d', marginBottom: 3 },
  infoBody: { fontSize: 12.5, color: '#5a6960', lineHeight: 1.5 },
  notice: { fontFamily: SANS, fontSize: 12.5, color: '#1f5a34', marginTop: 10 },
}
