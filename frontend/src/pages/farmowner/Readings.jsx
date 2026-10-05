import { useMemo, useState } from 'react'
import FarmerLayout from '../../components/FarmerLayout'
import TableFooter from '../../components/TableFooter'
import { SkeletonTable } from '../../components/Loading'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { BACKGROUND_POLL_MS } from '../../constants/polling'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useOverflowX } from '../../hooks/useOverflowX'
import { useSelectedFarm } from '../../hooks/useSelectedFarm'
import { AMMONIA_NOTE } from '../../utils/ammonia'
import { timeAgo, DISPLAY_TIME_ZONE } from '../../utils/formatDate'
import {
  METRICS, SENSOR_CONDITIONS, STATUS_TONE,
  overallStatus, formatValue, wordFor, isAdvisory, DEFAULT_ALERTING_METRICS,
} from '../../constants/sensorConditions'

/**
 * Farm Readings — the CURRENT condition of every monitored house, as a table.
 *
 * Deliberately not a set of cards: a farm may run two houses or twenty, and
 * cards stop being scannable somewhere around four. A row per house stays
 * readable at any count, and the columns let a farmer compare houses against
 * each other, which stacked cards cannot do.
 *
 * Deliberately not historical, and deliberately no charts. Farm owners told
 * us they do not read sensor logs or graphs; they want to know what is wrong
 * right now and what to do. Trend analysis lives on the LGU-facing screens,
 * where the people who do that work are.
 *
 * Rows have no click target and no "View" action for the same reason: there
 * is nothing behind them a farm owner asked for, and a dead-end detail page
 * is worse than no link at all.
 */

const SANS = "'Inter', sans-serif"
const TEXT_DARK = '#16311d'
const BORDER = '#e7e8e0'

const STATUS_FILTERS = [
  { value: '', label: 'All Status' },
  { value: 'Safe', label: 'Normal' },
  { value: 'Warning', label: 'Needs Attention' },
  { value: 'Critical', label: 'Critical' },
]

const SORT_COLUMNS = [
  { key: 'house', label: 'House / Device' },
  ...METRICS.map(m => ({ key: m, label: SENSOR_CONDITIONS[m].column })),
  { key: 'overall', label: 'Overall Status' },
]

const SEVERITY = { Safe: 0, Warning: 1, Critical: 2 }

/**
 * `compact` is the in-cell variant: same colours, smaller and without the
 * fixed width, so four of them across a row stay subordinate to the reading
 * they annotate. The full-size one is used once per row for Overall Status.
 */
function StatusPill({ status, children, compact = false }) {
  const tone = STATUS_TONE[status] || STATUS_TONE.Offline
  return (
    <span style={{
      ...(compact ? styles.pillCompact : styles.pill),
      color: tone.fg,
      backgroundColor: tone.bg,
      border: `1px solid ${tone.dot}33`,
    }}>
      {children ?? status}
    </span>
  )
}

/**
 * One metric cell: the plain word, the reading, and the formal status badge.
 *
 * The badge names the status in the same vocabulary as the Status filter and
 * the summary counts above, so a farmer filtering to "Critical" can see
 * exactly which cells put a house in that bucket — the descriptive word
 * ("Too Hot") cannot do that on its own.
 */
function MetricCell({ device, metric, alerting }) {
  const status = device[`${metric}_status`]
  const direction = device[`${metric}_direction`] ?? null
  const tone = STATUS_TONE[status] || STATUS_TONE.Offline
  const value = device[metric]

  if (!status && (value === null || value === undefined)) {
    return <td style={styles.td}><span style={styles.muted}>&mdash;</span></td>
  }

  // Advisory metric: the number only.
  //
  // A badge is a judgement, and these three no longer carry one — their
  // thresholds come from temperate-climate studies that a San Jose layer
  // house breaches all day. Showing "Too Hot / Critical" next to a reading
  // the system will not act on teaches the farmer to ignore the colour, and
  // that habit carries over to the ammonia badge, which does mean something.
  if (isAdvisory(metric, alerting)) {
    return (
      <td style={styles.td}>
        <span style={styles.metricValue}>{formatValue(metric, value)}</span>
      </td>
    )
  }

  return (
    <td style={styles.td}>
      <div style={{ ...styles.metricWord, color: tone.fg }}>
        {wordFor(metric, status, direction)}
      </div>
      <div style={styles.metricRow}>
        <span style={styles.metricValue}>{formatValue(metric, value)}</span>
        <StatusPill status={status} compact />
      </div>
    </td>
  )
}

