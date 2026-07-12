import { useState } from 'react'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useIsMobile } from '../../hooks/useIsMobile'

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
  const [barangayFilter, setBarangayFilter] = useState('')
  const [sizeFilter, setSizeFilter] = useState('')
  const [search, setSearch] = useState('')
  const [showRegisterModal, setShowRegisterModal] = useState(false)
  const [editFarm, setEditFarm] = useState(null)
  const [viewFarm, setViewFarm] = useState(null)
  const [confirmAction, setConfirmAction] = useState(null)
  const isMobile = useIsMobile()

  const params = {}
  if (statusFilter) params.status = statusFilter
  if (barangayFilter) params.barangay = barangayFilter
  if (sizeFilter) params.farm_size = sizeFilter
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
      <div style={{ ...styles.header, ...(isMobile ? styles.headerMobile : {}) }}>
        <div>
          <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>Farms</h1>
          <p style={styles.subtitle}>All registered farm owners & farms</p>
        </div>
        <button
          style={{ ...styles.newBtn, ...(isMobile ? styles.btnFull : {}) }}
          onClick={() => setShowRegisterModal(true)}
        >
          + Register Farm Owner
        </button>
      </div>

      <div style={{ ...styles.filters, ...(isMobile ? styles.filtersMobile : {}) }}>
        <form onSubmit={handleSearch} style={{ flex: 1, display: 'flex', gap: '8px' }}>
          <input
            placeholder="Search farm or owner..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={styles.searchInput}
          />
        </form>
        <select
          value={barangayFilter}
          onChange={e => setBarangayFilter(e.target.value)}
          style={{ ...styles.select, ...(isMobile ? styles.selectMobile : {}) }}
        >
          <option value="">All Barangays</option>
          {BARANGAYS.map(b => (
            <option key={b} value={b}>Brgy. {b}</option>
          ))}
        </select>
        <select
          value={sizeFilter}
          onChange={e => setSizeFilter(e.target.value)}
          style={{ ...styles.select, ...(isMobile ? styles.selectMobile : {}) }}
        >
          <option value="">All Sizes</option>
          <option value="Small">Small</option>
          <option value="Medium">Medium</option>
          <option value="Large">Large</option>
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{ ...styles.select, ...(isMobile ? styles.selectMobile : {}) }}
        >
          <option value="">All Status</option>
          <option value="Active">Active</option>
          <option value="Deactivated">Deactivated</option>
        </select>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: '#dc2626' }}>{error}</p>}

      {!loading && !error && (
        <div style={styles.tableCard}>
          {isMobile && allFarms.length > 0 && (
            <p style={styles.scrollHint}>Swipe left/right to see all columns →</p>
          )}
          <div style={isMobile ? styles.tableScroll : undefined}>
            <table style={{ ...styles.table, ...(isMobile ? styles.tableMobile : {}) }}>
              <thead>
                <tr>
                  <th style={styles.th}>Farm / Owner</th>
                  <th style={styles.th}>Mobile</th>
                  <th style={styles.th}>Barangay</th>
                  <th style={styles.th}>Farm Size</th>
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
                      <span style={{ ...styles.badge, backgroundColor: statusColor[f.sensor_status] || '#9ca3af' }}>
                        {f.sensor_status}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <span style={{ ...styles.actionBtn, ...styles.viewBtn }} onClick={() => setViewFarm(f)}>
                          View
                        </span>
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
          </div>
          {allFarms.length === 0 && <div style={styles.empty}>No farms found.</div>}
        </div>
      )}

      {viewFarm && (
        <ViewFarmModal
          farmId={viewFarm.id}
          isMobile={isMobile}
          onClose={() => setViewFarm(null)}
        />
      )}

      {showRegisterModal && (
        <RegisterModal
          isMobile={isMobile}
          onClose={() => setShowRegisterModal(false)}
          onSuccess={() => { setShowRegisterModal(false); refetch() }}
        />
      )}

      {editFarm && (
        <EditModal
          farm={editFarm}
          isMobile={isMobile}
          onClose={() => setEditFarm(null)}
          onSuccess={() => { setEditFarm(null); refetch() }}
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
    </AdminLayout>
  )
}

