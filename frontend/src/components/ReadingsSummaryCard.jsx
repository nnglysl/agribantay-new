import TableScroll from './TableScroll'
import TableFooter from './TableFooter'
import { SectionLoader } from './Loading'
import { AMMONIA_UNIT } from '../utils/ammonia'
import { parseLocalDate, DISPLAY_TIME_ZONE } from '../utils/formatDate'
import { formatDeploymentPeriod } from '../utils/deploymentPeriod'

/**
 * A farm's monitoring record as figures: one row per day per deployment.
 *
 * WHY A TABLE AND NOT ANOTHER CHART
 * The trend chart answers "is this getting better or worse" while staff are
 * deciding whether to dispatch. It cannot be read back afterwards: the points
 * are downsampled, the peaks are a shape rather than a number, and nothing on
 * it can be quoted. A monitoring period that has ended needs figures.
 *
 * WHY A LIST FIRST, THEN ONE TABLE
 * The fleet rotates, so a farm accumulates a deployment per visit and each
 * one runs about a week of daily rows. Rendering every deployment's table at
 * once put dozens of rows in a single card and pushed the alerts panel below
 * it off the screen. The list answers "what monitoring has this farm had" at
 * a glance; opening one answers "what happened during it", with the same
 * five-row paging every other table on these pages uses.
 *
 * Shared by the Admin and Super Admin farm pages, which are otherwise
 * near-duplicate files — one copy so the two cannot drift apart.
 */
