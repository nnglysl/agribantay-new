import { useState } from 'react'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useIsMobile } from '../../hooks/useIsMobile'

export default function ManageAccounts() {
  const [roleTab, setRoleTab] = useState('all') // all | admin | vet
  const [search, setSearch] = useState('')
  const [showRegisterModal, setShowRegisterModal] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [resetTarget, setResetTarget] = useState(null)
  const [resetResult, setResetResult] = useState(null)
  const [confirmAction, setConfirmAction] = useState(null)
  const isMobile = useIsMobile()

  const params = {}
  if (roleTab !== 'all') params.role = roleTab
  if (search) params.search = search

  const { data, loading, error, refetch } = useCachedFetch('/superadmin/accounts', params)
  const accounts = data || []

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

  const roleBadgeColor = { admin: '#234A35', vet: '#B5651D' }

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

      <div style={{ ...styles.filters, ...(isMobile ? styles.filtersMobile : {}) }}>
        <input
          placeholder="Search name, email, or username..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={styles.searchInput}
        />
        <div style={styles.tabs}>
          <div style={{ ...styles.tab, ...(roleTab === 'all' ? styles.tabActive : {}) }} onClick={() => setRoleTab('all')}>
            All
          </div>
          <div style={{ ...styles.tab, ...(roleTab === 'admin' ? styles.tabActive : {}) }} onClick={() => setRoleTab('admin')}>
            Admins
          </div>
          <div style={{ ...styles.tab, ...(roleTab === 'vet' ? styles.tabActive : {}) }} onClick={() => setRoleTab('vet')}>
            Veterinarians
          </div>
        </div>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: '#dc2626' }}>{error}</p>}

      {!loading && !error && (
        <div style={styles.tableCard}>
          {isMobile && accounts.length > 0 && (
            <p style={styles.scrollHint}>Swipe left/right to see all columns →</p>
          )}
          <div style={isMobile ? styles.tableScroll : undefined}>
            <table style={{ ...styles.table, ...(isMobile ? styles.tableMobile : {}) }}>
              <thead>
                <tr>
                  <th style={styles.th}>Name</th>
                  <th style={styles.th}>Role</th>
                  <th style={styles.th}>Email</th>
                  <th style={styles.th}>Contact</th>
                  <th style={styles.th}>Username</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map(acc => (
                  <tr key={acc.id}>
                    <td style={styles.td}>{acc.first_name} {acc.last_name}</td>
                    <td style={styles.td}>
                      <span style={{ ...styles.roleBadge, backgroundColor: roleBadgeColor[acc.role] || '#6b7280' }}>
                        {acc.role === 'admin' ? 'Admin' : 'Veterinarian'}
                      </span>
                    </td>
                    <td style={styles.td}>{acc.email}</td>
                    <td style={styles.td}>{acc.mobile_number}</td>
                    <td style={styles.td}>{acc.username}</td>
                    <td style={styles.td}>
                      <span style={{ ...styles.statusBadge, backgroundColor: acc.status === 'active' ? '#2E7D32' : '#9ca3af' }}>
                        {acc.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ ...styles.actionBtn, ...styles.editBtn }} onClick={() => setEditTarget(acc)}>Edit</span>
                        <span style={{ ...styles.actionBtn, ...styles.resetBtn }} onClick={() => handleResetPassword(acc)}>Reset Password</span>
                        {acc.status === 'active' ? (
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
          {accounts.length === 0 && <div style={styles.empty}>No accounts found.</div>}
        </div>
      )}

      {showRegisterModal && (
        <RegisterModal
          isMobile={isMobile}
          onClose={() => setShowRegisterModal(false)}
          onSuccess={(tempInfo) => { setShowRegisterModal(false); refetch(); if (tempInfo) setResetResult(tempInfo) }}
        />
      )}

      {editTarget && (
        <EditModal
          account={editTarget}
          isMobile={isMobile}
          onClose={() => setEditTarget(null)}
          onSuccess={() => { setEditTarget(null); refetch() }}
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
                style={{ ...modalStyles.submitBtn, backgroundColor: confirmAction.danger ? '#dc2626' : '#2E7D32' }}
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

function RegisterModal({ onClose, onSuccess, isMobile }) {
  const [form, setForm] = useState({
    role: 'admin',
    full_name: '', email: '', contact_number: '', username: '', password: '', password_confirmation: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/superadmin/accounts', form)
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

          <label style={modalStyles.label}>Email *</label>
          <input type="email" placeholder="Email" value={form.email} onChange={update('email')} style={modalStyles.inputFull} required />

          <label style={modalStyles.label}>Contact Number *</label>
          <input placeholder="Contact Number" value={form.contact_number} onChange={update('contact_number')} style={modalStyles.inputFull} required />

          <label style={modalStyles.label}>Username *</label>
          <input placeholder="Username" value={form.username} onChange={update('username')} style={modalStyles.inputFull} required />

          <div style={{ ...modalStyles.row, ...(isMobile ? modalStyles.rowMobile : {}) }}>
            <div>
              <label style={modalStyles.label}>Password *</label>
              <input type="password" placeholder="Password" value={form.password} onChange={update('password')} style={modalStyles.input} required />
            </div>
            <div>
              <label style={modalStyles.label}>Confirm Password *</label>
              <input type="password" placeholder="Confirm Password" value={form.password_confirmation} onChange={update('password_confirmation')} style={modalStyles.input} required />
            </div>
          </div>

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

function EditModal({ account, onClose, onSuccess, isMobile }) {
  const [form, setForm] = useState({
    full_name: `${account.first_name} ${account.last_name}`.trim(),
    email: account.email || '',
    contact_number: account.mobile_number || '',
    username: account.username || '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.put(`/superadmin/accounts/${account.id}`, form)
      onSuccess()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update account.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={{ ...modalStyles.modal, ...(isMobile ? modalStyles.modalMobile : {}) }} onClick={e => e.stopPropagation()}>
        <div style={modalStyles.header}>
          <h3 style={modalStyles.title}>Edit {account.role === 'admin' ? 'Admin' : 'Veterinarian'} Account</h3>
          <span style={modalStyles.close} onClick={onClose}>×</span>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div style={modalStyles.errorBox}>{error}</div>}

          <label style={modalStyles.label}>Full Name *</label>
          <input placeholder="Full Name" value={form.full_name} onChange={update('full_name')} style={modalStyles.inputFull} required />

          <label style={modalStyles.label}>Email *</label>
          <input type="email" placeholder="Email" value={form.email} onChange={update('email')} style={modalStyles.inputFull} required />

          <label style={modalStyles.label}>Contact Number *</label>
          <input placeholder="Contact Number" value={form.contact_number} onChange={update('contact_number')} style={modalStyles.inputFull} required />

          <label style={modalStyles.label}>Username *</label>
          <input placeholder="Username" value={form.username} onChange={update('username')} style={modalStyles.inputFull} required />

          <div style={{ ...modalStyles.actions, ...(isMobile ? modalStyles.actionsMobile : {}) }}>
            <button type="button" onClick={onClose} style={{ ...modalStyles.cancelBtn, ...(isMobile ? modalStyles.btnFull : {}) }}>
              Cancel
            </button>
            <button type="submit" disabled={loading} style={{ ...modalStyles.submitBtn, ...(isMobile ? modalStyles.btnFull : {}) }}>
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px', marginBottom: '20px' },
  headerMobile: { flexDirection: 'column', gap: '14px' },
  title: { fontSize: '22px', fontWeight: '700', color: '#111827', margin: 0 },
  titleMobile: { fontSize: '18px' },
  subtitle: { fontSize: '13px', color: '#6b7280', marginTop: '4px' },
  newBtn: { backgroundColor: '#2E7D32', color: 'white', border: 'none', borderRadius: '8px', padding: '10px 18px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' },
  btnFull: { width: '100%', boxSizing: 'border-box' },
  filters: { display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '16px', alignItems: 'center' },
  filtersMobile: { flexDirection: 'column', alignItems: 'stretch' },
  searchInput: { flex: 1, minWidth: '220px', padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box' },
  tabs: { display: 'flex', gap: '4px', backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '3px' },
  tab: { padding: '7px 14px', fontSize: '13px', color: '#6b7280', cursor: 'pointer', borderRadius: '6px', fontWeight: '600' },
  tabActive: { backgroundColor: '#234A35', color: '#fff' },
  tableCard: { backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden', padding: 0 },
  scrollHint: { fontSize: '11px', color: '#9ca3af', margin: '12px 16px 0' },
  tableScroll: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  table: { width: '100%', borderCollapse: 'collapse' },
  tableMobile: { minWidth: '900px' },
  th: { textAlign: 'left', padding: '14px 16px', fontSize: '12px', color: '#6b7280', borderBottom: '1px solid #e5e7eb', textTransform: 'uppercase', whiteSpace: 'nowrap' },
  td: { padding: '14px 16px', fontSize: '13px', color: '#374151', borderBottom: '1px solid #f3f4f6' },
  roleBadge: { padding: '3px 10px', borderRadius: '999px', color: 'white', fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap' },
  statusBadge: { padding: '3px 10px', borderRadius: '999px', color: 'white', fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap' },
  actionBtn: { padding: '5px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', border: '1px solid transparent', whiteSpace: 'nowrap' },
  editBtn: { color: '#2E7D32', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' },
  resetBtn: { color: '#B45309', backgroundColor: '#fffbeb', border: '1px solid #fcd34d' },
  deactivateBtn: { color: '#dc2626', backgroundColor: '#fef2f2', border: '1px solid #fecaca' },
  activateBtn: { color: '#2E7D32', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' },
  empty: { padding: '32px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' },
  tempPasswordBox: {
    fontFamily: 'monospace', fontSize: '18px', fontWeight: '700', color: '#122A1E',
    backgroundColor: '#F7F2E7', border: '1px solid #E8E2D3', borderRadius: '8px',
    padding: '14px', textAlign: 'center', letterSpacing: '1px', marginBottom: '4px',
  },
}

const modalStyles = {
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  modal: { backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '440px', maxWidth: '90%', maxHeight: '90vh', overflowY: 'auto' },
  modalMobile: { width: '100%', maxWidth: '100%', borderRadius: '16px 16px 0 0', padding: '20px', margin: '0', position: 'fixed', bottom: 0, left: 0, maxHeight: '85vh' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  title: { fontSize: '17px', fontWeight: '700', color: '#111827', margin: 0 },
  close: { fontSize: '22px', cursor: 'pointer', color: '#6b7280' },
  errorBox: { backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '14px' },
  label: { display: 'block', fontSize: '12.5px', fontWeight: '600', color: '#374151', marginBottom: '5px', marginTop: '10px' },
  input: { padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box', width: '100%' },
  inputFull: { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box' },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' },
  rowMobile: { gridTemplateColumns: '1fr' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' },
  actionsMobile: { flexDirection: 'column-reverse' },
  btnFull: { width: '100%', boxSizing: 'border-box' },
  cancelBtn: { padding: '10px 18px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: 'white', fontSize: '14px', cursor: 'pointer' },
  submitBtn: { padding: '10px 18px', borderRadius: '8px', border: 'none', backgroundColor: '#2E7D32', color: 'white', fontSize: '14px', fontWeight: '600', cursor: 'pointer' },
}

const confirmStyles = {
  modal: { backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '400px', maxWidth: '90%' },
  title: { fontSize: '17px', fontWeight: '700', color: '#111827', marginTop: 0, marginBottom: '10px' },
  message: { fontSize: '14px', color: '#6b7280', lineHeight: '1.5', marginBottom: '14px' },
}