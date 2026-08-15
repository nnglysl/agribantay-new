import { useState, useEffect, useMemo, useRef } from 'react'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useIsMobile } from '../../hooks/useIsMobile'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const BARANGAYS = [
  'Aguila', 'Anus', 'Aya', 'Bagong Pook', 'Balagtasin I', 'Balagtasin II',
  'Banay-banay I', 'Banay-banay II', 'Bigain I', 'Bigain II', 'Bigain South',
  'Calansayan', 'Dagatan', 'Don Luis', 'Galamay-Amo', 'Lalayat',
  'Lapolapo I', 'Lapolapo II', 'Lepote', 'Lumil', 'Mojon-Tampoy',
  'Natunuan', 'Palanca', 'Pinagtung-Ulan', 'Poblacion Barangay I',
  'Poblacion Barangay II', 'Poblacion Barangay III', 'Poblacion Barangay IV',
  'Sabang', 'Salaban', 'Santo Cristo', 'Taysan', 'Tugtug',
]

const PAGE_SIZE_OPTIONS = [10, 25, 50]

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const MONITORING_STATUSES = ['Normal', 'Warning', 'Critical', 'Offline']

const SAN_JOSE_CENTER = [13.8797, 121.0989]
const SAN_JOSE_VIEWBOX = '120.95,13.95,121.15,13.80'