function RegisterModal({ onClose, onSuccess, isMobile }) {
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
      <div style={{ ...modalStyles.modal, ...(isMobile ? modalStyles.modalMobile : {}) }} onClick={e => e.stopPropagation()}>
        <div style={modalStyles.header}>
          <h3 style={modalStyles.title}>Register Farm Owner & Farm</h3>
          <span style={modalStyles.close} onClick={onClose}>×</span>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div style={modalStyles.errorBox}>{error}</div>}
          {smsWarning && <div style={modalStyles.warnBox}>{smsWarning}</div>}

          <div style={modalStyles.sectionLabel}>OWNER ACCOUNT DETAILS</div>
          <div style={{ ...modalStyles.row, ...(isMobile ? modalStyles.rowMobile : {}) }}>
            <input placeholder="First Name" value={form.first_name} onChange={update('first_name')} style={modalStyles.input} required />
            <input placeholder="Last Name" value={form.last_name} onChange={update('last_name')} style={modalStyles.input} required />
          </div>
          <input placeholder="Mobile Number (used for login)" value={form.mobile_number} onChange={update('mobile_number')} style={modalStyles.inputFull} required />

          <div style={modalStyles.sectionLabel}>FARM PROFILE</div>
          <input placeholder="Farm Name" value={form.farm_name} onChange={update('farm_name')} style={modalStyles.inputFull} required />

          <div style={{ ...modalStyles.row, ...(isMobile ? modalStyles.rowMobile : {}) }}>
            <input placeholder="Lot No. (optional)" value={form.lot_number} onChange={update('lot_number')} style={modalStyles.input} />
            <input placeholder="Street (optional)" value={form.street} onChange={update('street')} style={modalStyles.input} />
          </div>

          <select value={form.barangay} onChange={update('barangay')} style={modalStyles.inputFull} required>
            <option value="">-- Select Barangay --</option>
            {BARANGAYS.map(b => (
              <option key={b} value={b}>Brgy. {b}</option>
            ))}
          </select>

          <div style={{ ...modalStyles.row, ...(isMobile ? modalStyles.rowMobile : {}) }}>
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
              style={{ ...modalStyles.submitBtn, ...(isMobile ? modalStyles.btnFull : {}) }}
            >
              {loading ? 'Creating...' : 'Create Account & Register Farm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EditModal({ farm, onClose, onSuccess, isMobile }) {
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
      <div style={{ ...modalStyles.modal, ...(isMobile ? modalStyles.modalMobile : {}) }} onClick={e => e.stopPropagation()}>
        <div style={modalStyles.header}>
          <h3 style={modalStyles.title}>Edit — {farm.owner_name}</h3>
          <span style={modalStyles.close} onClick={onClose}>×</span>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div style={modalStyles.errorBox}>{error}</div>}

          <input placeholder="Farm Name" value={form.farm_name} onChange={update('farm_name')} style={modalStyles.inputFull} />

          <div style={{ ...modalStyles.row, ...(isMobile ? modalStyles.rowMobile : {}) }}>
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
              style={{ ...modalStyles.submitBtn, ...(isMobile ? modalStyles.btnFull : {}) }}
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ViewFarmModal({ farmId, onClose, isMobile }) {
  const { data: farm, loading, error } = useCachedFetch(`/admin/farms/${farmId}`)

  const statusColorMap = { Normal: '#2E7D32', Warning: '#B45309', Critical: '#B91C1C' }
  const reading = farm?.sensor_readings?.[0] ?? farm?.sensorReadings?.[0] ?? null
  const initials = farm ? getInitials(farm.owner_name) : ''
  const isActive = farm?.status === 'Active'

  return (
    <div style={profileStyles.overlay} onClick={onClose}>
      <div style={{ ...profileStyles.modal, ...(isMobile ? profileStyles.modalMobile : {}) }} onClick={e => e.stopPropagation()}>
        <button style={profileStyles.closeBtn} onClick={onClose} aria-label="Close">×</button>

        {loading && <div style={profileStyles.stateMsg}>Loading farm profile…</div>}
        {error && <div style={{ ...profileStyles.stateMsg, color: '#dc2626' }}>{error}</div>}

        {farm && (
          <>
            <div style={profileStyles.header}>
              <div style={profileStyles.avatar}>{initials || <IconFarm size={20} />}</div>
              <div style={profileStyles.headerText}>
                <div style={profileStyles.farmName}>{farm.farm_name}</div>
                <div style={profileStyles.ownerName}>{farm.owner_name}</div>
              </div>
              <span
                style={{
                  ...profileStyles.statusPill,
                  backgroundColor: isActive ? 'rgba(212,175,55,0.18)' : 'rgba(255,255,255,0.12)',
                  color: isActive ? '#E8C766' : '#D7D2C4',
                  border: `1px solid ${isActive ? 'rgba(212,175,55,0.5)' : 'rgba(255,255,255,0.25)'}`,
                }}
              >
                {farm.status}
              </span>
            </div>

            <div style={profileStyles.body}>
              <div style={profileStyles.section}>
                <div style={profileStyles.sectionLabel}>
                  <IconFarm size={13} /> Farm &amp; Owner
                </div>
                <div style={{ ...profileStyles.infoGrid, ...(isMobile ? profileStyles.infoGridMobile : {}) }}>
                  <InfoCell icon={<IconPhone />} label="Mobile" value={farm.mobile_number} />
                  <InfoCell icon={<IconMapPin />} label="Barangay" value={farm.barangay} />
                  <InfoCell icon={<IconHome />} label="Address" value={farm.address} full />
                  <InfoCell icon={<IconScale />} label="Farm Size" value={farm.farm_size} />
                </div>
              </div>

              <div style={{ ...profileStyles.section, marginTop: '22px' }}>
                <div style={profileStyles.sectionLabel}>
                  <IconGauge size={13} /> Latest Sensor Readings
                </div>

                {!reading ? (
                  <div style={profileStyles.emptySensor}>
                    <IconOffline />
                    <div>
                      <div style={profileStyles.emptyTitle}>No readings yet</div>
                      <div style={profileStyles.emptySub}>Hardware not connected to this farm.</div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ ...profileStyles.sensorGrid, ...(isMobile ? profileStyles.sensorGridMobile : {}) }}>
                      <SensorStat icon={<IconAmmonia />} label="Ammonia" value={reading.ammonia} unit="ppm" status={reading.ammonia_status} colorMap={statusColorMap} />
                      <SensorStat icon={<IconTemp />} label="Temperature" value={reading.temperature} unit="°C" status={reading.temperature_status} colorMap={statusColorMap} />
                      <SensorStat icon={<IconHumidity />} label="Humidity" value={reading.humidity} unit="%" status={reading.humidity_status} colorMap={statusColorMap} />
                      <SensorStat icon={<IconMoisture />} label="Moisture" value={reading.moisture} unit="%" status={reading.moisture_status} colorMap={statusColorMap} />
                    </div>
                    {reading?.created_at && (
                      <div style={profileStyles.timestamp}>Last updated {new Date(reading.created_at).toLocaleString()}</div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div style={profileStyles.footer}>
              <button onClick={onClose} style={profileStyles.closeFooterBtn}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function InfoCell({ icon, label, value, full }) {
  return (
    <div style={{ ...profileStyles.infoCell, ...(full ? profileStyles.infoCellFull : {}) }}>
      <div style={profileStyles.infoIcon}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={profileStyles.infoLabel}>{label}</div>
        <div style={profileStyles.infoValue}>{value || '—'}</div>
      </div>
    </div>
  )
}

function SensorStat({ icon, label, value, unit, status, colorMap }) {
  const color = colorMap[status] || '#6b7280'
  return (
    <div style={{ ...profileStyles.sensorCard, borderLeftColor: color }}>
      <div style={{ ...profileStyles.sensorIcon, color }}>{icon}</div>
      <div style={profileStyles.sensorLabel}>{label}</div>
      <div style={{ ...profileStyles.sensorValue, color }}>
        {value !== null && value !== undefined ? `${value} ${unit}` : '—'}
      </div>
      {status && <div style={{ ...profileStyles.sensorStatus, color }}>{status}</div>}
    </div>
  )
}

function getInitials(name) {
  if (!name) return ''
  return name.split(' ').filter(Boolean).slice(0, 2).map(n => n[0].toUpperCase()).join('')
}

// --- Small inline icon set (no external dependency) ---
const iconBase = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }

function IconFarm({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...iconBase}>
      <path d="M3 21h18" /><path d="M5 21V9l7-5 7 5v12" /><path d="M9 21v-6h6v6" />
    </svg>
  )
}
function IconPhone() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" {...iconBase}>
      <path d="M6 3h4l1 5-2.5 1.5a11 11 0 0 0 5 5L15 12l5 1v4a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z" />
    </svg>
  )
}
function IconMapPin() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" {...iconBase}>
      <path d="M12 21s7-6.5 7-11a7 7 0 1 0-14 0c0 4.5 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" />
    </svg>
  )
}
function IconHome() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" {...iconBase}>
      <path d="M4 11.5 12 4l8 7.5" /><path d="M6 10v9h5v-5h2v5h5v-9" />
    </svg>
  )
}
function IconScale() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" {...iconBase}>
      <path d="M12 3v18" /><path d="M5 7h14" /><path d="M5 7l-3 6a3 3 0 0 0 6 0l-3-6z" /><path d="M19 7l-3 6a3 3 0 0 0 6 0l-3-6z" />
    </svg>
  )
}
function IconGauge({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...iconBase}>
      <circle cx="12" cy="13" r="8" /><path d="M12 13l3-4" /><path d="M9 5.5 10 4" />
    </svg>
  )
}
function IconOffline() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#C9B98A" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" />
    </svg>
  )
}
function IconAmmonia() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...iconBase}>
      <path d="M12 3s6 7 6 11a6 6 0 1 1-12 0c0-4 6-11 6-11z" />
    </svg>
  )
}
function IconTemp() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...iconBase}>
      <path d="M12 14V5a2 2 0 1 0-4 0v9a4 4 0 1 0 4 0z" />
    </svg>
  )
}
function IconHumidity() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...iconBase}>
      <path d="M7 16a4 4 0 0 1 .5-8 5 5 0 0 1 9.5 2 3.5 3.5 0 0 1-.5 7H7z" />
    </svg>
  )
}
function IconMoisture() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...iconBase}>
      <path d="M4 20c8 0 12-6 12-14 0 0-10 0-12 8-1 4 0 6 0 6z" />
    </svg>
  )
}

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' },
  headerMobile: { flexDirection: 'column', gap: '14px' },
  title: { fontSize: '22px', fontWeight: '700', color: '#111827', margin: 0 },
  titleMobile: { fontSize: '18px' },
  subtitle: { fontSize: '13px', color: '#6b7280', marginTop: '4px' },
  newBtn: { backgroundColor: '#2E7D32', color: 'white', border: 'none', borderRadius: '8px', padding: '10px 18px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' },
  btnFull: { width: '100%', boxSizing: 'border-box' },
  filters: { display: 'flex', gap: '12px', marginBottom: '16px' },
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
  viewBtn: { color: '#3b82f6', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe' },
  deactivateBtn: { color: '#dc2626', backgroundColor: '#fef2f2', border: '1px solid #fecaca' },
  activateBtn: { color: '#2E7D32', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' },
  empty: { padding: '32px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' },
}

const modalStyles = {
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  modal: { backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '480px', maxWidth: '90%', maxHeight: '90vh', overflowY: 'auto' },
  modalMobile: {
    width: '100%', maxWidth: '100%', borderRadius: '16px 16px 0 0',
    padding: '20px', margin: '0', position: 'fixed', bottom: 0, left: 0,
    maxHeight: '85vh',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  title: { fontSize: '17px', fontWeight: '700', color: '#111827', margin: 0 },
  close: { fontSize: '22px', cursor: 'pointer', color: '#6b7280' },
  sectionLabel: { fontSize: '11px', fontWeight: '600', color: '#9ca3af', marginTop: '16px', marginBottom: '8px', letterSpacing: '0.5px' },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' },
  rowMobile: { gridTemplateColumns: '1fr' },
  input: { padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box' },
  inputFull: { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box', marginBottom: '10px' },
  errorBox: { backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '14px' },
  warnBox: { backgroundColor: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '14px' },
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

// Farm Profile modal — dark forest green header, gold accents, beige body
// (matches the AgriBantay dashboard theme rather than a generic white modal)
const profileStyles = {
  overlay: {
    position: 'fixed', inset: 0, backgroundColor: 'rgba(18,38,27,0.6)',
    backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center',
    justifyContent: 'center', zIndex: 50, padding: '16px', boxSizing: 'border-box',
  },
  modal: {
    backgroundColor: '#F7F2E7', borderRadius: '18px', width: '520px', maxWidth: '100%',
    maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
    position: 'relative',
  },
  modalMobile: {
    width: '100%', borderRadius: '18px 18px 0 0', position: 'fixed',
    bottom: 0, left: 0, maxHeight: '88vh',
  },
  closeBtn: {
    position: 'absolute', top: '14px', right: '14px', width: '28px', height: '28px',
    borderRadius: '50%', border: 'none', backgroundColor: 'rgba(255,255,255,0.16)',
    color: '#fff', fontSize: '18px', lineHeight: '26px', cursor: 'pointer', zIndex: 2,
  },
  stateMsg: { padding: '40px 24px', textAlign: 'center', color: '#6b7280', fontSize: '14px' },
  header: {
    backgroundImage: 'linear-gradient(135deg, #234A35 0%, #122A1E 100%)',
    borderRadius: '18px 18px 0 0', padding: '24px 44px 20px 24px',
    display: 'flex', alignItems: 'center', gap: '14px',
  },
  avatar: {
    width: '50px', height: '50px', borderRadius: '50%', backgroundColor: 'rgba(212,175,55,0.16)',
    border: '1.5px solid #D4AF37', color: '#E8C766', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: '16px', fontWeight: '700', flexShrink: 0,
  },
  headerText: { flex: 1, minWidth: 0 },
  farmName: {
    color: '#fff', fontSize: '17px', fontWeight: '700', lineHeight: '1.3',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  ownerName: { color: 'rgba(247,242,231,0.65)', fontSize: '12.5px', marginTop: '2px' },
  statusPill: {
    padding: '4px 12px', borderRadius: '999px', fontSize: '11px', fontWeight: '700',
    letterSpacing: '0.3px', whiteSpace: 'nowrap', flexShrink: 0,
  },
  body: { padding: '22px 24px 8px' },
  section: {},
  sectionLabel: {
    display: 'flex', alignItems: 'center', gap: '7px', fontSize: '11px', fontWeight: '700',
    color: '#8A7A3E', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '12px',
  },
  infoGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' },
  infoGridMobile: { gridTemplateColumns: '1fr' },
  infoCell: {
    display: 'flex', gap: '10px', backgroundColor: '#fff', border: '1px solid #E8E2D3',
    borderRadius: '10px', padding: '10px 12px', alignItems: 'flex-start',
  },
  infoCellFull: { gridColumn: '1 / -1' },
  infoIcon: { color: '#234A35', opacity: 0.55, marginTop: '2px', flexShrink: 0 },
  infoLabel: {
    fontSize: '10.5px', color: '#9ca3af', fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '2px',
  },
  infoValue: { fontSize: '13.5px', color: '#1F2937', fontWeight: '600', wordBreak: 'break-word' },
  emptySensor: {
    display: 'flex', alignItems: 'center', gap: '12px', backgroundColor: '#fff',
    border: '1px dashed #D8D0BC', borderRadius: '10px', padding: '16px',
  },
  emptyTitle: { fontSize: '13px', fontWeight: '700', color: '#374151' },
  emptySub: { fontSize: '12px', color: '#9ca3af', marginTop: '2px' },
  sensorGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' },
  sensorGridMobile: { gridTemplateColumns: 'repeat(2, 1fr)' },
  sensorCard: {
    backgroundColor: '#fff', border: '1px solid #E8E2D3', borderLeft: '3px solid',
    borderRadius: '10px', padding: '12px 10px', textAlign: 'left',
  },
  sensorIcon: { marginBottom: '6px' },
  sensorLabel: {
    fontSize: '10.5px', color: '#6b7280', fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: '0.3px',
  },
  sensorValue: { fontSize: '15px', fontWeight: '700', marginTop: '3px' },
  sensorStatus: { fontSize: '10.5px', fontWeight: '700', marginTop: '2px' },
  timestamp: { fontSize: '11px', color: '#9ca3af', marginTop: '12px' },
  footer: { padding: '18px 24px 22px', display: 'flex', justifyContent: 'flex-end' },
  closeFooterBtn: {
    padding: '9px 20px', borderRadius: '8px', border: '1px solid #234A35',
    backgroundColor: 'transparent', color: '#234A35', fontSize: '13.5px',
    fontWeight: '600', cursor: 'pointer',
  },
}