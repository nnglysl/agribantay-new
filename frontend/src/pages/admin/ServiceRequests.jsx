import { useState, useMemo, useEffect } from 'react'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useIsMobile } from '../../hooks/useIsMobile'

const PAGE_SIZE_OPTIONS = [10, 25, 50]

export default function ServiceRequests() {
  const [tab, setTab] = useState('pending')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [acceptTarget, setAcceptTarget] = useState(null)
  const [confirmDecline, setConfirmDecline] = useState(null)
  const [confirmComplete, setConfirmComplete] = useState(null)
  const isMobile = useIsMobile()

  const { data, loading, error, refetch } = useCachedFetch('/admin/service-requests')
  const allRequests = data || []

  const filtered = allRequests.filter(r => {
    if (tab === 'pending') return r.status === 'Pending'
    if (tab === 'scheduled') return r.status === 'Scheduled'
    return r.status === 'Completed' || r.status === 'Cancelled'
  })

  useEffect(() => { setCurrentPage(1) }, [tab, pageSize])

  const totalItems = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [totalPages, currentPage])

  const list = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, currentPage, pageSize])

  const rangeStart = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const rangeEnd = Math.min(currentPage * pageSize, totalItems)

  const statusColor = {
    Pending: '#f59e0b',
    Scheduled: '#3b82f6',
    Completed: '#2E7D32',
    Cancelled: '#6b7280',
  }

  const handleDeclineAction = async () => {
    await api.patch(`/admin/service-requests/${confirmDecline.id}/decline`)
    setConfirmDecline(null)
    refetch()
  }

  const handleCompleteAction = async () => {
    await api.patch(`/admin/service-requests/${confirmComplete.id}/complete`)
    setConfirmComplete(null)
    refetch()
  }

  return (
    <AdminLayout>
      <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>Service Requests</h1>
      <p style={styles.subtitle}>Odor control, fly control, and other farmer-submitted service requests</p>

      <div style={styles.tabs}>
        <div style={{ ...styles.tab, ...(tab === 'pending' ? styles.tabActive : {}) }} onClick={() => setTab('pending')}>
          Pending
        </div>
        <div style={{ ...styles.tab, ...(tab === 'scheduled' ? styles.tabActive : {}) }} onClick={() => setTab('scheduled')}>
          Scheduled
        </div>
        <div style={{ ...styles.tab, ...(tab === 'history' ? styles.tabActive : {}) }} onClick={() => setTab('history')}>
          History
        </div>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: '#dc2626' }}>{error}</p>}

      {!loading && !error && (
        <div style={styles.tableCard}>
          {isMobile && list.length > 0 && (
            <p style={styles.scrollHint}>Swipe left/right to see all columns →</p>
          )}

          <div style={isMobile ? styles.tableScroll : undefined}>
            <table style={{ ...styles.table, ...(isMobile ? styles.tableMobile : {}) }}>
              <thead>
                <tr>
                  <th style={styles.th}>Request</th>
                  <th style={styles.th}>Farm</th>
                  <th style={styles.th}>Requested By</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.map(r => (
                  <tr key={r.id}>
                        <td style={styles.td}>
                            <div style={styles.serviceType}>{r.service_type}</div>
                            {r.request_number && <div style={styles.reqNumber}>#{r.request_number}</div>}
                            {r.notes && <div style={styles.notes}>{r.notes}</div>}
                        </td>
                        <td style={styles.td}>{r.farm_name}</td>
                        <td style={styles.td}>{r.requested_by}</td>
                        <td style={styles.td}>
                            <span style={{ ...styles.badge, backgroundColor: statusColor[r.status] || '#6b7280' }}>
                            {r.status}
                            </span>
                        </td>
                        <td style={styles.td}>
                      <div style={styles.actionGroup}>
                        {r.status === 'Pending' && (
                          <>
                            <span
                              style={{ ...styles.actionBtn, ...styles.acceptBtn }}
                              onClick={() => setAcceptTarget(r)}
                            >
                              Accept
                            </span>
                            <span
                              style={{ ...styles.actionBtn, ...styles.declineBtn }}
                              onClick={() => setConfirmDecline(r)}
                            >
                              Decline
                            </span>
                          </>
                        )}
                        {r.status === 'Scheduled' && (
                          <span
                            style={{ ...styles.actionBtn, ...styles.completeBtn }}
                            onClick={() => setConfirmComplete(r)}
                          >
                            Mark Completed
                          </span>
                        )}
                        {(r.status === 'Completed' || r.status === 'Cancelled') && (
                          <span style={styles.noAction}>—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {list.length === 0 && <div style={styles.empty}>No requests here yet.</div>}

          {totalItems > 0 && (
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

      {acceptTarget && (
        <AcceptModal
          request={acceptTarget}
          isMobile={isMobile}
          onClose={() => setAcceptTarget(null)}
          onSuccess={() => { setAcceptTarget(null); refetch() }}
        />
      )}

      {confirmDecline && (
        <div style={modalStyles.overlay} onClick={() => setConfirmDecline(null)}>
          <div style={{ ...confirmStyles.modal, ...(isMobile ? modalStyles.modalMobile : {}) }} onClick={e => e.stopPropagation()}>
            <h3 style={confirmStyles.title}>Decline Request</h3>
            <p style={confirmStyles.message}>
              Decline the {confirmDecline.service_type} request from {confirmDecline.farm_name}?
            </p>
            <div style={modalStyles.actions}>
              <button onClick={() => setConfirmDecline(null)} style={modalStyles.cancelBtn}>Keep it</button>
              <button onClick={handleDeclineAction} style={{ ...modalStyles.submitBtn, backgroundColor: '#dc2626' }}>
                Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmComplete && (
        <div style={modalStyles.overlay} onClick={() => setConfirmComplete(null)}>
          <div style={{ ...confirmStyles.modal, ...(isMobile ? modalStyles.modalMobile : {}) }} onClick={e => e.stopPropagation()}>
            <h3 style={confirmStyles.title}>Complete Request</h3>
            <p style={confirmStyles.message}>
              Mark the {confirmComplete.service_type} at {confirmComplete.farm_name} as completed?
            </p>
            <div style={modalStyles.actions}>
              <button onClick={() => setConfirmComplete(null)} style={modalStyles.cancelBtn}>Cancel</button>
              <button onClick={handleCompleteAction} style={{ ...modalStyles.submitBtn, backgroundColor: '#2E7D32' }}>
                Mark Completed
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
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

function AcceptModal({ request, onClose, onSuccess, isMobile }) {
  const [date, setDate] = useState('')
  const [time, setTime] = useState('09:00')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!date) {
      setError('Please select a date.')
      return
    }

    setLoading(true)
    try {
      await api.patch(`/admin/service-requests/${request.id}/accept`, {
        scheduled_at: `${date} ${time}:00`,
        notes,
      })
      onSuccess()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to accept request.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={{ ...modalStyles.modal, ...(isMobile ? modalStyles.modalMobile : {}) }} onClick={e => e.stopPropagation()}>
        <div style={modalStyles.header}>
          <h3 style={modalStyles.title}>Accept & Schedule</h3>
          <span style={modalStyles.close} onClick={onClose}>×</span>
        </div>
        <p style={modalStyles.dateLabel}>
          {request.service_type} · {request.farm_name} · Requested by {request.requested_by}
        </p>

        <form onSubmit={handleSubmit}>
          {error && <div style={modalStyles.errorBox}>{error}</div>}

          <div style={{ ...modalStyles.row, ...(isMobile ? modalStyles.rowMobile : {}) }}>
            <div>
              <label style={modalStyles.label}>Date *</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={modalStyles.input} />
            </div>
            <div>
              <label style={modalStyles.label}>Time *</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} style={modalStyles.input} />
            </div>
          </div>

          <label style={modalStyles.label}>Notes (optional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            style={{ ...modalStyles.input, minHeight: '70px', resize: 'vertical' }}
            placeholder="Assigned personnel, equipment needed, or special instructions"
          />

          <div style={{ ...modalStyles.actions, ...(isMobile ? modalStyles.actionsMobile : {}) }}>
            <button type="button" onClick={onClose} style={{ ...modalStyles.cancelBtn, ...(isMobile ? modalStyles.btnFull : {}) }}>
              Cancel
            </button>
            <button type="submit" disabled={loading} style={{ ...modalStyles.submitBtn, ...(isMobile ? modalStyles.btnFull : {}) }}>
              {loading ? 'Scheduling...' : 'Confirm Schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const styles = {
  title: { fontSize: '22px', fontWeight: '700', color: '#111827', margin: 0 },
  titleMobile: { fontSize: '18px' },
  subtitle: { fontSize: '13px', color: '#6b7280', marginTop: '4px', marginBottom: '20px' },
  tabs: { display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid #e5e7eb' },
  tab: { padding: '10px 16px', fontSize: '14px', color: '#6b7280', cursor: 'pointer', borderBottom: '2px solid transparent' },
  tabActive: { color: '#2E7D32', fontWeight: '600', borderBottom: '2px solid #2E7D32' },

  tableCard: { backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden' },
  scrollHint: { fontSize: '11px', color: '#9ca3af', margin: '12px 16px 0' },
  tableScroll: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  table: { width: '100%', borderCollapse: 'collapse' },
    tableMobile: { minWidth: '640px' },
  th: {
    textAlign: 'left', padding: '14px 16px', fontSize: '12px', color: '#6b7280',
    borderBottom: '1px solid #e5e7eb', textTransform: 'uppercase', whiteSpace: 'nowrap',
  },
  td: { padding: '14px 16px', fontSize: '13px', color: '#374151', borderBottom: '1px solid #f3f4f6', verticalAlign: 'top' },
  serviceType: { fontSize: '13.5px', fontWeight: '600', color: '#111827' },
  reqNumber: { fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace', marginTop: '2px' },
  notes: { fontSize: '12px', color: '#6b7280', marginTop: '4px', maxWidth: '260px' },
  badge: {
    padding: '3px 10px', borderRadius: '999px', color: 'white',
    fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap',
  },
  actionGroup: { display: 'flex', gap: '8px', whiteSpace: 'nowrap' },
  actionBtn: {
    padding: '5px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '600',
    cursor: 'pointer', border: '1px solid transparent', whiteSpace: 'nowrap',
  },
  acceptBtn: { color: '#2E7D32', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' },
  declineBtn: { color: '#dc2626', backgroundColor: '#fef2f2', border: '1px solid #fecaca' },
  completeBtn: { color: '#2E7D32', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' },
  noAction: { color: '#d1d5db' },
  empty: { padding: '32px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' },
}

const paginationStyles = {
  wrap: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 16px', borderTop: '1px solid #f3f4f6', flexWrap: 'wrap', gap: '10px',
  },
  wrapMobile: { flexDirection: 'column', alignItems: 'stretch' },
  info: { fontSize: '12.5px', color: '#6b7280', whiteSpace: 'nowrap' },
  controls: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
  controlsMobile: { justifyContent: 'space-between' },
  pageSizeSelect: {
    padding: '6px 10px', borderRadius: '6px', border: '1px solid #d1d5db',
    fontSize: '12.5px', color: '#374151', marginRight: '8px',
  },
  navBtn: {
    minWidth: '30px', height: '30px', padding: '0 6px', borderRadius: '6px',
    border: '1px solid #d1d5db', backgroundColor: 'white', color: '#374151',
    fontSize: '13px', cursor: 'pointer',
  },
  navBtnDisabled: { opacity: 0.4, cursor: 'not-allowed' },
  pageBtn: {
    minWidth: '30px', height: '30px', padding: '0 6px', borderRadius: '6px',
    border: '1px solid #d1d5db', backgroundColor: 'white', color: '#374151',
    fontSize: '12.5px', fontWeight: '600', cursor: 'pointer',
  },
  pageBtnActive: { backgroundColor: '#2E7D32', borderColor: '#2E7D32', color: 'white' },
  ellipsis: { padding: '0 4px', color: '#9ca3af', fontSize: '13px' },
}

const modalStyles = {
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  modal: { backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '440px', maxWidth: '90%', maxHeight: '90vh', overflowY: 'auto' },
  modalMobile: { width: '100%', maxWidth: '100%', borderRadius: '16px 16px 0 0', padding: '20px', margin: '0', position: 'fixed', bottom: 0, left: 0, maxHeight: '85vh' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' },
  title: { fontSize: '17px', fontWeight: '700', color: '#111827', margin: 0 },
  close: { fontSize: '22px', cursor: 'pointer', color: '#6b7280' },
  dateLabel: { fontSize: '13px', color: '#6b7280', marginBottom: '16px' },
  label: { display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px', marginTop: '12px' },
  input: { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box', fontFamily: 'inherit' },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  rowMobile: { gridTemplateColumns: '1fr' },
  errorBox: { backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '14px' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' },
  actionsMobile: { flexDirection: 'column-reverse' },
  btnFull: { width: '100%', boxSizing: 'border-box' },
  cancelBtn: { padding: '10px 18px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: 'white', fontSize: '14px', cursor: 'pointer' },
  submitBtn: { padding: '10px 18px', borderRadius: '8px', border: 'none', backgroundColor: '#2E7D32', color: 'white', fontSize: '14px', fontWeight: '600', cursor: 'pointer' },
}

const confirmStyles = {
  modal: { backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '400px', maxWidth: '90%' },
  title: { fontSize: '17px', fontWeight: '700', color: '#111827', marginTop: 0, marginBottom: '10px' },
  message: { fontSize: '14px', color: '#6b7280', lineHeight: '1.5', marginBottom: '4px' },
}