/**
 * Solid dark-green fill, matching the stat cards on the Admin and Super
 * Admin dashboards — the farmer's summary row is the same kind of object
 * and should not be a different-looking one.
 *
 * On that fill the severity colours lose their contrast, so the count is
 * plain white and the severity is carried by the label beside it ("Normal",
 * "Needs Attention", "Critical"), which names it outright.
 */
function SummaryCard({ count, title, sub }) {
  return (
    <div style={styles.summaryCard}>
      <div style={styles.summaryCount}>{count}</div>
      <div style={styles.summaryTitle}>{title}</div>
      <div style={styles.summarySub}>{sub}</div>
    </div>
  )
}

export default function FarmerReadings() {
  const isMobile = useIsMobile()
  const [tableScrollRef, tableOverflows] = useOverflowX()
  const { selectedFarmId, farmsLoading } = useSelectedFarm()

  const [houseFilter, setHouseFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sortKey, setSortKey] = useState('overall')
  const [sortDir, setSortDir] = useState('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const params = { farm_id: selectedFarmId }
  const { data, loading, error } = useCachedFetch(
    selectedFarmId ? '/farmer/dashboard' : null,
    params,
    { pollMs: BACKGROUND_POLL_MS }
  )

  const devices = useMemo(() => (Array.isArray(data?.devices) ? data.devices : []), [data])

  // Which metrics may be badged. The server owns this; the fallback only
  // covers a cached response from before the field existed.
  const alerting = useMemo(() => (
    Array.isArray(data?.alerting_metrics) && data.alerting_metrics.length
      ? data.alerting_metrics
      : DEFAULT_ALERTING_METRICS
  ), [data])

  const counts = useMemo(() => {
    const out = { Safe: 0, Warning: 0, Critical: 0 }
    devices.forEach(d => {
      const s = overallStatus(d, alerting)
      if (s && s in out) out[s] += 1
    })
    return out
  }, [devices, alerting])

  const visible = useMemo(() => {
    const rows = devices.filter(d => {
      if (houseFilter && String(d.device_id) !== houseFilter) return false
      if (statusFilter && overallStatus(d, alerting) !== statusFilter) return false
      return true
    })

    const sorted = [...rows].sort((a, b) => {
      let cmp
      if (sortKey === 'house') {
        cmp = (a.device_name || '').localeCompare(b.device_name || '')
      } else if (sortKey === 'overall') {
        cmp = (SEVERITY[overallStatus(a, alerting)] ?? -1) - (SEVERITY[overallStatus(b, alerting)] ?? -1)
      } else if (isAdvisory(sortKey, alerting)) {
        // An advisory column shows a number and no badge, so it sorts by that
        // number. Sorting it by a hidden status would reorder the table on a
        // judgement the reader cannot see.
        cmp = (a[sortKey] ?? -Infinity) - (b[sortKey] ?? -Infinity)
      } else {
        cmp = (SEVERITY[a[`${sortKey}_status`]] ?? -1) - (SEVERITY[b[`${sortKey}_status`]] ?? -1)
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return sorted
  }, [devices, houseFilter, statusFilter, sortKey, sortDir, alerting])

  const totalItems = visible.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const page = Math.min(Math.max(1, currentPage), totalPages)
  const paginated = useMemo(
    () => visible.slice((page - 1) * pageSize, page * pageSize),
    [visible, page, pageSize]
  )
  const rangeStart = totalItems === 0 ? 0 : (page - 1) * pageSize + 1
  const rangeEnd = Math.min(page * pageSize, totalItems)

  const toggleSort = key => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
    setCurrentPage(1)
  }

  if (farmsLoading || loading) {
    return <FarmerLayout title="Farm Readings"><SkeletonTable rows={6} columns={7} /></FarmerLayout>
  }

  if (error) {
    return (
      <FarmerLayout title="Farm Readings">
        <p style={{ ...styles.stateText, color: '#b91c1c' }}>{error}</p>
      </FarmerLayout>
    )
  }

  return (
    <FarmerLayout title="Farm Readings">
      <p style={styles.subtitle}>
        View the current condition of your monitored houses and devices.
      </p>

      {/* The two selects sit in one bordered strip that spans the page, so
          they read as a single filter control rather than two narrow boxes
          floating in empty space above a full-width table. */}
      <div style={styles.filterCard}>
        <div style={{ ...styles.filterGrid, ...(isMobile ? styles.filterGridMobile : {}) }}>
          <label style={styles.filterGroup}>
            <span style={styles.filterLabel}>Device / House</span>
            <select
              value={houseFilter}
              onChange={e => { setHouseFilter(e.target.value); setCurrentPage(1) }}
              style={styles.select}
            >
              <option value="">All Devices</option>
              {devices.map(d => (
                <option key={d.device_id} value={d.device_id}>
                  {d.device_name}
                </option>
              ))}
            </select>
          </label>

          <label style={styles.filterGroup}>
            <span style={styles.filterLabel}>Status</span>
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1) }}
              style={styles.select}
            >
              {STATUS_FILTERS.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div style={{ ...styles.summaryRow, ...(isMobile ? styles.summaryRowMobile : {}) }}>
        <SummaryCard count={counts.Safe} title="Normal" sub="houses / devices" />
        <SummaryCard count={counts.Warning} title="Needs Attention" sub="houses / devices" />
        <SummaryCard count={counts.Critical} title="Critical" sub="houses / devices" />
      </div>

      <div style={styles.card}>
        <div style={styles.cardHead}>
          <span style={styles.cardTitle}>Monitored Houses</span>
          <span style={styles.cardNote}>
            All readings are the latest sent by your devices.
          </span>
        </div>

        {tableOverflows && totalItems > 0 && (
          <p style={styles.scrollHint}>
            {isMobile ? 'Swipe' : 'Scroll'} left and right to see all columns &rarr;
          </p>
        )}

        <div ref={tableScrollRef} style={styles.tableScroll}>
          <table style={{ ...styles.table, ...styles.tableMinWidth }}>
            <thead>
              <tr>
                {SORT_COLUMNS.map(col => (
                  <th
                    key={col.key}
                    style={styles.th}
                    onClick={() => toggleSort(col.key)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSort(col.key) }
                    }}
                  >
                    {col.label}
                    <span style={styles.sortMark}>
                      {sortKey === col.key ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                    </span>
                  </th>
                ))}
                <th style={styles.th}>Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map(device => {
                const overall = overallStatus(device, alerting)
                return (
                  <tr key={device.device_id}>
                    <td style={styles.td}>
                      <div style={styles.houseName}>
                        {device.device_name}
                      </div>
                      <div style={styles.houseSub}>
                        {device.connectivity}
                        {device.connectivity !== 'Online' && timeAgo(device.last_reading_at) && (
                          <span style={styles.houseStale}>
                            {' '}&middot; last heard {timeAgo(device.last_reading_at)}
                          </span>
                        )}
                      </div>
                    </td>

                    {METRICS.map(metric => (
                      <MetricCell key={metric} device={device} metric={metric} alerting={alerting} />
                    ))}

                    <td style={styles.td}>
                      {overall
                        ? <StatusPill status={overall}>{overall === 'Safe' ? 'Normal' : overall}</StatusPill>
                        : <span style={styles.muted}>No reading yet</span>}
                    </td>

                    <td style={{ ...styles.td, ...styles.lastUpdated }}>
                      {device.last_reading_at
                        ? new Date(device.last_reading_at).toLocaleString(undefined, {
                          month: 'short', day: 'numeric', year: 'numeric',
                          hour: 'numeric', minute: '2-digit', timeZone: DISPLAY_TIME_ZONE,
                        })
                        : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {totalItems === 0 && (
          <div style={styles.empty}>
            {devices.length === 0
              ? 'No monitoring device has been installed for your farm yet.'
              : 'No house matches the filters above.'}
          </div>
        )}

        {totalItems > pageSize && (
          <TableFooter
            currentPage={page}
            totalPages={totalPages}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={size => { setPageSize(size); setCurrentPage(1) }}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            totalItems={totalItems}
            isMobile={isMobile}
          />
        )}
      </div>

      {/* Stated once under the table rather than on every row: the air-quality
          number is a raw sensor level until the sensor is calibrated, and an
          unlabelled figure beside °C and % would be read as a real unit. */}
      {AMMONIA_NOTE && (
        <p style={styles.footnote}>Air Quality is a relative sensor level &mdash; {AMMONIA_NOTE.toLowerCase()}.</p>
      )}
    </FarmerLayout>
  )
}

const styles = {
  stateText: { fontFamily: SANS, fontSize: '14px' },
  subtitle: { fontSize: '13.5px', color: '#6b7770', margin: '0 0 18px', fontFamily: SANS },

  filterCard: {
    background: '#fff', border: `1px solid ${BORDER}`, borderRadius: '12px',
    padding: '14px 16px', marginBottom: '16px',
  },
  // Equal columns that fill the strip, rather than two fixed-width boxes
  // leaving a wide gap on the right.
  filterGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '14px' },
  filterGridMobile: { gridTemplateColumns: '1fr' },
  filterGroup: { display: 'flex', flexDirection: 'column', gap: '5px', minWidth: 0 },
  filterLabel: { fontSize: '11.5px', fontWeight: 700, color: '#8a968d', fontFamily: SANS },
  select: {
    padding: '9px 12px', borderRadius: '10px', border: `1px solid #dcdfd6`,
    backgroundColor: '#fff', color: TEXT_DARK, fontSize: '13.5px',
    fontFamily: SANS, cursor: 'pointer', boxSizing: 'border-box',
  },

  summaryRow: { display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '18px' },
  summaryRowMobile: { flexDirection: 'column' },
  // Same fill, border and type colours as the Admin/Super Admin stat cards
  // (components/ReportsLayout.jsx), so the farmer's summary row is visibly
  // the same component and not a second design for the same idea.
  summaryCard: {
    background: '#234A35', border: '1px solid #1c3c2b', borderRadius: '14px',
    padding: '18px 20px', flex: '1 1 180px', fontFamily: SANS,
  },
  summaryCount: { fontSize: '30px', fontWeight: 800, lineHeight: 1, color: '#fff', letterSpacing: '-0.02em' },
  summaryTitle: { fontSize: '13px', fontWeight: 700, color: '#eaf3ec', marginTop: '8px' },
  summarySub: { fontSize: '12px', color: 'rgba(234,243,236,0.7)', marginTop: '3px' },

  card: { background: '#fff', border: `1px solid ${BORDER}`, borderRadius: '14px', overflow: 'hidden' },
  cardHead: {
    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
    gap: '12px', flexWrap: 'wrap', padding: '16px 20px 12px',
  },
  cardTitle: { fontSize: '15px', fontWeight: 800, color: TEXT_DARK, fontFamily: SANS },
  cardNote: { fontSize: '11.5px', color: '#9aa79d', fontFamily: SANS },
  scrollHint: { fontSize: '11px', color: '#9aa79d', margin: '0 20px 8px', fontFamily: SANS },

  tableScroll: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  table: { width: '100%', borderCollapse: 'collapse', fontFamily: SANS },
  tableMinWidth: { minWidth: '940px' },
  th: {
    textAlign: 'left', padding: '11px 16px', fontSize: '12px', fontWeight: 700,
    color: '#8a968d', borderBottom: `1px solid #eceee7`, borderTop: `1px solid #eceee7`,
    backgroundColor: '#fafbf8', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none',
  },
  sortMark: { marginLeft: '6px', fontSize: '9px', color: '#b7bdb4' },
  td: { padding: '12px 16px', borderBottom: '1px solid #f2f3ed', verticalAlign: 'top' },

  houseName: { fontSize: '13.5px', fontWeight: 700, color: TEXT_DARK },
  houseSub: { fontSize: '11.5px', color: '#9aa79d', marginTop: '2px' },
  houseStale: { color: '#9a6a12', fontWeight: 600 },

  metricWord: { fontSize: '13px', fontWeight: 700 },
  metricRow: { display: 'flex', alignItems: 'center', gap: '7px', marginTop: '3px', flexWrap: 'wrap' },
  metricValue: { fontSize: '12.5px', color: '#4b5a50', whiteSpace: 'nowrap' },

  // Now the only badge on the row, so it can afford to be readable: bigger
  // text and padding than the four it replaced, and a matching outline so it
  // holds its shape against a white row instead of looking like a smudge.
  pill: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minWidth: '74px', padding: '4px 12px', borderRadius: '999px',
    fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap',
  },
  pillCompact: {
    display: 'inline-flex', alignItems: 'center', padding: '2px 8px',
    borderRadius: '999px', fontSize: '10px', fontWeight: 700, whiteSpace: 'nowrap',
  },
  muted: { fontSize: '12.5px', color: '#9aa79d' },
  lastUpdated: { fontSize: '12px', color: '#8a968d', whiteSpace: 'nowrap' },
  empty: { padding: '32px', textAlign: 'center', color: '#9aa79d', fontSize: '13.5px', fontFamily: SANS },
  footnote: { fontSize: '11.5px', color: '#9aa79d', margin: '12px 2px 0', fontFamily: SANS },
}
