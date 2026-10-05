import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import VetLayout from '../../components/VetLayout'
import TableScroll from '../../components/TableScroll'
import SharedPagination from '../../components/Pagination'
import ClearDateButton, { DateRangeHeader } from '../../components/ClearDateButton'
import ServiceRequestDetailsModal from '../../components/ServiceRequestDetailsModal'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { BACKGROUND_POLL_MS } from '../../constants/polling'
import { useIsMobile } from '../../hooks/useIsMobile'
import { DISPLAY_TIME_ZONE } from '../../utils/formatDate'
import { parseLocalDate } from '../../utils/formatDate'
import { serviceTypeBadgeStyle, serviceTypeLabel, requestStatusBadgeStyle } from '../../utils/serviceBadgeStyle'
import { VET_TYPES } from '../../constants/serviceTypes'
import { SectionLoader } from '../../components/Loading'
import ReadingTrendChart from '../../components/ReadingTrendChart'
import { SENSOR_CONDITIONS } from '../../constants/sensorConditions'

const PAGE_SIZE_OPTIONS = [10, 25, 50]

// The four readings a vet reads alongside a flock assessment, in the order
// they are asked about. Units and decimals come from SENSOR_CONDITIONS so
// they cannot drift from the farmer and Admin screens; the labels are the
// clinical names rather than the farmer-facing wording ("Air Quality",
// "Manure Condition"), which is the one thing that should differ here.
const VET_CONDITIONS = [
  { key: 'ammonia', label: 'Ammonia' },
  { key: 'temperature', label: 'Temperature' },
  { key: 'humidity', label: 'Humidity' },
  { key: 'moisture', label: 'Manure Moisture' },
]

// Same palette the rest of the system uses for these three words.
const CONDITION_TONE = {
  Safe: { fg: '#256b3d', bg: '#eaf3ec' },
  Warning: { fg: '#b45309', bg: '#fbf1e2' },
  Critical: { fg: '#b91c1c', bg: '#fbeaea' },
}

// Vet's Service Requests are always Farm Biosecurity/Blood Test (enforced server-side
// in Vet\FarmController::serviceRequests()).
const SERVICE_REQUEST_TYPES = VET_TYPES

// An empty string on either side means "don't restrict that end of the range".
function matchesDateRange(dateValue, fromDate, toDate) {
  if (!fromDate && !toDate) return true
  if (!dateValue) return false
  const d = new Date(dateValue)
  if (isNaN(d.getTime())) return false
  const dOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  if (fromDate && dOnly < parseLocalDate(fromDate)) return false
  if (toDate && dOnly > parseLocalDate(toDate)) return false
  return true
}

// Monitoring is its own tab. The readings are supporting evidence for an
// assessment, not part of the owner's record — stacking a status table and a
// chart under the contact details made one long page where two short ones
// read better, and nothing above the fold said what the farm was like today.
const TABS = [
  { key: 'info', label: 'Farm Information' },
  { key: 'monitoring', label: 'Monitoring' },
  { key: 'servicerequests', label: 'Service Requests' },
]

function getInitials(name) {
  if (!name) return ''
  return name.split(' ').filter(Boolean).slice(0, 2).map(n => n[0].toUpperCase()).join('')
}

// Short form of the shared display convention: same Asia/Manila timezone as
// utils/formatDate, abbreviated month to fit this page's dense detail rows.
function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: DISPLAY_TIME_ZONE })
}

/**
 * View-only Farm Details for the Vet role. No edit/deactivate anywhere —
 * mirrors the narrow, read-only scope of Vet\FarmController on the backend.
 * Service Requests here only ever return Vaccine/Blood Test requests
 * (enforced server-side), the two request types relevant to veterinary work.
 */
