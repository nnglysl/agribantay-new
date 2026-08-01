import { useState, useMemo } from 'react'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useIsMobile } from '../../hooks/useIsMobile'

const PAGE_SIZE_OPTIONS = [10, 25, 50]

function emptyTabState() {
  return { roleTab: 'all', search: '', currentPage: 1, pageSize: 10 }
}

export default function ManageAccounts() {
  const [statusTab, setStatusTab] = useState('active')
  const [tabState, setTabState] = useState({
    active: emptyTabState(),
    deactivated: emptyTabState(),
  })

  const [showRegisterModal, setShowRegisterModal] = useState(false)
  const [viewTarget, setViewTarget] = useState(null)
  const [resetTarget, setResetTarget] = useState(null)
  const [resetResult, setResetResult] = useState(null)
  const [confirmAction, setConfirmAction] = useState(null)
  const isMobile = useIsMobile()

  const current = tabState[statusTab]

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

  const handleResetPassword = (acc) => {
    setConfirmAction({
      title: 'Reset Password',
      message: `Generate a new temporary password for ${acc.first_name} ${acc.last_name}? Their current password will stop working immediately.`,
      confirmLabel: 'Reset Password',
      danger: false,
      onConfirm: async () => {
        const res = await api.post(`/superadmin/accounts/${acc.id}/reset-password`)
        setConfirmAction(null)
        setResetResult({ name: `${acc.first_name} ${acc.last_name}`, password: res.data.temp_password })
        refetch()
      },
    })
  }

  const roleBadgeColor = { admin: '#234A35', vet: '#8a5a1f' }

  return (
    <AdminLayout>
      <div style={{ ...styles.header, ...(isMobile ? styles.headerMobile : {}) }}>
        <div>
          <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>Manage Accounts</h1>
          <p style={styles.subtitle}>Admin and Veterinarian accounts — Super Admin only</p>
        </div>
        <button
          style={{ ...styles.newBtn, ...(isMobile ? styles.btnFull : {}) }}
          onClick={() => setShowRegisterModal(true)}
        >
          + Register Account
        </button>
      </div>

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

      <div style={{ ...styles.filters, ...(isMobile ? styles.filtersMobile : {}) }}>
        <input
          placeholder="Search name, email, or contact..."
          value={current.search}
          onChange={e => updateCurrent({ search: e.target.value, currentPage: 1 })}
          style={styles.searchInput}
        />
        <div style={styles.roleTabs}>
          <div
            style={{ ...styles.roleTab, ...(current.roleTab === 'all' ? styles.roleTabActive : {}) }}
            onClick={() => updateCurrent({ roleTab: 'all', currentPage: 1 })}
          >
            All
          </div>
          <div
            style={{ ...styles.roleTab, ...(current.roleTab === 'admin' ? styles.roleTabActive : {}) }}
            onClick={() => updateCurrent({ roleTab: 'admin', currentPage: 1 })}
          >
            Admins
          </div>
          <div
            style={{ ...styles.roleTab, ...(current.roleTab === 'vet' ? styles.roleTabActive : {}) }}
            onClick={() => updateCurrent({ roleTab: 'vet', currentPage: 1 })}
          >
            Veterinarians
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
                      <span style={{ ...styles.roleBadge, backgroundColor: roleBadgeColor[acc.role] || '#6b7280' }}>
                        {acc.role === 'admin' ? 'Admin' : 'Veterinarian'}
                      </span>
                    </td>
                    <td style={styles.td}>{acc.email || '—'}</td>
                    <td style={styles.td}>{acc.mobile_number || '—'}</td>
                    <td style={styles.td}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <span style={{ ...styles.actionBtn, ...styles.viewBtn }} onClick={() => setViewTarget(acc)}>View</span>
                        <span style={{ ...styles.actionBtn, ...styles.resetBtn }} onClick={() => handleResetPassword(acc)}>Reset Password</span>
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

      {viewTarget && (
        <ViewEditModal
          account={viewTarget}
          isMobile={isMobile}
          onClose={() => setViewTarget(null)}
          onSaved={(updated) => { setViewTarget(updated); refetch() }}
          roleBadgeColor={roleBadgeColor}
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

      {resetResult && (
        <div style={modalStyles.overlay} onClick={() => setResetResult(null)}>
          <div style={{ ...confirmStyles.modal, ...(isMobile ? modalStyles.modalMobile : {}) }} onClick={e => e.stopPropagation()}>
            <h3 style={confirmStyles.title}>Temporary Password</h3>
            <p style={confirmStyles.message}>
              For <strong>{resetResult.name}</strong> — shown once, relay this to them directly:
            </p>
            <div style={styles.tempPasswordBox}>{resetResult.password}</div>
            <div style={modalStyles.actions}>
              <button onClick={() => setResetResult(null)} style={modalStyles.submitBtn}>Done</button>
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
            Provide at least one — email or mobile number. A temporary password will be generated automatically and sent via whichever was provided (email if both are filled). The account holder must change it on their first login.
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

function IconUserSmall() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
}

function ViewEditModal({ account, onClose, onSaved, isMobile, roleBadgeColor }) {
  const [isEditing, setIsEditing] = useState(false)
  const [fullName, setFullName] = useState(`${account.first_name} ${account.last_name}`.trim())
  const [email, setEmail] = useState(account.email || '')
  const [contactNumber, setContactNumber] = useState(account.mobile_number || '')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  const isActive = account.status === 'active'
  const initials = ((account.first_name?.[0] || '') + (account.last_name?.[0] || '')).toUpperCase()
  const roleLabel = account.role === 'admin' ? 'Admin' : 'Veterinarian'

  const handleCancelEdit = () => {
    setFullName(`${account.first_name} ${account.last_name}`.trim())
    setEmail(account.email || '')
    setContactNumber(account.mobile_number || '')
    setIsEditing(false)
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!isEditing) return // hard guard — this should only ever run from the Save Changes button
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      const res = await api.put(`/superadmin/accounts/${account.id}`, {
        full_name: fullName,
        email,
        contact_number: contactNumber,
      })
      setSuccess('Account updated successfully.')
      setIsEditing(false)
      onSaved(res.data.data ? { ...account, ...res.data.data, mobile_number: contactNumber, email } : { ...account, email, mobile_number: contactNumber })
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update account.')
    } finally {
      setLoading(false)
    }
  }

  const fieldStyle = (editing) => ({
    ...profileStyles.fieldBox,
    ...(editing ? profileStyles.fieldBoxEditable : {}),
  })

  return (
    <div style={profileStyles.overlay} onClick={onClose}>
      <div style={{ ...profileStyles.modal, ...(isMobile ? profileStyles.modalMobile : {}) }} onClick={e => e.stopPropagation()}>
        <div style={profileStyles.accentBar} />

        <div style={{ ...profileStyles.header, ...(isMobile ? profileStyles.headerMobile : {}) }}>
          <div style={profileStyles.avatarWrap}>
            {account.profile_photo_url ? (
              <img src={account.profile_photo_url} alt={fullName} style={profileStyles.avatarImg} />
            ) : (
              <span style={profileStyles.avatarInitials}>{initials || '—'}</span>
            )}
          </div>
          <div style={profileStyles.headerText}>
            <div style={profileStyles.ownerNameLarge}>{account.first_name} {account.last_name}</div>
            <div style={profileStyles.roleRow}>
              <span style={{ ...styles.roleBadge, backgroundColor: roleBadgeColor[account.role] || '#6b7280' }}>
                {roleLabel}
              </span>
            </div>
          </div>
          <span style={{
            ...profileStyles.statusPill,
            color: isActive ? '#2c8047' : '#6b7280',
            backgroundColor: isActive ? '#eaf3ec' : '#f0f1ec',
          }}>
            <span style={{ ...profileStyles.pillDot, backgroundColor: isActive ? '#2c8047' : '#6b7280' }} />
            {isActive ? 'Active' : 'Deactivated'}
          </span>
          <button style={profileStyles.closeBtn} onClick={onClose} aria-label="Close">×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={profileStyles.body}>
            <div style={profileStyles.section}>
              <div style={profileStyles.sectionHeader}>
                <div style={profileStyles.sectionTitleRow}>
                  <span style={profileStyles.sectionIcon}><IconUserSmall /></span>
                  <span style={profileStyles.sectionTitle}>Account Information</span>
                </div>
                {isEditing && <span style={profileStyles.editingTag}>Editing</span>}
              </div>

              {error && <div style={profileStyles.errorBox}>{error}</div>}
              {success && <div style={profileStyles.successBox}>{success}</div>}

              <div style={profileStyles.fieldGrid}>
                <div style={profileStyles.fieldGroup}>
                  <label style={profileStyles.fieldLabel}>Full Name</label>
                  <input
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    disabled={!isEditing}
                    style={fieldStyle(isEditing)}
                  />
                </div>
                <div style={profileStyles.fieldGroup}>
                  <label style={profileStyles.fieldLabel}>Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    disabled={!isEditing}
                    style={fieldStyle(isEditing)}
                  />
                </div>
                <div style={profileStyles.fieldGroup}>
                  <label style={profileStyles.fieldLabel}>Mobile Number</label>
                  <input
                    value={contactNumber}
                    onChange={e => setContactNumber(e.target.value)}
                    disabled={!isEditing}
                    style={fieldStyle(isEditing)}
                  />
                </div>
                <div style={profileStyles.fieldGroup}>
                  <label style={profileStyles.fieldLabel}>Status</label>
                  <div style={{
                    ...profileStyles.fieldBox,
                    color: isActive ? '#2c8047' : '#6b7280',
                    fontWeight: 700,
                  }}>
                    {isActive ? 'Active' : 'Deactivated'}
                  </div>
                </div>
              </div>

              <p style={profileStyles.note}>
                Profile photo is set by the account holder in their own Settings and cannot be changed here.
              </p>
            </div>
          </div>

          <div style={profileStyles.footer}>
            {isEditing ? (
              <>
                <button type="button" onClick={handleCancelEdit} style={profileStyles.footerCancelBtn} disabled={loading}>
                  Cancel
                </button>
                <button type="submit" disabled={loading} style={profileStyles.footerPrimaryBtn}>
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={onClose} style={profileStyles.footerCancelBtn}>Close</button>
                <button type="button" onClick={() => { setIsEditing(true); setSuccess('') }} style={profileStyles.footerPrimaryBtn}>
                  Edit
                </button>
              </>
            )}
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

  statusTabs: { display: 'flex', gap: '4px', marginBottom: '18px', borderBottom: '1px solid #e7e8e0' },
  statusTab: {
    padding: '10px 18px', fontSize: '14px', fontWeight: 700, color: '#6b7770',
    cursor: 'pointer', borderBottom: '2px solid transparent', fontFamily: SANS,
  },
  statusTabActive: { color: '#2c8047', borderBottom: '2px solid #2c8047' },

  filters: { display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '18px', alignItems: 'center' },
  filtersMobile: { flexDirection: 'column', alignItems: 'stretch' },
  searchInput: {
    flex: 1, minWidth: '220px', padding: '11px 14px', borderRadius: '10px', border: '1px solid #dcdfd6',
    fontSize: '14px', boxSizing: 'border-box', fontFamily: SANS, color: '#16311d',
  },
  roleTabs: { display: 'flex', gap: '3px', backgroundColor: '#f3f4ef', borderRadius: '10px', padding: '3px' },
  roleTab: { padding: '8px 14px', fontSize: '12.5px', color: '#6b7770', cursor: 'pointer', borderRadius: '8px', fontWeight: 700, fontFamily: SANS },
  roleTabActive: { backgroundColor: '#2c8047', color: '#fff' },

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
  resetBtn: { color: '#b45309' },
  deactivateBtn: { color: '#b91c1c' },
  activateBtn: { color: '#2c8047' },

  empty: { padding: '32px', textAlign: 'center', color: '#9aa79d', fontSize: '14px', fontFamily: SANS },
  tempPasswordBox: {
    fontFamily: 'monospace', fontSize: '18px', fontWeight: '700', color: '#16311d',
    backgroundColor: '#f7f2e7', border: '1px solid #e8e2d3', borderRadius: '8px',
    padding: '14px', textAlign: 'center', letterSpacing: '1px', marginBottom: '4px',
  },
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

// View/Edit account modal — matches the Farms ViewFarmModal design language
const profileStyles = {
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(15,38,22,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px', boxSizing: 'border-box', fontFamily: SANS },
  modal: { backgroundColor: '#fff', borderRadius: '16px', width: '560px', maxWidth: '94vw', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 70px rgba(15,38,22,0.28)', border: '1px solid #e7e8e0', position: 'relative', fontFamily: SANS },
  modalMobile: { width: '100%', maxWidth: '100%', borderRadius: '16px 16px 0 0', position: 'fixed', bottom: 0, left: 0, maxHeight: '92vh' },

  accentBar: { height: '6px', backgroundColor: '#1f5a34' },

  header: { display: 'flex', alignItems: 'center', gap: '16px', padding: '20px 24px', borderBottom: '1px solid #f0efe8' },
  headerMobile: { padding: '18px 18px', gap: '12px' },
  avatarWrap: { width: '60px', height: '60px', borderRadius: '50%', flexShrink: 0, overflow: 'hidden', backgroundColor: '#eaf3ec', border: '1px solid #d6e5da', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  avatarInitials: { fontSize: '20px', fontWeight: 700, color: '#2c8047', letterSpacing: '0.02em' },
  headerText: { flex: 1, minWidth: 0 },
  ownerNameLarge: { color: '#16311d', fontSize: '19px', fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  roleRow: { marginTop: '7px' },
  statusPill: { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 13px', borderRadius: '999px', fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 },
  pillDot: { width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0 },
  closeBtn: { width: '30px', height: '30px', borderRadius: '8px', border: '1px solid #eceee7', backgroundColor: '#fff', color: '#8a968d', fontSize: '17px', lineHeight: 1, cursor: 'pointer', flexShrink: 0 },

  body: { padding: '4px 24px 8px' },

  section: { padding: '18px 0 4px' },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  sectionTitleRow: { display: 'flex', alignItems: 'center', gap: '10px' },
  sectionIcon: { width: '26px', height: '26px', borderRadius: '8px', backgroundColor: '#2c8047', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sectionTitle: { fontSize: '14px', fontWeight: 800, color: '#16311d' },
  editingTag: { padding: '3px 10px', borderRadius: '999px', fontSize: '10.5px', fontWeight: 700, color: '#2c8047', backgroundColor: '#eaf3ec' },

  errorBox: { backgroundColor: '#fbeaea', border: '1px solid #f0c9c9', color: '#b91c1c', padding: '10px 14px', borderRadius: '10px', fontSize: '13px', marginBottom: '14px' },
  successBox: { backgroundColor: '#eaf3ec', border: '1px solid #cfe0d3', color: '#1f5a34', padding: '10px 14px', borderRadius: '10px', fontSize: '13px', marginBottom: '14px' },

  fieldGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px 20px' },
  fieldGroup: { display: 'flex', flexDirection: 'column' },
  fieldLabel: { fontSize: '10.5px', color: '#9aa79d', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' },
  fieldBox: {
    padding: '11px 14px', borderRadius: '10px', border: '1px solid #e7e8e0', backgroundColor: '#fafbf8',
    fontSize: '14px', color: '#16311d', fontWeight: 600, fontFamily: SANS, width: '100%', boxSizing: 'border-box',
  },
  fieldBoxEditable: { backgroundColor: '#fff', borderColor: '#2c8047', cursor: 'text' },

  note: { fontSize: '11.5px', color: '#9aa79d', marginTop: '18px', marginBottom: '4px', lineHeight: '1.5', fontStyle: 'italic' },

  footer: { padding: '14px 24px', display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid #f0efe8' },
  footerCancelBtn: { padding: '9px 22px', borderRadius: '10px', border: '1px solid #dcdfd6', backgroundColor: '#fff', color: '#33413a', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: SANS },
  footerPrimaryBtn: { padding: '9px 22px', borderRadius: '10px', border: 'none', backgroundColor: '#2c8047', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: SANS },
}