async function geocodeAddress(query) {
  if (!query || query.trim().length < 3) return []
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
    `${query}, San Jose, Batangas, Philippines`
  )}&viewbox=${SAN_JOSE_VIEWBOX}&bounded=1&countrycodes=ph&limit=5`

  const res = await fetch(url)
  if (!res.ok) throw new Error('Geocoding request failed')
  return res.json()
}

let farmLocalIdCounter = 0
const nextFarmLocalId = () => `farm-${++farmLocalIdCounter}`

function emptyFarm() {
  return {
    localId: nextFarmLocalId(),
    farm_name: '',
    farm_size: '',
    barangay: '',
    landmark: '',
    address: '',
    latitude: null,
    longitude: null,
  }
}

function emptyTabState() {
  return {
    search: '', barangayFilter: '', sizeFilter: '', monitoringFilter: '',
    filterMonth: '', filterYear: '', currentPage: 1, pageSize: 10,
    sortField: 'created_at', sortDirection: 'desc',
  }
}

function formatRegistrationDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getInitials(name) {
  if (!name) return ''
  return name.split(' ').filter(Boolean).slice(0, 2).map(n => n[0].toUpperCase()).join('')
}

export default function Farms() {
  const [statusTab, setStatusTab] = useState('active')
  const [tabState, setTabState] = useState({
    active: emptyTabState(),
    deactivated: emptyTabState(),
  })

  const [showRegisterModal, setShowRegisterModal] = useState(false)
  const [showAddFarmModal, setShowAddFarmModal] = useState(false)
  const [editFarm, setEditFarm] = useState(null)
  const [viewFarm, setViewFarm] = useState(null)
  const [confirmAction, setConfirmAction] = useState(null)
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const isMobile = useIsMobile()

  const current = tabState[statusTab]
  const updateCurrent = (patch) => {
    setTabState(prev => ({ ...prev, [statusTab]: { ...prev[statusTab], ...patch } }))
  }

  const params = { status: statusTab === 'active' ? 'Active' : 'Deactivated' }
  if (current.barangayFilter) params.barangay = current.barangayFilter
  if (current.search) params.search = current.search

  const { data: farms, loading, error, refetch } = useCachedFetch('/admin/farms', params)
  const allFarms = farms || []

  const availableYears = useMemo(() => {
    const set = new Set()
    allFarms.forEach(f => {
      if (f.created_at) set.add(new Date(f.created_at).getFullYear())
    })
    return [...set].sort((a, b) => b - a)
  }, [allFarms])

  const sortedFarms = useMemo(() => {
    let list = [...allFarms]

    if (current.sizeFilter) list = list.filter(f => f.farm_size === current.sizeFilter)
    if (current.monitoringFilter) list = list.filter(f => f.current_status === current.monitoringFilter)

    if (current.filterYear || current.filterMonth !== '') {
      list = list.filter(f => {
        if (!f.created_at) return false
        const d = new Date(f.created_at)
        if (current.filterYear && d.getFullYear() !== Number(current.filterYear)) return false
        if (current.filterMonth !== '' && d.getMonth() !== Number(current.filterMonth)) return false
        return true
      })
    }

    list.sort((a, b) => {
      let result
      if (current.sortField === 'created_at') {
        result = new Date(a.created_at ?? 0) - new Date(b.created_at ?? 0)
      } else {
        result = String(a[current.sortField] ?? '').localeCompare(String(b[current.sortField] ?? ''))
      }
      return current.sortDirection === 'asc' ? result : -result
    })
    return list
  }, [allFarms, current.sizeFilter, current.monitoringFilter, current.filterMonth, current.filterYear, current.sortField, current.sortDirection])

  const handleSort = (field) => {
    if (current.sortField === field) {
      updateCurrent({ sortDirection: current.sortDirection === 'asc' ? 'desc' : 'asc' })
    } else {
      updateCurrent({ sortField: field, sortDirection: 'asc' })
    }
  }

  const totalItems = sortedFarms.length
  const totalPages = Math.max(1, Math.ceil(totalItems / current.pageSize))
  const safePage = Math.min(current.currentPage, totalPages)

  const paginatedFarms = useMemo(() => {
    const start = (safePage - 1) * current.pageSize
    return sortedFarms.slice(start, start + current.pageSize)
  }, [sortedFarms, safePage, current.pageSize])

  const rangeStart = totalItems === 0 ? 0 : (safePage - 1) * current.pageSize + 1
  const rangeEnd = Math.min(safePage * current.pageSize, totalItems)

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

  const monitoringColor = { Normal: '#256b3d', Warning: '#b45309', Critical: '#b91c1c', Offline: '#6b7280' }
  const monitoringBg = { Normal: '#eaf3ec', Warning: '#fbf1e2', Critical: '#fbeaea', Offline: '#eef1ea' }
  const activeFilterCount = [current.barangayFilter, current.sizeFilter, current.monitoringFilter, current.filterMonth !== '' || current.filterYear].filter(Boolean).length

  return (
    <AdminLayout>
      <div style={{ ...styles.header, ...(isMobile ? styles.headerMobile : {}) }}>
        <div>
          <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>Farms</h1>
          <p style={styles.subtitle}>All registered farm owners & farms</p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', ...(isMobile ? { flexDirection: 'column', width: '100%' } : {}) }}>
          <button style={{ ...styles.secondaryBtn, ...(isMobile ? styles.btnFull : {}) }} onClick={() => setShowAddFarmModal(true)}>
            + Add Farm to Existing Owner
          </button>
          <button style={{ ...styles.newBtn, ...(isMobile ? styles.btnFull : {}) }} onClick={() => setShowRegisterModal(true)}>
            + Register Farm Owner
          </button>
        </div>
      </div>

      <div style={styles.statusTabs}>
        <div style={{ ...styles.statusTab, ...(statusTab === 'active' ? styles.statusTabActive : {}) }} onClick={() => setStatusTab('active')}>
          Active Farms
        </div>
        <div style={{ ...styles.statusTab, ...(statusTab === 'deactivated' ? styles.statusTabActive : {}) }} onClick={() => setStatusTab('deactivated')}>
          Deactivated Farms
        </div>
      </div>

      <div style={{ ...styles.filters, ...(isMobile ? styles.filtersMobile : {}) }}>
        <input
          placeholder="Search farm or owner..."
          value={current.search}
          onChange={e => updateCurrent({ search: e.target.value, currentPage: 1 })}
          style={styles.searchInput}
        />

        {isMobile && (
          <button type="button" onClick={() => setShowMobileFilters(v => !v)} style={styles.filterToggleBtn}>
            <span>Filters</span>
            {activeFilterCount > 0 && <span style={styles.filterBadge}>{activeFilterCount}</span>}
            <span style={styles.filterChevron}>{showMobileFilters ? '▲' : '▼'}</span>
          </button>
        )}

        {(!isMobile || showMobileFilters) && (
          <>
            <select value={current.barangayFilter} onChange={e => updateCurrent({ barangayFilter: e.target.value, currentPage: 1 })} style={{ ...styles.select, ...(isMobile ? styles.selectMobile : {}) }}>
              <option value="">All Barangays</option>
              {BARANGAYS.map(b => <option key={b} value={b}>Brgy. {b}</option>)}
            </select>
            <select value={current.sizeFilter} onChange={e => updateCurrent({ sizeFilter: e.target.value, currentPage: 1 })} style={{ ...styles.select, ...(isMobile ? styles.selectMobile : {}) }}>
              <option value="">All Sizes</option>
              <option value="Small">Small</option>
              <option value="Medium">Medium</option>
              <option value="Large">Large</option>
            </select>
            <select value={current.monitoringFilter} onChange={e => updateCurrent({ monitoringFilter: e.target.value, currentPage: 1 })} style={{ ...styles.select, ...(isMobile ? styles.selectMobile : {}) }}>
              <option value="">All Monitoring Status</option>
              {MONITORING_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={current.filterMonth} onChange={e => updateCurrent({ filterMonth: e.target.value, currentPage: 1 })} style={{ ...styles.select, ...(isMobile ? styles.selectMobile : {}) }}>
              <option value="">All Months</option>
              {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
            <select value={current.filterYear} onChange={e => updateCurrent({ filterYear: e.target.value, currentPage: 1 })} style={{ ...styles.select, ...(isMobile ? styles.selectMobile : {}) }}>
              <option value="">All Years</option>
              {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </>
        )}
      </div>

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: '#b91c1c' }}>{error}</p>}

      {!loading && !error && (
        <div style={styles.tableCard}>
          {isMobile && allFarms.length > 0 && (
            <p style={styles.scrollHint}>Swipe left/right to see all columns →</p>
          )}
          <div style={isMobile ? styles.tableScroll : undefined}>
            <table style={{ ...styles.table, ...(isMobile ? styles.tableMobile : {}) }}>
              <thead>
                <tr>
                  <th style={styles.th}></th>
                  <th style={styles.th}>Farm / Owner</th>
                  <th style={styles.th}>Mobile</th>
                  <th style={styles.th}>Barangay</th>
                  <th style={styles.th}>Farm Size</th>
                  <th style={styles.th}>Device Name</th>
                  <th style={{ ...styles.th, ...styles.thSortable }} onClick={() => handleSort('created_at')}>
                    Registration Date
                    {current.sortField === 'created_at' && <span style={styles.sortArrow}>{current.sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
                  </th>
                  <th style={styles.th}>Monitoring Status</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedFarms.map(f => (
                  <tr key={f.id} style={styles.tr}>
                    <td style={styles.td}>
                      {f.owner_profile_photo_url ? (
                        <img src={f.owner_profile_photo_url} alt="" style={styles.ownerAvatarImg} />
                      ) : (
                        <span style={styles.avatar}>{getInitials(f.owner_name)}</span>
                      )}
                    </td>
                    <td style={styles.td}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: '#16311d' }}>{f.farm_name}</div>
                        <div style={{ fontSize: '12.5px', color: '#8a968d', marginTop: '1px' }}>{f.owner_name}</div>
                      </div>
                    </td>
                    <td style={styles.td}>{f.mobile_number || f.email || '—'}</td>
                    <td style={styles.td}>{f.barangay}</td>
                    <td style={styles.td}>{f.farm_size}</td>
                    <td style={styles.td}>{f.device_name || '—'}</td>
                    <td style={styles.td}>{formatRegistrationDate(f.created_at)}</td>
                    <td style={styles.td}>
                      <span style={{ ...styles.badge, color: monitoringColor[f.current_status] || '#6b7280', backgroundColor: monitoringBg[f.current_status] || '#eef1ea' }}>
                        <span style={{ ...styles.badgeDot, backgroundColor: monitoringColor[f.current_status] || '#6b7280' }} />
                        {f.current_status || 'Offline'}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <span style={{ ...styles.actionBtn, ...styles.viewBtn }} onClick={() => setViewFarm(f)}>View</span>
                        <span style={{ ...styles.actionBtn, ...styles.editBtn }} onClick={() => setEditFarm(f)}>Edit</span>
                        {statusTab === 'active' ? (
                          <span style={{ ...styles.actionBtn, ...styles.deactivateBtn }} onClick={() => handleDeactivate(f)}>Deactivate</span>
                        ) : (
                          <span style={{ ...styles.actionBtn, ...styles.activateBtn }} onClick={() => handleActivate(f)}>Activate</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {allFarms.length === 0 && <div style={styles.empty}>No {statusTab === 'active' ? 'active' : 'deactivated'} farms found.</div>}

          {allFarms.length > 0 && (
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

      {viewFarm && <ViewFarmModal farmId={viewFarm.id} isMobile={isMobile} onClose={() => setViewFarm(null)} />}

      {showRegisterModal && (
        <RegisterModal isMobile={isMobile} onClose={() => setShowRegisterModal(false)} onSuccess={() => { setShowRegisterModal(false); refetch() }} />
      )}

      {showAddFarmModal && (
        <AddFarmModal isMobile={isMobile} onClose={() => setShowAddFarmModal(false)} onSuccess={() => { setShowAddFarmModal(false); refetch() }} />
      )}

      {editFarm && (
        <EditModal farm={editFarm} isMobile={isMobile} onClose={() => setEditFarm(null)} onSuccess={() => { setEditFarm(null); refetch() }} />
      )}

      {confirmAction && (
        <div style={modalStyles.overlay} onClick={() => setConfirmAction(null)}>
          <div style={{ ...confirmStyles.modal, ...(isMobile ? modalStyles.modalMobile : {}) }} onClick={e => e.stopPropagation()}>
            <h3 style={confirmStyles.title}>{confirmAction.title}</h3>
            <p style={confirmStyles.message}>{confirmAction.message}</p>
            <div style={{ ...modalStyles.actions, ...(isMobile ? modalStyles.actionsMobile : {}) }}>
              <button onClick={() => setConfirmAction(null)} style={{ ...modalStyles.cancelBtn, ...(isMobile ? modalStyles.btnFull : {}) }}>Cancel</button>
              <button
                onClick={confirmAction.onConfirm}
                style={{ ...modalStyles.submitBtn, ...(isMobile ? modalStyles.btnFull : {}), backgroundColor: confirmAction.danger ? '#b91c1c' : '#2c8047' }}
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

function Pagination({ currentPage, totalPages, pageSize, onPageChange, onPageSizeChange, rangeStart, rangeEnd, totalItems, isMobile }) {
  const pageNumbers = useMemo(() => {
    const maxButtons = isMobile ? 3 : 5
    let start = Math.max(1, currentPage - Math.floor(maxButtons / 2))
    let end = start + maxButtons - 1
    if (end > totalPages) { end = totalPages; start = Math.max(1, end - maxButtons + 1) }
    const pages = []
    for (let p = start; p <= end; p++) pages.push(p)
    return pages
  }, [currentPage, totalPages, isMobile])

  return (
    <div style={{ ...paginationStyles.wrap, ...(isMobile ? paginationStyles.wrapMobile : {}) }}>
      <div style={paginationStyles.info}>{totalItems === 0 ? 'No results' : `Showing ${rangeStart}–${rangeEnd} of ${totalItems}`}</div>
      <div style={{ ...paginationStyles.controls, ...(isMobile ? paginationStyles.controlsMobile : {}) }}>
        <select value={pageSize} onChange={e => onPageSizeChange(Number(e.target.value))} style={paginationStyles.pageSizeSelect}>
          {PAGE_SIZE_OPTIONS.map(size => <option key={size} value={size}>{size} / page</option>)}
        </select>
        <button style={{ ...paginationStyles.navBtn, ...(currentPage === 1 ? paginationStyles.navBtnDisabled : {}) }} onClick={() => onPageChange(1)} disabled={currentPage === 1}>«</button>
        <button style={{ ...paginationStyles.navBtn, ...(currentPage === 1 ? paginationStyles.navBtnDisabled : {}) }} onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1}>‹</button>
        {pageNumbers[0] > 1 && <span style={paginationStyles.ellipsis}>…</span>}
        {pageNumbers.map(p => (
          <button key={p} onClick={() => onPageChange(p)} style={{ ...paginationStyles.pageBtn, ...(p === currentPage ? paginationStyles.pageBtnActive : {}) }}>{p}</button>
        ))}
        {pageNumbers[pageNumbers.length - 1] < totalPages && <span style={paginationStyles.ellipsis}>…</span>}
        <button style={{ ...paginationStyles.navBtn, ...(currentPage === totalPages ? paginationStyles.navBtnDisabled : {}) }} onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages}>›</button>
        <button style={{ ...paginationStyles.navBtn, ...(currentPage === totalPages ? paginationStyles.navBtnDisabled : {}) }} onClick={() => onPageChange(totalPages)} disabled={currentPage === totalPages}>»</button>
      </div>
    </div>
  )
}

function TabPagination({ currentPage, lastPage, onPageChange }) {
  if (lastPage <= 1) return null
  return (
    <div style={profileStyles.tabPager}>
      <button
        style={{ ...profileStyles.tabPagerBtn, ...(currentPage === 1 ? profileStyles.tabPagerBtnDisabled : {}) }}
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        disabled={currentPage === 1}
      >
        ‹ Previous
      </button>
      <span style={profileStyles.tabPagerInfo}>Page {currentPage} of {lastPage}</span>
      <button
        style={{ ...profileStyles.tabPagerBtn, ...(currentPage === lastPage ? profileStyles.tabPagerBtnDisabled : {}) }}
        onClick={() => onPageChange(Math.min(lastPage, currentPage + 1))}
        disabled={currentPage === lastPage}
      >
        Next ›
      </button>
    </div>
  )
}

function ProfilePhotoUpload({ file, setFile, existingUrl }) {
  const inputRef = useRef(null)
  const previewUrl = file ? URL.createObjectURL(file) : existingUrl

  return (
    <div style={modalStyles.photoUploadWrap}>
      <div style={modalStyles.photoPreview} onClick={() => inputRef.current?.click()}>
        {previewUrl ? (
          <img src={previewUrl} alt="Profile preview" style={modalStyles.photoPreviewImg} />
        ) : (
          <span style={modalStyles.photoPlaceholder}>+</span>
        )}
      </div>
      <div>
        <div style={modalStyles.photoUploadLabel}>Owner Profile Photo</div>
        <div style={modalStyles.photoUploadHint}>Optional. JPG or PNG, up to 5MB.</div>
        <span style={modalStyles.photoUploadBtn} onClick={() => inputRef.current?.click()}>
          {previewUrl ? 'Change photo' : 'Upload photo'}
        </span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={e => setFile(e.target.files?.[0] || null)}
      />
    </div>
  )
}

function RegisterModal({ onClose, onSuccess, isMobile }) {
  const [step, setStep] = useState('owner')

  const [ownerForm, setOwnerForm] = useState({
    first_name: '', last_name: '', mobile_number: '', email: '', address: '',
  })
  const [profilePhoto, setProfilePhoto] = useState(null)
  const [ownerId, setOwnerId] = useState(null)
  const [ownerError, setOwnerError] = useState('')
  const [ownerLoading, setOwnerLoading] = useState(false)
  const [smsWarning, setSmsWarning] = useState('')

  const [farmsList, setFarmsList] = useState([emptyFarm()])
  const [farmsError, setFarmsError] = useState('')
  const [farmsLoading, setFarmsLoading] = useState(false)

  const updateOwner = (key) => (e) => setOwnerForm({ ...ownerForm, [key]: e.target.value })

  const handleOwnerSubmit = async (e) => {
    e.preventDefault()
    setOwnerError('')
    setOwnerLoading(true)
    try {
      const formData = new FormData()
      formData.append('first_name', ownerForm.first_name)
      formData.append('last_name', ownerForm.last_name)
      formData.append('mobile_number', ownerForm.mobile_number)
      if (ownerForm.email) formData.append('email', ownerForm.email)
      if (ownerForm.address) formData.append('address', ownerForm.address)
      if (profilePhoto) formData.append('profile_photo', profilePhoto)

      const res = await api.post('/admin/farm-owners', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setOwnerId(res.data.id)
      if (res.data.delivered === false) {
        setSmsWarning('Owner account created, but the SMS with the temporary password failed to send.')
      }
      setStep('farms')
    } catch (err) {
      setOwnerError(err.response?.data?.message || 'Failed to register farm owner.')
    } finally {
      setOwnerLoading(false)
    }
  }

  const updateFarm = (localId, field, value) => {
    setFarmsList(list => list.map(f => (f.localId === localId ? { ...f, [field]: value } : f)))
  }
  const addFarm = () => setFarmsList(list => [...list, emptyFarm()])
  const removeFarm = (localId) => setFarmsList(list => list.filter(f => f.localId !== localId))

  const handleFarmsSubmit = async (e) => {
    e.preventDefault()
    setFarmsError('')

    for (const f of farmsList) {
      if (!f.farm_name || !f.farm_size || !f.barangay) {
        setFarmsError('Please complete every required field for each farm.')
        return
      }
      if (f.latitude == null || f.longitude == null) {
        setFarmsError(`Please pin "${f.farm_name || 'a farm'}"'s exact location on the map so it can be saved.`)
        return
      }
    }

    setFarmsLoading(true)
    try {
      await Promise.all(
        farmsList.map(f =>
          api.post('/admin/farms', {
            farm_owner_id: ownerId,
            farm_name: f.farm_name,
            farm_size: f.farm_size,
            barangay: f.barangay,
            landmark: f.landmark,
            address: f.address,
            latitude: f.latitude,
            longitude: f.longitude,
          })
        )
      )
      onSuccess()
    } catch (err) {
      setFarmsError(err.response?.data?.message || 'Failed to save one or more farms.')
    } finally {
      setFarmsLoading(false)
    }
  }

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={{ ...modalStyles.modal, ...(isMobile ? modalStyles.modalMobile : {}), ...modalStyles.modalWide }} onClick={e => e.stopPropagation()}>
        <div style={modalStyles.header}>
          <h3 style={modalStyles.title}>Register Farm Owner & Farm</h3>
          <span style={modalStyles.close} onClick={onClose}>×</span>
        </div>

        <p style={modalStyles.instruction}>
          All fields marked <span style={modalStyles.requiredMark}>*</span> are required. Please complete the form before submitting.
        </p>

        <div style={modalStyles.stepper}>
          <StepPill number={1} label="Owner Info" active={step === 'owner'} done={step === 'farms'} />
          <div style={modalStyles.stepperLine} />
          <StepPill number={2} label="Farm(s)" active={step === 'farms'} done={false} />
        </div>

        {step === 'owner' && (
          <form onSubmit={handleOwnerSubmit}>
            {ownerError && <div style={modalStyles.errorBox}>{ownerError}</div>}

            <div style={modalStyles.sectionLabel}>OWNER ACCOUNT DETAILS</div>

            <ProfilePhotoUpload file={profilePhoto} setFile={setProfilePhoto} />

            <div style={{ ...modalStyles.row, ...(isMobile ? modalStyles.rowMobile : {}) }}>
              <div>
                <Label text="First Name" required />
                <input placeholder="First Name" value={ownerForm.first_name} onChange={updateOwner('first_name')} style={modalStyles.input} required />
              </div>
              <div>
                <Label text="Last Name" required />
                <input placeholder="Last Name" value={ownerForm.last_name} onChange={updateOwner('last_name')} style={modalStyles.input} required />
              </div>
            </div>

            <Label text="Mobile Number" required />
            <input placeholder="e.g. 0917 123 4567" value={ownerForm.mobile_number} onChange={updateOwner('mobile_number')} style={modalStyles.inputFull} required />

            <Label text="Email Address" />
            <input type="email" placeholder="Optional" value={ownerForm.email} onChange={updateOwner('email')} style={modalStyles.inputFull} />
            <p style={modalStyles.mapHint}>Both mobile number and email (if provided) can be used to log in.</p>

            <Label text="Owner Address" required />
            <input placeholder="House/Lot No., Street, Barangay" value={ownerForm.address} onChange={updateOwner('address')} style={modalStyles.inputFull} required />

            <p style={modalStyles.hint}>
              A temporary password will be generated and sent to the owner's mobile number via SMS. The owner must change it on their first login, and can log in afterward using either their mobile number or email (if provided). The owner is registered once — you'll add their farm(s) in the next step.
            </p>

            <div style={{ ...modalStyles.actions, ...(isMobile ? modalStyles.actionsMobile : {}) }}>
              <button type="button" onClick={onClose} style={{ ...modalStyles.cancelBtn, ...(isMobile ? modalStyles.btnFull : {}) }}>Cancel</button>
              <button type="submit" disabled={ownerLoading} style={{ ...modalStyles.submitBtn, ...(isMobile ? modalStyles.btnFull : {}) }}>
                {ownerLoading ? 'Creating Owner...' : 'Next: Add Farm(s) →'}
              </button>
            </div>
          </form>
        )}

        {step === 'farms' && (
          <form onSubmit={handleFarmsSubmit}>
            {smsWarning && <div style={modalStyles.warnBox}>{smsWarning}</div>}
            {farmsError && <div style={modalStyles.errorBox}>{farmsError}</div>}

            <div style={modalStyles.ownerBanner}>
              Adding farm(s) for <strong>{ownerForm.first_name} {ownerForm.last_name}</strong>
            </div>

            {farmsList.map((farm, idx) => (
              <FarmEntry
                key={farm.localId}
                index={idx}
                farm={farm}
                isMobile={isMobile}
                canRemove={farmsList.length > 1}
                onChange={(field, value) => updateFarm(farm.localId, field, value)}
                onRemove={() => removeFarm(farm.localId)}
              />
            ))}

            <button type="button" onClick={addFarm} style={modalStyles.addFarmBtn}>+ Add Another Farm</button>

            <div style={{ ...modalStyles.actions, ...(isMobile ? modalStyles.actionsMobile : {}) }}>
              <button type="button" onClick={onClose} style={{ ...modalStyles.cancelBtn, ...(isMobile ? modalStyles.btnFull : {}) }}>Cancel</button>
              <button type="submit" disabled={farmsLoading} style={{ ...modalStyles.submitBtn, ...(isMobile ? modalStyles.btnFull : {}) }}>
                {farmsLoading ? 'Saving Farm(s)...' : `Save ${farmsList.length > 1 ? `${farmsList.length} Farms` : 'Farm'}`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function AddFarmModal({ onClose, onSuccess, isMobile }) {
  const [ownerQuery, setOwnerQuery] = useState('')
  const [ownerResults, setOwnerResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [selectedOwner, setSelectedOwner] = useState(null)
  const debounceRef = useRef(null)

  const [farmsList, setFarmsList] = useState([emptyFarm()])
  const [farmsError, setFarmsError] = useState('')
  const [farmsLoading, setFarmsLoading] = useState(false)

  const handleOwnerQueryChange = (value) => {
    setOwnerQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (value.trim().length < 2) { setOwnerResults([]); return }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await api.get('/admin/farm-owners', { params: { search: value } })
        setOwnerResults(res.data.data || [])
      } catch {
        setOwnerResults([])
      } finally {
        setSearching(false)
      }
    }, 350)
  }

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current) }, [])

  const updateFarm = (localId, field, value) => {
    setFarmsList(list => list.map(f => (f.localId === localId ? { ...f, [field]: value } : f)))
  }
  const addFarm = () => setFarmsList(list => [...list, emptyFarm()])
  const removeFarm = (localId) => setFarmsList(list => list.filter(f => f.localId !== localId))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFarmsError('')

    for (const f of farmsList) {
      if (!f.farm_name || !f.farm_size || !f.barangay) {
        setFarmsError('Please complete every required field for each farm.')
        return
      }
      if (f.latitude == null || f.longitude == null) {
        setFarmsError(`Please pin "${f.farm_name || 'a farm'}"'s exact location on the map so it can be saved.`)
        return
      }
    }

    setFarmsLoading(true)
    try {
      await Promise.all(
        farmsList.map(f =>
          api.post('/admin/farms', {
            farm_owner_id: selectedOwner.id,
            farm_name: f.farm_name,
            farm_size: f.farm_size,
            barangay: f.barangay,
            landmark: f.landmark,
            address: f.address,
            latitude: f.latitude,
            longitude: f.longitude,
          })
        )
      )
      onSuccess()
    } catch (err) {
      setFarmsError(err.response?.data?.message || 'Failed to save one or more farms.')
    } finally {
      setFarmsLoading(false)
    }
  }

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={{ ...modalStyles.modal, ...(isMobile ? modalStyles.modalMobile : {}), ...modalStyles.modalWide }} onClick={e => e.stopPropagation()}>
        <div style={modalStyles.header}>
          <h3 style={modalStyles.title}>Add Farm to Existing Owner</h3>
          <span style={modalStyles.close} onClick={onClose}>×</span>
        </div>

        {!selectedOwner && (
          <>
            <p style={modalStyles.instruction}>
              Search for the owner by name or mobile number, then select them to add a new farm under their existing account.
            </p>

            <div style={{ position: 'relative' }}>
              <input
                placeholder="Search owner name or mobile number..."
                value={ownerQuery}
                onChange={e => handleOwnerQueryChange(e.target.value)}
                style={modalStyles.inputFull}
                autoFocus
              />
              {searching && <span style={modalStyles.geocodeSpinner}>Searching...</span>}
            </div>

            {ownerResults.length > 0 && (
              <div style={modalStyles.ownerResultsList}>
                {ownerResults.map(o => (
                  <div key={o.id} style={modalStyles.ownerResultItem} onClick={() => setSelectedOwner(o)}>
                    <div style={modalStyles.ownerResultName}>{o.first_name} {o.last_name}</div>
                    <div style={modalStyles.ownerResultMeta}>
                      {o.mobile_number || o.email} · {o.farm_count} farm{o.farm_count === 1 ? '' : 's'} registered
                    </div>
                  </div>
                ))}
              </div>
            )}

            {ownerQuery.trim().length >= 2 && !searching && ownerResults.length === 0 && (
              <div style={modalStyles.ownerEmptyResult}>No matching owner found.</div>
            )}

            <div style={{ ...modalStyles.actions, ...(isMobile ? modalStyles.actionsMobile : {}) }}>
              <button type="button" onClick={onClose} style={{ ...modalStyles.cancelBtn, ...(isMobile ? modalStyles.btnFull : {}) }}>Cancel</button>
            </div>
          </>
        )}

        {selectedOwner && (
          <form onSubmit={handleSubmit}>
            <div style={modalStyles.ownerBanner}>
              Adding farm(s) for <strong>{selectedOwner.first_name} {selectedOwner.last_name}</strong> ({selectedOwner.mobile_number || selectedOwner.email})
              {' — '}
              <span style={modalStyles.changeOwnerLink} onClick={() => { setSelectedOwner(null); setOwnerResults([]); setOwnerQuery('') }}>Change owner</span>
            </div>

            {farmsError && <div style={modalStyles.errorBox}>{farmsError}</div>}

            {farmsList.map((farm, idx) => (
              <FarmEntry
                key={farm.localId}
                index={idx}
                farm={farm}
                isMobile={isMobile}
                canRemove={farmsList.length > 1}
                onChange={(field, value) => updateFarm(farm.localId, field, value)}
                onRemove={() => removeFarm(farm.localId)}
              />
            ))}

            <button type="button" onClick={addFarm} style={modalStyles.addFarmBtn}>+ Add Another Farm</button>

            <div style={{ ...modalStyles.actions, ...(isMobile ? modalStyles.actionsMobile : {}) }}>
              <button type="button" onClick={onClose} style={{ ...modalStyles.cancelBtn, ...(isMobile ? modalStyles.btnFull : {}) }}>Cancel</button>
              <button type="submit" disabled={farmsLoading} style={{ ...modalStyles.submitBtn, ...(isMobile ? modalStyles.btnFull : {}) }}>
                {farmsLoading ? 'Saving Farm(s)...' : `Save ${farmsList.length > 1 ? `${farmsList.length} Farms` : 'Farm'}`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function StepPill({ number, label, active, done }) {
  return (
    <div style={{ ...modalStyles.stepPill, ...(active ? modalStyles.stepPillActive : {}), ...(done ? modalStyles.stepPillDone : {}) }}>
      <span style={{ ...modalStyles.stepPillNum, ...(active || done ? modalStyles.stepPillNumActive : {}) }}>{done ? '✓' : number}</span>
      <span>{label}</span>
    </div>
  )
}

function Label({ text, required }) {
  return <label style={modalStyles.label}>{text} {required && <span style={modalStyles.requiredMark}>*</span>}</label>
}

function FarmEntry({ index, farm, isMobile, canRemove, onChange, onRemove }) {
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [geocodeLoading, setGeocodeLoading] = useState(false)
  const [geocodeError, setGeocodeError] = useState('')
  const debounceRef = useRef(null)

  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)

  const addOrMoveMarker = (lat, lng) => {
    if (!mapRef.current) return
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng])
    } else {
      const marker = L.marker([lat, lng], { draggable: true }).addTo(mapRef.current)
      marker.on('dragend', () => {
        const pos = marker.getLatLng()
        onChange('latitude', pos.lat)
        onChange('longitude', pos.lng)
      })
      markerRef.current = marker
    }
  }

  const placeMarker = (lat, lng) => {
    addOrMoveMarker(lat, lng)
    onChange('latitude', lat)
    onChange('longitude', lng)
  }

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    const hasExisting = farm.latitude != null && farm.longitude != null
    const initialCenter = hasExisting ? [farm.latitude, farm.longitude] : SAN_JOSE_CENTER

    const map = L.map(mapContainerRef.current).setView(initialCenter, hasExisting ? 16 : 13)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map)

    map.on('click', (e) => placeMarker(e.latlng.lat, e.latlng.lng))

    mapRef.current = map

    if (hasExisting) addOrMoveMarker(farm.latitude, farm.longitude)

    setTimeout(() => map.invalidateSize(), 200)

    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleBarangayChange = async (value) => {
    onChange('barangay', value)
    if (!value || !mapRef.current) return
    try {
      const results = await geocodeAddress(value)
      if (results[0]) {
        mapRef.current.flyTo([parseFloat(results[0].lat), parseFloat(results[0].lon)], 15, { duration: 0.6 })
      }
    } catch { /* silent */ }
  }

  const handleAddressChange = (value) => {
    onChange('address', value)
    setGeocodeError('')

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (value.trim().length < 3) { setSuggestions([]); return }
      setGeocodeLoading(true)
      try {
        const results = await geocodeAddress(value)
        setSuggestions(results)
        setShowSuggestions(true)
      } catch {
        setGeocodeError('Could not look up that address — try a different search, or just click directly on the map instead.')
      } finally {
        setGeocodeLoading(false)
      }
    }, 400)
  }

  const selectSuggestion = (s) => {
    onChange('address', s.display_name)
    const lat = parseFloat(s.lat)
    const lng = parseFloat(s.lon)
    if (mapRef.current) mapRef.current.flyTo([lat, lng], 17, { duration: 0.6 })
    placeMarker(lat, lng)
    setShowSuggestions(false)
    setSuggestions([])
  }

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current) }, [])

  return (
    <div style={modalStyles.farmBlock}>
      <div style={modalStyles.farmBlockHeader}>
        <span style={modalStyles.farmBlockTitle}>Farm {index + 1}</span>
        {canRemove && <span style={modalStyles.removeFarmBtn} onClick={onRemove}>Remove</span>}
      </div>

      <Label text="Farm Name" required />
      <input placeholder="Farm Name" value={farm.farm_name} onChange={e => onChange('farm_name', e.target.value)} style={modalStyles.inputFull} required />

      <Label text="Farm Size" required />
      <select value={farm.farm_size} onChange={e => onChange('farm_size', e.target.value)} style={modalStyles.inputFull} required>
        <option value="">Farm Size</option>
        <option value="Small">Small (below 10,000 layers)</option>
        <option value="Medium">Medium (10,000–50,000 layers)</option>
        <option value="Large">Large (above 50,000 layers)</option>
      </select>

      <Label text="Barangay" required />
      <select value={farm.barangay} onChange={e => handleBarangayChange(e.target.value)} style={modalStyles.inputFull} required>
        <option value="">-- Select Barangay --</option>
        {BARANGAYS.map(b => <option key={b} value={b}>Brgy. {b}</option>)}
      </select>
      <p style={modalStyles.mapHint}>Selecting a barangay moves the map below to that area.</p>

      <Label text="Landmark (optional)" />
      <input placeholder="Landmark (optional)" value={farm.landmark} onChange={e => onChange('landmark', e.target.value)} style={modalStyles.inputFull} />

      <Label text="Search Address (optional)" />
      <div style={{ position: 'relative' }}>
        <input
          placeholder="Search to jump the map there, or just click below..."
          value={farm.address}
          onChange={e => handleAddressChange(e.target.value)}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          style={modalStyles.inputFull}
        />
        {geocodeLoading && <span style={modalStyles.geocodeSpinner}>Searching...</span>}
        {showSuggestions && suggestions.length > 0 && (
          <div style={modalStyles.dropdownList}>
            {suggestions.map((s, i) => (
              <div key={i} style={modalStyles.dropdownItem} onClick={() => selectSuggestion(s)}>{s.display_name}</div>
            ))}
          </div>
        )}
      </div>
      {geocodeError && <div style={modalStyles.geocodeError}>{geocodeError}</div>}

      <Label text="Pin Exact Farm Location" required />
      <p style={modalStyles.mapHint}>Click anywhere on the map to drop a pin, or drag the pin to fine-tune it.</p>
      <div ref={mapContainerRef} style={modalStyles.mapContainer} />

      {farm.latitude != null && farm.longitude != null && (
        <div style={modalStyles.geotagConfirmed}>✓ Location pinned for this farm</div>
      )}
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
    mobile_number: farm.mobile_number || '',
    email: farm.email || '',
    farm_size: farm.farm_size,
  })
  const [profilePhoto, setProfilePhoto] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('_method', 'PUT')
      Object.entries(form).forEach(([key, value]) => {
        if (value !== '' && value != null) formData.append(key, value)
      })
      if (profilePhoto) formData.append('profile_photo', profilePhoto)

      await api.post(`/admin/farms/${farm.id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
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

          <ProfilePhotoUpload file={profilePhoto} setFile={setProfilePhoto} existingUrl={farm.profile_photo_url} />

          <Label text="Farm Name" required />
          <input placeholder="Farm Name" value={form.farm_name} onChange={update('farm_name')} style={modalStyles.inputFull} required />

          <div style={{ ...modalStyles.row, ...(isMobile ? modalStyles.rowMobile : {}) }}>
            <input placeholder="Lot No. (optional)" value={form.lot_number} onChange={update('lot_number')} style={modalStyles.input} />
            <input placeholder="Street (optional)" value={form.street} onChange={update('street')} style={modalStyles.input} />
          </div>

          <Label text="Barangay" required />
          <select value={form.barangay} onChange={update('barangay')} style={modalStyles.inputFull} required>
            {BARANGAYS.map(b => <option key={b} value={b}>Brgy. {b}</option>)}
          </select>

          <input placeholder="Landmark (optional)" value={form.landmark} onChange={update('landmark')} style={modalStyles.inputFull} />

          <Label text="Farm Size" required />
          <select value={form.farm_size} onChange={update('farm_size')} style={modalStyles.inputFull} required>
            <option value="Small">Small (below 10,000 layers)</option>
            <option value="Medium">Medium (10,000–50,000 layers)</option>
            <option value="Large">Large (above 50,000 layers)</option>
          </select>

          <Label text="Mobile Number" required />
          <input placeholder="Mobile Number" value={form.mobile_number} onChange={update('mobile_number')} style={modalStyles.inputFull} required />

          <Label text="Email Address" />
          <input type="email" placeholder="Optional" value={form.email} onChange={update('email')} style={modalStyles.inputFull} />

          <div style={{ ...modalStyles.actions, ...(isMobile ? modalStyles.actionsMobile : {}) }}>
            <button type="button" onClick={onClose} style={{ ...modalStyles.cancelBtn, ...(isMobile ? modalStyles.btnFull : {}) }}>Cancel</button>
            <button type="submit" disabled={loading} style={{ ...modalStyles.submitBtn, ...(isMobile ? modalStyles.btnFull : {}) }}>
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Lightbox({ src, alt, onClose }) {
  const handleOverlayClick = (e) => {
    e.stopPropagation()
    onClose()
  }

  const handleCloseClick = (e) => {
    e.stopPropagation()
    onClose()
  }

  return (
    <div style={lightboxStyles.overlay} onClick={handleOverlayClick}>
      <button style={lightboxStyles.closeBtn} onClick={handleCloseClick} aria-label="Close preview">×</button>
      <img src={src} alt={alt} style={lightboxStyles.image} onClick={e => e.stopPropagation()} />
    </div>
  )
}

function ViewFarmModal({ farmId, onClose, isMobile }) {
  const { data: farm, loading, error } = useCachedFetch(`/admin/farms/${farmId}`)
  const [lightboxImage, setLightboxImage] = useState(null)
  const [activeTab, setActiveTab] = useState('info')

  const [cleanoutPage, setCleanoutPage] = useState(1)
  const [disposalPage, setDisposalPage] = useState(1)
  const [inspectionPage, setInspectionPage] = useState(1)

  const { data: cleanoutData, loading: cleanoutLoading } = useCachedFetch(
    activeTab === 'cleanout' ? `/admin/farms/${farmId}/maintenance-logs` : null, { page: cleanoutPage }
  )
  const { data: disposalData, loading: disposalLoading } = useCachedFetch(
    activeTab === 'disposal' ? `/admin/farms/${farmId}/disposal-records` : null, { page: disposalPage }
  )
  const { data: inspectionData, loading: inspectionLoading } = useCachedFetch(
    activeTab === 'inspections' ? `/admin/farms/${farmId}/inspection-records` : null, { page: inspectionPage }
  )

  const reading = farm?.sensor_readings?.[0] ?? farm?.sensorReadings?.[0] ?? null
  const initials = farm ? getInitials(farm.owner_name) : ''
  const isActive = farm?.status === 'Active'
  const isSensorOnline = !!reading
  const riskLevel = farm?.current_status || (reading ? 'Normal' : null)

  const { data: insight, loading: insightLoading } = useCachedFetch(
    reading ? `/admin/farms/${farmId}/root-cause` : null
  )

  const STATUS = {
    Normal:   { color: '#256b3d', bg: '#eaf3ec', border: '#cfe0d3' },
    Warning:  { color: '#b45309', bg: '#fbf1e2', border: '#f0e2cf' },
    Critical: { color: '#b91c1c', bg: '#fbeaea', border: '#f0c9c9' },
    Offline:  { color: '#6b7280', bg: '#eef1ea', border: '#e0e3da' },
  }
  const overall = STATUS[riskLevel] || STATUS.Offline

  const tabs = [
    { key: 'info', label: 'Farm Information' },
    { key: 'cleanout', label: 'Manure Clean-out' },
    { key: 'disposal', label: 'Manure Disposal' },
    { key: 'inspections', label: 'Inspections' },
  ]

  return (
    <div style={profileStyles.overlay} onClick={onClose}>
      <div style={{ ...profileStyles.modal, ...(isMobile ? profileStyles.modalMobile : {}) }} onClick={e => e.stopPropagation()}>

        {loading && <div style={profileStyles.stateMsg}>Loading farm profile…</div>}
        {error && <div style={{ ...profileStyles.stateMsg, color: '#b91c1c' }}>{error}</div>}

        {farm && (
          <>
            <div style={{ ...profileStyles.header, ...(isMobile ? profileStyles.headerMobile : {}) }}>
              <div style={profileStyles.avatarWrap}>
                {farm.owner_profile_photo_url ? (
                  <img src={farm.owner_profile_photo_url} alt={farm.owner_name} style={profileStyles.avatarImg} />
                ) : (
                  <span style={profileStyles.avatarInitials}>{initials || '—'}</span>
                )}
              </div>
              <div style={profileStyles.headerText}>
                <div style={profileStyles.ownerNameLarge}>{farm.owner_name}</div>
                <div style={profileStyles.farmNameRow}>{farm.farm_name} &nbsp;·&nbsp; Farm #{farm.id}</div>
              </div>
              <span style={{
                ...profileStyles.statusPill,
                color: isActive ? '#2c8047' : '#6b7280',
                backgroundColor: isActive ? '#eaf3ec' : '#f0f1ec',
              }}>
                <span style={{ ...profileStyles.pillDot, backgroundColor: isActive ? '#2c8047' : '#6b7280' }} />
                {farm.status}
              </span>
              <button style={profileStyles.closeBtn} onClick={onClose} aria-label="Close">×</button>
            </div>

            <div style={profileStyles.tabsRow}>
              {tabs.map(t => (
                <button
                  key={t.key}
                  style={{ ...profileStyles.tab, ...(activeTab === t.key ? profileStyles.tabActive : {}) }}
                  onClick={() => setActiveTab(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div style={profileStyles.body}>

              {activeTab === 'info' && (
                <>
                  <Section title="Farm Information">
                    <div style={profileStyles.infoGrid}>
                      <InfoCell label="Address" value={farm.address} />
                      <InfoCell label="Contact Number" value={farm.mobile_number} />
                      <InfoCell label="Barangay" value={farm.barangay} />
                      <InfoCell label="Farm Size" value={farm.farm_size} />
                      <InfoCell label="Email" value={farm.user?.email} />
                      <InfoCell label="Date Registered" value={formatRegistrationDate(farm.created_at)} />
                    </div>
                  </Section>

                  <Section title="Sensor & Monitoring">
                    <div style={profileStyles.infoGrid}>
                      <InfoCell label="Device Name" value={reading?.sensor?.label || reading?.sensor?.sensor_code} />
                      <div>
                        <div style={profileStyles.infoLabel}>Sensor Status</div>
                        <span style={{
                          ...profileStyles.miniPill,
                          color: isSensorOnline ? '#2c8047' : '#9ca3af',
                          backgroundColor: isSensorOnline ? '#eaf3ec' : '#f0f1ec',
                        }}>
                          <span style={{ ...profileStyles.pillDot, backgroundColor: isSensorOnline ? '#2c8047' : '#9ca3af' }} />
                          {isSensorOnline ? 'Online' : 'Offline'}
                        </span>
                      </div>
                      <InfoCell label="Last Synchronization" value={reading?.created_at ? new Date(reading.created_at).toLocaleString() : null} />
                    </div>

                    {reading ? (
                      <>
                        <div style={profileStyles.sensorList}>
                          <SensorStat label="Ammonia" value={reading.ammonia} unit="ppm" status={reading.ammonia_status} STATUS={STATUS} />
                          <SensorStat label="Temperature" value={reading.temperature} unit="°C" status={reading.temperature_status} STATUS={STATUS} />
                          <SensorStat label="Humidity" value={reading.humidity} unit="%" status={reading.humidity_status} STATUS={STATUS} />
                          <SensorStat label="Moisture" value={reading.moisture} unit="%" status={reading.moisture_status} STATUS={STATUS} last />
                        </div>
                        {riskLevel && (
                          <div style={profileStyles.overallRow}>
                            <span style={profileStyles.overallLabel}>Overall Farm Status</span>
                            <span style={{ ...profileStyles.overallBadge, color: overall.color, backgroundColor: overall.bg, borderColor: overall.border }}>
                              <span style={{ ...profileStyles.pillDot, backgroundColor: overall.color }} />
                              {riskLevel}
                            </span>
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={profileStyles.empty}>No sensor connected to this farm yet.</div>
                    )}
                  </Section>

                  {reading && (
                    <Section title="AI Insight">
                      {insightLoading && <div style={profileStyles.empty}>Analyzing sensor data…</div>}
                      {!insightLoading && insight && (
                        <div style={profileStyles.insightCard}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={profileStyles.insightHeader}>
                              <span style={profileStyles.insightRootCause}>{insight.diagnosis.root_cause}</span>
                              <span style={{ ...profileStyles.confidenceTag, color: overall.color, backgroundColor: overall.bg }}>{insight.diagnosis.confidence}% confidence</span>
                            </div>
                            {insight.explanation ? (
                              <p style={profileStyles.insightExplanation}>{insight.explanation}</p>
                            ) : (
                              <p style={profileStyles.insightExplanationUnavailable}>Explanation unavailable right now — the diagnosis above is still accurate.</p>
                            )}
                          </div>
                        </div>
                      )}
                      {!insightLoading && !insight && <div style={profileStyles.empty}>Insight unavailable for this farm right now.</div>}
                    </Section>
                  )}
                </>
              )}

              {activeTab === 'cleanout' && (
                <Section title="Manure Clean-out" badge={farm.maintenance_status?.status} badgeColor={maintBadgeColor(farm.maintenance_status?.status)}>
                  <div style={profileStyles.infoGrid}>
                    <InfoCell label="Last Logged" value={farm.maintenance_status?.last_performed_at || 'No clean-out logged yet'} />
                    <InfoCell label="Days Since" value={farm.maintenance_status ? `${farm.maintenance_status.days_since} of ~${farm.maintenance_status.expected_interval_days} expected` : null} />
                  </div>

                  {cleanoutLoading && <div style={profileStyles.empty}>Loading…</div>}
                  {!cleanoutLoading && (cleanoutData?.logs?.length ?? 0) === 0 && (
                    <div style={profileStyles.empty}>No clean-out records logged for this farm yet.</div>
                  )}
                  {!cleanoutLoading && cleanoutData?.logs?.length > 0 && (
                    <>
                      <div style={profileStyles.logsList}>
                        {cleanoutData.logs.map(log => (
                          <div key={log.id} style={profileStyles.logRow}>
                            <img src={log.photo_url} alt="Clean-out proof" style={profileStyles.logThumb} onClick={() => setLightboxImage(log.photo_url)} />
                            <div style={{ minWidth: 0 }}>
                              <div style={profileStyles.logDate}>{log.performed_at}</div>
                              <div style={profileStyles.logNote}>{log.notes || 'No notes provided'}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <TabPagination currentPage={cleanoutData.current_page} lastPage={cleanoutData.last_page} onPageChange={setCleanoutPage} />
                    </>
                  )}
                </Section>
              )}

              {activeTab === 'disposal' && (
                <Section title="Manure Disposal Records">
                  {disposalLoading && <div style={profileStyles.empty}>Loading…</div>}
                  {!disposalLoading && (disposalData?.records?.length ?? 0) === 0 && (
                    <div style={profileStyles.empty}>No disposal records logged for this farm yet.</div>
                  )}
                  {!disposalLoading && disposalData?.records?.length > 0 && (
                    <>
                      <div style={profileStyles.logsList}>
                        {disposalData.records.map(r => (
                          <div key={r.id} style={profileStyles.textRow}>
                            <div style={profileStyles.logDate}>{r.disposal_date} — {r.disposal_method}</div>
                            <div style={profileStyles.logNote}>
                              {r.quantity} kg{r.buyer_name ? ` · ${r.buyer_name}` : ''}{r.notes ? ` · ${r.notes}` : ''}
                            </div>
                          </div>
                        ))}
                      </div>
                      <TabPagination currentPage={disposalData.current_page} lastPage={disposalData.last_page} onPageChange={setDisposalPage} />
                    </>
                  )}
                </Section>
              )}

              {activeTab === 'inspections' && (
                <Section title="Inspection Summary">
                  {inspectionLoading && <div style={profileStyles.empty}>Loading…</div>}
                  {!inspectionLoading && (inspectionData?.inspections?.length ?? 0) === 0 && (
                    <div style={profileStyles.empty}>No inspections recorded for this farm yet.</div>
                  )}
                  {!inspectionLoading && inspectionData?.inspections?.length > 0 && (
                    <>
                      <div style={profileStyles.logsList}>
                        {inspectionData.inspections.map(i => {
                          const done = i.status === 'Completed'
                          return (
                            <div key={i.id} style={profileStyles.inspectionRow}>
                              <div style={{ minWidth: 0 }}>
                                <div style={profileStyles.logDate}>{i.inspection_type}</div>
                                <div style={profileStyles.logNote}>
                                  {done ? `Completed ${i.completed_at}` : `Scheduled ${i.scheduled_at}`}
                                </div>
                              </div>
                              <span style={{
                                ...profileStyles.miniPill,
                                color: done ? '#256b3d' : '#b45309',
                                backgroundColor: done ? '#eaf3ec' : '#fbf1e2',
                              }}>{i.status}</span>
                            </div>
                          )
                        })}
                      </div>
                      <TabPagination currentPage={inspectionData.current_page} lastPage={inspectionData.last_page} onPageChange={setInspectionPage} />
                    </>
                  )}
                </Section>
              )}

            </div>

            <div style={profileStyles.footer}>
              <button onClick={onClose} style={profileStyles.closeFooterBtn}>Close</button>
            </div>
          </>
        )}
      </div>

      {lightboxImage && <Lightbox src={lightboxImage} alt="Clean-out proof" onClose={() => setLightboxImage(null)} />}
    </div>
  )
}

function Section({ title, children, badge, badgeColor }) {
  return (
    <div style={profileStyles.section}>
      <div style={profileStyles.sectionHeader}>
        <span style={profileStyles.sectionTitle}>{title}</span>
        {badge && (
          <span style={{ ...profileStyles.sectionBadge, color: badgeColor, backgroundColor: `${badgeColor}18` }}>{badge}</span>
        )}
      </div>
      {children}
    </div>
  )
}

function InfoRow({ children, last }) {
  return <div style={{ ...profileStyles.infoRow, ...(last ? profileStyles.infoRowLast : {}) }}>{children}</div>
}

function maintBadgeColor(status) {
  if (status === 'Overdue') return '#b91c1c'
  if (status === 'Due') return '#b45309'
  return '#2c8047'
}

function InfoCell({ label, value }) {
  return (
    <div style={profileStyles.infoCell}>
      <div style={profileStyles.infoLabel}>{label}</div>
      <div style={profileStyles.infoValue}>{value || value === 0 ? value : '—'}</div>
    </div>
  )
}

function SensorStat({ label, value, unit, status, STATUS, last }) {
  const s = STATUS[status] || STATUS.Offline
  return (
    <div style={{ ...profileStyles.sensorRow, ...(last ? profileStyles.sensorRowLast : {}) }}>
      <span style={profileStyles.sensorRowLabel}>{label}</span>
      <div style={profileStyles.sensorRowRight}>
        <span style={{ ...profileStyles.sensorRowValue, color: s.color }}>
          {value !== null && value !== undefined ? `${value} ${unit}` : '—'}
        </span>
        {status && (
          <span style={{ ...profileStyles.sensorRowStatus, color: s.color }}>{status}</span>
        )}
      </div>
    </div>
  )
}

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '22px' },
  headerMobile: { flexDirection: 'column', gap: '14px' },
  title: { fontSize: '24px', fontWeight: 800, letterSpacing: '-0.015em', color: '#16311d', margin: 0 },
  titleMobile: { fontSize: '20px' },
  subtitle: { fontSize: '13.5px', color: '#6b7770', marginTop: '5px' },
  newBtn: { display: 'inline-flex', alignItems: 'center', gap: '7px', backgroundColor: '#2c8047', color: '#fff', border: 'none', borderRadius: '10px', padding: '10px 18px', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer' },
  secondaryBtn: { display: 'inline-flex', alignItems: 'center', gap: '7px', backgroundColor: '#fff', color: '#2c8047', border: '1px solid #cfe0d3', borderRadius: '10px', padding: '10px 16px', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer' },
  btnFull: { width: '100%', boxSizing: 'border-box', justifyContent: 'center' },

  statusTabs: { display: 'flex', gap: '4px', marginBottom: '18px', borderBottom: '1px solid #e7e8e0' },
  statusTab: { padding: '10px 18px', fontSize: '14px', fontWeight: 700, color: '#6b7770', cursor: 'pointer', borderBottom: '2px solid transparent' },
  statusTabActive: { color: '#2c8047', borderBottom: '2px solid #2c8047' },

  filters: { display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' },
  filtersMobile: { flexDirection: 'column' },
  searchInput: { flex: 1, padding: '11px 14px', borderRadius: '10px', border: '1px solid #dcdfd6', fontSize: '14px', boxSizing: 'border-box', width: '100%', backgroundColor: '#fff', color: '#16311d' },
  select: { padding: '11px 14px', borderRadius: '10px', border: '1px solid #dcdfd6', fontSize: '13.5px', color: '#33413a', backgroundColor: '#fff', cursor: 'pointer' },
  selectMobile: { width: '100%', boxSizing: 'border-box' },
  filterToggleBtn: {
    width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: '8px',
    padding: '11px 14px', borderRadius: '10px', border: '1px solid #dcdfd6', backgroundColor: '#fff',
    fontSize: '14px', fontWeight: 600, color: '#33413a', cursor: 'pointer',
  },
  filterBadge: { backgroundColor: '#2c8047', color: '#fff', fontSize: '11px', fontWeight: 700, borderRadius: '999px', padding: '1px 7px', lineHeight: '16px' },
  filterChevron: { marginLeft: 'auto', fontSize: '11px', color: '#9aa79d' },

  tableCard: { backgroundColor: '#fff', borderRadius: '14px', border: '1px solid #e7e8e0', overflow: 'hidden', padding: 0 },
  scrollHint: { fontSize: '11px', color: '#9aa79d', margin: '12px 20px 0' },
  tableScroll: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  table: { width: '100%', borderCollapse: 'collapse' },
  tableMobile: { minWidth: '1000px' },
  th: { textAlign: 'left', padding: '13px 20px', fontSize: '11px', fontWeight: 700, color: '#8a968d', borderBottom: '1px solid #eceee7', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', backgroundColor: '#fafbf8' },
  thSortable: { cursor: 'pointer', userSelect: 'none' },
  sortArrow: { color: '#2c8047', fontSize: '10px' },
  tr: {},
  td: { padding: '13px 20px', fontSize: '13px', color: '#4b5a50', borderBottom: '1px solid #f2f3ed', verticalAlign: 'middle' },
  avatar: { width: '38px', height: '38px', borderRadius: '10px', backgroundColor: '#eaf3ec', color: '#2c8047', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, flexShrink: 0, textTransform: 'uppercase' },
  ownerAvatarImg: { width: '38px', height: '38px', borderRadius: '10px', objectFit: 'cover', display: 'block' },
  badge: { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 11px', borderRadius: '999px', fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap' },
  badgeDot: { width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0 },
  actionBtn: { padding: '6px 13px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', border: '1px solid #e3e6dd', backgroundColor: '#fff', whiteSpace: 'nowrap' },
  viewBtn: { color: '#4b5a50' },
  editBtn: { color: '#2c8047' },
  deactivateBtn: { color: '#b91c1c' },
  activateBtn: { color: '#2c8047' },
  empty: { padding: '32px', textAlign: 'center', color: '#9aa79d', fontSize: '14px' },
}

const paginationStyles = {
  wrap: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderTop: '1px solid #eceee7', flexWrap: 'wrap', gap: '10px' },
  wrapMobile: { flexDirection: 'column', alignItems: 'stretch' },
  info: { fontSize: '12.5px', color: '#8a968d', whiteSpace: 'nowrap' },
  controls: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
  controlsMobile: { justifyContent: 'space-between' },
  pageSizeSelect: { padding: '6px 10px', borderRadius: '8px', border: '1px solid #dcdfd6', fontSize: '12.5px', color: '#4b5a50', marginRight: '6px' },
  navBtn: { minWidth: '30px', height: '30px', padding: '0 6px', borderRadius: '8px', border: '1px solid #dcdfd6', backgroundColor: '#fff', color: '#4b5a50', fontSize: '13px', cursor: 'pointer' },
  navBtnDisabled: { opacity: 0.4, cursor: 'not-allowed' },
  pageBtn: { minWidth: '30px', height: '30px', padding: '0 6px', borderRadius: '8px', border: '1px solid #dcdfd6', backgroundColor: '#fff', color: '#4b5a50', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' },
  pageBtnActive: { backgroundColor: '#2c8047', borderColor: '#2c8047', color: '#fff' },
  ellipsis: { padding: '0 4px', color: '#9aa79d', fontSize: '13px' },
}

const modalStyles = {
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(15,38,22,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  modal: { backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '480px', maxWidth: '90%', maxHeight: '90vh', overflowY: 'auto' },
  modalWide: { width: '560px' },
  modalMobile: { width: '100%', maxWidth: '100%', borderRadius: '16px 16px 0 0', padding: '20px', margin: '0', position: 'fixed', bottom: 0, left: 0, maxHeight: '85vh' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  title: { fontSize: '17px', fontWeight: 800, color: '#16311d', margin: 0 },
  close: { fontSize: '22px', cursor: 'pointer', color: '#8a968d' },
  instruction: { fontSize: '12.5px', color: '#6b7770', marginBottom: '16px', lineHeight: '1.5' },
  requiredMark: { color: '#b91c1c', fontWeight: 700 },

  stepper: { display: 'flex', alignItems: 'center', marginBottom: '20px' },
  stepperLine: { flex: 1, height: '2px', backgroundColor: '#e7e8e0', margin: '0 8px' },
  stepPill: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#9aa79d', fontWeight: 600 },
  stepPillActive: { color: '#2c8047' },
  stepPillDone: { color: '#2c8047' },
  stepPillNum: { width: '22px', height: '22px', borderRadius: '50%', backgroundColor: '#eef1ea', color: '#9aa79d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0 },
  stepPillNumActive: { backgroundColor: '#2c8047', color: '#fff' },

  ownerBanner: { backgroundColor: '#eaf3ec', border: '1px solid #cfe0d3', color: '#1f5a34', padding: '8px 12px', borderRadius: '10px', fontSize: '12.5px', marginBottom: '16px' },

  sectionLabel: { fontSize: '11px', fontWeight: 700, color: '#9aa79d', marginTop: '16px', marginBottom: '8px', letterSpacing: '0.5px' },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' },
  rowMobile: { gridTemplateColumns: '1fr' },
  input: { padding: '10px 12px', borderRadius: '10px', border: '1px solid #dcdfd6', fontSize: '14px', boxSizing: 'border-box', width: '100%' },
  inputFull: { width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #dcdfd6', fontSize: '14px', boxSizing: 'border-box', marginBottom: '10px' },
  label: { display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#33413a', marginBottom: '5px' },
  errorBox: { backgroundColor: '#fbeaea', border: '1px solid #f0c9c9', color: '#b91c1c', padding: '10px 14px', borderRadius: '10px', fontSize: '13px', marginBottom: '14px' },
  warnBox: { backgroundColor: '#fdf8f0', border: '1px solid #f0e2cf', color: '#92400e', padding: '10px 14px', borderRadius: '10px', fontSize: '13px', marginBottom: '14px' },
  hint: { fontSize: '12px', color: '#6b7770', marginTop: '14px', lineHeight: '1.5' },
  mapHint: { fontSize: '11.5px', color: '#9aa79d', margin: '-6px 0 8px', lineHeight: '1.4' },
  mapContainer: { height: '260px', width: '100%', borderRadius: '10px', border: '1px solid #dcdfd6', overflow: 'hidden' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' },
  actionsMobile: { flexDirection: 'column-reverse' },
  btnFull: { width: '100%', boxSizing: 'border-box' },
  cancelBtn: { padding: '10px 18px', borderRadius: '10px', border: '1px solid #dcdfd6', backgroundColor: 'white', fontSize: '14px', fontWeight: 600, color: '#33413a', cursor: 'pointer' },
  submitBtn: { padding: '10px 18px', borderRadius: '10px', border: 'none', backgroundColor: '#2c8047', color: 'white', fontSize: '14px', fontWeight: 700, cursor: 'pointer' },

  farmBlock: { border: '1px solid #e7e8e0', borderRadius: '12px', padding: '16px', marginBottom: '14px', backgroundColor: '#fafbf8' },
  farmBlockHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' },
  farmBlockTitle: { fontSize: '13px', fontWeight: 700, color: '#2c8047' },
  removeFarmBtn: { fontSize: '12px', color: '#b91c1c', fontWeight: 600, cursor: 'pointer' },
  addFarmBtn: { display: 'block', width: '100%', padding: '10px', borderRadius: '10px', border: '1px dashed #2c8047', backgroundColor: 'white', color: '#2c8047', fontSize: '13px', fontWeight: 600, cursor: 'pointer', marginBottom: '4px' },

  dropdownList: { position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: 'white', border: '1px solid #dcdfd6', borderRadius: '10px', marginTop: '-6px', maxHeight: '180px', overflowY: 'auto', zIndex: 10, boxShadow: '0 4px 12px rgba(20,48,28,0.12)' },
  dropdownItem: { padding: '10px 14px', fontSize: '13px', cursor: 'pointer', color: '#33413a' },
  geocodeSpinner: { position: 'absolute', right: '12px', top: '11px', fontSize: '11px', color: '#9aa79d' },
  geocodeError: { fontSize: '12px', color: '#b91c1c', marginTop: '-6px', marginBottom: '10px' },
  geotagConfirmed: { fontSize: '12px', color: '#2c8047', fontWeight: 600, marginTop: '2px' },

  ownerResultsList: { border: '1px solid #dcdfd6', borderRadius: '10px', marginTop: '-6px', marginBottom: '10px', maxHeight: '220px', overflowY: 'auto' },
  ownerResultItem: { padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f2f3ed' },
  ownerResultName: { fontSize: '13.5px', fontWeight: 700, color: '#16311d' },
  ownerResultMeta: { fontSize: '12px', color: '#6b7770', marginTop: '2px' },
  ownerEmptyResult: { fontSize: '12.5px', color: '#9aa79d', padding: '10px 2px', marginTop: '-6px' },
  changeOwnerLink: { color: '#2c8047', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' },

  photoUploadWrap: { display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px', padding: '12px', backgroundColor: '#fafbf8', borderRadius: '12px', border: '1px solid #eceee7' },
  photoPreview: { width: '56px', height: '56px', borderRadius: '50%', backgroundColor: '#eaf3ec', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, overflow: 'hidden', border: '2px dashed #cfe0d3' },
  photoPreviewImg: { width: '100%', height: '100%', objectFit: 'cover' },
  photoPlaceholder: { fontSize: '22px', color: '#2c8047', fontWeight: 700 },
  photoUploadLabel: { fontSize: '13px', fontWeight: 700, color: '#16311d' },
  photoUploadHint: { fontSize: '11.5px', color: '#9aa79d', marginTop: '2px' },
  photoUploadBtn: { fontSize: '12px', fontWeight: 700, color: '#2c8047', cursor: 'pointer', marginTop: '4px', display: 'inline-block' },
}

const confirmStyles = {
  modal: { backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '400px', maxWidth: '90%' },
  title: { fontSize: '17px', fontWeight: 800, color: '#16311d', marginTop: 0, marginBottom: '10px' },
  message: { fontSize: '14px', color: '#6b7770', lineHeight: '1.5', marginBottom: '4px' },
}

const profileStyles = {
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(15,38,22,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px', boxSizing: 'border-box' },
  modal: { backgroundColor: '#fff', borderRadius: '16px', width: '820px', maxWidth: '94vw', maxHeight: '92vh', overflowY: 'auto', border: '1px solid #e7e8e0', position: 'relative' },
  modalMobile: { width: '100%', maxWidth: '100%', borderRadius: '16px 16px 0 0', position: 'fixed', bottom: 0, left: 0, maxHeight: '92vh' },
  stateMsg: { padding: '48px 24px', textAlign: 'center', color: '#6b7770', fontSize: '14px' },

  header: { display: 'flex', alignItems: 'center', gap: '18px', padding: '24px 28px', borderBottom: '1px solid #f0efe8' },
  headerMobile: { padding: '18px 18px', gap: '12px' },
  avatarWrap: { width: '84px', height: '84px', borderRadius: '50%', flexShrink: 0, overflow: 'hidden', backgroundColor: '#eaf3ec', border: '1px solid #d6e5da', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  avatarInitials: { fontSize: '26px', fontWeight: 700, color: '#2c8047', letterSpacing: '0.02em' },
  headerText: { flex: 1, minWidth: 0 },
  ownerNameLarge: { color: '#16311d', fontSize: '19px', fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  farmNameRow: { color: '#7b8a80', fontSize: '13px', marginTop: '3px' },
  statusPill: { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 13px', borderRadius: '999px', fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 },
  pillDot: { width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0 },
  closeBtn: { width: '30px', height: '30px', borderRadius: '8px', border: '1px solid #eceee7', backgroundColor: '#fff', color: '#8a968d', fontSize: '17px', lineHeight: 1, cursor: 'pointer', flexShrink: 0 },

  tabsRow: { display: 'flex', gap: '26px', padding: '0 28px', borderBottom: '1px solid #f0efe8', overflowX: 'auto' },
  tab: { border: 'none', background: 'none', padding: '14px 0 12px', fontFamily: 'inherit', fontSize: '13px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', color: '#8a968d', borderBottom: '2px solid transparent', marginBottom: '-1px' },
  tabActive: { color: '#2c8047', borderBottom: '2px solid #2c8047' },

  body: { padding: '4px 28px 8px' },

  section: { padding: '20px 0', borderBottom: '1px solid #f0efe8' },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' },
  sectionTitle: { fontSize: '14px', fontWeight: 800, color: '#16311d' },
  sectionBadge: { padding: '3px 10px', borderRadius: '999px', fontSize: '10.5px', fontWeight: 700 },

  infoGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px 40px' },
  infoRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 20px', padding: '14px 0', borderBottom: '1px solid #f0efe8' },
  infoRowLast: { borderBottom: 'none', paddingBottom: '18px' },
  infoCell: {},
  infoLabel: { fontSize: '10.5px', color: '#9aa79d', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '5px' },
  infoValue: { fontSize: '13.5px', color: '#16311d', fontWeight: 600, lineHeight: 1.4, wordBreak: 'break-word' },
  miniPill: { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 11px', borderRadius: '999px', fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap' },

  sensorList: { marginTop: '18px', border: '1px solid #eceee7', borderRadius: '10px', overflow: 'hidden' },
  sensorRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', borderBottom: '1px solid #f2f3ed', backgroundColor: '#fff' },
  sensorRowLast: { borderBottom: 'none' },
  sensorRowLabel: { fontSize: '12.5px', color: '#6b7770', fontWeight: 600 },
  sensorRowRight: { display: 'flex', alignItems: 'center', gap: '14px' },
  sensorRowValue: { fontSize: '14px', fontWeight: 800 },
  sensorRowStatus: { fontSize: '11px', fontWeight: 700 },

  overallRow: { display: 'flex', alignItems: 'center', gap: '10px', marginTop: '16px' },
  overallLabel: { fontSize: '12.5px', fontWeight: 600, color: '#6b7770' },
  overallBadge: { display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '6px 15px', borderRadius: '999px', fontSize: '12.5px', fontWeight: 800, border: '1px solid transparent' },

  empty: { fontSize: '13px', color: '#9aa79d', marginTop: '12px' },

  insightCard: { display: 'flex', gap: '13px', alignItems: 'flex-start', backgroundColor: '#fafbf8', border: '1px solid #eceee7', borderRadius: '12px', padding: '16px 18px' },
  insightHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' },
  insightRootCause: { fontSize: '13.5px', fontWeight: 800, color: '#16311d' },
  confidenceTag: { fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '999px' },
  insightExplanation: { fontSize: '12.5px', color: '#5c6b60', lineHeight: 1.6, marginTop: '8px', marginBottom: 0 },
  insightExplanationUnavailable: { fontSize: '12px', color: '#9aa79d', fontStyle: 'italic', marginTop: '8px', marginBottom: 0 },

  logsList: { display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' },
  logRow: { display: 'flex', alignItems: 'center', gap: '13px' },
  textRow: { padding: '13px 0', borderBottom: '1px solid #f2f3ed' },
  inspectionRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '13px 0', borderBottom: '1px solid #f2f3ed' },
  logThumb: { width: '44px', height: '44px', borderRadius: '9px', objectFit: 'cover', flexShrink: 0, cursor: 'pointer' },
  logDate: { fontSize: '13px', fontWeight: 700, color: '#16311d' },
  logNote: { fontSize: '12px', color: '#6b7770', marginTop: '2px' },

  tabPager: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '16px', paddingTop: '14px', borderTop: '1px solid #f0efe8' },
  tabPagerBtn: { padding: '6px 12px', borderRadius: '8px', border: '1px solid #dcdfd6', backgroundColor: '#fff', color: '#33413a', fontSize: '12px', fontWeight: 600, cursor: 'pointer' },
  tabPagerBtnDisabled: { opacity: 0.4, cursor: 'not-allowed' },
  tabPagerInfo: { fontSize: '11.5px', color: '#8a968d' },

  footer: { padding: '14px 28px', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #f0efe8' },
  closeFooterBtn: { padding: '9px 22px', borderRadius: '10px', border: '1px solid #dcdfd6', backgroundColor: '#fff', color: '#33413a', fontSize: '13px', fontWeight: 700, cursor: 'pointer' },
}

const lightboxStyles = {
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(10,20,14,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '24px', cursor: 'zoom-out' },
  closeBtn: { position: 'absolute', top: '20px', right: '24px', width: '36px', height: '36px', borderRadius: '50%', border: 'none', backgroundColor: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: '20px', cursor: 'pointer', zIndex: 2 },
  image: { maxWidth: '90vw', maxHeight: '88vh', borderRadius: '10px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', cursor: 'default' },
}