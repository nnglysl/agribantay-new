import { GREEN } from '../../theme/green'
import { FarmOverview, FarmBadge, FarmIcon } from '../../components/farm-details/FarmProfileSections'
import { useTableFetch } from '../../hooks/useTableFetch'
import ScrollableTabs from '../../components/ScrollableTabs'
import { useState } from 'react'
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
import { serviceTypeBadgeStyle, serviceTypeLabel, requestStatusBadgeStyle } from '../../utils/serviceBadgeStyle'
import { VET_TYPES } from '../../constants/serviceTypes'
import { SectionLoader } from '../../components/Loading'
import '../../components/poultry-houses.css'

const PAGE_SIZE_OPTIONS = [10, 25, 50]

// Vet's Service Requests are always Farm Biosecurity/Blood Test (enforced server-side
// in Vet\FarmController::serviceRequests()).
const SERVICE_REQUEST_TYPES = VET_TYPES

// An empty string on either side means "don't restrict that end of the range".


// Monitoring is its own tab. The readings are supporting evidence for an
// assessment, not part of the owner's record — stacking a status table and a
// chart under the contact details made one long page where two short ones
// read better, and nothing above the fold said what the farm was like today.
const TABS = [
  { key: 'info', label: 'Farm Information' },
  { key: 'servicerequests', label: 'Service Requests' },
]

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
  const [requestPage, setRequestPage] = useState(1)
  const [requestPageSize, setRequestPageSize] = useState(10)
  const [viewRecord, setViewRecord] = useState(null)

  const [requestTypeFilter, setRequestTypeFilter] = useState('')
  const [requestFromDate, setRequestFromDate] = useState('')
  const [requestToDate, setRequestToDate] = useState('')
  const [draftRequestType, setDraftRequestType] = useState('')
  const [draftRequestFrom, setDraftRequestFrom] = useState('')
  const [draftRequestTo, setDraftRequestTo] = useState('')

  const { data: farmResponse, loading, error } = useCachedFetch(`/vet/farms/${farmId}`, {}, { pollMs: BACKGROUND_POLL_MS })
  const { data: houseInventory, loading: housesLoading, error: housesError } = useCachedFetch(
    activeTab === 'info' ? `/farms/${farmId}/poultry-houses` : null
  )
  const { data: requestData, loading: requestLoading } = useTableFetch(
    activeTab === 'servicerequests' ? `/vet/farms/${farmId}/service-requests` : null,
    { service_type: requestTypeFilter, from: requestFromDate, to: requestToDate }, requestPage, requestPageSize, setRequestPage
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

  const filteredRequests = requestData?.requests || []

  const farm = String(farmResponse?.id) === String(farmId) ? farmResponse : null
  if (loading || (!farm && !error)) {
    return <VetLayout><p style={styles.stateText}>Loading farm profile…</p></VetLayout>
  }
  if (error || !farm) {
    return <VetLayout><p style={{ ...styles.stateText, color: '#b91c1c' }}>{error || 'Farm not found.'}</p></VetLayout>
  }

  return (
    <VetLayout>
      <div className="fd-page">
        <nav className="fd-breadcrumb" aria-label="Breadcrumb">
          <button type="button" onClick={() => navigate('/vet/farms')}>← Back</button>
          <span aria-hidden="true">/</span><strong>{farm.farm_name}</strong>
        </nav>
        <header className="fd-header">
          <div className="fd-heading-row">
            <div className="fd-title">
              <div className="fd-title-line"><h1>{farm.farm_name || 'Farm details'}</h1><FarmBadge value={farm.status} /></div>
              <p><FarmIcon name="pin" size={14} />{farm.address || farm.barangay || 'Address not available'}</p>
            </div>
          </div>
        </header>
      </div>

      <ScrollableTabs style={{ ...styles.tabsRow, marginBottom: 0 }} containerStyle={{ marginBottom: styles.tabsRow.marginBottom }} isMobile={isMobile} label="Farm detail tabs">
        {TABS.map(t => (
          <button
            key={t.key}
            style={{ ...styles.tab, ...(activeTab === t.key ? styles.tabActive : {}) }}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </ScrollableTabs>

      {activeTab === 'info' && (
        <div className="fd-page">
          <FarmOverview farm={farm} registrationDate={formatDate(farm.created_at)} readOnly />
          <VetPoultryHouseSummary inventory={houseInventory} loading={housesLoading} error={housesError} />
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
                      <th className="agb-table-actions-cell" style={{ ...tableStyles.th, textAlign: 'right' }}>Action</th>
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
                          <td className="agb-table-actions-cell" style={{ ...tableStyles.td, textAlign: 'right' }}>
                            <span className="agb-table-action"
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

function VetPoultryHouseSummary({ inventory, loading, error }) {
  const houses = inventory?.houses || []
  const hasInventory = inventory?.available === true

  return (
    <section className="ph-section" aria-label="Poultry Houses">
      <div className="ph-heading"><h2>Poultry Houses</h2></div>
      {loading && <p className="ph-note" role="status">Loading houses…</p>}
      {!loading && error && <p className="ph-error" role="alert">{error}</p>}
      {!loading && !error && !hasInventory && <p className="ph-note">Poultry house records are unavailable.</p>}
      {!loading && !error && hasInventory && inventory.inventory_status !== 'verified' && <p className="ph-note">Not yet verified</p>}
      {!loading && !error && hasInventory && <>
        <p className="ph-count"><strong>{houses.length}</strong> registered {houses.length === 1 ? 'house' : 'houses'}</p>
        {houses.length > 0 ? <div className="ph-scroll"><table>
          <thead><tr><th>House</th><th>Status</th></tr></thead>
          <tbody>{houses.map(house => <tr key={house.id}>
            <td data-label="House">{house.name}</td>
            <td data-label="Status"><span className={`ph-status ph-status--${house.status.toLowerCase()}`}>{house.status}</span></td>
          </tr>)}</tbody>
        </table></div> : <p className="ph-note">No poultry houses are recorded.</p>}
      </>}
    </section>
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

function Pagination({ currentPage, lastPage, pageSize, total, onPageChange, onPageSizeChange, isMobile }) {
  const rangeStart = total === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const rangeEnd = Math.min(currentPage * pageSize, total)

  return (
    <div className="no-print agb-table-footer" style={{ ...paginationStyles.wrap, ...(isMobile ? paginationStyles.wrapMobile : {}) }}>
      <div style={paginationStyles.info}>
        {total === 0 ? 'No results' : `Showing ${rangeStart}–${rangeEnd} of ${total}`}
      </div>
      <div className="agb-table-footer-controls" style={paginationStyles.controls}>
        <select aria-label="Rows per page" value={pageSize} onChange={e => onPageSizeChange(Number(e.target.value))} style={paginationStyles.pageSizeSelect}>
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

  // minWidth 0 is what lets overflowX work: without it a flex item refuses
  // to be narrower than its contents, so the row pushed the whole page
  // sideways instead of scrolling inside itself.
  tabsRow: { display: 'flex', gap: '26px', borderBottom: '1px solid #e7e8e0', marginBottom: '20px', overflowX: 'auto', minWidth: 0, flexWrap: 'nowrap', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', },
  tab: { border: 'none', background: 'none', padding: '12px 0', fontFamily: SANS, fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', color: '#8a968d', borderBottom: '2px solid transparent', marginBottom: '-1px', flexShrink: 0, },
  tabActive: { color: GREEN.primary, borderBottom: '2px solid var(--agb-green)' },

  card: { backgroundColor: '#fff', border: '1px solid #e7e8e0', borderRadius: '14px', padding: '20px 22px', fontFamily: SANS },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  cardTitle: { fontSize: '14px', fontWeight: 800, color: '#16311d' },

  miniPill: { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 11px', borderRadius: '999px', fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap' },
  empty: { fontSize: '13px', color: '#9aa79d' },


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
    backgroundColor: GREEN.primary, color: '#fff', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap',
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
  pageBtnActive: { backgroundColor: GREEN.primary, borderColor: GREEN.primary, color: '#fff' },
  ellipsis: { padding: '0 4px', color: '#9aa79d', fontSize: '13px' },
}
