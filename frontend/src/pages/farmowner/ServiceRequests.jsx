import { useState, useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import api from '../../api/axios'
import FarmerLayout from '../../components/FarmerLayout'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useIsMobile } from '../../hooks/useIsMobile'

const PAGE_SIZE_OPTIONS = [10, 25, 50]

// Tinted status pill styling, consistent with Reports/Admin badges.
function statusBadge(status) {
  switch (status) {
    case 'Pending':   return { backgroundColor: '#fdf3e6', color: '#b45309' }
    case 'Scheduled': return { backgroundColor: '#e9eef6', color: '#2f5fa0' }
    case 'Completed': return { backgroundColor: '#eaf3ec', color: '#256b3d' }
    case 'Cancelled': return { backgroundColor: '#eef0ea', color: '#6b7770' }
    default:          return { backgroundColor: '#eef0ea', color: '#6b7770' }
  }
}

// Shared date formatting so Request Date / Scheduled Date render identically
// across the table and the mobile card fallback.
function formatDate(value, fallback = '—') {
  if (!value) return fallback
  return new Date(value).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

export default function ServiceRequests() {
  const [tab, setTab] = useState('active')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [showModal, setShowModal] = useState(false)
  const [prefillType, setPrefillType] = useState('')
  const isMobile = useIsMobile()
  const location = useLocation()

  // Arriving here from the dashboard's Critical-ammonia prompt pre-selects
  // Odor Control Request and opens the modal immediately, instead of
  // making the farmer navigate + pick it manually.
  useEffect(() => {
    if (location.state?.prefillService) {
      setPrefillType(location.state.prefillService)
      setShowModal(true)
    }
  }, [location.state])

  // Reset to page 1 whenever the tab or page size changes so the farmer
  // isn't stuck on a page number that doesn't exist for the new list.
  useEffect(() => { setCurrentPage(1) }, [tab, pageSize])

  const { data, loading, error, refetch } = useCachedFetch('/farmer/service-requests')
  const requestData = data || { active: [], past: [] }

  const list = tab === 'active' ? requestData.active : requestData.past

  const totalItems = list.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [totalPages, currentPage])

  const pagedList = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return list.slice(start, start + pageSize)
  }, [list, currentPage, pageSize])

  const rangeStart = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const rangeEnd = Math.min(currentPage * pageSize, totalItems)

  return (
    <FarmerLayout>
      <div style={{ ...styles.header, ...(isMobile ? styles.headerMobile : {}) }}>
        <div>
          <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>Service Requests</h1>
        </div>
        <button
          style={{ ...styles.newBtn, ...(isMobile ? styles.newBtnMobile : {}) }}
          onClick={() => setShowModal(true)}
        >
          + Request a Service
        </button>
      </div>

      <div style={styles.tabs}>
        <div
          style={{ ...styles.tab, ...(tab === 'active' ? styles.tabActive : {}) }}
          onClick={() => setTab('active')}
        >
          My Requests
        </div>
        <div
          style={{ ...styles.tab, ...(tab === 'past' ? styles.tabActive : {}) }}
          onClick={() => setTab('past')}
        >
          Past Records
        </div>
      </div>

      {loading && <p style={styles.stateText}>Loading...</p>}
      {error && <p style={{ ...styles.stateText, color: '#b91c1c' }}>{error}</p>}

      {!loading && !error && (
        <div style={styles.listCard}>
          {list.length === 0 ? (
            <div style={styles.empty}>No {tab === 'active' ? 'active requests' : 'past records'} yet.</div>
          ) : isMobile ? (
            // Mobile stays a card list — table columns collapse into labeled
            // rows inside each card so nothing gets cramped on small screens.
            <div style={styles.list}>
              {pagedList.map(r => {
                const sb = statusBadge(r.status)
                return (
                  <div key={r.id} style={styles.cardMobile}>
                    <div style={styles.cardMobileTop}>
                      <div style={{ minWidth: 0 }}>
                        <div style={styles.cardTitle}>{r.service_type}</div>
                        {r.assigned_to && <div style={styles.cardMeta}>{r.assigned_to}</div>}
                      </div>
                      <div style={{ ...styles.badge, ...sb, ...styles.badgeMobile }}>
                        <span style={{ ...styles.badgeDot, backgroundColor: sb.color }} />
                        {r.status}
                      </div>
                    </div>

                    <div style={styles.cardMobileGrid}>
                      <div>
                        <div style={styles.cardMobileLabel}>Request Date</div>
                        <div style={styles.cardMobileValue}>{formatDate(r.created_at)}</div>
                      </div>
                      <div>
                        <div style={styles.cardMobileLabel}>Scheduled Date</div>
                        <div style={styles.cardMobileValue}>{formatDate(r.scheduled_at, 'Awaiting review')}</div>
                      </div>
                    </div>

                    {r.notes && <div style={styles.cardNotes}>{r.notes}</div>}
                  </div>
                )
              })}
            </div>
          ) : (
            // Desktop: proper table, matching the Vet/Admin table conversions.
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Request Type</th>
                    <th style={styles.th}>Request Date</th>
                    <th style={styles.th}>Scheduled Date</th>
                    <th style={styles.th}>Notes</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedList.map(r => {
                    const sb = statusBadge(r.status)
                    return (
                      <tr key={r.id} style={styles.tr}>
                        <td style={styles.td}>
                          <div style={styles.cardTitle}>{r.service_type}</div>
                        </td>
                        <td style={styles.td}>{formatDate(r.created_at)}</td>
                        <td style={styles.td}>{formatDate(r.scheduled_at, 'Awaiting review')}</td>
                        <td style={{ ...styles.td, ...styles.tdNotes }} title={r.notes || ''}>
                          {r.notes || '—'}
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>
                          <div style={{ ...styles.badge, ...sb }}>
                            <span style={{ ...styles.badgeDot, backgroundColor: sb.color }} />
                            {r.status}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {list.length > 0 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              totalItems={totalItems}
              isMobile={isMobile}
            />
          )}
        </div>
      )}

      {showModal && (
        <RequestModal
          isMobile={isMobile}
          initialServiceType={prefillType}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); refetch() }}
        />
      )}
    </FarmerLayout>
  )
}

