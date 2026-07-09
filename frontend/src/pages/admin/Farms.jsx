import { useState } from 'react'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'
import { useCachedFetch } from '../../hooks/useCachedFetch'

const BARANGAYS = [
  'Aguila', 'Anus', 'Aya', 'Bagong Pook', 'Balagtasin I', 'Balagtasin II',
  'Banay-banay I', 'Banay-banay II', 'Bigain I', 'Bigain II', 'Bigain South',
  'Calansayan', 'Dagatan', 'Don Luis', 'Galamay-Amo', 'Lalayat',
  'Lapolapo I', 'Lapolapo II', 'Lepote', 'Lumil', 'Mojon-Tampoy',
  'Natunuan', 'Palanca', 'Pinagtung-Ulan', 'Poblacion Barangay I',
  'Poblacion Barangay II', 'Poblacion Barangay III', 'Poblacion Barangay IV',
  'Sabang', 'Salaban', 'Santo Cristo', 'Taysan', 'Tugtug',
]

export default function Farms() {
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [showRegisterModal, setShowRegisterModal] = useState(false)
  const [editFarm, setEditFarm] = useState(null)
  const [confirmAction, setConfirmAction] = useState(null)

  const params = {}
  if (statusFilter) params.status = statusFilter
  if (search) params.search = search

  const { data: farms, loading, error, refetch } = useCachedFetch('/admin/farms', params)
  const allFarms = farms || []

  const handleSearch = (e) => {
    e.preventDefault()
    refetch()
  }

  const handleDeactivate = (farm) => {
    setConfirmAction({
      title: 'Deactivate Farm',
      message: `Are you sure you want to deactivate ${farm.farm_name}? The farm owner will lose access until reactivated.`,
      confirmLabel: 'Deactivate',
      danger: true,
      onConfirm: async () => {
        await api.patch(`/admin/farms/${farm.id}/deactivate`)
        setConfirmAction(null)
        refetch()
      },
    })
  }

  const handleActivate = (farm) => {
    setConfirmAction({
      title: 'Activate Farm',
      message: `Reactivate ${farm.farm_name}? The farm owner will regain access.`,
      confirmLabel: 'Activate',
      danger: false,
      onConfirm: async () => {
        await api.patch(`/admin/farms/${farm.id}/activate`)
        setConfirmAction(null)
        refetch()
      },
    })
  }

  const statusColor = { Normal: '#2E7D32', Warning: '#f59e0b', Critical: '#dc2626', Offline: '#9ca3af' }

  return (
    <AdminLayout>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Farms</h1>
          <p style={styles.subtitle}>All registered farm owners & farms</p>
        </div>
        <button style={styles.newBtn} onClick={() => setShowRegisterModal(true)}>
          + Register Farm Owner
        </button>
      </div>

      <div style={styles.filters}>
        <form onSubmit={handleSearch} style={{ flex: 1, display: 'flex', gap: '8px' }}>
          <input
            placeholder="Search farm or owner..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={styles.searchInput}
          />
        </form>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={styles.select}>
          <option value="">All Status</option>
          <option value="Active">Active</option>
          <option value="Deactivated">Deactivated</option>
        </select>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: '#dc2626' }}>{error}</p>}

      {!loading && !error && (
        <div style={styles.tableCard}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Farm / Owner</th>
                <th style={styles.th}>Mobile</th>
                <th style={styles.th}>Barangay</th>
                <th style={styles.th}>Farm Size</th>
                <th style={styles.th}>Ammonia</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {allFarms.map(f => (
                <tr key={f.id}>
                  <td style={styles.td}>
                    <div style={{ fontWeight: 600 }}>{f.farm_name}</div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>{f.owner_name}</div>
                  </td>
                  <td style={styles.td}>{f.mobile_number}</td>
                  <td style={styles.td}>{f.barangay}</td>
                  <td style={styles.td}>{f.farm_size}</td>
                  <td style={styles.td}>
                    {f.ammonia !== null ? `${f.ammonia} ppm` : '—'}
                  </td>
                  <td style={styles.td}>
                    <span style={{ ...styles.badge, backgroundColor: statusColor[f.sensor_status] || '#9ca3af' }}>
                      {f.sensor_status}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <span style={{ ...styles.actionBtn, ...styles.editBtn }} onClick={() => setEditFarm(f)}>
                        Edit
                      </span>
                      {f.status === 'Active' ? (
                        <span style={{ ...styles.actionBtn, ...styles.deactivateBtn }} onClick={() => handleDeactivate(f)}>
                          Deactivate
                        </span>
                      ) : (
                        <span style={{ ...styles.actionBtn, ...styles.activateBtn }} onClick={() => handleActivate(f)}>
                          Activate
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {allFarms.length === 0 && <div style={styles.empty}>No farms found.</div>}
        </div>
      )}

      {showRegisterModal && (
        <RegisterModal
          onClose={() => setShowRegisterModal(false)}
          onSuccess={() => { setShowRegisterModal(false); refetch() }}
        />
      )}

      {editFarm && (
        <EditModal
          farm={editFarm}
          onClose={() => setEditFarm(null)}
          onSuccess={() => { setEditFarm(null); refetch() }}
        />
      )}

      {confirmAction && (
        <div style={modalStyles.overlay} onClick={() => setConfirmAction(null)}>
          <div style={confirmStyles.modal} onClick={e => e.stopPropagation()}>
            <h3 style={confirmStyles.title}>{confirmAction.title}</h3>
            <p style={confirmStyles.message}>{confirmAction.message}</p>
            <div style={modalStyles.actions}>
              <button onClick={() => setConfirmAction(null)} style={modalStyles.cancelBtn}>
                Cancel
              </button>
              <button
                onClick={confirmAction.onConfirm}
                style={{
                  ...modalStyles.submitBtn,
                  backgroundColor: confirmAction.danger ? '#dc2626' : '#2E7D32',
                }}
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

function RegisterModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    first_name: '', last_name: '', mobile_number: '',
    farm_name: '', lot_number: '', street: '', barangay: '', landmark: '',
    farm_size: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [smsWarning, setSmsWarning] = useState('')

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await api.post('/admin/farms', form)
      if (!res.data.sms_sent) {
        setSmsWarning('Account created, but the SMS failed to send. You can resend it from the Farms list.')
        setTimeout(() => onSuccess(), 2000)
      } else {
        onSuccess()
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to register farm owner.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.modal} onClick={e => e.stopPropagation()}>
        <div style={modalStyles.header}>
          <h3 style={modalStyles.title}>Register Farm Owner & Farm</h3>
          <span style={modalStyles.close} onClick={onClose}>×</span>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div style={modalStyles.errorBox}>{error}</div>}
          {smsWarning && <div style={modalStyles.warnBox}>{smsWarning}</div>}

          <div style={modalStyles.sectionLabel}>OWNER ACCOUNT DETAILS</div>
          <div style={modalStyles.row}>
            <input placeholder="First Name" value={form.first_name} onChange={update('first_name')} style={modalStyles.input} required />
            <input placeholder="Last Name" value={form.last_name} onChange={update('last_name')} style={modalStyles.input} required />
          </div>
          <input placeholder="Mobile Number (used for login)" value={form.mobile_number} onChange={update('mobile_number')} style={modalStyles.inputFull} required />

          <div style={modalStyles.sectionLabel}>FARM PROFILE</div>
          <input placeholder="Farm Name" value={form.farm_name} onChange={update('farm_name')} style={modalStyles.inputFull} required />

          <div style={modalStyles.row}>
            <input placeholder="Lot No. (optional)" value={form.lot_number} onChange={update('lot_number')} style={modalStyles.input} />
            <input placeholder="Street (optional)" value={form.street} onChange={update('street')} style={modalStyles.input} />
          </div>

          <select value={form.barangay} onChange={update('barangay')} style={modalStyles.inputFull} required>
            <option value="">-- Select Barangay --</option>
            {BARANGAYS.map(b => (
              <option key={b} value={b}>Brgy. {b}</option>
            ))}
          </select>

          <div style={modalStyles.row}>
            <input placeholder="Landmark (optional)" value={form.landmark} onChange={update('landmark')} style={modalStyles.input} />
            <select value={form.farm_size} onChange={update('farm_size')} style={modalStyles.input} required>
              <option value="">Farm Size</option>
              <option value="Small">Small (below 10,000 layers)</option>
              <option value="Medium">Medium (10,000–50,000 layers)</option>
              <option value="Large">Large (above 50,000 layers)</option>
            </select>
          </div>

          <p style={modalStyles.hint}>
            A temporary password will be generated and sent to the owner's mobile number via SMS. The owner must change it on their first login.
          </p>

          <div style={modalStyles.actions}>
            <button type="button" onClick={onClose} style={modalStyles.cancelBtn}>Cancel</button>
            <button type="submit" disabled={loading} style={modalStyles.submitBtn}>
              {loading ? 'Creating...' : 'Create Account & Register Farm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EditModal({ farm, onClose, onSuccess }) {
  const [form, setForm] = useState({
    farm_name: farm.farm_name,
    lot_number: '',
    street: '',
    barangay: farm.barangay,
    landmark: '',
    mobile_number: farm.mobile_number,
    farm_size: farm.farm_size,
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.put(`/admin/farms/${farm.id}`, form)
      onSuccess()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update farm.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.modal} onClick={e => e.stopPropagation()}>
        <div style={modalStyles.header}>
          <h3 style={modalStyles.title}>Edit — {farm.owner_name}</h3>
          <span style={modalStyles.close} onClick={onClose}>×</span>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div style={modalStyles.errorBox}>{error}</div>}

          <input placeholder="Farm Name" value={form.farm_name} onChange={update('farm_name')} style={modalStyles.inputFull} />

          <div style={modalStyles.row}>
            <input placeholder="Lot No. (optional)" value={form.lot_number} onChange={update('lot_number')} style={modalStyles.input} />
            <input placeholder="Street (optional)" value={form.street} onChange={update('street')} style={modalStyles.input} />
          </div>

          <select value={form.barangay} onChange={update('barangay')} style={modalStyles.inputFull}>
            {BARANGAYS.map(b => (
              <option key={b} value={b}>Brgy. {b}</option>
            ))}
          </select>

          <input placeholder="Landmark (optional)" value={form.landmark} onChange={update('landmark')} style={modalStyles.inputFull} />

          <select value={form.farm_size} onChange={update('farm_size')} style={modalStyles.inputFull}>
            <option value="Small">Small (below 10,000 layers)</option>
            <option value="Medium">Medium (10,000–50,000 layers)</option>
            <option value="Large">Large (above 50,000 layers)</option>
          </select>

          <input placeholder="Mobile Number" value={form.mobile_number} onChange={update('mobile_number')} style={modalStyles.inputFull} />

          <div style={modalStyles.actions}>
            <button type="button" onClick={onClose} style={modalStyles.cancelBtn}>Cancel</button>
            <button type="submit" disabled={loading} style={modalStyles.submitBtn}>
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' },
  title: { fontSize: '22px', fontWeight: '700', color: '#111827', margin: 0 },
  subtitle: { fontSize: '13px', color: '#6b7280', marginTop: '4px' },
  newBtn: { backgroundColor: '#2E7D32', color: 'white', border: 'none', borderRadius: '8px', padding: '10px 18px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' },
  filters: { display: 'flex', gap: '12px', marginBottom: '16px' },
  searchInput: { flex: 1, padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' },
  select: { padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' },
  tableCard: { backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '14px 16px', fontSize: '12px', color: '#6b7280', borderBottom: '1px solid #e5e7eb', textTransform: 'uppercase' },
  td: { padding: '14px 16px', fontSize: '13px', color: '#374151', borderBottom: '1px solid #f3f4f6' },
  badge: { padding: '3px 10px', borderRadius: '999px', color: 'white', fontSize: '11px', fontWeight: '600' },
  actionBtn: {
    padding: '5px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '600',
    cursor: 'pointer', border: '1px solid transparent', whiteSpace: 'nowrap',
  },
  editBtn: { color: '#2E7D32', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' },
  deactivateBtn: { color: '#dc2626', backgroundColor: '#fef2f2', border: '1px solid #fecaca' },
  activateBtn: { color: '#2E7D32', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' },
  empty: { padding: '32px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' },
}

const modalStyles = {
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  modal: { backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '480px', maxWidth: '90%', maxHeight: '90vh', overflowY: 'auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  title: { fontSize: '17px', fontWeight: '700', color: '#111827', margin: 0 },
  close: { fontSize: '22px', cursor: 'pointer', color: '#6b7280' },
  sectionLabel: { fontSize: '11px', fontWeight: '600', color: '#9ca3af', marginTop: '16px', marginBottom: '8px', letterSpacing: '0.5px' },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' },
  input: { padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box' },
  inputFull: { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box', marginBottom: '10px' },
  errorBox: { backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '14px' },
  warnBox: { backgroundColor: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '14px' },
  hint: { fontSize: '12px', color: '#6b7280', marginTop: '14px', lineHeight: '1.5' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' },
  cancelBtn: { padding: '10px 18px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: 'white', fontSize: '14px', cursor: 'pointer' },
  submitBtn: { padding: '10px 18px', borderRadius: '8px', border: 'none', backgroundColor: '#2E7D32', color: 'white', fontSize: '14px', fontWeight: '600', cursor: 'pointer' },
}

const confirmStyles = {
  modal: { backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '400px', maxWidth: '90%' },
  title: { fontSize: '17px', fontWeight: '700', color: '#111827', marginTop: 0, marginBottom: '10px' },
  message: { fontSize: '14px', color: '#6b7280', lineHeight: '1.5', marginBottom: '4px' },
}