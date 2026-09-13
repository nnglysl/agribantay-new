import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import VetLayout from '../../components/VetLayout'
import ServiceRequestDetailsModal from '../../components/ServiceRequestDetailsModal'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useIsMobile } from '../../hooks/useIsMobile'

const PAGE_SIZE_OPTIONS = [10, 25, 50]

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
// Vet's Service Requests are always Vaccine/Blood Test (enforced server-side
// in Vet\FarmController::serviceRequests()).
const SERVICE_REQUEST_TYPES = ['Vaccine Request', 'Blood Test Request']

function serviceRequestTypeLabel(type) {
  return type ? type.replace(' Request', '') : type
}

// '' for either side means "don't restrict by that".
function matchesMonthYear(dateValue, month, year) {
  if (!month && !year) return true
  if (!dateValue) return false
  const d = new Date(dateValue)
  if (isNaN(d.getTime())) return false
  if (month !== '' && d.getMonth() !== Number(month)) return false
  if (year !== '' && d.getFullYear() !== Number(year)) return false
  return true
}

const TABS = [
  { key: 'info', label: 'Farm Information' },
  { key: 'servicerequests', label: 'Service Requests' },
]

function getInitials(name) {
  if (!name) return ''
  return name.split(' ').filter(Boolean).slice(0, 2).map(n => n[0].toUpperCase()).join('')
}