function Pagination({
  currentPage, totalPages, pageSize, onPageChange, onPageSizeChange,
  rangeStart, rangeEnd, totalItems, isMobile,
}) {
  const pageNumbers = useMemo(() => {
    const maxButtons = isMobile ? 3 : 5
    let start = Math.max(1, currentPage - Math.floor(maxButtons / 2))
    let end = start + maxButtons - 1
    if (end > totalPages) {
      end = totalPages
      start = Math.max(1, end - maxButtons + 1)
    }
    const pages = []
    for (let p = start; p <= end; p++) pages.push(p)
    return pages
  }, [currentPage, totalPages, isMobile])

  return (
    <div style={{ ...paginationStyles.wrap, ...(isMobile ? paginationStyles.wrapMobile : {}) }}>
      <div style={paginationStyles.info}>
        {totalItems === 0
          ? 'No results'
          : `Showing ${rangeStart}–${rangeEnd} of ${totalItems}`}
      </div>

      <div style={{ ...paginationStyles.controls, ...(isMobile ? paginationStyles.controlsMobile : {}) }}>
        <select
          value={pageSize}
          onChange={e => onPageSizeChange(Number(e.target.value))}
          style={paginationStyles.pageSizeSelect}
        >
          {PAGE_SIZE_OPTIONS.map(size => (
            <option key={size} value={size}>{size} / page</option>
          ))}
        </select>

        <button
          style={{ ...paginationStyles.navBtn, ...(currentPage === 1 ? paginationStyles.navBtnDisabled : {}) }}
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          aria-label="First page"
        >
          «
        </button>
        <button
          style={{ ...paginationStyles.navBtn, ...(currentPage === 1 ? paginationStyles.navBtnDisabled : {}) }}
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          aria-label="Previous page"
        >
          ‹
        </button>

        {pageNumbers[0] > 1 && <span style={paginationStyles.ellipsis}>…</span>}

        {pageNumbers.map(p => (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            style={{
              ...paginationStyles.pageBtn,
              ...(p === currentPage ? paginationStyles.pageBtnActive : {}),
            }}
          >
            {p}
          </button>
        ))}

        {pageNumbers[pageNumbers.length - 1] < totalPages && <span style={paginationStyles.ellipsis}>…</span>}

        <button
          style={{ ...paginationStyles.navBtn, ...(currentPage === totalPages ? paginationStyles.navBtnDisabled : {}) }}
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          aria-label="Next page"
        >
          ›
        </button>
        <button
          style={{ ...paginationStyles.navBtn, ...(currentPage === totalPages ? paginationStyles.navBtnDisabled : {}) }}
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          aria-label="Last page"
        >
          »
        </button>
      </div>
    </div>
  )
}