export default function VetFarmDetails() {
  const { farmId } = useParams()
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  const [activeTab, setActiveTab] = useState('info')
  const [trendHours, setTrendHours] = useState(24)
  const [requestPage, setRequestPage] = useState(1)
  const [requestPageSize, setRequestPageSize] = useState(10)
  const [viewRecord, setViewRecord] = useState(null)

  const [requestTypeFilter, setRequestTypeFilter] = useState('')
  const [requestFromDate, setRequestFromDate] = useState('')
  const [requestToDate, setRequestToDate] = useState('')
  const [draftRequestType, setDraftRequestType] = useState('')
  const [draftRequestFrom, setDraftRequestFrom] = useState('')
  const [draftRequestTo, setDraftRequestTo] = useState('')

  const { data: farm, loading, error } = useCachedFetch(`/vet/farms/${farmId}`, {}, { pollMs: BACKGROUND_POLL_MS })
  const { data: trendData, loading: trendLoading } = useCachedFetch(
    activeTab === 'monitoring' ? `/vet/farms/${farmId}/readings-history` : null,
    { hours: trendHours },
    { pollMs: BACKGROUND_POLL_MS }
  )
  const { data: requestData, loading: requestLoading } = useCachedFetch(
    activeTab === 'servicerequests' ? `/vet/farms/${farmId}/service-requests` : null,
    { page: requestPage, per_page: requestPageSize }
  )

  const handlePageSizeChange = (size) => { setRequestPageSize(size); setRequestPage(1) }

  // One-click Clear Date: clears draft + applied dates immediately; the
  // request-type filter is untouched.
  const clearRequestDates = () => {
    setDraftRequestFrom(''); setDraftRequestTo('')
    setRequestFromDate(''); setRequestToDate('')
  }
  const hasRequestDate = !!(draftRequestFrom || draftRequestTo || requestFromDate || requestToDate)

  const applyRequestFilter = () => {
    setRequestTypeFilter(draftRequestType)
    setRequestFromDate(draftRequestFrom)
    setRequestToDate(draftRequestTo)
  }
  const resetRequestFilter = () => {
    setDraftRequestType('')
    setDraftRequestFrom('')
    setDraftRequestTo('')
    setRequestTypeFilter('')
    setRequestFromDate('')
    setRequestToDate('')
  }

  const filteredRequests = useMemo(() => {
    let list = requestData?.requests || []
    if (requestTypeFilter) list = list.filter(r => r.request_type === requestTypeFilter)
    list = list.filter(r => matchesDateRange(r.created_at, requestFromDate, requestToDate))
    return list
  }, [requestData, requestTypeFilter, requestFromDate, requestToDate])

  if (loading) {
    return <VetLayout><p style={styles.stateText}>Loading farm profile…</p></VetLayout>
  }
  if (error || !farm) {
    return <VetLayout><p style={{ ...styles.stateText, color: '#b91c1c' }}>{error || 'Farm not found.'}</p></VetLayout>
  }

  const isActive = farm.status === 'Active'
  const initials = getInitials(farm.owner_name)

  return (
    <VetLayout>
      <button type="button" style={styles.backBtn} onClick={() => navigate('/vet/farms')}>
        ← Back
      </button>

      <div style={styles.headerCard}>
        <div style={styles.headerLeft}>
          <span style={styles.avatarCircle}>
            {farm.owner_profile_photo_url ? (
              <img src={farm.owner_profile_photo_url} alt={farm.owner_name} style={styles.avatarImg} />
            ) : (
              initials || '—'
            )}
          </span>
          <div>
            <div style={styles.ownerName}>{farm.owner_name}</div>
            <div style={styles.farmSub}>
              {farm.farm_name}
              <span style={{
                ...styles.statusPill,
                color: isActive ? '#2c8047' : '#6b7280',
                backgroundColor: isActive ? '#eaf3ec' : '#f0f1ec',
              }}>
                <span style={{ ...styles.pillDot, backgroundColor: isActive ? '#2c8047' : '#6b7280' }} />
                {farm.status}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div style={styles.tabsRow}>
        {TABS.map(t => (
          <button
            key={t.key}
            style={{ ...styles.tab, ...(activeTab === t.key ? styles.tabActive : {}) }}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'info' && (
        <Card title="Account Information">
          <div style={photoUploadStyles.wrap}>
            <span style={photoUploadStyles.preview}>
              {farm.owner_profile_photo_url ? (
                <img src={farm.owner_profile_photo_url} alt={farm.owner_name} style={photoUploadStyles.previewImg} />
              ) : (
                <span style={photoUploadStyles.placeholder}>{initials || '—'}</span>
              )}
            </span>
            <div>
              <div style={photoUploadStyles.label}>Owner Profile Photo</div>
              <div style={photoUploadStyles.hint}>Optional. JPG or PNG, up to 5MB.</div>
            </div>
          </div>

          <div style={acctStyles.row}>
            <ReadOnlyField label="First Name" value={farm.owner_first_name} />
            <ReadOnlyField label="Last Name" value={farm.owner_last_name} />
          </div>
          {/* "Account Status" was showing farm.status — the FARM's status,
              under an owner-account label, repeating the badge beside the
              farm name two inches above. Wrong twice over, so it is gone;
              the badge is the one place that says it. */}
          <div style={acctStyles.row}>
            <ReadOnlyField label="Mobile Number" value={farm.mobile_number} />
            <ReadOnlyField label="Email Address" value={farm.email} />
          </div>

          <div style={styles.sectionDivider}>
            <span style={styles.sectionDividerLabel}>Farm Details</span>
          </div>

          <div style={acctStyles.row}>
            <ReadOnlyField label="Farm Name" value={farm.farm_name} />
            <ReadOnlyField label="Address" value={farm.address} />
          </div>
          <div style={acctStyles.row}>
            <ReadOnlyField label="Barangay" value={farm.barangay} />
            <ReadOnlyField label="Farm Size" value={farm.farm_size} />
          </div>
          <div style={acctStyles.row}>
            <ReadOnlyField label="Date Registered" value={formatDate(farm.created_at)} />
            <div />
          </div>
        </Card>
      )}

      {/* A vet assessing a flock needs to see whether conditions have been
          bad for hours or are only now spiking — the latest reading alone
          cannot tell those apart. Same component the Admin and farmer use. */}
      {/* The latest value per sensor, before the trend — a vet checks "what
          is it right now" first, then looks at how it got there. Statuses are
          the ones the backend already computed; nothing is classified here. */}
      {activeTab === 'monitoring' && (
        <div style={isMobile ? styles.cardStack : styles.monitoringSplit}>
        <Card title="Current Conditions">
          {!farm.latest_reading ? (
            <div style={styles.empty}>
              No readings recorded for this farm yet.
            </div>
          ) : (
            <>
              <div style={styles.conditionList}>
                {VET_CONDITIONS.map(({ key, label }) => {
                  const value = farm.latest_reading[key]
                  const status = farm.latest_reading[`${key}_status`]
                  const spec = SENSOR_CONDITIONS[key]
                  const tone = CONDITION_TONE[status]
                  // Advisory metrics are still shown, but a vet should know
                  // they never raise an alert on their own.
                  const advisory = !(farm.alerting_metrics || []).includes(key)

                  // "Outside range" said a reading was wrong without saying
                  // which way or against what. The band comes from the
                  // server (config/sensors.php), so the side is worked out
                  // from the number rather than guessed from the status.
                  const band = farm.metric_bands?.[key]
                  const advisoryWord = !band || value == null
                    ? (status === 'Safe' ? 'Normal' : 'Outside normal')
                    : value > band.high ? 'Above normal'
                      : value < band.low ? 'Below normal'
                        : 'Normal'

                  return (
                    <div key={key} style={styles.conditionRow}>
                      <span style={styles.conditionLabel}>
                        {label}
                        {advisory && <span style={styles.conditionAdvisory}>advisory</span>}
                        {advisory && band && (
                          <span style={styles.conditionBand}>
                            normal {band.low}–{band.high}{spec?.unit ?? ''}
                          </span>
                        )}
                      </span>
                      <span style={styles.conditionValue}>
                        {value == null
                          ? '—'
                          : `${Number(value).toFixed(spec?.decimals ?? 0)}${spec?.unit ?? ''}`}
                      </span>
                      <span style={styles.conditionStatusWrap}>
                        {!status ? (
                          <span style={styles.conditionMuted}>No data</span>
                        ) : advisory ? (
                          // An advisory metric raised no alert, so it must not
                          // wear the alert palette. "Temperature ADVISORY —
                          // Critical" in red said both things at once: the row
                          // looked like an emergency while Alert History,
                          // correctly, held nothing for it. The reading is
                          // still shown, described rather than graded.
                          <span style={styles.conditionNeutral}>
                            {advisoryWord}
                          </span>
                        ) : tone ? (
                          <span style={{ ...styles.conditionStatus, color: tone.fg, backgroundColor: tone.bg }}>
                            {status}
                          </span>
                        ) : (
                          <span style={styles.conditionMuted}>No data</span>
                        )}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Without this the "advisory" tag is a word with no meaning
                  attached, and a vet is left to guess why one row is graded
                  Safe/Warning/Critical and the next is not. */}
              <div style={styles.conditionFooter}>
                {farm.latest_reading.recorded_at && (
                  <span>Last recorded {farm.latest_reading.recorded_at}</span>
                )}
                <span style={styles.conditionNote}>
                  Advisory readings are recorded for context and never raise an alert
                  on their own. Only ammonia and manure moisture do.
                </span>
              </div>
            </>
          )}
        </Card>

        <Card title="Readings Over Time">
          <ReadingTrendChart
            data={trendData}
            loading={trendLoading}
            hours={trendHours}
            onHoursChange={setTrendHours}
          />
        </Card>
        </div>
      )}

      {activeTab === 'servicerequests' && (
        <Card title="Service Requests">
          {requestLoading && <SectionLoader />}
          {!requestLoading && (requestData?.requests?.length ?? 0) === 0 && (
            <div style={styles.empty}>No service requests recorded for this farm yet.</div>
          )}
          {!requestLoading && requestData?.requests?.length > 0 && (
            <>
              <div className="no-print" style={filterStyles.filterBar}>
                <div style={filterStyles.filterField}>
                  <DateRangeHeader>
                    <label style={filterStyles.filterLabel}>From</label>
                    <ClearDateButton visible={hasRequestDate} onClick={clearRequestDates} />
                  </DateRangeHeader>
                  <input type="date" value={draftRequestFrom} onChange={e => setDraftRequestFrom(e.target.value)} style={filterStyles.filterSelect} />
                </div>

                <div style={filterStyles.filterField}>
                  <label style={filterStyles.filterLabel}>To</label>
                  <input type="date" value={draftRequestTo} onChange={e => setDraftRequestTo(e.target.value)} style={filterStyles.filterSelect} />
                </div>

                <div style={filterStyles.filterField}>
                  <label style={filterStyles.filterLabel}>Type</label>
                  <select
                    value={draftRequestType}
                    onChange={e => setDraftRequestType(e.target.value)}
                    style={filterStyles.filterSelect}
                  >
                    <option value="">All Types</option>
                    {SERVICE_REQUEST_TYPES.map(t => (
                      <option key={t} value={t}>{serviceTypeLabel(t)}</option>
                    ))}
                  </select>
                </div>

                <div style={filterStyles.filterActions}>
                  <button type="button" onClick={resetRequestFilter} style={filterStyles.filterResetBtn}>Reset</button>
                  <button type="button" onClick={applyRequestFilter} style={filterStyles.filterApplyBtn}>Apply</button>
                </div>
              </div>

              <TableScroll style={tableStyles.wrap}>
                <table style={{ ...tableStyles.table, minWidth: '826px' }}>
                  <thead>
                    <tr>
                      <th style={tableStyles.th}>Request Type</th>
                      <th style={tableStyles.th}>Request Date</th>
                      <th style={tableStyles.th}>Status</th>
                      <th style={tableStyles.th}>Accepted By</th>
                      <th style={tableStyles.th}>Date Completed</th>
                      <th style={{ ...tableStyles.th, textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRequests.map(r => {
                      return (
                        <tr key={r.id}>
                          <td style={tableStyles.td}>
                            <span style={{ ...styles.miniPill, ...serviceTypeBadgeStyle(r.request_type) }}>
                              {serviceTypeLabel(r.request_type)}
                            </span>
                          </td>
                          <td style={tableStyles.td}>{r.request_date}</td>
                          <td style={tableStyles.td}>
                            <span style={{ ...styles.miniPill, ...requestStatusBadgeStyle(r.status) }}>{r.status}</span>
                          </td>
                          <td style={tableStyles.td}>{r.accepted_by || '—'}</td>
                          <td style={tableStyles.td}>{r.completed_at || '—'}</td>
                          <td style={{ ...tableStyles.td, textAlign: 'right' }}>
                            <span
                              style={tableStyles.viewLink}
                              onClick={() => setViewRecord({
                                ...r,
                                farm_name: farm.farm_name,
                                owner_name: farm.owner_name,
                                barangay: farm.barangay,
                                farm_size: farm.farm_size,
                                service_type: r.request_type,
                                completed_at: r.completed_at_raw,
                              })}
                            >
                              View
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </TableScroll>
              <Pagination
                currentPage={requestData.current_page}
                lastPage={requestData.last_page}
                pageSize={requestPageSize}
                total={requestData.total}
                onPageChange={setRequestPage}
                onPageSizeChange={handlePageSizeChange}
                isMobile={isMobile}
              />
            </>
          )}
        </Card>
      )}

      {viewRecord && (
        <ServiceRequestDetailsModal
          request={viewRecord}
          isMobile={isMobile}
          onClose={() => setViewRecord(null)}
        />
      )}
    </VetLayout>
  )
}

function Card({ title, children }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <span style={styles.cardTitle}>{title}</span>
      </div>
      {children}
    </div>
  )
}

function ReadOnlyField({ label, value }) {
  return (
    <div style={acctStyles.fieldGroup}>
      <label style={acctStyles.label}>{label}</label>
      <input value={value || ''} disabled style={{ ...acctStyles.input, ...acctStyles.inputDisabled }} />
    </div>
  )
}

function Pagination({ currentPage, lastPage, pageSize, total, onPageChange, onPageSizeChange, isMobile }) {
  const rangeStart = total === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const rangeEnd = Math.min(currentPage * pageSize, total)

  return (
    <div className="no-print" style={{ ...paginationStyles.wrap, ...(isMobile ? paginationStyles.wrapMobile : {}) }}>
      <div style={paginationStyles.info}>
        {total === 0 ? 'No results' : `Showing ${rangeStart}–${rangeEnd} of ${total}`}
      </div>
      <div style={paginationStyles.controls}>
        <select value={pageSize} onChange={e => onPageSizeChange(Number(e.target.value))} style={paginationStyles.pageSizeSelect}>
          {PAGE_SIZE_OPTIONS.map(size => <option key={size} value={size}>{size} / page</option>)}
        </select>
        <SharedPagination currentPage={currentPage} totalPages={lastPage} onPageChange={onPageChange} isMobile={isMobile} />
      </div>
    </div>
  )
}

const SANS = "'Inter', sans-serif"

const styles = {
  stateText: { fontFamily: SANS, fontSize: '14px', color: '#4b5a50' },

  backBtn: {
    display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px',
    borderRadius: '999px', border: '1px solid #dcdfd6', backgroundColor: '#fff',
    color: '#33413a', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: SANS,
    marginBottom: '16px',
  },

  headerCard: {
    display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '16px',
    backgroundColor: '#fff', border: '1px solid #e7e8e0', borderRadius: '14px', padding: '18px 22px', marginBottom: '20px',
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '14px' },
  avatarCircle: {
    width: '52px', height: '52px', borderRadius: '50%', backgroundColor: '#eaf3ec', color: '#2c8047',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '17px', fontWeight: 700,
    flexShrink: 0, overflow: 'hidden', border: '1px solid #d6e5da',
  },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  ownerName: { fontSize: '17px', fontWeight: 800, color: '#16311d', letterSpacing: '-0.01em' },
  farmSub: { fontSize: '12.5px', color: '#7b8a80', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '10px' },
  statusPill: { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 11px', borderRadius: '999px', fontSize: '11px', fontWeight: 700 },
  pillDot: { width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0 },

  // minWidth 0 is what lets overflowX work: without it a flex item refuses
  // to be narrower than its contents, so the row pushed the whole page
  // sideways instead of scrolling inside itself.
  tabsRow: { display: 'flex', gap: '26px', borderBottom: '1px solid #e7e8e0', marginBottom: '20px', overflowX: 'auto', minWidth: 0, flexWrap: 'nowrap', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', },
  tab: { border: 'none', background: 'none', padding: '12px 0', fontFamily: SANS, fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', color: '#8a968d', borderBottom: '2px solid transparent', marginBottom: '-1px', flexShrink: 0, },
  tabActive: { color: '#2c8047', borderBottom: '2px solid #2c8047' },

  card: { backgroundColor: '#fff', border: '1px solid #e7e8e0', borderRadius: '14px', padding: '20px 22px', fontFamily: SANS },
  // Spacing lives on the container, not the card — see the Admin copies.
  cardStack: { display: 'flex', flexDirection: 'column', gap: '18px' },
  // The chart takes the larger share — a line needs width to be readable,
  // while the four readings are a short list. align-items: start keeps the
  // left card its own height instead of stretching it to match the chart.
  monitoringSplit: {
    display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.3fr)',
    gap: '18px', alignItems: 'start',
  },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  cardTitle: { fontSize: '14px', fontWeight: 800, color: '#16311d' },

  sectionDivider: { borderTop: '1px solid #eceee7', marginTop: '4px', marginBottom: '18px', paddingTop: '14px' },
  sectionDividerLabel: { fontSize: '11px', fontWeight: 700, color: '#8a968d', textTransform: 'uppercase', letterSpacing: '0.05em' },

  miniPill: { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 11px', borderRadius: '999px', fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap' },
  empty: { fontSize: '13px', color: '#9aa79d' },

  // Current Conditions — a plain three-column read-out, no controls.
  conditionList: { display: 'flex', flexDirection: 'column' },
  // The value belongs beside its status, not stranded in the middle of a
  // wide card: a reading and its verdict are one fact and are read together.
  // The label takes the slack, so the two right-hand columns stay aligned
  // down the list whatever the card width.
  conditionRow: {
    display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 110px 130px',
    alignItems: 'center', gap: '12px', padding: '11px 0', borderBottom: '1px solid #f2f3ed',
  },
  // Wraps rather than squeezes: in the narrower side-by-side card the label,
  // the advisory tag and the band hint no longer fit on one line.
  conditionLabel: { fontSize: '13.5px', fontWeight: 600, color: '#33413a', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px 8px', minWidth: 0 },
  conditionAdvisory: {
    fontSize: '10px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
    color: '#8a968d', backgroundColor: '#f2f3ed', borderRadius: '999px', padding: '2px 7px', whiteSpace: 'nowrap',
  },
  // Right-aligned and tabular so the decimal points line up down the column.
  conditionValue: {
    fontSize: '14px', fontWeight: 700, color: '#16311d',
    textAlign: 'right', fontVariantNumeric: 'tabular-nums',
  },
  conditionStatusWrap: { justifySelf: 'end' },
  conditionBand: { fontSize: '11.5px', color: '#8a968d', fontWeight: 500, whiteSpace: 'nowrap' },
  conditionNeutral: {
    display: 'inline-block', fontSize: '11.5px', fontWeight: 700,
    borderRadius: '999px', padding: '3px 10px', whiteSpace: 'nowrap',
    color: '#6b7770', backgroundColor: '#f2f3ed',
  },
  conditionStatus: {
    display: 'inline-block', fontSize: '11.5px', fontWeight: 700,
    borderRadius: '999px', padding: '3px 10px', whiteSpace: 'nowrap',
  },
  conditionMuted: { fontSize: '12px', color: '#9aa79d' },
  conditionFooter: {
    fontSize: '11.5px', color: '#8a968d', marginTop: '12px',
    display: 'flex', flexDirection: 'column', gap: '4px', lineHeight: 1.6,
  },
  conditionNote: { maxWidth: '72ch' },
}

const acctStyles = {
  row: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '16px' },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' },
  label: { fontSize: '13px', fontWeight: '500', color: '#374151' },
  input: {
    padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db',
    fontSize: '14px', boxSizing: 'border-box', width: '100%', fontFamily: SANS,
  },
  inputDisabled: { backgroundColor: '#f9fafb', color: '#6b7280', cursor: 'not-allowed' },
}

const photoUploadStyles = {
  wrap: { display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px', padding: '12px', backgroundColor: '#fafbf8', borderRadius: '12px', border: '1px solid #eceee7' },
  preview: { width: '56px', height: '56px', borderRadius: '50%', backgroundColor: '#eaf3ec', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden', border: '2px dashed #cfe0d3' },
  previewImg: { width: '100%', height: '100%', objectFit: 'cover' },
  placeholder: { fontSize: '18px', color: '#2c8047', fontWeight: 700 },
  label: { fontSize: '13px', fontWeight: 700, color: '#16311d' },
  hint: { fontSize: '11.5px', color: '#9aa79d', marginTop: '2px' },
}

const tableStyles = {
  wrap: { overflowX: 'auto', marginTop: '4px', border: '1px solid #eceee7', borderRadius: '10px' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '10px 14px', fontSize: '13px', fontWeight: 600, color: '#8a968d', borderBottom: '1px solid #eceee7', backgroundColor: '#fafbf8', whiteSpace: 'nowrap' },
  td: { padding: '11px 14px', fontSize: '12px', color: '#4b5a50', borderBottom: '1px solid #f2f3ed', verticalAlign: 'top' },
  viewLink: {
    display: 'inline-block', padding: '6px 13px', borderRadius: '8px',
    fontSize: '12.5px', fontWeight: 600, cursor: 'pointer',
    border: '1px solid #e3e6dd', backgroundColor: '#fff', color: '#4b5a50', whiteSpace: 'nowrap',
  },
}

// Styling for the Service Requests tab's inline horizontal filter bar —
// every dropdown is shown directly on the page (no popover), matching the
// same visual pattern used across the Admin/Super Admin Farm Details pages.
const filterStyles = {
  filterBar: {
    display: 'flex', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap',
    marginTop: '4px', marginBottom: '18px', padding: '14px 16px',
    backgroundColor: '#fafbf8', border: '1px solid #eceee7', borderRadius: '12px',
  },
  // Fields share the bar's width rather than staying at their minimum and
  // leaving a stripe of empty space to the right of the last input.
  filterField: { display: 'flex', flexDirection: 'column', gap: '6px', flex: '1 1 160px', minWidth: '160px' },
  filterLabel: { fontSize: '11.5px', fontWeight: 700, color: '#4b5a50', textTransform: 'uppercase', letterSpacing: '0.03em' },
  filterSelect: {
    padding: '9px 12px', borderRadius: '10px', border: '1px solid #dcdfd6',
    fontSize: '13px', color: '#33413a', backgroundColor: '#fff', cursor: 'pointer',
    fontFamily: SANS, boxSizing: 'border-box', width: '100%', minWidth: 0,
  },
  // Sits on the baseline with the inputs rather than being pushed to the
  // far edge by margin, so the bar reads as one row of controls.
  filterActions: { display: 'flex', gap: '10px', marginLeft: 'auto', flex: '0 0 auto' },
  filterResetBtn: {
    padding: '9px 18px', borderRadius: '10px', border: '1px solid #dcdfd6',
    backgroundColor: '#fff', color: '#33413a', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap',
  },
  filterApplyBtn: {
    padding: '9px 18px', borderRadius: '10px', border: 'none',
    backgroundColor: '#2c8047', color: '#fff', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap',
  },
}

const paginationStyles = {
  wrap: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '16px', paddingTop: '14px', borderTop: '1px solid #f0efe8', flexWrap: 'wrap', gap: '10px' },
  wrapMobile: { flexDirection: 'column', flexWrap: 'nowrap', alignItems: 'stretch' },
  info: { fontSize: '12px', color: '#8a968d', whiteSpace: 'nowrap', fontFamily: SANS },
  controls: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
  pageSizeSelect: { padding: '6px 10px', borderRadius: '8px', border: '1px solid #dcdfd6', fontSize: '12px', color: '#4b5a50', fontFamily: SANS, backgroundColor: '#fff', cursor: 'pointer' },
  navBtn: { minWidth: '30px', height: '30px', padding: '0 6px', borderRadius: '8px', border: '1px solid #dcdfd6', backgroundColor: '#fff', color: '#4b5a50', fontSize: '13px', cursor: 'pointer', fontFamily: SANS },
  navBtnDisabled: { opacity: 0.4, cursor: 'not-allowed' },
  pageInfo: { fontSize: '12.5px', color: '#8a968d' },
  pageBtn: { minWidth: '30px', height: '30px', padding: '0 6px', borderRadius: '8px', border: '1px solid #dcdfd6', backgroundColor: '#fff', color: '#4b5a50', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: SANS },
  pageBtnActive: { backgroundColor: '#2c8047', borderColor: '#2c8047', color: '#fff' },
  ellipsis: { padding: '0 4px', color: '#9aa79d', fontSize: '13px' },
}