function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
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
  const [requestMonthFilter, setRequestMonthFilter] = useState('')
  const [requestYearFilter, setRequestYearFilter] = useState('')
  const [draftRequestType, setDraftRequestType] = useState('')
  const [draftRequestMonth, setDraftRequestMonth] = useState('')
  const [draftRequestYear, setDraftRequestYear] = useState('')

  const { data: farm, loading, error } = useCachedFetch(`/vet/farms/${farmId}`)
  const { data: requestData, loading: requestLoading } = useCachedFetch(
    activeTab === 'servicerequests' ? `/vet/farms/${farmId}/service-requests` : null,
    { page: requestPage, per_page: requestPageSize }
  )

  const handlePageSizeChange = (size) => { setRequestPageSize(size); setRequestPage(1) }

  const applyRequestFilter = () => {
    setRequestTypeFilter(draftRequestType)
    setRequestMonthFilter(draftRequestMonth)
    setRequestYearFilter(draftRequestYear)
  }
  const resetRequestFilter = () => {
    setDraftRequestType('')
    setDraftRequestMonth('')
    setDraftRequestYear('')
    setRequestTypeFilter('')
    setRequestMonthFilter('')
    setRequestYearFilter('')
  }

  const requestYears = useMemo(() => {
    const list = requestData?.requests || []
    const years = new Set([new Date().getFullYear()])
    list.forEach(r => {
      if (r.created_at) years.add(new Date(r.created_at).getFullYear())
    })
    return [...years].sort((a, b) => b - a)
  }, [requestData])

  const filteredRequests = useMemo(() => {
    let list = requestData?.requests || []
    if (requestTypeFilter) list = list.filter(r => r.request_type === requestTypeFilter)
    list = list.filter(r => matchesMonthYear(r.created_at, requestMonthFilter, requestYearFilter))
    return list
  }, [requestData, requestTypeFilter, requestMonthFilter, requestYearFilter])

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
            <ReadOnlyField label="Full Name" value={farm.owner_name} />
            <ReadOnlyField label="Mobile Number" value={farm.mobile_number} />
          </div>
          <div style={acctStyles.row}>
            <ReadOnlyField label="Email Address" value={farm.email} />
            <ReadOnlyField label="Account Status" value={farm.status} />
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

      {activeTab === 'servicerequests' && (
        <Card title="Service Requests">
          {requestLoading && <div style={styles.empty}>Loading…</div>}
          {!requestLoading && (requestData?.requests?.length ?? 0) === 0 && (
            <div style={styles.empty}>No service requests recorded for this farm yet.</div>
          )}
          {!requestLoading && requestData?.requests?.length > 0 && (
            <>
              <div style={filterStyles.filterBar}>
                <div style={filterStyles.filterField}>
                  <label style={filterStyles.filterLabel}>Month</label>
                  <select value={draftRequestMonth} onChange={e => setDraftRequestMonth(e.target.value)} style={filterStyles.filterSelect}>
                    <option value="">All Months</option>
                    {MONTH_NAMES.map((m, i) => <option key={m} value={i}>{m}</option>)}
                  </select>
                </div>

                <div style={filterStyles.filterField}>
                  <label style={filterStyles.filterLabel}>Year</label>
                  <select value={draftRequestYear} onChange={e => setDraftRequestYear(e.target.value)} style={filterStyles.filterSelect}>
                    <option value="">All Years</option>
                    {requestYears.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
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
                      <option key={t} value={t}>{serviceRequestTypeLabel(t)}</option>
                    ))}
                  </select>
                </div>

                <div style={filterStyles.filterActions}>
                  <button type="button" onClick={resetRequestFilter} style={filterStyles.filterResetBtn}>Reset</button>
                  <button type="button" onClick={applyRequestFilter} style={filterStyles.filterApplyBtn}>Apply</button>
                </div>
              </div>

              <div style={tableStyles.wrap}>
                <table style={tableStyles.table}>
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
                      const done = r.status === 'Completed'
                      return (
                        <tr key={r.id}>
                          <td style={tableStyles.td}>{r.request_type}</td>
                          <td style={tableStyles.td}>{r.request_date}</td>
                          <td style={tableStyles.td}>
                            <span style={{
                              ...styles.miniPill,
                              color: done ? '#256b3d' : '#b45309',
                              backgroundColor: done ? '#eaf3ec' : '#fbf1e2',
                            }}>{r.status}</span>
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
              </div>
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
    <div style={{ ...paginationStyles.wrap, ...(isMobile ? paginationStyles.wrapMobile : {}) }}>
      <div style={paginationStyles.info}>
        {total === 0 ? 'No results' : `Showing ${rangeStart}–${rangeEnd} of ${total}`}
      </div>
      <div style={paginationStyles.controls}>
        <select value={pageSize} onChange={e => onPageSizeChange(Number(e.target.value))} style={paginationStyles.pageSizeSelect}>
          {PAGE_SIZE_OPTIONS.map(size => <option key={size} value={size}>{size} / page</option>)}
        </select>
        <button
          style={{ ...paginationStyles.navBtn, ...(currentPage === 1 ? paginationStyles.navBtnDisabled : {}) }}
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
        >‹</button>
        <span style={paginationStyles.pageInfo}>Page {currentPage} of {lastPage}</span>
        <button
          style={{ ...paginationStyles.navBtn, ...(currentPage === lastPage ? paginationStyles.navBtnDisabled : {}) }}
          onClick={() => onPageChange(Math.min(lastPage, currentPage + 1))}
          disabled={currentPage === lastPage}
        >›</button>
      </div>
    </div>
  )
}

const SANS = "'Public Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

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

  tabsRow: { display: 'flex', gap: '26px', borderBottom: '1px solid #e7e8e0', marginBottom: '20px', overflowX: 'auto' },
  tab: { border: 'none', background: 'none', padding: '12px 0', fontFamily: SANS, fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', color: '#8a968d', borderBottom: '2px solid transparent', marginBottom: '-1px' },
  tabActive: { color: '#2c8047', borderBottom: '2px solid #2c8047' },

  card: { backgroundColor: '#fff', border: '1px solid #e7e8e0', borderRadius: '14px', padding: '20px 22px', fontFamily: SANS },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  cardTitle: { fontSize: '14px', fontWeight: 800, color: '#16311d' },

  sectionDivider: { borderTop: '1px solid #eceee7', marginTop: '4px', marginBottom: '18px', paddingTop: '14px' },
  sectionDividerLabel: { fontSize: '11px', fontWeight: 700, color: '#8a968d', textTransform: 'uppercase', letterSpacing: '0.05em' },

  miniPill: { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 11px', borderRadius: '999px', fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap' },
  empty: { fontSize: '13px', color: '#9aa79d' },
}

const acctStyles = {
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
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
  th: { textAlign: 'left', padding: '10px 14px', fontSize: '10.5px', fontWeight: 700, color: '#8a968d', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #eceee7', backgroundColor: '#fafbf8', whiteSpace: 'nowrap' },
  td: { padding: '11px 14px', fontSize: '12.5px', color: '#4b5a50', borderBottom: '1px solid #f2f3ed', verticalAlign: 'top' },
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
  filterField: { display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '160px' },
  filterLabel: { fontSize: '11.5px', fontWeight: 700, color: '#4b5a50', textTransform: 'uppercase', letterSpacing: '0.03em' },
  filterSelect: {
    padding: '9px 12px', borderRadius: '10px', border: '1px solid #dcdfd6',
    fontSize: '13px', color: '#33413a', backgroundColor: '#fff', cursor: 'pointer',
    fontFamily: SANS, boxSizing: 'border-box', minWidth: '160px',
  },
  filterActions: { display: 'flex', gap: '10px', marginLeft: 'auto' },
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
  wrapMobile: { flexDirection: 'column', alignItems: 'stretch' },
  info: { fontSize: '12.5px', color: '#8a968d', whiteSpace: 'nowrap', fontFamily: SANS },
  controls: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
  pageSizeSelect: { padding: '6px 10px', borderRadius: '8px', border: '1px solid #dcdfd6', fontSize: '12.5px', color: '#4b5a50', fontFamily: SANS, backgroundColor: '#fff', cursor: 'pointer' },
  navBtn: { minWidth: '30px', height: '30px', padding: '0 6px', borderRadius: '8px', border: '1px solid #dcdfd6', backgroundColor: '#fff', color: '#4b5a50', fontSize: '13px', cursor: 'pointer', fontFamily: SANS },
  navBtnDisabled: { opacity: 0.4, cursor: 'not-allowed' },
  pageInfo: { fontSize: '12.5px', color: '#8a968d' },
}