function RequestModal({ onClose, onSuccess, isMobile, initialServiceType }) {
  const [serviceType, setServiceType] = useState(initialServiceType || '')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!serviceType) {
      setError('Please select a service type.')
      return
    }

    setLoading(true)
    try {
      await api.post('/farmer/service-requests', { service_type: serviceType, notes })
      onSuccess()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit request.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={{ ...modalStyles.modal, ...(isMobile ? modalStyles.modalMobile : {}) }} onClick={e => e.stopPropagation()}>
        <div style={modalStyles.header}>
          <h3 style={modalStyles.title}>Request a Service</h3>
          <span style={modalStyles.close} onClick={onClose}>×</span>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div style={modalStyles.errorBox}>{error}</div>}

          <label style={modalStyles.label}>Service Type *</label>
          <select
            value={serviceType}
            onChange={e => setServiceType(e.target.value)}
            style={modalStyles.input}
          >
            <option value="">-- Select service type --</option>
            <option value="Vaccine Request">Vaccine Request</option>
            <option value="Blood Test Request">Blood Test Request</option>
            <option value="Odor Control Request">Odor Control Request</option>
            <option value="Fly Control Request">Fly Control Request</option>
          </select>

          <label style={modalStyles.label}>Notes (optional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            style={{ ...modalStyles.input, minHeight: '80px', resize: 'vertical' }}
            placeholder="Add context or specific concerns"
          />

          <p style={modalStyles.hint}>
            Vaccine and blood test requests will be forwarded to the Municipal Veterinarian. Odor control and fly control requests will be reviewed by the Administrator.
          </p>

          <div style={{ ...modalStyles.actions, ...(isMobile ? modalStyles.actionsMobile : {}) }}>
            <button
              type="button"
              onClick={onClose}
              style={{ ...modalStyles.cancelBtn, ...(isMobile ? modalStyles.btnFull : {}) }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{ ...modalStyles.submitBtn, ...(isMobile ? modalStyles.btnFull : {}), ...(loading ? modalStyles.btnDisabled : {}) }}
            >
              {loading ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const SANS = "'Public Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

const styles = {
  stateText: { fontFamily: SANS, fontSize: '14px', color: '#4b5a50' },

  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', gap: '16px' },
  headerMobile: { flexDirection: 'column', gap: '14px' },
  title: { fontSize: '24px', fontWeight: 800, letterSpacing: '-0.015em', color: '#16311d', margin: 0, fontFamily: SANS },
  titleMobile: { fontSize: '21px' },
  subtitle: { fontSize: '13.5px', color: '#6b7770', marginTop: '5px' },
  newBtn: {
    backgroundColor: '#2c8047', color: 'white', border: 'none', borderRadius: '10px',
    padding: '0 18px', height: '40px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', fontFamily: SANS,
  },
  newBtnMobile: { width: '100%', boxSizing: 'border-box' },

  tabs: { display: 'flex', gap: '4px', marginBottom: '18px', borderBottom: '1px solid #e7e8e0' },
  tab: { padding: '10px 16px', fontSize: '14px', fontWeight: 600, color: '#6b7770', cursor: 'pointer', borderBottom: '2px solid transparent' },
  tabActive: { color: '#2c8047', fontWeight: 700, borderBottom: '2px solid #2c8047' },

  empty: { padding: '40px', textAlign: 'center', color: '#9aa79d', fontSize: '14px' },
  listCard: { backgroundColor: 'white', borderRadius: '14px', border: '1px solid #e7e8e0', overflow: 'hidden' },
  list: { display: 'flex', flexDirection: 'column' },

  // --- Desktop table ---
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontFamily: SANS },
  th: {
    textAlign: 'left', fontSize: '12px', fontWeight: 700, color: '#6b7770',
    textTransform: 'uppercase', letterSpacing: '0.03em',
    padding: '12px 20px', borderBottom: '1px solid #e7e8e0', backgroundColor: '#fafaf7', whiteSpace: 'nowrap',
  },
  tr: { borderBottom: '1px solid #f2f3ed' },
  td: {
    padding: '14px 20px', fontSize: '13.5px', color: '#33413a', verticalAlign: 'middle', whiteSpace: 'nowrap',
  },
  tdNotes: {
    maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#4b5a50',
  },

  // --- Mobile cards ---
  cardMobile: { padding: '14px 16px', borderBottom: '1px solid #f2f3ed' },
  cardMobileTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' },
  cardMobileGrid: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px',
    marginTop: '12px', padding: '10px 12px', backgroundColor: '#fafaf7', borderRadius: '9px',
  },
  cardMobileLabel: { fontSize: '10.5px', fontWeight: 700, color: '#9aa79d', textTransform: 'uppercase', letterSpacing: '0.03em' },
  cardMobileValue: { fontSize: '13px', fontWeight: 600, color: '#33413a', marginTop: '3px' },

  cardTitle: { fontSize: '15px', fontWeight: 700, color: '#16311d' },
  cardMeta: { fontSize: '13px', color: '#6b7770', marginTop: '4px' },
  cardNotes: { fontSize: '13px', color: '#4b5a50', marginTop: '10px', lineHeight: '1.5' },
  badge: {
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    padding: '4px 11px', borderRadius: '999px', fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap',
  },
  badgeDot: { width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0 },
  badgeMobile: { flexShrink: 0 },
}

