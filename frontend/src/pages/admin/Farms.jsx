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

// San Jose, Batangas municipal center — used as the map's fallback view
// before a barangay is selected.
const SAN_JOSE_CENTER = [13.8797, 121.0989]

// Nominatim search biased to San Jose, Batangas — mirrors the viewbox +
// bounded=1 fix already applied to the sensor/dashboard geocoding, so farm
// addresses resolve to San Jose and don't drift into a neighboring province.
const SAN_JOSE_VIEWBOX = '120.95,13.95,121.15,13.80' // left,top,right,bottom

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

// e.g. "Jul 15, 2026" — used for the Registration Date column.
function formatRegistrationDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function Farms() {
  const [statusFilter, setStatusFilter] = useState('')
  const [barangayFilter, setBarangayFilter] = useState('')
  const [sizeFilter, setSizeFilter] = useState('')
  const [search, setSearch] = useState('')
  const [showRegisterModal, setShowRegisterModal] = useState(false)
  const [showAddFarmModal, setShowAddFarmModal] = useState(false)
  const [editFarm, setEditFarm] = useState(null)
  const [viewFarm, setViewFarm] = useState(null)
  const [confirmAction, setConfirmAction] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [sortField, setSortField] = useState('created_at')
  const [sortDirection, setSortDirection] = useState('desc') // newest registrations first by default
  const isMobile = useIsMobile()

  const params = {}
  if (statusFilter) params.status = statusFilter
  if (barangayFilter) params.barangay = barangayFilter
  if (sizeFilter) params.farm_size = sizeFilter
  if (search) params.search = search

  const { data: farms, loading, error, refetch } = useCachedFetch('/admin/farms', params)
  const allFarms = farms || []

  useEffect(() => {
    setCurrentPage(1)
  }, [statusFilter, barangayFilter, sizeFilter, search, pageSize, sortField, sortDirection])

  const sortedFarms = useMemo(() => {
    const list = [...allFarms]
    list.sort((a, b) => {
      let result
      if (sortField === 'created_at') {
        result = new Date(a.created_at ?? 0) - new Date(b.created_at ?? 0)
      } else {
        result = String(a[sortField] ?? '').localeCompare(String(b[sortField] ?? ''))
      }
      return sortDirection === 'asc' ? result : -result
    })
    return list
  }, [allFarms, sortField, sortDirection])

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const totalItems = sortedFarms.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [totalPages, currentPage])

  const paginatedFarms = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedFarms.slice(start, start + pageSize)
  }, [sortedFarms, currentPage, pageSize])

  const rangeStart = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const rangeEnd = Math.min(currentPage * pageSize, totalItems)

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
  const activeFilterCount = [barangayFilter, sizeFilter, statusFilter].filter(Boolean).length

  return (
    <AdminLayout>
      <div style={{ ...styles.header, ...(isMobile ? styles.headerMobile : {}) }}>
        <div>
          <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>Farms</h1>
          <p style={styles.subtitle}>All registered farm owners & farms</p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', ...(isMobile ? { flexDirection: 'column', width: '100%' } : {}) }}>
          <button
            style={{ ...styles.secondaryBtn, ...(isMobile ? styles.btnFull : {}) }}
            onClick={() => setShowAddFarmModal(true)}
          >
            + Add Farm to Existing Owner
          </button>
          <button
            style={{ ...styles.newBtn, ...(isMobile ? styles.btnFull : {}) }}
            onClick={() => setShowRegisterModal(true)}
          >
            + Register Farm Owner
          </button>
        </div>
      </div>

      <div style={{ ...styles.filters, ...(isMobile ? styles.filtersMobile : {}) }}>
        <form onSubmit={handleSearch} style={{ flex: 1, minWidth: '220px', display: 'flex', gap: '8px' }}>
          <input
            placeholder="Search farm or owner..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={styles.searchInput}
          />
        </form>

        {isMobile && (
          <button
            type="button"
            onClick={() => setShowMobileFilters(v => !v)}
            style={styles.filterToggleBtn}
          >
            <span>Filters</span>
            {activeFilterCount > 0 && <span style={styles.filterBadge}>{activeFilterCount}</span>}
            <span style={styles.filterChevron}>{showMobileFilters ? '▲' : '▼'}</span>
          </button>
        )}

        {(!isMobile || showMobileFilters) && (
          <>
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
          </>
        )}
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
                  <th style={{ ...styles.th, ...styles.thSortable }} onClick={() => handleSort('created_at')}>
                    Registration Date
                    {sortField === 'created_at' && (
                      <span style={styles.sortArrow}>{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>
                    )}
                  </th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedFarms.map(f => (
                  <tr key={f.id}>
                    <td style={styles.td}>
                      <div style={{ fontWeight: 600 }}>{f.farm_name}</div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>{f.owner_name}</div>
                    </td>
                    <td style={styles.td}>{f.mobile_number}</td>
                    <td style={styles.td}>{f.barangay}</td>
                    <td style={styles.td}>{f.farm_size}</td>
                    <td style={styles.td}>{formatRegistrationDate(f.created_at)}</td>
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

          {allFarms.length > 0 && (
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

      {showAddFarmModal && (
        <AddFarmModal
          isMobile={isMobile}
          onClose={() => setShowAddFarmModal(false)}
          onSuccess={() => { setShowAddFarmModal(false); refetch() }}
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

/* ------------------------------------------------------------------ *
 *  Register flow — Step 1: Farm Owner (created once)
 *                  Step 2: one or more Farms under that owner,
 *                          each with its own pinned map location.
 * ------------------------------------------------------------------ */

function RegisterModal({ onClose, onSuccess, isMobile }) {
  const [step, setStep] = useState('owner') // 'owner' | 'farms'

  const [ownerForm, setOwnerForm] = useState({
    first_name: '', last_name: '', mobile_number: '', address: '',
  })
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
      const res = await api.post('/admin/farm-owners', ownerForm)
      setOwnerId(res.data.id)
      if (res.data.sms_sent === false) {
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

            <Label text="Mobile Number (used for login)" required />
            <input placeholder="e.g. 0917 123 4567" value={ownerForm.mobile_number} onChange={updateOwner('mobile_number')} style={modalStyles.inputFull} required />

            <Label text="Owner Address" required />
            <input placeholder="House/Lot No., Street, Barangay" value={ownerForm.address} onChange={updateOwner('address')} style={modalStyles.inputFull} required />

            <p style={modalStyles.hint}>
              A temporary password will be generated and sent to the owner's mobile number via SMS. The owner must change it on their first login. The owner is registered once — you'll add their farm(s) in the next step.
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
                disabled={ownerLoading}
                style={{ ...modalStyles.submitBtn, ...(isMobile ? modalStyles.btnFull : {}) }}
              >
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

            <button type="button" onClick={addFarm} style={modalStyles.addFarmBtn}>
              + Add Another Farm
            </button>

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
                disabled={farmsLoading}
                style={{ ...modalStyles.submitBtn, ...(isMobile ? modalStyles.btnFull : {}) }}
              >
                {farmsLoading ? 'Saving Farm(s)...' : `Save ${farmsList.length > 1 ? `${farmsList.length} Farms` : 'Farm'}`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 *  Add Farm to Existing Owner — search for an owner already in the
 *  system, then attach one or more new farms to them without
 *  re-registering the owner (mobile number stays unique).
 * ------------------------------------------------------------------ */

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
    if (value.trim().length < 2) {
      setOwnerResults([])
      return
    }
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
                      {o.mobile_number} · {o.farm_count} farm{o.farm_count === 1 ? '' : 's'} registered
                    </div>
                  </div>
                ))}
              </div>
            )}

            {ownerQuery.trim().length >= 2 && !searching && ownerResults.length === 0 && (
              <div style={modalStyles.ownerEmptyResult}>No matching owner found.</div>
            )}

            <div style={{ ...modalStyles.actions, ...(isMobile ? modalStyles.actionsMobile : {}) }}>
              <button
                type="button"
                onClick={onClose}
                style={{ ...modalStyles.cancelBtn, ...(isMobile ? modalStyles.btnFull : {}) }}
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {selectedOwner && (
          <form onSubmit={handleSubmit}>
            <div style={modalStyles.ownerBanner}>
              Adding farm(s) for <strong>{selectedOwner.first_name} {selectedOwner.last_name}</strong> ({selectedOwner.mobile_number})
              {' — '}
              <span
                style={modalStyles.changeOwnerLink}
                onClick={() => { setSelectedOwner(null); setOwnerResults([]); setOwnerQuery('') }}
              >
                Change owner
              </span>
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

            <button type="button" onClick={addFarm} style={modalStyles.addFarmBtn}>
              + Add Another Farm
            </button>

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
                disabled={farmsLoading}
                style={{ ...modalStyles.submitBtn, ...(isMobile ? modalStyles.btnFull : {}) }}
              >
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
      <span style={modalStyles.stepPillNum}>{done ? '✓' : number}</span>
      <span>{label}</span>
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

/* ------------------------------------------------------------------ *
 *  FarmEntry — Google-Maps-style location picker.
 *
 *  1. Selecting a barangay flies the map to that barangay's approximate
 *     center (a Nominatim lookup, navigation only — no marker placed).
 *  2. The admin clicks anywhere on the map to drop a pin, or drags the
 *     pin to fine-tune it. That's the single source of truth for the
 *     farm's saved latitude/longitude.
 *  3. The address search box is an optional shortcut: picking a
 *     suggestion flies the map there and drops the pin at that point,
 *     but the pin remains freely draggable afterward for precision.
 * ------------------------------------------------------------------ */

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

  // Initialize the map once on mount.
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

    // Leaflet sometimes renders blank tiles if the container's size wasn't
    // final at init time (e.g. inside a modal that's still animating in).
    setTimeout(() => map.invalidateSize(), 200)

    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Selecting a barangay navigates the map there — it does not place a
  // pin, since the exact spot still needs a deliberate click.
  const handleBarangayChange = async (value) => {
    onChange('barangay', value)
    if (!value || !mapRef.current) return
    try {
      const results = await geocodeAddress(value)
      if (results[0]) {
        mapRef.current.flyTo([parseFloat(results[0].lat), parseFloat(results[0].lon)], 15, { duration: 0.6 })
      }
    } catch {
      // Silent — this is just map navigation convenience, not a hard requirement.
    }
  }

  const handleAddressChange = (value) => {
    onChange('address', value)
    setGeocodeError('')

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (value.trim().length < 3) {
        setSuggestions([])
        return
      }
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
        {canRemove && (
          <span style={modalStyles.removeFarmBtn} onClick={onRemove}>Remove</span>
        )}
      </div>

      <Label text="Farm Name" required />
      <input
        placeholder="Farm Name"
        value={farm.farm_name}
        onChange={e => onChange('farm_name', e.target.value)}
        style={modalStyles.inputFull}
        required
      />

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
      <input
        placeholder="Landmark (optional)"
        value={farm.landmark}
        onChange={e => onChange('landmark', e.target.value)}
        style={modalStyles.inputFull}
      />

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
              <div key={i} style={modalStyles.dropdownItem} onClick={() => selectSuggestion(s)}>
                {s.display_name}
              </div>
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

          <Label text="Farm Name" required />
          <input placeholder="Farm Name" value={form.farm_name} onChange={update('farm_name')} style={modalStyles.inputFull} required />

          <div style={{ ...modalStyles.row, ...(isMobile ? modalStyles.rowMobile : {}) }}>
            <input placeholder="Lot No. (optional)" value={form.lot_number} onChange={update('lot_number')} style={modalStyles.input} />
            <input placeholder="Street (optional)" value={form.street} onChange={update('street')} style={modalStyles.input} />
          </div>

          <Label text="Barangay" required />
          <select value={form.barangay} onChange={update('barangay')} style={modalStyles.inputFull} required>
            {BARANGAYS.map(b => (
              <option key={b} value={b}>Brgy. {b}</option>
            ))}
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
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px', marginBottom: '20px' },
  headerMobile: { flexDirection: 'column', gap: '14px' },
  title: { fontSize: '22px', fontWeight: '700', color: '#111827', margin: 0 },
  titleMobile: { fontSize: '18px' },
  subtitle: { fontSize: '13px', color: '#6b7280', marginTop: '4px' },
  newBtn: { backgroundColor: '#2E7D32', color: 'white', border: 'none', borderRadius: '8px', padding: '10px 18px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' },
  secondaryBtn: { backgroundColor: 'white', color: '#2E7D32', border: '1px solid #2E7D32', borderRadius: '8px', padding: '10px 18px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' },
  btnFull: { width: '100%', boxSizing: 'border-box' },
  filters: { display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' },
  filtersMobile: { flexDirection: 'column' },
  searchInput: { flex: 1, padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box', width: '100%' },
  select: { padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' },
  selectMobile: { width: '100%', boxSizing: 'border-box' },
  filterToggleBtn: {
    width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: '8px',
    padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: 'white',
    fontSize: '14px', fontWeight: '600', color: '#374151', cursor: 'pointer',
  },
  filterBadge: {
    backgroundColor: '#2E7D32', color: 'white', fontSize: '11px', fontWeight: '700',
    borderRadius: '999px', padding: '1px 7px', lineHeight: '16px',
  },
  filterChevron: { marginLeft: 'auto', fontSize: '11px', color: '#9ca3af' },
  tableCard: { backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden', padding: 0 },
  scrollHint: { fontSize: '11px', color: '#9ca3af', margin: '12px 16px 0' },
  tableScroll: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  table: { width: '100%', borderCollapse: 'collapse' },
  tableMobile: { minWidth: '900px' },
  th: { textAlign: 'left', padding: '14px 16px', fontSize: '12px', color: '#6b7280', borderBottom: '1px solid #e5e7eb', textTransform: 'uppercase', whiteSpace: 'nowrap' },
  thSortable: { cursor: 'pointer', userSelect: 'none' },
  sortArrow: { color: '#2E7D32', fontSize: '10px' },
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
  pageBtnActive: {
    backgroundColor: '#2E7D32', borderColor: '#2E7D32', color: 'white',
  },
  ellipsis: { padding: '0 4px', color: '#9ca3af', fontSize: '13px' },
}

const modalStyles = {
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  modal: { backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '480px', maxWidth: '90%', maxHeight: '90vh', overflowY: 'auto' },
  modalWide: { width: '560px' },
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

  stepper: { display: 'flex', alignItems: 'center', marginBottom: '20px' },
  stepperLine: { flex: 1, height: '2px', backgroundColor: '#e5e7eb', margin: '0 8px' },
  stepPill: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#9ca3af', fontWeight: '600' },
  stepPillActive: { color: '#2E7D32' },
  stepPillDone: { color: '#2E7D32' },
  stepPillNum: {
    width: '22px', height: '22px', borderRadius: '50%', backgroundColor: '#f3f4f6',
    color: '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '11px', fontWeight: '700', flexShrink: 0,
  },

  ownerBanner: {
    backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534',
    padding: '8px 12px', borderRadius: '8px', fontSize: '12.5px', marginBottom: '16px',
  },

  sectionLabel: { fontSize: '11px', fontWeight: '600', color: '#9ca3af', marginTop: '16px', marginBottom: '8px', letterSpacing: '0.5px' },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' },
  rowMobile: { gridTemplateColumns: '1fr' },
  areaRow: { display: 'flex', gap: '10px', marginBottom: '10px' },
  input: { padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box', width: '100%' },
  inputFull: { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box', marginBottom: '10px' },
  inputDisabled: { backgroundColor: '#f9fafb', color: '#6b7280', cursor: 'not-allowed' },
  label: { display: 'block', fontSize: '12.5px', fontWeight: '600', color: '#374151', marginBottom: '5px' },
  errorBox: { backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '14px' },
  warnBox: { backgroundColor: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '14px' },
  hint: { fontSize: '12px', color: '#6b7280', marginTop: '14px', lineHeight: '1.5' },
  mapHint: { fontSize: '11.5px', color: '#9ca3af', margin: '-6px 0 8px', lineHeight: '1.4' },
  mapContainer: { height: '260px', width: '100%', borderRadius: '10px', border: '1px solid #d1d5db', overflow: 'hidden' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' },
  actionsMobile: { flexDirection: 'column-reverse' },
  btnFull: { width: '100%', boxSizing: 'border-box' },
  cancelBtn: { padding: '10px 18px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: 'white', fontSize: '14px', cursor: 'pointer' },
  submitBtn: { padding: '10px 18px', borderRadius: '8px', border: 'none', backgroundColor: '#2E7D32', color: 'white', fontSize: '14px', fontWeight: '600', cursor: 'pointer' },

  farmBlock: {
    border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px',
    marginBottom: '14px', backgroundColor: '#fafaf8',
  },
  farmBlockHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' },
  farmBlockTitle: { fontSize: '13px', fontWeight: '700', color: '#2E7D32' },
  removeFarmBtn: { fontSize: '12px', color: '#dc2626', fontWeight: '600', cursor: 'pointer' },
  addFarmBtn: {
    display: 'block', width: '100%', padding: '10px', borderRadius: '8px',
    border: '1px dashed #2E7D32', backgroundColor: 'white', color: '#2E7D32',
    fontSize: '13px', fontWeight: '600', cursor: 'pointer', marginBottom: '4px',
  },

  dropdownList: {
    position: 'absolute', top: '100%', left: 0, right: 0,
    backgroundColor: 'white', border: '1px solid #d1d5db', borderRadius: '8px',
    marginTop: '-6px', maxHeight: '180px', overflowY: 'auto', zIndex: 10,
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
  },
  dropdownItem: { padding: '10px 14px', fontSize: '13px', cursor: 'pointer', color: '#374151' },
  geocodeSpinner: { position: 'absolute', right: '12px', top: '11px', fontSize: '11px', color: '#9ca3af' },
  geocodeError: { fontSize: '12px', color: '#dc2626', marginTop: '-6px', marginBottom: '10px' },
  geotagConfirmed: { fontSize: '12px', color: '#2E7D32', fontWeight: '600', marginTop: '2px' },

  ownerResultsList: {
    border: '1px solid #d1d5db', borderRadius: '8px', marginTop: '-6px',
    marginBottom: '10px', maxHeight: '220px', overflowY: 'auto',
  },
  ownerResultItem: {
    padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6',
  },
  ownerResultName: { fontSize: '13.5px', fontWeight: '700', color: '#111827' },
  ownerResultMeta: { fontSize: '12px', color: '#6b7280', marginTop: '2px' },
  ownerEmptyResult: { fontSize: '12.5px', color: '#9ca3af', padding: '10px 2px', marginTop: '-6px' },
  changeOwnerLink: { color: '#2E7D32', fontWeight: '700', cursor: 'pointer', textDecoration: 'underline' },
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