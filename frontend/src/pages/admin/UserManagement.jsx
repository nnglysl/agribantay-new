import { useState } from 'react'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useIsMobile } from '../../hooks/useIsMobile'

export default function UserManagement() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showRegisterModal, setShowRegisterModal] = useState(false)
  const [editVet, setEditVet] = useState(null)
  const [confirmAction, setConfirmAction] = useState(null)
  const [resetPasswordResult, setResetPasswordResult] = useState(null)
  const isMobile = useIsMobile()

  const params = {}
  if (search) params.search = search
  if (statusFilter) params.status = statusFilter

  const { data: vets, loading, error, refetch } = useCachedFetch('/admin/veterinarians', params)
  const allVets = vets || []

  const handleSearch = (e) => {
    e.preventDefault()
    refetch()
  }

  const handleDeactivate = (vet) => {
    setConfirmAction({
      title: 'Deactivate Veterinarian',
      message: `Deactivate ${vet.first_name} ${vet.last_name}? They will lose access until reactivated.`,
      confirmLabel: 'Deactivate',
      danger: true,
      onConfirm: async () => {
        await api.patch(`/admin/veterinarians/${vet.id}/deactivate`)
        setConfirmAction(null)
        refetch()
      },
    })
  }

  const handleActivate = (vet) => {
    setConfirmAction({
      title: 'Activate Veterinarian',
      message: `Reactivate ${vet.first_name} ${vet.last_name}? They will regain access.`,
      confirmLabel: 'Activate',
      danger: false,
      onConfirm: async () => {
        await api.patch(`/admin/veterinarians/${vet.id}/activate`)
        setConfirmAction(null)
        refetch()
      },
    })
  }

  const handleResetPassword = (vet) => {
    setConfirmAction({
      title: 'Reset Password',
      message: `Generate a new temporary password for ${vet.first_name} ${vet.last_name}? Their current password will stop working immediately.`,
      confirmLabel: 'Reset Password',
      danger: false,
      onConfirm: async () => {
        const res = await api.post(`/admin/veterinarians/${vet.id}/reset-password`)
        setConfirmAction(null)
        setResetPasswordResult({ vet, tempPassword: res.data.temp_password })
      },
    })
  }

  return (
    <AdminLayout>
      <div style={{ ...styles.header, ...(isMobile ? styles.headerMobile : {}) }}>
        <div>
          <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>Veterinarians</h1>
          <p style={styles.subtitle}>Manage veterinarian accounts and access</p>
        </div>
        <button
          style={{ ...styles.newBtn, ...(isMobile ? styles.btnFull : {}) }}
          onClick={() => setShowRegisterModal(true)}
        >
          + Register Veterinarian
        </button>
      </div>

      <div style={{ ...styles.filters, ...(isMobile ? styles.filtersMobile : {}) }}>
        <form onSubmit={handleSearch} style={{ flex: 1, minWidth: '220px', display: 'flex', gap: '8px' }}>
          <input
            placeholder="Search name, email, or username..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={styles.searchInput}
          />
        </form>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{ ...styles.select, ...(isMobile ? styles.selectMobile : {}) }}
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: '#dc2626' }}>{error}</p>}

      {!loading && !error && (
        <div style={styles.tableCard}>
          {isMobile && allVets.length > 0 && (
            <p style={styles.scrollHint}>Swipe left/right to see all columns →</p>
          )}
          <div style={isMobile ? styles.tableScroll : undefined}>
            <table style={{ ...styles.table, ...(isMobile ? styles.tableMobile : {}) }}>
              <thead>
                <tr>
                  <th style={styles.th}>Name</th>
                  <th style={styles.th}>Email</th>
                  <th style={styles.th}>Contact</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {allVets.map(v => (
                  <tr key={v.id}>
                    <td style={styles.td}>{v.first_name} {v.last_name}</td>
                    <td style={styles.td}>{v.email}</td>
                    <td style={styles.td}>{v.mobile_number}</td>
                    <td style={styles.td}>
                      <span style={{ ...styles.badge, backgroundColor: v.status === 'active' ? '#2E7D32' : '#9ca3af' }}>
                        {v.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ ...styles.actionBtn, ...styles.editBtn }} onClick={() => setEditVet(v)}>
                          Edit
                        </span>
                        <span style={{ ...styles.actionBtn, ...styles.resetBtn }} onClick={() => handleResetPassword(v)}>
                          Reset Password
                        </span>
                        {v.status === 'active' ? (
                          <span style={{ ...styles.actionBtn, ...styles.deactivateBtn }} onClick={() => handleDeactivate(v)}>
                            Deactivate
                          </span>
                        ) : (
                          <span style={{ ...styles.actionBtn, ...styles.activateBtn }} onClick={() => handleActivate(v)}>
                            Activate
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {allVets.length === 0 && <div style={styles.empty}>No veterinarian accounts found.</div>}
        </div>
      )}

      {showRegisterModal && (
        <RegisterModal
          isMobile={isMobile}
          onClose={() => setShowRegisterModal(false)}
          onSuccess={() => { setShowRegisterModal(false); refetch() }}
        />
      )}

      {editVet && (
        <EditModal
          vet={editVet}
          isMobile={isMobile}
          onClose={() => setEditVet(null)}
          onSuccess={() => { setEditVet(null); refetch() }}
        />
      )}

      {confirmAction && (
        <div style={modalStyles.overlay} onClick={() => setConfirmAction(null)}>
          <div style={{ ...confirmStyles.modal, ...(isMobile ? modalStyles.modalMobile : {}) }} onClick={e => e.stopPropagation()}>
            <h3 style={confirmStyles.title}>{confirmAction.title}</h3>
            <p style={confirmStyles.message}>{confirmAction.message}</p>
            <div style={{ ...modalStyles.actions, ...(isMobile ? modalStyles.actionsMobile : {}) }}>
              <button
                onClick={() => setConfirmAction(null)}
                style={{ ...modalStyles.cancelBtn, ...(isMobile ? modalStyles.btnFull : {}) }}
              >
                Cancel
              </button>
              <button
                onClick={confirmAction.onConfirm}
                style={{
                  ...modalStyles.submitBtn,
                  ...(isMobile ? modalStyles.btnFull : {}),
                  backgroundColor: confirmAction.danger ? '#dc2626' : '#2E7D32',
                }}
              >
                {confirmAction.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {resetPasswordResult && (
        <div style={modalStyles.overlay} onClick={() => setResetPasswordResult(null)}>
          <div style={{ ...confirmStyles.modal, ...(isMobile ? modalStyles.modalMobile : {}) }} onClick={e => e.stopPropagation()}>
            <h3 style={confirmStyles.title}>Password Reset</h3>
            <p style={confirmStyles.message}>
              New temporary password for <strong>{resetPasswordResult.vet.first_name} {resetPasswordResult.vet.last_name}</strong>:
            </p>
            <div style={styles.tempPasswordBox}>{resetPasswordResult.tempPassword}</div>
            <p style={styles.tempPasswordHint}>
              Share this with the veterinarian directly — it won't be shown again. They'll be required to set a new password on their next login.
            </p>
            <div style={modalStyles.actions}>
              <button onClick={() => setResetPasswordResult(null)} style={modalStyles.submitBtn}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

function RegisterModal({ onClose, onSuccess, isMobile }) {
  const [form, setForm] = useState({
    full_name: '', email: '', contact_number: '', username: '', password: '', password_confirmation: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (form.password !== form.password_confirmation) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      await api.post('/admin/veterinarians', form)
      onSuccess()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to register veterinarian.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={{ ...modalStyles.modal, ...(isMobile ? modalStyles.modalMobile : {}) }} onClick={e => e.stopPropagation()}>
        <div style={modalStyles.header}>
          <h3 style={modalStyles.title}>Register Veterinarian</h3>
          <span style={modalStyles.close} onClick={onClose}>×</span>
        </div>

        <p style={modalStyles.instruction}>
          All fields marked <span style={modalStyles.requiredMark}>*</span> are required.
        </p>

        <form onSubmit={handleSubmit}>
          {error && <div style={modalStyles.errorBox}>{error}</div>}

          <Label text="Full Name" required />
          <input placeholder="Full Name" value={form.full_name} onChange={update('full_name')} style={modalStyles.inputFull} required />

          <Label text="Email Address" required />
          <input type="email" placeholder="Email Address" value={form.email} onChange={update('email')} style={modalStyles.inputFull} required />

          <Label text="Contact Number" required />
          <input placeholder="Contact Number" value={form.contact_number} onChange={update('contact_number')} style={modalStyles.inputFull} required />

          <Label text="Username" required />
          <input placeholder="Username" value={form.username} onChange={update('username')} style={modalStyles.inputFull} required />

          <div style={{ ...modalStyles.row, ...(isMobile ? modalStyles.rowMobile : {}) }}>
            <div>
              <Label text="Password" required />
              <input type="password" placeholder="Password" value={form.password} onChange={update('password')} style={modalStyles.input} required minLength={8} />
            </div>
            <div>
              <Label text="Confirm Password" required />
              <input type="password" placeholder="Confirm Password" value={form.password_confirmation} onChange={update('password_confirmation')} style={modalStyles.input} required minLength={8} />
            </div>
          </div>

          <p style={modalStyles.hint}>
            This account will automatically be assigned the Veterinarian role and can log in immediately with the username and password set here.
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

function EditModal({ vet, onClose, onSuccess, isMobile }) {
  const [form, setForm] = useState({
    full_name: `${vet.first_name} ${vet.last_name}`.trim(),
    email: vet.email || '',
    contact_number: vet.mobile_number || '',
    username: vet.username || '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.put(`/admin/veterinarians/${vet.id}`, form)
      onSuccess()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update veterinarian.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={{ ...modalStyles.modal, ...(isMobile ? modalStyles.modalMobile : {}) }} onClick={e => e.stopPropagation()}>
        <div style={modalStyles.header}>
          <h3 style={modalStyles.title}>Edit Veterinarian</h3>
          <span style={modalStyles.close} onClick={onClose}>×</span>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div style={modalStyles.errorBox}>{error}</div>}

          <Label text="Full Name" required />
          <input placeholder="Full Name" value={form.full_name} onChange={update('full_name')} style={modalStyles.inputFull} required />

          <Label text="Email Address" required />
          <input type="email" placeholder="Email Address" value={form.email} onChange={update('email')} style={modalStyles.inputFull} required />

          <Label text="Contact Number" required />
          <input placeholder="Contact Number" value={form.contact_number} onChange={update('contact_number')} style={modalStyles.inputFull} required />

          <Label text="Username" required />
          <input placeholder="Username" value={form.username} onChange={update('username')} style={modalStyles.inputFull} required />

          <p style={modalStyles.hint}>
            To change the password, use "Reset Password" from the list instead.
          </p>

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

function Label({ text, required }) {
  return (
    <label style={modalStyles.label}>
      {text} {required && <span style={modalStyles.requiredMark}>*</span>}
    </label>
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
  filters: { display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' },
  filtersMobile: { flexDirection: 'column' },
  searchInput: { flex: 1, padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box', width: '100%' },
  select: { padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' },
  selectMobile: { width: '100%', boxSizing: 'border-box' },
  tableCard: { backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden', padding: 0 },
  scrollHint: { fontSize: '11px', color: '#9ca3af', margin: '12px 16px 0' },
  tableScroll: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  table: { width: '100%', borderCollapse: 'collapse' },
  tableMobile: { minWidth: '760px' },
  th: { textAlign: 'left', padding: '14px 16px', fontSize: '12px', color: '#6b7280', borderBottom: '1px solid #e5e7eb', textTransform: 'uppercase', whiteSpace: 'nowrap' },
  td: { padding: '14px 16px', fontSize: '13px', color: '#374151', borderBottom: '1px solid #f3f4f6' },
  badge: { padding: '3px 10px', borderRadius: '999px', color: 'white', fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap' },
  actionBtn: {
    padding: '5px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '600',
    cursor: 'pointer', border: '1px solid transparent', whiteSpace: 'nowrap',
  },
  editBtn: { color: '#2E7D32', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' },
  resetBtn: { color: '#B45309', backgroundColor: '#fffbeb', border: '1px solid #fcd34d' },
  deactivateBtn: { color: '#dc2626', backgroundColor: '#fef2f2', border: '1px solid #fecaca' },
  activateBtn: { color: '#2E7D32', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' },
  empty: { padding: '32px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' },
  tempPasswordBox: {
    fontFamily: 'monospace', fontSize: '18px', fontWeight: '700', letterSpacing: '1px',
    backgroundColor: '#f3f4f6', border: '1px dashed #9ca3af', borderRadius: '8px',
    padding: '14px', textAlign: 'center', margin: '14px 0', color: '#111827',
  },
  tempPasswordHint: { fontSize: '12px', color: '#6b7280', lineHeight: '1.5', marginBottom: '4px' },
}

const modalStyles = {
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  modal: { backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '480px', maxWidth: '90%', maxHeight: '90vh', overflowY: 'auto' },
  modalMobile: {
    width: '100%', maxWidth: '100%', borderRadius: '16px 16px 0 0',
    padding: '20px', margin: '0', position: 'fixed', bottom: 0, left: 0,
    maxHeight: '85vh',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  title: { fontSize: '17px', fontWeight: '700', color: '#111827', margin: 0 },
  close: { fontSize: '22px', cursor: 'pointer', color: '#6b7280' },
  instruction: { fontSize: '12.5px', color: '#6b7280', marginBottom: '16px', lineHeight: '1.5' },
  requiredMark: { color: '#dc2626', fontWeight: '700' },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' },
  rowMobile: { gridTemplateColumns: '1fr' },
  input: { padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box', width: '100%' },
  inputFull: { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box', marginBottom: '10px' },
  label: { display: 'block', fontSize: '12.5px', fontWeight: '600', color: '#374151', marginBottom: '5px' },
  errorBox: { backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '14px' },
  hint: { fontSize: '12px', color: '#6b7280', marginTop: '14px', lineHeight: '1.5' },
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