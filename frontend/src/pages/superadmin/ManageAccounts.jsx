import { useEffect, useRef, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useIsMobile } from '../../hooks/useIsMobile'
import { roleBadgeStyle } from '../../utils/roleBadgeStyle'

const ROLE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'admin', label: 'Admins' },
  { value: 'vet', label: 'Veterinarians' },
]

function IconFilter() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M4 5h16l-6.5 7.5v6L10.5 21v-8.5z" />
    </svg>
  )
}

const PAGE_SIZE_OPTIONS = [10, 25, 50]

function emptyTabState() {
  return { roleTab: 'all', search: '', currentPage: 1, pageSize: 10 }
}

export default function ManageAccounts() {
  const navigate = useNavigate()
  const [statusTab, setStatusTab] = useState('active')
  const [tabState, setTabState] = useState({
    active: emptyTabState(),
    deactivated: emptyTabState(),
  })

  const [showRegisterModal, setShowRegisterModal] = useState(false)
  const [confirmAction, setConfirmAction] = useState(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [draftRole, setDraftRole] = useState('all')
  const filterRef = useRef(null)
  const isMobile = useIsMobile()

  const current = tabState[statusTab]

  useEffect(() => {
    if (!filterOpen) return
    const onClickOutside = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [filterOpen])

  const openFilter = () => {
    setDraftRole(current.roleTab)
    setFilterOpen(true)
  }

  const applyRoleFilter = () => {
    updateCurrent({ roleTab: draftRole, currentPage: 1 })
    setFilterOpen(false)
  }

  const resetFilter = () => {
    setDraftRole('all')
  }

  const activeFilterCount = current.roleTab !== 'all' ? 1 : 0

  const updateCurrent = (patch) => {
    setTabState(prev => ({ ...prev, [statusTab]: { ...prev[statusTab], ...patch } }))
  }

  const params = { status: statusTab === 'active' ? 'active' : 'inactive' }
  if (current.roleTab !== 'all') params.role = current.roleTab
  if (current.search) params.search = current.search

  const { data, loading, error, refetch } = useCachedFetch('/superadmin/accounts', params)
  const accounts = data || []

  const totalItems = accounts.length
  const totalPages = Math.max(1, Math.ceil(totalItems / current.pageSize))
  const safePage = Math.min(current.currentPage, totalPages)

  const pagedAccounts = useMemo(() => {
    const start = (safePage - 1) * current.pageSize
    return accounts.slice(start, start + current.pageSize)
  }, [accounts, safePage, current.pageSize])

  const rangeStart = totalItems === 0 ? 0 : (safePage - 1) * current.pageSize + 1
  const rangeEnd = Math.min(safePage * current.pageSize, totalItems)

  const handleStatusTabChange = (tab) => setStatusTab(tab)

  const handleDeactivate = (acc) => {
    setConfirmAction({
      title: 'Deactivate Account',
      message: `Deactivate ${acc.first_name} ${acc.last_name}'s ${acc.role} account? They will lose access until reactivated.`,
      confirmLabel: 'Deactivate',
      danger: true,
      onConfirm: async () => {
        await api.patch(`/superadmin/accounts/${acc.id}/deactivate`)
        setConfirmAction(null)
        refetch()
      },
    })
  }

  const handleActivate = (acc) => {
    setConfirmAction({
      title: 'Activate Account',
      message: `Reactivate ${acc.first_name} ${acc.last_name}'s ${acc.role} account?`,
      confirmLabel: 'Activate',
      danger: false,
      onConfirm: async () => {
        await api.patch(`/superadmin/accounts/${acc.id}/activate`)
        setConfirmAction(null)
        refetch()
      },
    })
  }

  return (
    <AdminLayout>
      <div style={{ ...styles.header, ...(isMobile ? styles.headerMobile : {}) }}>
        <div>
          <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>Manage Accounts</h1>
          <p style={styles.subtitle}>Create and manage Admin and Veterinarian accounts</p>
        </div>
        <button
          style={{ ...styles.newBtn, ...(isMobile ? styles.btnFull : {}) }}
          onClick={() => setShowRegisterModal(true)}
        >
          + Register Account
        </button>
      </div>

      <div style={{ ...styles.toolbar, ...(isMobile ? styles.toolbarMobile : {}) }}>
        <div style={styles.statusTabs}>
          <div
            style={{ ...styles.statusTab, ...(statusTab === 'active' ? styles.statusTabActive : {}) }}
            onClick={() => handleStatusTabChange('active')}
          >
            Active Users
          </div>
          <div
            style={{ ...styles.statusTab, ...(statusTab === 'deactivated' ? styles.statusTabActive : {}) }}
            onClick={() => handleStatusTabChange('deactivated')}
          >
            Deactivated Users
          </div>
        </div>

        <div style={{ ...styles.toolbarRight, ...(isMobile ? styles.toolbarRightMobile : {}) }}>
          <div style={styles.searchWrap}>
            <svg style={styles.searchIcon} width="15" height="15" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="#9aa79d" strokeWidth="2" />
              <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="#9aa79d" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              placeholder="Search name, email, or contact..."
              value={current.search}
              onChange={e => updateCurrent({ search: e.target.value, currentPage: 1 })}
              style={styles.searchInput}
            />
            {current.search && (
              <button type="button" onClick={() => updateCurrent({ search: '', currentPage: 1 })} style={styles.clearBtn} aria-label="Clear search">
                ×
              </button>
            )}
          </div>

          <div style={styles.filterAnchor} ref={filterRef}>
            <button
              type="button"
              onClick={() => (filterOpen ? setFilterOpen(false) : openFilter())}
              style={{ ...styles.filterBtn, ...(activeFilterCount > 0 ? styles.filterBtnActive : {}) }}
            >
              <IconFilter />
              Filter
              {activeFilterCount > 0 && <span style={styles.filterCount}>{activeFilterCount}</span>}
            </button>

            {filterOpen && (
              <div style={{ ...styles.filterPanel, ...(isMobile ? styles.filterPanelMobile : {}) }}>
                <div style={styles.filterPanelHeader}>
                  <span style={styles.filterPanelTitle}>Filter</span>
                  <span style={styles.filterPanelClose} onClick={() => setFilterOpen(false)}>×</span>
                </div>

                <label style={styles.filterLabel}>Role</label>
                <select value={draftRole} onChange={e => setDraftRole(e.target.value)} style={styles.filterSelect}>
                  {ROLE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>

                <div style={styles.filterActions}>
                  <button type="button" onClick={resetFilter} style={styles.filterResetBtn}>Reset</button>
                  <button type="button" onClick={applyRoleFilter} style={styles.filterApplyBtn}>Apply</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {loading && <p style={styles.stateText}>Loading...</p>}
      {error && <p style={{ ...styles.stateText, color: '#b91c1c' }}>{error}</p>}

      {!loading && !error && (
        <div style={styles.tableCard}>
          {isMobile && accounts.length > 0 && (
            <p style={styles.scrollHint}>Swipe left/right to see all columns →</p>
          )}
          <div style={isMobile ? styles.tableScroll : undefined}>
            <table style={{ ...styles.table, ...(isMobile ? styles.tableMobile : {}) }}>
              <thead>
                <tr>
                  <th style={styles.th}></th>
                  <th style={styles.th}>Name</th>
                  <th style={styles.th}>Role</th>
                  <th style={styles.th}>Email</th>
                  <th style={styles.th}>Contact</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedAccounts.map(acc => (
                  <tr key={acc.id} style={styles.tr}>
                    <td style={styles.td}>
                      {acc.profile_photo_url ? (
                        <img src={acc.profile_photo_url} alt="" style={styles.tableAvatarImg} />
                      ) : (
                        <div style={styles.tableAvatarFallback}>
                          {(acc.first_name?.[0] || '') + (acc.last_name?.[0] || '')}
                        </div>
                      )}
                    </td>
                    <td style={styles.td}>{acc.first_name} {acc.last_name}</td>
                    <td style={styles.td}>
                      <span style={{ ...styles.roleBadge, ...roleBadgeStyle(acc.role) }}>
                        {acc.role === 'admin' ? 'Admin' : 'Veterinarian'}
                      </span>
                    </td>
                    <td style={styles.td}>{acc.email || '—'}</td>
                    <td style={styles.td}>{acc.mobile_number || '—'}</td>
                    <td style={styles.td}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <span style={{ ...styles.actionBtn, ...styles.viewBtn }} onClick={() => navigate(`/superadmin/accounts/${acc.id}`)}>View</span>
                        {statusTab === 'active' ? (
                          <span style={{ ...styles.actionBtn, ...styles.deactivateBtn }} onClick={() => handleDeactivate(acc)}>Deactivate</span>
                        ) : (
                          <span style={{ ...styles.actionBtn, ...styles.activateBtn }} onClick={() => handleActivate(acc)}>Activate</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {accounts.length === 0 && (
            <div style={styles.empty}>
              No {statusTab === 'active' ? 'active' : 'deactivated'} accounts found.
            </div>
          )}

          {accounts.length > 0 && (
            <Pagination
              currentPage={safePage}
              totalPages={totalPages}
              pageSize={current.pageSize}
              onPageChange={(p) => updateCurrent({ currentPage: p })}
              onPageSizeChange={(s) => updateCurrent({ pageSize: s, currentPage: 1 })}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              totalItems={totalItems}
              isMobile={isMobile}
            />
          )}
        </div>
      )}

      {showRegisterModal && (
        <RegisterModal
          isMobile={isMobile}
          onClose={() => setShowRegisterModal(false)}
          onSuccess={() => { setShowRegisterModal(false); refetch() }}
        />
      )}

      {confirmAction && (
        <div style={modalStyles.overlay} onClick={() => setConfirmAction(null)}>
          <div style={{ ...confirmStyles.modal, ...(isMobile ? modalStyles.modalMobile : {}) }} onClick={e => e.stopPropagation()}>
            <h3 style={confirmStyles.title}>{confirmAction.title}</h3>
            <p style={confirmStyles.message}>{confirmAction.message}</p>
            <div style={modalStyles.actions}>
              <button onClick={() => setConfirmAction(null)} style={modalStyles.cancelBtn}>Cancel</button>
              <button
                onClick={confirmAction.onConfirm}
                style={{ ...modalStyles.submitBtn, backgroundColor: confirmAction.danger ? '#b91c1c' : '#2c8047' }}
              >
                {confirmAction.confirmLabel}
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
        {totalItems === 0 ? 'No results' : `Showing ${rangeStart}–${rangeEnd} of ${totalItems}`}
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
        >«</button>
        <button
          style={{ ...paginationStyles.navBtn, ...(currentPage === 1 ? paginationStyles.navBtnDisabled : {}) }}
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
        >‹</button>

        {pageNumbers[0] > 1 && <span style={paginationStyles.ellipsis}>…</span>}

        {pageNumbers.map(p => (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            style={{ ...paginationStyles.pageBtn, ...(p === currentPage ? paginationStyles.pageBtnActive : {}) }}
          >{p}</button>
        ))}

        {pageNumbers[pageNumbers.length - 1] < totalPages && <span style={paginationStyles.ellipsis}>…</span>}

        <button
          style={{ ...paginationStyles.navBtn, ...(currentPage === totalPages ? paginationStyles.navBtnDisabled : {}) }}
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
        >›</button>
        <button
          style={{ ...paginationStyles.navBtn, ...(currentPage === totalPages ? paginationStyles.navBtnDisabled : {}) }}
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
        >»</button>
      </div>
    </div>
  )
}

function RegisterModal({ onClose, onSuccess, isMobile }) {
  const [form, setForm] = useState({
    role: 'admin',
    full_name: '', email: '', contact_number: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!form.email.trim() && !form.contact_number.trim()) {
      setError('Please provide at least an email address or a mobile number.')
      return
    }

    setLoading(true)
    try {
      const contact = form.email.trim() || form.contact_number.trim()

      await api.post('/superadmin/accounts', {
        role: form.role,
        full_name: form.full_name,
        contact,
      })
      onSuccess()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create account.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={{ ...modalStyles.modal, ...(isMobile ? modalStyles.modalMobile : {}) }} onClick={e => e.stopPropagation()}>
        <div style={modalStyles.header}>
          <h3 style={modalStyles.title}>Register Account</h3>
          <span style={modalStyles.close} onClick={onClose}>×</span>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div style={modalStyles.errorBox}>{error}</div>}

          <label style={modalStyles.label}>Account Type *</label>
          <select value={form.role} onChange={update('role')} style={modalStyles.inputFull} required>
            <option value="admin">Admin</option>
            <option value="vet">Veterinarian</option>
          </select>

          <label style={modalStyles.label}>Full Name *</label>
          <input placeholder="Full Name" value={form.full_name} onChange={update('full_name')} style={modalStyles.inputFull} required />

          <label style={modalStyles.label}>Email</label>
          <input type="email" placeholder="Email address" value={form.email} onChange={update('email')} style={modalStyles.inputFull} />

          <label style={modalStyles.label}>Contact Number</label>
          <input placeholder="Mobile number" value={form.contact_number} onChange={update('contact_number')} style={modalStyles.inputFull} />

          <p style={modalStyles.hint}>
            Enter at least one email or mobile number. If both are provided, the temporary password will be sent to the email address. The user must change it on their first login.
          </p>

          <div style={{ ...modalStyles.actions, ...(isMobile ? modalStyles.actionsMobile : {}) }}>
            <button type="button" onClick={onClose} style={{ ...modalStyles.cancelBtn, ...(isMobile ? modalStyles.btnFull : {}) }}>
              Cancel
            </button>
            <button type="submit" disabled={loading} style={{ ...modalStyles.submitBtn, ...(isMobile ? modalStyles.btnFull : {}) }}>
              {loading ? 'Creating...' : 'Create Account'}
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

  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px', marginBottom: '20px' },
  headerMobile: { flexDirection: 'column', gap: '14px' },
  title: { fontFamily: SANS, fontSize: '24px', fontWeight: 800, letterSpacing: '-0.015em', color: '#16311d', margin: 0 },
  titleMobile: { fontSize: '20px' },
  subtitle: { fontFamily: SANS, fontSize: '13.5px', color: '#6b7770', marginTop: '5px' },
  newBtn: {
    backgroundColor: '#2c8047', color: '#fff', border: 'none', borderRadius: '10px',
    padding: '10px 18px', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', fontFamily: SANS,
  },
  btnFull: { width: '100%', boxSizing: 'border-box' },

  toolbar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: '14px', marginBottom: '18px', borderBottom: '1px solid #e7e8e0', flexWrap: 'wrap',
  },
  toolbarMobile: { flexDirection: 'column', alignItems: 'stretch', gap: '12px' },

  statusTabs: { display: 'flex', gap: '4px', overflowX: 'auto' },
  statusTab: {
    padding: '10px 18px', fontSize: '14px', fontWeight: 700, color: '#6b7770',
    cursor: 'pointer', borderBottom: '2px solid transparent', fontFamily: SANS, whiteSpace: 'nowrap',
  },
  statusTabActive: { color: '#2c8047', borderBottom: '2px solid #2c8047' },

  toolbarRight: { display: 'flex', alignItems: 'center', gap: '10px', paddingBottom: '10px' },
  toolbarRightMobile: { paddingBottom: '2px' },

  searchWrap: { position: 'relative', width: '260px', maxWidth: '100%' },
  searchIcon: { position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' },
  searchInput: {
    width: '100%', padding: '8px 34px 8px 34px', borderRadius: '10px',
    border: '1px solid #dcdfd6', fontSize: '13px', boxSizing: 'border-box',
    backgroundColor: '#fff', color: '#16311d', fontFamily: SANS,
  },
  clearBtn: {
    position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
    width: '18px', height: '18px', borderRadius: '50%', border: 'none',
    backgroundColor: '#eceee7', color: '#6b7770', fontSize: '13px', lineHeight: 1,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: SANS, padding: 0,
  },

  filterAnchor: { position: 'relative', flexShrink: 0 },
  filterBtn: {
    display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 15px',
    borderRadius: '10px', border: '1px solid #dcdfd6', backgroundColor: '#fff',
    color: '#33413a', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap',
  },
  filterBtnActive: { borderColor: '#2c8047', color: '#2c8047' },
  filterCount: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minWidth: '18px', height: '18px', borderRadius: '999px', backgroundColor: '#2c8047',
    color: '#fff', fontSize: '11px', fontWeight: 700, padding: '0 4px',
  },
  filterPanel: {
    position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 40,
    backgroundColor: '#fff', border: '1px solid #e7e8e0', borderRadius: '14px',
    boxShadow: '0 8px 24px rgba(15,38,22,0.12)', padding: '18px', width: '280px',
  },
  filterPanelMobile: { right: 0, width: '260px' },
  filterPanelHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' },
  filterPanelTitle: { fontSize: '15px', fontWeight: 800, color: '#16311d' },
  filterPanelClose: { fontSize: '19px', cursor: 'pointer', color: '#8a968d', lineHeight: 1 },
  filterLabel: { display: 'block', fontSize: '12px', fontWeight: 700, color: '#4b5a50', marginBottom: '7px', marginTop: '14px' },
  filterSelect: {
    width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #dcdfd6',
    fontSize: '13px', color: '#33413a', backgroundColor: '#fff', cursor: 'pointer',
    fontFamily: SANS, boxSizing: 'border-box',
  },
  filterActions: { display: 'flex', gap: '10px', marginTop: '20px' },
  filterResetBtn: {
    flex: 1, padding: '9px 0', borderRadius: '10px', border: '1px solid #dcdfd6',
    backgroundColor: '#fff', color: '#33413a', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer', fontFamily: SANS,
  },
  filterApplyBtn: {
    flex: 1, padding: '9px 0', borderRadius: '10px', border: 'none',
    backgroundColor: '#2c8047', color: '#fff', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', fontFamily: SANS,
  },

  tableCard: { backgroundColor: '#fff', borderRadius: '14px', border: '1px solid #e7e8e0', overflow: 'hidden' },
  scrollHint: { fontSize: '11px', color: '#9aa79d', margin: '12px 20px 0', fontFamily: SANS },
  tableScroll: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  table: { width: '100%', borderCollapse: 'collapse' },
  tableMobile: { minWidth: '800px' },
  th: {
    textAlign: 'left', padding: '13px 20px', fontSize: '11px', fontWeight: 700, color: '#8a968d',
    borderBottom: '1px solid #eceee7', textTransform: 'uppercase', letterSpacing: '0.05em',
    whiteSpace: 'nowrap', backgroundColor: '#fafbf8', fontFamily: SANS,
  },
  tr: {},
  td: { padding: '13px 20px', fontSize: '13px', color: '#4b5a50', borderBottom: '1px solid #f2f3ed', verticalAlign: 'middle', fontFamily: SANS },
  roleBadge: { padding: '4px 11px', borderRadius: '999px', color: '#fff', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap' },

  tableAvatarImg: { width: '34px', height: '34px', borderRadius: '50%', objectFit: 'cover', display: 'block' },
  tableAvatarFallback: {
    width: '34px', height: '34px', borderRadius: '50%', backgroundColor: '#eaf3ec', color: '#2c8047',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase',
  },

  actionBtn: {
    padding: '6px 13px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 600,
    cursor: 'pointer', border: '1px solid #e3e6dd', backgroundColor: '#fff', whiteSpace: 'nowrap', fontFamily: SANS,
  },
  viewBtn: { color: '#4b5a50' },
  deactivateBtn: { color: '#b91c1c' },
  activateBtn: { color: '#2c8047' },

  empty: { padding: '32px', textAlign: 'center', color: '#9aa79d', fontSize: '14px', fontFamily: SANS },
}

const paginationStyles = {
  wrap: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 20px', borderTop: '1px solid #eceee7', flexWrap: 'wrap', gap: '10px',
  },
  wrapMobile: { flexDirection: 'column', alignItems: 'stretch' },
  info: { fontSize: '12.5px', color: '#8a968d', whiteSpace: 'nowrap', fontFamily: SANS },
  controls: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
  controlsMobile: { justifyContent: 'space-between' },
  pageSizeSelect: {
    padding: '6px 10px', borderRadius: '8px', border: '1px solid #dcdfd6',
    fontSize: '12.5px', color: '#4b5a50', marginRight: '6px', fontFamily: SANS, backgroundColor: '#fff', cursor: 'pointer',
  },
  navBtn: {
    minWidth: '30px', height: '30px', padding: '0 6px', borderRadius: '8px',
    border: '1px solid #dcdfd6', backgroundColor: '#fff', color: '#4b5a50',
    fontSize: '13px', cursor: 'pointer', fontFamily: SANS,
  },
  navBtnDisabled: { opacity: 0.4, cursor: 'not-allowed' },
  pageBtn: {
    minWidth: '30px', height: '30px', padding: '0 6px', borderRadius: '8px',
    border: '1px solid #dcdfd6', backgroundColor: '#fff', color: '#4b5a50',
    fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: SANS,
  },
  pageBtnActive: { backgroundColor: '#2c8047', borderColor: '#2c8047', color: '#fff' },
  ellipsis: { padding: '0 4px', color: '#9aa79d', fontSize: '13px' },
}

const modalStyles = {
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(15,38,22,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  modal: { backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '440px', maxWidth: '90%', maxHeight: '90vh', overflowY: 'auto', fontFamily: SANS },
  modalMobile: { width: '100%', maxWidth: '100%', borderRadius: '16px 16px 0 0', padding: '20px', margin: '0', position: 'fixed', bottom: 0, left: 0, maxHeight: '85vh' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  title: { fontSize: '18px', fontWeight: 800, color: '#16311d', margin: 0 },
  close: { fontSize: '22px', cursor: 'pointer', color: '#8a968d' },
  errorBox: { backgroundColor: '#fbeaea', border: '1px solid #f0c9c9', color: '#b91c1c', padding: '10px 14px', borderRadius: '10px', fontSize: '13px', marginBottom: '14px' },
  successBox: { backgroundColor: '#eaf3ec', border: '1px solid #cfe0d3', color: '#1f5a34', padding: '10px 14px', borderRadius: '10px', fontSize: '13px', marginBottom: '14px' },
  label: { display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#33413a', marginBottom: '5px', marginTop: '12px' },
  input: { padding: '10px 12px', borderRadius: '10px', border: '1px solid #dcdfd6', fontSize: '14px', boxSizing: 'border-box', width: '100%' },
  inputFull: { width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #dcdfd6', fontSize: '14px', boxSizing: 'border-box', marginTop: '2px' },
  hint: { fontSize: '12px', color: '#6b7770', marginTop: '14px', lineHeight: '1.5' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '22px' },
  actionsMobile: { flexDirection: 'column-reverse' },
  btnFull: { width: '100%', boxSizing: 'border-box' },
  cancelBtn: { padding: '10px 18px', borderRadius: '10px', border: '1px solid #dcdfd6', backgroundColor: 'white', fontSize: '14px', fontWeight: 600, color: '#33413a', cursor: 'pointer' },
  submitBtn: { padding: '10px 18px', borderRadius: '10px', border: 'none', backgroundColor: '#2c8047', color: 'white', fontSize: '14px', fontWeight: 700, cursor: 'pointer' },
}

const confirmStyles = {
  modal: { backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '400px', maxWidth: '90%', fontFamily: SANS },
  title: { fontSize: '17px', fontWeight: 800, color: '#16311d', marginTop: 0, marginBottom: '10px' },
  message: { fontSize: '14px', color: '#6b7770', lineHeight: '1.5', marginBottom: '14px' },
}