const paginationStyles = {
  wrap: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 16px', borderTop: '1px solid #f2f3ed', flexWrap: 'wrap', gap: '10px',
  },
  wrapMobile: { flexDirection: 'column', alignItems: 'stretch' },
  info: { fontSize: '12.5px', color: '#9aa79d', whiteSpace: 'nowrap' },
  controls: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
  controlsMobile: { justifyContent: 'space-between' },
  pageSizeSelect: {
    padding: '7px 10px', borderRadius: '9px', border: '1px solid #dcdfd6',
    fontSize: '12.5px', color: '#33413a', marginRight: '8px', fontFamily: SANS, backgroundColor: '#fff', cursor: 'pointer',
  },
  navBtn: {
    minWidth: '32px', height: '32px', padding: '0 6px', borderRadius: '9px',
    border: '1px solid #dcdfd6', backgroundColor: 'white', color: '#33413a',
    fontSize: '13px', cursor: 'pointer', fontFamily: SANS,
  },
  navBtnDisabled: { opacity: 0.4, cursor: 'not-allowed' },
  pageBtn: {
    minWidth: '32px', height: '32px', padding: '0 6px', borderRadius: '9px',
    border: '1px solid #dcdfd6', backgroundColor: 'white', color: '#33413a',
    fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', fontFamily: SANS,
  },
  pageBtnActive: {
    backgroundColor: '#2c8047', borderColor: '#2c8047', color: 'white',
  },
  ellipsis: { padding: '0 4px', color: '#9aa79d', fontSize: '13px' },
}

const modalStyles = {
  overlay: {
    position: 'fixed', inset: 0, backgroundColor: 'rgba(15,38,22,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
  },
  modal: { backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '420px', maxWidth: '90%', fontFamily: SANS },
  modalMobile: { width: '100%', maxWidth: '100%', borderRadius: '16px 16px 0 0', padding: '20px', margin: '0', position: 'fixed', bottom: 0, left: 0, maxHeight: '85vh', overflowY: 'auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
  title: { fontSize: '18px', fontWeight: 800, color: '#16311d', margin: 0 },
  close: { fontSize: '22px', cursor: 'pointer', color: '#9aa79d' },
  errorBox: {
    backgroundColor: '#fdf2f2', border: '1px solid #f3c9c9', color: '#b91c1c',
    padding: '10px 14px', borderRadius: '9px', fontSize: '13px', marginBottom: '16px',
  },
  label: { display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#33413a', marginBottom: '6px', marginTop: '14px' },
  input: {
    width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #dcdfd6',
    fontSize: '14px', boxSizing: 'border-box', fontFamily: SANS, color: '#16311d',
  },
  hint: { fontSize: '12px', color: '#9aa79d', marginTop: '14px', lineHeight: '1.5' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' },
  actionsMobile: { flexDirection: 'column-reverse' },
  btnFull: { width: '100%', boxSizing: 'border-box' },
  cancelBtn: {
    padding: '11px 18px', borderRadius: '10px', border: '1px solid #d9dcd4',
    backgroundColor: 'white', fontSize: '14px', fontWeight: 600, color: '#33413a', cursor: 'pointer', fontFamily: SANS,
  },
  submitBtn: {
    padding: '11px 18px', borderRadius: '10px', border: 'none',
    backgroundColor: '#2c8047', color: 'white', fontSize: '14px', fontWeight: 700, cursor: 'pointer', fontFamily: SANS,
  },
  btnDisabled: { opacity: 0.6, cursor: 'not-allowed' },
}