export default function ReadingsSummaryCard({
  data,
  loading,
  openSummary,
  onOpen,
  onBack,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  isMobile,
}) {
  const deployments = data?.deployments || []
  const open = deployments.find(d => d.sensor_id === openSummary) || null

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <span style={styles.cardTitle}>
          {open ? `Readings Summary — ${open.device_name}` : 'Readings Summary'}
        </span>
        {open && (
          <button type="button" style={styles.backBtn} onClick={onBack}>
            ← Back
          </button>
        )}
      </div>

      {loading && <SectionLoader />}

      {!loading && deployments.length === 0 && (
        <div style={styles.empty}>No readings recorded for this farm yet.</div>
      )}

      {/* The list: one row per deployment. */}
      {!loading && !open && deployments.length > 0 && (
        <TableScroll style={styles.tableWrap}>
          <table style={{ ...styles.table, minWidth: '760px' }}>
            <thead>
              <tr>
                <th style={styles.th}>Device</th>
                <th style={styles.th}>Monitoring Period</th>
                <th style={styles.th}>Days</th>
                <th style={styles.th}>Readings</th>
                <th style={styles.th}>Uptime</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {deployments.map(dep => (
                <tr key={dep.sensor_id}>
                  <td style={styles.td}>
                    <div style={styles.device}>{dep.device_name}</div>
                    {!dep.is_current && <div style={styles.deviceSub}>Previously installed</div>}
                  </td>
                  <td style={styles.td}>
                    {formatDeploymentPeriod(dep.first_reading_at, dep.last_reading_at)}
                  </td>
                  <td style={styles.td}>{dep.days_covered}</td>
                  <td style={styles.td}>{dep.total_readings.toLocaleString()}</td>
                  <td style={styles.td}>
                    {dep.uptime_percent === null ? '—' : `${dep.uptime_percent}%`}
                  </td>
                  <td style={{ ...styles.td, textAlign: 'right' }}>
                    <button type="button" style={styles.viewBtn} onClick={() => onOpen(dep.sensor_id)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}

      {/* The daily table for one deployment. */}
      {!loading && open && (
        <>
          <div style={styles.openMeta}>
            {formatDeploymentPeriod(open.first_reading_at, open.last_reading_at)}
            {' · '}{open.total_readings.toLocaleString()} readings
            {open.uptime_percent !== null && ` · ${open.uptime_percent}% uptime`}
          </div>

          <TableScroll style={styles.tableWrap}>
            <table style={{ ...styles.table, minWidth: '826px' }}>
              <thead>
                <tr>
                  <th style={styles.th}>Date</th>
                  <th style={styles.th}>Ammonia Peak</th>
                  <th style={styles.th}>Ammonia Avg</th>
                  <th style={styles.th}>Moisture Peak</th>
                  <th style={styles.th}>Readings</th>
                  <th style={styles.th}>Alerts</th>
                  <th style={styles.th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {open.rows.slice((page - 1) * pageSize, page * pageSize).map(row => {
                  const tone = STATUS[row.status] || STATUS.Offline
                  return (
                    <tr key={row.date}>
                      <td style={styles.td}>
                        {parseLocalDate(row.date)?.toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                          timeZone: DISPLAY_TIME_ZONE,
                        }) || row.date}
                      </td>
                      <td style={styles.td}>{formatAmmonia(row.ammonia_peak)}</td>
                      <td style={styles.td}>{formatAmmonia(row.ammonia_avg)}</td>
                      <td style={styles.td}>
                        {row.moisture_peak === null ? '—' : `${row.moisture_peak}%`}
                      </td>
                      <td style={styles.td}>{row.reading_count.toLocaleString()}</td>
                      <td style={styles.td}>{row.alerts_raised}</td>
                      <td style={styles.td}>
                        <span style={{
                          ...styles.pill,
                          color: tone.color,
                          backgroundColor: tone.bg,
                        }}>
                          {row.status === 'Safe' ? 'Normal' : row.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableScroll>

          {/*
            TableFooter, not the bare Pagination: this card previously passed
            `lastPage`, which Pagination does not accept — it reads
            `totalPages`. The prop arrived undefined, the control fell back to
            a single page, and Next stayed disabled no matter how many days a
            deployment covered. A farm with twelve days of readings showed
            five and gave no way to reach the rest.

            TableFooter is what every other paginated table on these pages
            uses, so this also brings the "Showing X–Y of Z" count and the
            rows-per-page selector that were missing here, with the same
            spacing as the rest of the stack.
          */}
          <TableFooter
            currentPage={page}
            totalPages={Math.max(1, Math.ceil(open.rows.length / pageSize))}
            pageSize={pageSize}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
            rangeStart={open.rows.length === 0 ? 0 : (page - 1) * pageSize + 1}
            rangeEnd={Math.min(page * pageSize, open.rows.length)}
            totalItems={open.rows.length}
            isMobile={isMobile}
          />
        </>
      )}
    </div>
  )
}

const formatAmmonia = value =>
  value === null ? '—' : `${value}${AMMONIA_UNIT ? ` ${AMMONIA_UNIT}` : ''}`

const SANS = "'Inter', sans-serif"

// Same palette the rest of the system uses for these three words.
const STATUS = {
  Safe: { color: '#256b3d', bg: '#eaf3ec' },
  Warning: { color: '#b45309', bg: '#fbf1e2' },
  Critical: { color: '#b91c1c', bg: '#fbeaea' },
  Offline: { color: '#6b7280', bg: '#eef1ea' },
}

// Matches the Card and table styling the two farm pages define locally, so
// this card does not read as a different component dropped into the stack.
const styles = {
  card: { backgroundColor: '#fff', border: '1px solid #e7e8e0', borderRadius: '14px', padding: '20px 22px', fontFamily: SANS, boxSizing: 'border-box' },
  cardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '14px' },
  cardTitle: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 800, color: '#16311d' },
  backBtn: { border: '1px solid #e7e8e0', backgroundColor: '#fff', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontWeight: 700, color: '#16311d', cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap' },
  viewBtn: { border: '1px solid #cfe0d3', backgroundColor: '#eaf3ec', borderRadius: '8px', padding: '5px 14px', fontSize: '12px', fontWeight: 700, color: '#256b3d', cursor: 'pointer', fontFamily: SANS },
  openMeta: { fontSize: '11.5px', color: '#8a968d', marginBottom: '12px' },
  tableWrap: { width: '100%' },
  table: { width: '100%', borderCollapse: 'collapse', fontFamily: SANS },
  th: { textAlign: 'left', padding: '10px 14px', fontSize: '11.5px', fontWeight: 700, color: '#6f7a70', borderBottom: '1px solid #e7e8e0', whiteSpace: 'nowrap' },
  td: { padding: '13px 14px', fontSize: '13px', color: '#16311d', borderBottom: '1px solid #f0f1ec', whiteSpace: 'nowrap' },
  device: { fontSize: '13.5px', fontWeight: 800, color: '#16311d', lineHeight: 1.3 },
  deviceSub: { fontSize: '11.5px', color: '#9aa79d', marginTop: '4px', lineHeight: 1.3 },
  pill: { display: 'inline-flex', alignItems: 'center', padding: '3px 11px', borderRadius: '999px', fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap' },
  empty: { fontSize: '13px', color: '#9aa79d' },
}
