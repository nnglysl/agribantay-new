import { useState, useMemo, useRef, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import AdminLayout from '../../components/AdminLayout'
import SharedPagination from '../../components/Pagination'
import { useCachedFetch, invalidateCache } from '../../hooks/useCachedFetch'
import { useIsMobile } from '../../hooks/useIsMobile'
import api from '../../api/axios'
import { BARANGAYS } from '../../constants/barangays'
import { viewModalStyles as v } from '../../styles/viewModalStyles'
import { isValidPhoneNumber, sanitizePhoneInput, PHONE_VALIDATION_MESSAGE } from '../../utils/phoneValidation'
import { serviceTypeBadgeStyle, serviceTypeLabel, requestStatusBadgeStyle } from '../../utils/serviceBadgeStyle'
import VerifyEmailChangeModal from '../../components/VerifyEmailChangeModal'

const FARM_SIZES = ['Small', 'Medium', 'Large']
const PAGE_SIZE_OPTIONS = [10, 25, 50]

const INSPECTION_TYPES = ['General Inspection', 'Follow-up']
// Super Admin's per-farm Service Requests view is a completed-service history
// covering every type, including the Vet-only ones (see FarmController::serviceRequests()).
const SERVICE_REQUEST_TYPES = ['Odor Control Request', 'Fly Control Request', 'Vaccine Request', 'Blood Test Request']

// Shared by the Inspections / Manure Disposal / Service Requests tabs'
// From/To date range filters — an empty string on either side means
// "don't restrict that end of the range".
function matchesDateRange(dateValue, fromDate, toDate) {
  if (!fromDate && !toDate) return true
  if (!dateValue) return false
  const d = new Date(dateValue)
  if (isNaN(d.getTime())) return false
  const dOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  if (fromDate && dOnly < new Date(fromDate)) return false
  if (toDate && dOnly > new Date(toDate)) return false
  return true
}

function getInitials(name) {
  if (!name) return ''
  return name.split(' ').filter(Boolean).slice(0, 2).map(n => n[0].toUpperCase()).join('')
}

function formatRegistrationDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function maintBadgeColor(status) {
  if (status === 'Non-Compliant') return '#b91c1c'
  if (status === 'Overdue') return '#b45309'
  return '#2c8047'
}

function getExplanationText(insight) {
  const exp = insight?.explanation
  if (typeof exp === 'string') return exp
  if (exp && typeof exp === 'object') return exp.explanation_en || null
  return null
}

const STATUS = {
  Safe:     { color: '#256b3d', bg: '#eaf3ec', border: '#cfe0d3' },
  Warning:  { color: '#b45309', bg: '#fbf1e2', border: '#f0e2cf' },
  Critical: { color: '#b91c1c', bg: '#fbeaea', border: '#f0c9c9' },
  'Pending Setup': { color: '#6b7280', bg: '#eef1ea', border: '#e0e3da' },
  Offline:  { color: '#6b7280', bg: '#eef1ea', border: '#e0e3da' },
}

const OVERALL_HERO = {
  Safe:     { fill: '#2c8047', iconName: 'health_and_safety', title: 'Safe' },
  Warning:  { fill: '#b45309', iconName: 'warning', title: 'Warning' },
  Critical: { fill: '#b91c1c', iconName: 'e911_emergency', title: 'Critical' },
  'Pending Setup': { fill: '#6b7280', iconName: 'settings', title: 'Pending Setup' },
  Offline:  { fill: '#6b7280', iconName: 'sensors_off', title: 'Offline' },
}

const TABS = [
  { key: 'info', label: 'Farm Information' },
  { key: 'cleanout', label: 'Manure Clean-out' },
  { key: 'disposal', label: 'Manure Disposal' },
  { key: 'inspections', label: 'Inspections' },
  { key: 'servicerequests', label: 'Service Requests' },
  { key: 'devices', label: 'Devices' },
]

const ICON_COLOR = '#2c8047'
const iconBase = { fill: 'none', stroke: ICON_COLOR, strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }

function WindIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" {...iconBase}><path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2" /><path d="M9.6 4.6A2 2 0 1 1 11 8H2" /><path d="M12.6 19.4A2 2 0 1 0 14 16H2" /></svg> }
function ThermometerIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" {...iconBase}><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" /></svg> }
function DropletIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" {...iconBase}><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5S5 13 5 15a7 7 0 0 0 7 7z" /></svg> }
function LeafIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" {...iconBase}><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" /><path d="M2 21c0-3 1.85-5.36 5.08-6" /></svg> }

const SENSOR_ICON = { ammonia: WindIcon, temperature: ThermometerIcon, humidity: DropletIcon, moisture: LeafIcon }

function PhotoIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#b7c0ba" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="M21 15l-5-5L5 20" />
    </svg>
  )
}

const responsiveCss = `
  .material-symbols-outlined {
    font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
  }
`

function useMaterialSymbolsFont() {
  useMemo(() => {
    if (typeof document === 'undefined') return
    const id = 'material-symbols-outlined-font'
    if (document.getElementById(id)) return
    const link = document.createElement('link')
    link.id = id
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200'
    document.head.appendChild(link)
  }, [])
}

export default function SuperAdminFarmDetails() {
  useMaterialSymbolsFont()

  const { farmId } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const isMobile = useIsMobile()

  const { data: farm, loading, error, refetch } = useCachedFetch(`/admin/farms/${farmId}`)
  const [activeTab, setActiveTab] = useState('info')

  const [isEditingAccount, setIsEditingAccount] = useState(false)
  const [editFullName, setEditFullName] = useState('')
  const [editMobileNumber, setEditMobileNumber] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editPhoto, setEditPhoto] = useState(null)
  const [editFarmName, setEditFarmName] = useState('')
  const [editLotNumber, setEditLotNumber] = useState('')
  const [editStreet, setEditStreet] = useState('')
  const [editBarangay, setEditBarangay] = useState('')
  const [editLandmark, setEditLandmark] = useState('')
  const [editFarmSize, setEditFarmSize] = useState('')
  const [accountEditError, setAccountEditError] = useState('')
  const [accountEditSuccess, setAccountEditSuccess] = useState('')
  const [accountSaving, setAccountSaving] = useState(false)
  const [pendingOwnerEmail, setPendingOwnerEmail] = useState(null)

  const [cleanoutPage, setCleanoutPage] = useState(1)
  const [disposalPage, setDisposalPage] = useState(1)
  const [inspectionPage, setInspectionPage] = useState(1)

  const [cleanoutPageSize, setCleanoutPageSize] = useState(10)
  const [disposalPageSize, setDisposalPageSize] = useState(10)
  const [inspectionPageSize, setInspectionPageSize] = useState(10)

  const [cleanoutSort, setCleanoutSort] = useState('desc')
  const [cleanoutViewLog, setCleanoutViewLog] = useState(null)

  const [disposalSort, setDisposalSort] = useState({ field: 'disposal_date', dir: 'desc' })
  const [disposalMethodFilter, setDisposalMethodFilter] = useState('')
  const [disposalFromDate, setDisposalFromDate] = useState('')
  const [disposalToDate, setDisposalToDate] = useState('')
  const [disposalViewRecord, setDisposalViewRecord] = useState(null)
  const [draftDisposalMethod, setDraftDisposalMethod] = useState('')
  const [draftDisposalFrom, setDraftDisposalFrom] = useState('')
  const [draftDisposalTo, setDraftDisposalTo] = useState('')

  const [inspectionSort, setInspectionSort] = useState({ field: 'date', dir: 'desc' })
  const [inspectionTypeFilter, setInspectionTypeFilter] = useState('')
  const [inspectionFromDate, setInspectionFromDate] = useState('')
  const [inspectionToDate, setInspectionToDate] = useState('')
  const [inspectionViewRecord, setInspectionViewRecord] = useState(null)
  const [draftInspectionType, setDraftInspectionType] = useState('')
  const [draftInspectionFrom, setDraftInspectionFrom] = useState('')
  const [draftInspectionTo, setDraftInspectionTo] = useState('')

  const [serviceRequestPage, setServiceRequestPage] = useState(1)
  const [serviceRequestPageSize, setServiceRequestPageSize] = useState(10)
  const [serviceRequestViewRecord, setServiceRequestViewRecord] = useState(null)
  const [serviceRequestTypeFilter, setServiceRequestTypeFilter] = useState('')
  const [serviceRequestFromDate, setServiceRequestFromDate] = useState('')
  const [serviceRequestToDate, setServiceRequestToDate] = useState('')
  const [draftServiceRequestType, setDraftServiceRequestType] = useState('')
  const [draftServiceRequestFrom, setDraftServiceRequestFrom] = useState('')
  const [draftServiceRequestTo, setDraftServiceRequestTo] = useState('')

  const [lightboxImage, setLightboxImage] = useState(null)

  const applyDisposalFilter = () => {
    setDisposalMethodFilter(draftDisposalMethod)
    setDisposalFromDate(draftDisposalFrom)
    setDisposalToDate(draftDisposalTo)
  }
  const resetDisposalFilter = () => {
    setDraftDisposalMethod('')
    setDraftDisposalFrom('')
    setDraftDisposalTo('')
    setDisposalMethodFilter('')
    setDisposalFromDate('')
    setDisposalToDate('')
  }

  const applyInspectionFilter = () => {
    setInspectionTypeFilter(draftInspectionType)
    setInspectionFromDate(draftInspectionFrom)
    setInspectionToDate(draftInspectionTo)
  }
  const resetInspectionFilter = () => {
    setDraftInspectionType('')
    setDraftInspectionFrom('')
    setDraftInspectionTo('')
    setInspectionTypeFilter('')
    setInspectionFromDate('')
    setInspectionToDate('')
  }

  const applyServiceRequestFilter = () => {
    setServiceRequestTypeFilter(draftServiceRequestType)
    setServiceRequestFromDate(draftServiceRequestFrom)
    setServiceRequestToDate(draftServiceRequestTo)
  }
  const resetServiceRequestFilter = () => {
    setDraftServiceRequestType('')
    setDraftServiceRequestFrom('')
    setDraftServiceRequestTo('')
    setServiceRequestTypeFilter('')
    setServiceRequestFromDate('')
    setServiceRequestToDate('')
  }

  const { data: cleanoutData, loading: cleanoutLoading } = useCachedFetch(
    activeTab === 'cleanout' ? `/admin/farms/${farmId}/maintenance-logs` : null, { page: cleanoutPage, per_page: cleanoutPageSize }
  )
  const { data: disposalData, loading: disposalLoading } = useCachedFetch(
    activeTab === 'disposal' ? `/admin/farms/${farmId}/disposal-records` : null, { page: disposalPage, per_page: disposalPageSize }
  )
  const { data: inspectionData, loading: inspectionLoading } = useCachedFetch(
    activeTab === 'inspections' ? `/admin/farms/${farmId}/inspection-records` : null, { page: inspectionPage, per_page: inspectionPageSize }
  )
  const { data: serviceRequestData, loading: serviceRequestLoading } = useCachedFetch(
    activeTab === 'servicerequests' ? `/admin/farms/${farmId}/service-requests` : null, { page: serviceRequestPage, per_page: serviceRequestPageSize }
  )

  const handleCleanoutPageSizeChange = (size) => { setCleanoutPageSize(size); setCleanoutPage(1) }
  const handleDisposalPageSizeChange = (size) => { setDisposalPageSize(size); setDisposalPage(1) }
  const handleInspectionPageSizeChange = (size) => { setInspectionPageSize(size); setInspectionPage(1) }
  const handleServiceRequestPageSizeChange = (size) => { setServiceRequestPageSize(size); setServiceRequestPage(1) }
  // NOTE: this endpoint is a guess based on your existing URL pattern — confirm
  // the real one (or add it) if it doesn't exist yet on the backend.
  const { data: alertsData, loading: alertsLoading } = useCachedFetch(
    activeTab === 'info' ? `/admin/farms/${farmId}/alerts` : null
  )

  const reading = farm?.sensor_readings?.[0] ?? farm?.sensorReadings?.[0] ?? null
  const initials = farm ? getInitials(farm.owner_name) : ''
  const isActive = farm?.status === 'Active'
  const isSensorOnline = !!reading
  // The registered device (from the Devices tab) is the single source of
  // truth for Device Name — shown here even before the device has ever
  // sent a reading. Online/Offline and Last Synchronization stay tied to
  // actual reading data (unchanged monitoring logic) since those reflect
  // real communication, not just registration.
  const registeredSensor = farm?.sensors?.[0] ?? null
  const hasRegisteredDevice = !!registeredSensor
  const deviceSensor = reading?.sensor ?? registeredSensor
  const riskLevel = farm?.display_status || farm?.current_status || (reading ? 'Safe' : null)
  const overall = STATUS[riskLevel] || STATUS.Offline
  const overallHero = OVERALL_HERO[riskLevel] || OVERALL_HERO.Offline

  const { data: insight, loading: insightLoading } = useCachedFetch(
    reading && activeTab === 'info' ? `/admin/farms/${farmId}/root-cause` : null
  )

  const sortedCleanoutLogs = useMemo(() => {
    const list = cleanoutData?.logs || []
    return [...list].sort((a, b) => {
      const da = new Date(a.performed_at || 0)
      const db = new Date(b.performed_at || 0)
      return cleanoutSort === 'asc' ? da - db : db - da
    })
  }, [cleanoutData, cleanoutSort])

  const disposalMethods = useMemo(() => {
    const list = disposalData?.records || []
    return [...new Set(list.map(r => r.disposal_method).filter(Boolean))]
  }, [disposalData])

  const filteredSortedDisposal = useMemo(() => {
    let list = disposalData?.records || []
    if (disposalMethodFilter) list = list.filter(r => r.disposal_method === disposalMethodFilter)
    list = list.filter(r => matchesDateRange(r.disposal_date_raw, disposalFromDate, disposalToDate))
    return [...list].sort((a, b) => {
      let av, bv
      if (disposalSort.field === 'quantity') {
        av = Number(a.quantity) || 0
        bv = Number(b.quantity) || 0
      } else {
        av = new Date(a.disposal_date || 0)
        bv = new Date(b.disposal_date || 0)
      }
      const result = av > bv ? 1 : av < bv ? -1 : 0
      return disposalSort.dir === 'asc' ? result : -result
    })
  }, [disposalData, disposalMethodFilter, disposalFromDate, disposalToDate, disposalSort])

  const toggleDisposalSort = (field) => {
    setDisposalSort(s => (s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' }))
  }

  const inspectionDateValue = (i) => i.completed_at || i.scheduled_at || null
  const inspectionDateValueRaw = (i) => i.completed_at_raw || i.scheduled_at_raw || null

  const filteredSortedInspections = useMemo(() => {
    let list = inspectionData?.inspections || []
    if (inspectionTypeFilter) list = list.filter(i => i.inspection_type === inspectionTypeFilter)
    list = list.filter(i => matchesDateRange(inspectionDateValueRaw(i), inspectionFromDate, inspectionToDate))
    return [...list].sort((a, b) => {
      let av, bv
      if (inspectionSort.field === 'type') {
        av = a.inspection_type || ''
        bv = b.inspection_type || ''
      } else {
        av = new Date(inspectionDateValue(a) || 0)
        bv = new Date(inspectionDateValue(b) || 0)
      }
      const result = av > bv ? 1 : av < bv ? -1 : 0
      return inspectionSort.dir === 'asc' ? result : -result
    })
  }, [inspectionData, inspectionTypeFilter, inspectionFromDate, inspectionToDate, inspectionSort])

  const toggleInspectionSort = (field) => {
    setInspectionSort(s => (s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' }))
  }

  const filteredServiceRequests = useMemo(() => {
    let list = serviceRequestData?.requests || []
    if (serviceRequestTypeFilter) list = list.filter(r => r.request_type === serviceRequestTypeFilter)
    list = list.filter(r => matchesDateRange(r.request_date_raw, serviceRequestFromDate, serviceRequestToDate))
    return list
  }, [serviceRequestData, serviceRequestTypeFilter, serviceRequestFromDate, serviceRequestToDate])

  const startEditAccount = () => {
    setEditFullName(farm.owner_name || '')
    setEditMobileNumber(farm.mobile_number || '')
    setEditEmail(farm.user?.email || '')
    setEditPhoto(null)
    setEditFarmName(farm.farm_name || '')
    setEditLotNumber(farm.lot_number || '')
    setEditStreet(farm.street || '')
    setEditBarangay(farm.barangay || BARANGAYS[0])
    setEditLandmark(farm.landmark || '')
    setEditFarmSize(farm.farm_size || FARM_SIZES[0])
    setAccountEditError('')
    setAccountEditSuccess('')
    setIsEditingAccount(true)
  }

  const cancelEditAccount = () => {
    setIsEditingAccount(false)
    setEditPhoto(null)
    setAccountEditError('')
  }

  const handleSaveAccount = async (e) => {
    e.preventDefault()
    setAccountEditError('')
    setAccountEditSuccess('')

    if (!isValidPhoneNumber(editMobileNumber)) {
      setAccountEditError(PHONE_VALIDATION_MESSAGE)
      return
    }

    const currentEmail = farm.user?.email || ''
    const newEmail = editEmail.trim()
    const emailChanged = newEmail !== currentEmail

    setAccountSaving(true)
    try {
      // A genuinely new email must be proven deliverable before it's saved
      // anywhere — this only sends the code; the address itself isn't
      // written to the account until the Verify New Email modal succeeds.
      if (emailChanged && newEmail) {
        await api.post(`/admin/farms/${farm.id}/email/otp/request`, { email: newEmail })
      }

      const [firstName, ...rest] = editFullName.trim().split(' ')
      const lastName = rest.join(' ')

      const formData = new FormData()
      formData.append('_method', 'PUT')
      formData.append('first_name', firstName || '')
      formData.append('last_name', lastName)
      formData.append('mobile_number', editMobileNumber)
      // Clearing the email to blank isn't a "claim" of anything, so it's
      // still allowed to go straight through — only a NEW address is gated.
      if (emailChanged && !newEmail) formData.append('clear_email', '1')
      if (editPhoto) formData.append('profile_photo', editPhoto)
      formData.append('farm_name', editFarmName)
      formData.append('barangay', editBarangay)
      formData.append('farm_size', editFarmSize)
      formData.append('lot_number', editLotNumber)
      formData.append('street', editStreet)
      formData.append('landmark', editLandmark)

      await api.post(`/admin/farms/${farm.id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      invalidateCache('/admin/farms')
      await refetch()
      setIsEditingAccount(false)
      setEditPhoto(null)

      if (emailChanged && newEmail) {
        setPendingOwnerEmail(newEmail)
      } else {
        setAccountEditSuccess('Account updated successfully.')
      }
    } catch (err) {
      setAccountEditError(err.response?.data?.message || 'Failed to update account information.')
    } finally {
      setAccountSaving(false)
    }
  }

  useEffect(() => {
    if (farm && searchParams.get('edit') === '1' && !isEditingAccount) {
      // One-time auto-open triggered by a URL param from the Farms list's
      // Edit action, not a render-derived state sync.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      startEditAccount()
      setSearchParams({}, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farm])

  if (loading) {
    return (
      <AdminLayout>
        <p style={styles.stateText}>Loading farm profile…</p>
      </AdminLayout>
    )
  }

  if (error || !farm) {
    return (
      <AdminLayout>
        <p style={{ ...styles.stateText, color: '#b91c1c' }}>{error || 'Farm not found.'}</p>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <style>{responsiveCss}</style>

      <button type="button" style={styles.backBtn} onClick={() => navigate('/superadmin/farms')}>
        ← Back
      </button>

      <div style={styles.headerCard}>
        <div style={styles.headerLeft}>
          <span style={styles.avatarCircle}>
            {farm.owner_profile_photo_url ? (
              <img src={farm.owner_profile_photo_url} alt={farm.owner_name} style={styles.avatarImg} />
            ) : (
              initials || '—'
            )}
          </span>
          <div>
            <div style={styles.ownerName}>{farm.owner_name}</div>
            <div style={styles.farmSub}>
              {farm.farm_name}
              <span style={{
                ...styles.statusPill,
                color: isActive ? '#2c8047' : '#6b7280',
                backgroundColor: isActive ? '#eaf3ec' : '#f0f1ec',
              }}>
                <span style={{ ...styles.pillDot, backgroundColor: isActive ? '#2c8047' : '#6b7280' }} />
                {farm.status}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div style={styles.tabsRow}>
        {TABS.map(t => (
          <button
            key={t.key}
            style={{ ...styles.tab, ...(activeTab === t.key ? styles.tabActive : {}) }}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'info' && (
        <div style={{ ...styles.infoColumns, ...(isMobile ? styles.infoColumnsMobile : {}) }}>
          <div style={styles.infoColumn}>
            <Card
              title="Account Information"
              action={!isEditingAccount && (
                <button type="button" onClick={startEditAccount} style={acctStyles.editBtn}>
                  <EditIcon /> Edit Account
                </button>
              )}
            >
              {accountEditError && <div style={acctStyles.errorBox}>{accountEditError}</div>}
              {accountEditSuccess && <div style={acctStyles.successBox}>{accountEditSuccess}</div>}
              <form onSubmit={handleSaveAccount}>
                <FarmPhotoUpload
                  file={editPhoto}
                  setFile={setEditPhoto}
                  existingUrl={farm.owner_profile_photo_url}
                  editable={isEditingAccount}
                  initials={initials}
                />

                <div style={{ ...acctStyles.row, ...(isMobile ? acctStyles.rowMobile : {}) }}>
                  <FarmField label="Full Name" value={editFullName} onChange={setEditFullName} editing={isEditingAccount} display={farm.owner_name} />
                  <FarmField
                    label="Mobile Number"
                    value={editMobileNumber}
                    onChange={v => setEditMobileNumber(sanitizePhoneInput(v))}
                    editing={isEditingAccount}
                    display={farm.mobile_number}
                    type="tel"
                    inputMode="numeric"
                    maxLength={11}
                  />
                </div>

                <div style={{ ...acctStyles.row, ...(isMobile ? acctStyles.rowMobile : {}) }}>
                  <FarmField label="Email Address" value={editEmail} onChange={setEditEmail} editing={isEditingAccount} display={farm.user?.email} type="email" />
                  <FarmField label="Account Status" value={farm.status} onChange={() => {}} editing={false} display={farm.status} />
                </div>

                <div style={styles.sectionDivider}>
                  <span style={styles.sectionDividerLabel}>Farm Details</span>
                </div>

                <div style={{ ...acctStyles.row, ...(isMobile ? acctStyles.rowMobile : {}) }}>
                  <FarmField label="Farm Name" value={editFarmName} onChange={setEditFarmName} editing={isEditingAccount} display={farm.farm_name} />
                  <div style={acctStyles.fieldGroup}>
                    <label style={acctStyles.label}>Address</label>
                    <input value={farm.address || ''} disabled style={{ ...acctStyles.input, ...acctStyles.inputDisabled }} />
                  </div>
                </div>

                <div style={{ ...acctStyles.row, ...(isMobile ? acctStyles.rowMobile : {}) }}>
                  <FarmField label="Lot No. (optional)" value={editLotNumber} onChange={setEditLotNumber} editing={isEditingAccount} display={farm.lot_number || '—'} />
                  <FarmField label="Street (optional)" value={editStreet} onChange={setEditStreet} editing={isEditingAccount} display={farm.street || '—'} />
                </div>

                <div style={{ ...acctStyles.row, ...(isMobile ? acctStyles.rowMobile : {}) }}>
                  <FarmField label="Barangay" value={editBarangay} onChange={setEditBarangay} editing={isEditingAccount} display={farm.barangay} type="select" options={BARANGAYS} />
                  <FarmField label="Landmark (optional)" value={editLandmark} onChange={setEditLandmark} editing={isEditingAccount} display={farm.landmark || '—'} />
                </div>

                <div style={{ ...acctStyles.row, ...(isMobile ? acctStyles.rowMobile : {}) }}>
                  <FarmField label="Farm Size" value={editFarmSize} onChange={setEditFarmSize} editing={isEditingAccount} display={farm.farm_size} type="select" options={FARM_SIZES} />
                  <div style={acctStyles.fieldGroup}>
                    <label style={acctStyles.label}>Date Registered</label>
                    <input value={formatRegistrationDate(farm.created_at)} disabled style={{ ...acctStyles.input, ...acctStyles.inputDisabled }} />
                  </div>
                </div>

                {isEditingAccount && (
                  <div style={{ display: 'flex', gap: '10px', ...(isMobile ? { flexDirection: 'column' } : {}) }}>
                    <button
                      type="submit"
                      disabled={accountSaving}
                      style={{ ...acctStyles.saveBtn, ...(isMobile ? acctStyles.btnFull : {}) }}
                    >
                      {accountSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEditAccount}
                      style={{ ...acctStyles.cancelBtn, ...(isMobile ? acctStyles.btnFull : {}) }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </form>
            </Card>
          </div>

          <div style={styles.infoColumn}>
            <Card title="Sensor & Monitoring">
              <div style={styles.infoGrid}>
                <InfoCell label="Device Name" value={deviceSensor?.label || deviceSensor?.sensor_code} />
                <div>
                  <div style={styles.infoLabel}>Sensor Status</div>
                  {hasRegisteredDevice ? (
                    <span style={{
                      ...styles.miniPill,
                      color: isSensorOnline ? '#2c8047' : '#9ca3af',
                      backgroundColor: isSensorOnline ? '#eaf3ec' : '#f0f1ec',
                    }}>
                      <span style={{ ...styles.pillDot, backgroundColor: isSensorOnline ? '#2c8047' : '#9ca3af' }} />
                      {isSensorOnline ? 'Online' : 'Offline'}
                    </span>
                  ) : (
                    <span style={{ ...styles.miniPill, color: '#9ca3af', backgroundColor: '#f0f1ec' }}>
                      <span style={{ ...styles.pillDot, backgroundColor: '#9ca3af' }} />
                      Not Registered
                    </span>
                  )}
                </div>
                <InfoCell label="Last Synchronization" value={reading?.created_at ? new Date(reading.created_at).toLocaleString() : null} />
              </div>
            </Card>

            {reading && riskLevel ? (
              <Card title="Current Monitoring Status">
                <div style={{ ...styles.monitoringRow, ...(isMobile ? styles.monitoringRowMobile : {}) }}>
                  <div style={{ ...styles.heroCard, backgroundColor: overallHero.fill }}>
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: '64px', color: '#fff', lineHeight: 1 }}
                    >
                      {overallHero.iconName}
                    </span>
                    <div style={styles.heroTitle}>{overallHero.title}</div>
                  </div>

                  <div style={styles.metricGrid}>
                    <MetricBox type="ammonia" label="Ammonia" value={reading.ammonia} unit="ppm" status={reading.ammonia_status} />
                    <MetricBox type="temperature" label="Temperature" value={reading.temperature} unit="°C" status={reading.temperature_status} />
                    <MetricBox type="humidity" label="Humidity" value={reading.humidity} unit="%" status={reading.humidity_status} />
                    <MetricBox type="moisture" label="Moisture" value={reading.moisture} unit="%" status={reading.moisture_status} />
                  </div>
                </div>
              </Card>
            ) : (
              <Card title="Current Monitoring Status">
                <div style={styles.empty}>No sensor connected to this farm yet.</div>
              </Card>
            )}

            {reading && (
              <Card title="AI Insight">
                {insightLoading && <div style={styles.empty}>Analyzing sensor data…</div>}
                {!insightLoading && insight && (
                  <div style={styles.insightCard}>
                    <div style={styles.insightHeader}>
                      <span style={styles.insightRootCause}>{insight.diagnosis.root_cause}</span>
                      <span style={{ ...styles.confidenceTag, color: overall.color, backgroundColor: overall.bg }}>
                        {insight.diagnosis.confidence}% confidence
                      </span>
                    </div>
                    {getExplanationText(insight) ? (
                      <p style={styles.insightExplanation}>{getExplanationText(insight)}</p>
                    ) : (
                      <p style={styles.insightExplanationUnavailable}>Explanation unavailable right now — the diagnosis above is still accurate.</p>
                    )}
                  </div>
                )}
                {!insightLoading && !insight && <div style={styles.empty}>Insight unavailable for this farm right now.</div>}
              </Card>
            )}

            <Card title="Recent Alerts">
              {alertsLoading && <div style={styles.empty}>Loading…</div>}
              {!alertsLoading && (alertsData?.length ?? 0) === 0 && (
                <div style={styles.empty}>No recent alerts for this farm.</div>
              )}
              {!alertsLoading && alertsData?.length > 0 && (
                <div style={tableStyles.wrap}>
                  <table style={tableStyles.table}>
                    <thead>
                      <tr>
                        <th style={tableStyles.th}>Date & Time</th>
                        <th style={tableStyles.th}>Type</th>
                        <th style={tableStyles.th}>Reading</th>
                        <th style={tableStyles.th}>Status</th>
                        <th style={tableStyles.th}>Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {alertsData.map(a => (
                        <tr key={a.id}>
                          <td style={tableStyles.td}>{new Date(a.created_at).toLocaleString()}</td>
                          <td style={tableStyles.td}>{a.type}</td>
                          <td style={tableStyles.td}>{a.reading}</td>
                          <td style={tableStyles.td}>
                            <span style={{ color: (STATUS[a.status] || STATUS.Offline).color, fontWeight: 700 }}>{a.status}</span>
                          </td>
                          <td style={tableStyles.td}>{a.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {activeTab === 'cleanout' && (
        <Card title="Manure Clean-out" badge={farm.maintenance_status?.status} badgeColor={maintBadgeColor(farm.maintenance_status?.status)}>
          <div style={styles.infoGrid}>
            <InfoCell label="Last Logged" value={farm.maintenance_status?.last_performed_at || 'No clean-out logged yet'} />
            <InfoCell label="Days Since" value={farm.maintenance_status ? `${farm.maintenance_status.days_since} of ~${farm.maintenance_status.expected_interval_days} expected` : null} />
          </div>

          {cleanoutLoading && <div style={styles.empty}>Loading…</div>}
          {!cleanoutLoading && (cleanoutData?.logs?.length ?? 0) === 0 && (
            <div style={styles.empty}>No clean-out records logged for this farm yet.</div>
          )}
          {!cleanoutLoading && cleanoutData?.logs?.length > 0 && (
            <>
              <div style={tableStyles.wrap}>
                <table style={tableStyles.table}>
                  <thead>
                    <tr>
                      <th style={{ ...tableStyles.th, ...tableStyles.thSortable }} onClick={() => setCleanoutSort(s => (s === 'asc' ? 'desc' : 'asc'))}>
                        Date {cleanoutSort === 'asc' ? '▲' : '▼'}
                      </th>
                      <th style={tableStyles.th}>Notes</th>
                      <th style={{ ...tableStyles.th, textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCleanoutLogs.map(log => (
                      <tr key={log.id}>
                        <td style={tableStyles.td}>{log.performed_at}</td>
                        <td style={tableStyles.td}><span style={tableStyles.truncate}>{log.notes || '—'}</span></td>
                        <td style={{ ...tableStyles.td, textAlign: 'right' }}>
                          <span style={tableStyles.viewLink} onClick={() => setCleanoutViewLog(log)}>View</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                currentPage={cleanoutData.current_page}
                lastPage={cleanoutData.last_page}
                pageSize={cleanoutPageSize}
                total={cleanoutData.total}
                onPageChange={setCleanoutPage}
                onPageSizeChange={handleCleanoutPageSizeChange}
                isMobile={isMobile}
              />
            </>
          )}
        </Card>
      )}

      {activeTab === 'disposal' && (
        <Card title="Manure Disposal Records">
          {disposalLoading && <div style={styles.empty}>Loading…</div>}
          {!disposalLoading && (disposalData?.records?.length ?? 0) === 0 && (
            <div style={styles.empty}>No disposal records logged for this farm yet.</div>
          )}
          {!disposalLoading && disposalData?.records?.length > 0 && (
            <>
              <div className="no-print" style={filterStyles.filterBar}>
                <div style={filterStyles.filterField}>
                  <label style={filterStyles.filterLabel}>From</label>
                  <input type="date" value={draftDisposalFrom} onChange={e => setDraftDisposalFrom(e.target.value)} style={filterStyles.filterSelect} />
                </div>

                <div style={filterStyles.filterField}>
                  <label style={filterStyles.filterLabel}>To</label>
                  <input type="date" value={draftDisposalTo} onChange={e => setDraftDisposalTo(e.target.value)} style={filterStyles.filterSelect} />
                </div>

                {disposalMethods.length > 0 && (
                  <div style={filterStyles.filterField}>
                    <label style={filterStyles.filterLabel}>Method</label>
                    <select
                      value={draftDisposalMethod}
                      onChange={e => setDraftDisposalMethod(e.target.value)}
                      style={filterStyles.filterSelect}
                    >
                      <option value="">All Methods</option>
                      {disposalMethods.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                )}

                <div style={filterStyles.filterActions}>
                  <button type="button" onClick={resetDisposalFilter} style={filterStyles.filterResetBtn}>Reset</button>
                  <button type="button" onClick={applyDisposalFilter} style={filterStyles.filterApplyBtn}>Apply</button>
                </div>
              </div>

              <div style={tableStyles.wrap}>
                <table style={tableStyles.table}>
                  <thead>
                    <tr>
                      <th style={{ ...tableStyles.th, ...tableStyles.thSortable }} onClick={() => toggleDisposalSort('disposal_date')}>
                        Date {disposalSort.field === 'disposal_date' && (disposalSort.dir === 'asc' ? '▲' : '▼')}
                      </th>
                      <th style={tableStyles.th}>Method</th>
                      <th style={tableStyles.th}>Buyer</th>
                      <th style={{ ...tableStyles.th, ...tableStyles.thSortable }} onClick={() => toggleDisposalSort('quantity')}>
                        Quantity {disposalSort.field === 'quantity' && (disposalSort.dir === 'asc' ? '▲' : '▼')}
                      </th>
                      <th style={{ ...tableStyles.th, textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSortedDisposal.map(r => (
                      <tr key={r.id}>
                        <td style={tableStyles.td}>{r.disposal_date}</td>
                        <td style={tableStyles.td}>{r.disposal_method}</td>
                        <td style={tableStyles.td}>{r.buyer_name || '—'}</td>
                        <td style={tableStyles.td}>{r.quantity} kg</td>
                        <td style={{ ...tableStyles.td, textAlign: 'right' }}>
                          <span style={tableStyles.viewLink} onClick={() => setDisposalViewRecord(r)}>View</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                currentPage={disposalData.current_page}
                lastPage={disposalData.last_page}
                pageSize={disposalPageSize}
                total={disposalData.total}
                onPageChange={setDisposalPage}
                onPageSizeChange={handleDisposalPageSizeChange}
                isMobile={isMobile}
              />
            </>
          )}
        </Card>
      )}

      {activeTab === 'inspections' && (
        <Card title="Inspection Summary">
          {inspectionLoading && <div style={styles.empty}>Loading…</div>}
          {!inspectionLoading && (inspectionData?.inspections?.length ?? 0) === 0 && (
            <div style={styles.empty}>No inspections recorded for this farm yet.</div>
          )}
          {!inspectionLoading && inspectionData?.inspections?.length > 0 && (
            <>
              <div className="no-print" style={filterStyles.filterBar}>
                <div style={filterStyles.filterField}>
                  <label style={filterStyles.filterLabel}>From</label>
                  <input type="date" value={draftInspectionFrom} onChange={e => setDraftInspectionFrom(e.target.value)} style={filterStyles.filterSelect} />
                </div>

                <div style={filterStyles.filterField}>
                  <label style={filterStyles.filterLabel}>To</label>
                  <input type="date" value={draftInspectionTo} onChange={e => setDraftInspectionTo(e.target.value)} style={filterStyles.filterSelect} />
                </div>

                <div style={filterStyles.filterField}>
                  <label style={filterStyles.filterLabel}>Inspection Type</label>
                  <select
                    value={draftInspectionType}
                    onChange={e => setDraftInspectionType(e.target.value)}
                    style={filterStyles.filterSelect}
                  >
                    <option value="">All Types</option>
                    {INSPECTION_TYPES.map(t => (
                      <option key={t} value={t}>{t === 'Follow-up' ? 'Follow-up Inspection' : t}</option>
                    ))}
                  </select>
                </div>

                <div style={filterStyles.filterActions}>
                  <button type="button" onClick={resetInspectionFilter} style={filterStyles.filterResetBtn}>Reset</button>
                  <button type="button" onClick={applyInspectionFilter} style={filterStyles.filterApplyBtn}>Apply</button>
                </div>
              </div>

              <div style={tableStyles.wrap}>
                <table style={tableStyles.table}>
                  <thead>
                    <tr>
                      <th style={{ ...tableStyles.th, ...tableStyles.thSortable }} onClick={() => toggleInspectionSort('type')}>
                        Type {inspectionSort.field === 'type' && (inspectionSort.dir === 'asc' ? '▲' : '▼')}
                      </th>
                      <th style={tableStyles.th}>Status</th>
                      <th style={{ ...tableStyles.th, ...tableStyles.thSortable }} onClick={() => toggleInspectionSort('date')}>
                        Date {inspectionSort.field === 'date' && (inspectionSort.dir === 'asc' ? '▲' : '▼')}
                      </th>
                      <th style={{ ...tableStyles.th, textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSortedInspections.map(i => {
                      const done = i.status === 'Completed'
                      return (
                        <tr key={i.id}>
                          <td style={tableStyles.td}>{i.inspection_type}</td>
                          <td style={tableStyles.td}>
                            <span style={{
                              ...styles.miniPill,
                              color: done ? '#256b3d' : '#b45309',
                              backgroundColor: done ? '#eaf3ec' : '#fbf1e2',
                            }}>{i.status}</span>
                          </td>
                          <td style={tableStyles.td}>{done ? i.completed_at : i.scheduled_at}</td>
                          <td style={{ ...tableStyles.td, textAlign: 'right' }}>
                            <span style={tableStyles.viewLink} onClick={() => setInspectionViewRecord(i)}>View</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination
                currentPage={inspectionData.current_page}
                lastPage={inspectionData.last_page}
                pageSize={inspectionPageSize}
                total={inspectionData.total}
                onPageChange={setInspectionPage}
                onPageSizeChange={handleInspectionPageSizeChange}
                isMobile={isMobile}
              />
            </>
          )}
        </Card>
      )}

      {activeTab === 'servicerequests' && (
        <Card title="Service Requests">
          {serviceRequestLoading && <div style={styles.empty}>Loading…</div>}
          {!serviceRequestLoading && (serviceRequestData?.requests?.length ?? 0) === 0 && (
            <div style={styles.empty}>No service requests recorded for this farm yet.</div>
          )}
          {!serviceRequestLoading && serviceRequestData?.requests?.length > 0 && (
            <>
              <div className="no-print" style={filterStyles.filterBar}>
                <div style={filterStyles.filterField}>
                  <label style={filterStyles.filterLabel}>From</label>
                  <input type="date" value={draftServiceRequestFrom} onChange={e => setDraftServiceRequestFrom(e.target.value)} style={filterStyles.filterSelect} />
                </div>

                <div style={filterStyles.filterField}>
                  <label style={filterStyles.filterLabel}>To</label>
                  <input type="date" value={draftServiceRequestTo} onChange={e => setDraftServiceRequestTo(e.target.value)} style={filterStyles.filterSelect} />
                </div>

                <div style={filterStyles.filterField}>
                  <label style={filterStyles.filterLabel}>Type</label>
                  <select
                    value={draftServiceRequestType}
                    onChange={e => setDraftServiceRequestType(e.target.value)}
                    style={filterStyles.filterSelect}
                  >
                    <option value="">All Types</option>
                    {SERVICE_REQUEST_TYPES.map(t => (
                      <option key={t} value={t}>{serviceTypeLabel(t)}</option>
                    ))}
                  </select>
                </div>

                <div style={filterStyles.filterActions}>
                  <button type="button" onClick={resetServiceRequestFilter} style={filterStyles.filterResetBtn}>Reset</button>
                  <button type="button" onClick={applyServiceRequestFilter} style={filterStyles.filterApplyBtn}>Apply</button>
                </div>
              </div>

              <div style={tableStyles.wrap}>
                <table style={tableStyles.table}>
                  <thead>
                    <tr>
                      <th style={tableStyles.th}>Request Type</th>
                      <th style={tableStyles.th}>Request Date</th>
                      <th style={tableStyles.th}>Status</th>
                      <th style={tableStyles.th}>Accepted By</th>
                      <th style={tableStyles.th}>Date Completed</th>
                      <th style={{ ...tableStyles.th, textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredServiceRequests.map(r => {
                      return (
                        <tr key={r.id}>
                          <td style={tableStyles.td}>
                            <span style={{ ...styles.miniPill, ...serviceTypeBadgeStyle(r.request_type) }}>
                              {serviceTypeLabel(r.request_type)}
                            </span>
                          </td>
                          <td style={tableStyles.td}>{r.request_date}</td>
                          <td style={tableStyles.td}>
                            <span style={{ ...styles.miniPill, ...requestStatusBadgeStyle(r.status) }}>{r.status}</span>
                          </td>
                          <td style={tableStyles.td}>{r.accepted_by || '—'}</td>
                          <td style={tableStyles.td}>{r.completed_at || '—'}</td>
                          <td style={{ ...tableStyles.td, textAlign: 'right' }}>
                            <span style={tableStyles.viewLink} onClick={() => setServiceRequestViewRecord(r)}>View</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination
                currentPage={serviceRequestData.current_page}
                lastPage={serviceRequestData.last_page}
                pageSize={serviceRequestPageSize}
                total={serviceRequestData.total}
                onPageChange={setServiceRequestPage}
                onPageSizeChange={handleServiceRequestPageSizeChange}
                isMobile={isMobile}
              />
            </>
          )}
        </Card>
      )}

      {activeTab === 'devices' && (
        <DevicesSection farmId={farm.id} onDeviceChange={() => { invalidateCache('/admin/farms'); refetch() }} />
      )}

      {lightboxImage && (
        <div style={lightboxStyles.overlay} onClick={() => setLightboxImage(null)}>
          <button style={lightboxStyles.closeBtn} onClick={() => setLightboxImage(null)} aria-label="Close preview">×</button>
          <img src={lightboxImage} alt="Clean-out proof" style={lightboxStyles.image} onClick={e => e.stopPropagation()} />
        </div>
      )}

      {pendingOwnerEmail && (
        <VerifyEmailChangeModal
          email={pendingOwnerEmail}
          requestUrl={`/admin/farms/${farm.id}/email/otp/request`}
          verifyUrl={`/admin/farms/${farm.id}/email/otp/verify`}
          onCancel={() => {
            setPendingOwnerEmail(null)
            setEditEmail(farm.user?.email || '')
          }}
          onVerified={async () => {
            invalidateCache('/admin/farms')
            await refetch()
            setPendingOwnerEmail(null)
            setAccountEditSuccess('Email verified successfully.')
          }}
        />
      )}

      {cleanoutViewLog && (
        <CleanoutRecordModal
          log={cleanoutViewLog}
          onPhotoClick={() => setLightboxImage(cleanoutViewLog.photo_url)}
          onClose={() => setCleanoutViewLog(null)}
        />
      )}

      {disposalViewRecord && (
        <RecordDetailModal
          title="Disposal Record"
          onClose={() => setDisposalViewRecord(null)}
          rows={[
            { label: 'Date', value: disposalViewRecord.disposal_date },
            { label: 'Method', value: disposalViewRecord.disposal_method },
            { label: 'Buyer', value: disposalViewRecord.buyer_name || '—' },
            { label: 'Quantity', value: `${disposalViewRecord.quantity} kg` },
            { label: 'Notes', value: disposalViewRecord.notes || '—' },
          ]}
        />
      )}

      {inspectionViewRecord && (
        <RecordDetailModal
          title="Inspection Record"
          onClose={() => setInspectionViewRecord(null)}
          rows={[
            { label: 'Type', value: inspectionViewRecord.inspection_type },
            { label: 'Status', value: inspectionViewRecord.status },
            {
              label: inspectionViewRecord.status === 'Completed' ? 'Completed' : 'Scheduled',
              value: inspectionViewRecord.status === 'Completed' ? inspectionViewRecord.completed_at : inspectionViewRecord.scheduled_at,
            },
          ]}
        />
      )}

      {serviceRequestViewRecord && (
        <RecordDetailModal
          title="Service Request"
          onClose={() => setServiceRequestViewRecord(null)}
          rows={[
            { label: 'Request Type', value: (
              <span style={{ ...styles.miniPill, ...serviceTypeBadgeStyle(serviceRequestViewRecord.request_type) }}>
                {serviceTypeLabel(serviceRequestViewRecord.request_type)}
              </span>
            ) },
            { label: 'Request Date', value: serviceRequestViewRecord.request_date },
            { label: 'Status', value: (
              <span style={{ ...styles.miniPill, ...requestStatusBadgeStyle(serviceRequestViewRecord.status) }}>
                {serviceRequestViewRecord.status}
              </span>
            ) },
            { label: 'Accepted By', value: serviceRequestViewRecord.accepted_by || '—' },
            { label: 'Date Completed', value: serviceRequestViewRecord.completed_at || '—' },
          ]}
        />
      )}
    </AdminLayout>
  )
}

function Card({ title, children, badge, badgeColor, action }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <span style={styles.cardTitle}>
          {title}
        </span>
        {action}
        {!action && badge && (
          <span style={{ ...styles.sectionBadge, color: badgeColor, backgroundColor: `${badgeColor}18` }}>{badge}</span>
        )}
      </div>
      {children}
    </div>
  )
}

function InfoCell({ label, value }) {
  return (
    <div>
      <div style={styles.infoLabel}>{label}</div>
      <div style={styles.infoValue}>{value || value === 0 ? value : '—'}</div>
    </div>
  )
}

function FarmField({ label, value, onChange, editing, display, type = 'text', options, inputMode, maxLength }) {
  return (
    <div style={acctStyles.fieldGroup}>
      <label style={acctStyles.label}>{label}</label>
      {editing && type === 'select' ? (
        <select value={value} onChange={e => onChange(e.target.value)} style={acctStyles.input}>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input
          type={editing ? type : 'text'}
          inputMode={inputMode}
          maxLength={maxLength}
          value={editing ? value : (display || '')}
          onChange={e => onChange(e.target.value)}
          disabled={!editing}
          style={{ ...acctStyles.input, ...(!editing ? acctStyles.inputDisabled : {}) }}
        />
      )}
    </div>
  )
}

function FarmPhotoUpload({ file, setFile, existingUrl, editable, initials }) {
  const inputRef = useRef(null)
  const previewUrl = file ? URL.createObjectURL(file) : existingUrl
  const openPicker = () => { if (editable) inputRef.current?.click() }

  return (
    <div style={photoUploadStyles.wrap}>
      <div
        style={{ ...photoUploadStyles.preview, cursor: editable ? 'pointer' : 'default' }}
        onClick={openPicker}
      >
        {previewUrl ? (
          <img src={previewUrl} alt="Owner profile preview" style={photoUploadStyles.previewImg} />
        ) : (
          <span style={photoUploadStyles.placeholder}>{initials || '—'}</span>
        )}
      </div>
      <div>
        <div style={photoUploadStyles.label}>Owner Profile Photo</div>
        <div style={photoUploadStyles.hint}>Optional. JPG or PNG, up to 5MB.</div>
        <span
          style={{ ...photoUploadStyles.btn, cursor: editable ? 'pointer' : 'default' }}
          onClick={openPicker}
        >
          {previewUrl ? 'Change photo' : 'Upload photo'}
        </span>
      </div>
      {editable && (
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={e => setFile(e.target.files?.[0] || null)}
        />
      )}
    </div>
  )
}

function EditIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  )
}

function MetricBox({ type, label, value, unit, status }) {
  const s = STATUS[status] || STATUS.Offline
  const Icon = SENSOR_ICON[type]
  return (
    <div style={styles.metricBox}>
      <div style={styles.metricBoxHead}>
        {Icon && <Icon />}
        <span style={styles.metricBoxLabel}>{label}</span>
      </div>
      <div style={styles.metricValueRow}>
        <span style={styles.metricBoxValue}>
          {value !== null && value !== undefined ? `${value} ${unit}` : '—'}
        </span>
      </div>
      {status && (
        <span style={{ ...styles.metricStatusWord, color: s.color }}>{status}</span>
      )}
    </div>
  )
}

function Pagination({ currentPage, lastPage, pageSize, total, onPageChange, onPageSizeChange, isMobile }) {
  const rangeStart = total === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const rangeEnd = Math.min(currentPage * pageSize, total)

  return (
    <div className="no-print" style={{ ...paginationStyles.wrap, ...(isMobile ? paginationStyles.wrapMobile : {}) }}>
      <div style={paginationStyles.info}>
        {total === 0 ? 'No results' : `Showing ${rangeStart}–${rangeEnd} of ${total}`}
      </div>
      <div style={{ ...paginationStyles.controls, ...(isMobile ? paginationStyles.controlsMobile : {}) }}>
        <select value={pageSize} onChange={e => onPageSizeChange(Number(e.target.value))} style={paginationStyles.pageSizeSelect}>
          {PAGE_SIZE_OPTIONS.map(size => <option key={size} value={size}>{size} / page</option>)}
        </select>
        <SharedPagination currentPage={currentPage} totalPages={lastPage} onPageChange={onPageChange} isMobile={isMobile} />
      </div>
    </div>
  )
}

// Fixed-width, content-sized, view-only modal specifically for Clean-out records.
function CleanoutRecordModal({ log, onPhotoClick, onClose }) {
  return (
    <div style={cleanoutModalStyles.overlay} onClick={onClose}>
      <div style={cleanoutModalStyles.modal} onClick={e => e.stopPropagation()}>
        <div style={cleanoutModalStyles.header}>
          <span style={cleanoutModalStyles.headerTitle}>Clean-out Record</span>
          <span style={cleanoutModalStyles.close} onClick={onClose}>×</span>
        </div>

        <div style={cleanoutModalStyles.body}>
          <div style={cleanoutModalStyles.leftCol}>
            {log.photo_url ? (
              <img
                src={log.photo_url}
                alt="Clean-out"
                style={cleanoutModalStyles.photo}
                onClick={onPhotoClick}
              />
            ) : (
              <div style={cleanoutModalStyles.photoEmpty}>
                <PhotoIcon />
                <span style={cleanoutModalStyles.photoEmptyText}>No photo available</span>
              </div>
            )}
          </div>

          <div style={cleanoutModalStyles.rightCol}>
            <div style={cleanoutModalStyles.infoBox}>
              <div style={cleanoutModalStyles.infoLabel}>Date Performed</div>
              <div style={cleanoutModalStyles.infoValue}>{log.performed_at || '—'}</div>
            </div>

            <div style={cleanoutModalStyles.notesLabel}>Notes</div>
            <div style={cleanoutModalStyles.notesBox}>
              {log.notes || 'No notes provided.'}
            </div>
          </div>
        </div>

        <div style={cleanoutModalStyles.footer}>
          <button style={cleanoutModalStyles.closeBtn} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

function RecordDetailModal({ title, rows, photoUrl, onPhotoClick, onClose }) {
  // "Notes" is free text, not a fixed field — gets the larger bordered
  // notes box instead of sitting in the field grid like the rest.
  const fieldRows = rows.filter(r => r.label !== 'Notes')
  const notesRow = rows.find(r => r.label === 'Notes')

  return (
    <div style={v.overlay} onClick={onClose}>
      <div style={v.modal} onClick={e => e.stopPropagation()}>
        <div style={v.header}>
          <h3 style={v.title}>{title}</h3>
          <span style={v.close} onClick={onClose}>×</span>
        </div>

        {photoUrl && (
          <img src={photoUrl} alt="Record" style={styles.recordModalPhoto} onClick={onPhotoClick} />
        )}

        <span style={v.sectionLabel}>Record Details</span>
        <div style={notesRow ? v.grid : v.gridLast}>
          {fieldRows.map(r => (
            <div key={r.label} style={v.fieldBox}>
              <div style={v.fieldLabel}>{r.label}</div>
              <div style={v.fieldValue}>{r.value ?? '—'}</div>
            </div>
          ))}
        </div>

        {notesRow && (
          <>
            <span style={v.sectionLabel}>Notes</span>
            <div style={v.notesBox}>
              <p style={v.notes}>{notesRow.value || 'No notes provided.'}</p>
            </div>
          </>
        )}

        <div style={v.actions}>
          <button onClick={onClose} style={v.closeBtn}>Close</button>
        </div>
      </div>
    </div>
  )
}

function DevicesSection({ farmId, onDeviceChange }) {
  const { data: sensors, loading, error, refetch } = useCachedFetch(`/admin/farms/${farmId}/sensors`)
  const [showRegister, setShowRegister] = useState(false)
  const [editSensor, setEditSensor] = useState(null)
  const list = sensors || []

  const handleChanged = () => {
    refetch()
    onDeviceChange?.()
  }

  return (
    <Card
      title="Registered Devices"
      action={
        <button type="button" style={deviceStyles.registerBtn} onClick={() => setShowRegister(true)}>
          + Register Device
        </button>
      }
    >
      {loading && <div style={styles.empty}>Loading devices...</div>}
      {error && <div style={{ ...styles.empty, color: '#b91c1c' }}>{error}</div>}
      {!loading && !error && list.length === 0 && (
        <div style={styles.empty}>No devices registered for this farm yet.</div>
      )}
      {!loading && !error && list.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
          {list.map(s => (
            <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '13px 0', borderBottom: '1px solid #f2f3ed' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#16311d' }}>{s.device_name}</span>
                  <span style={{
                    fontSize: '10.5px', fontWeight: 700, padding: '2px 9px', borderRadius: '999px',
                    color: s.status === 'Active' ? '#2c8047' : '#6b7280',
                    backgroundColor: s.status === 'Active' ? '#eaf3ec' : '#f0f1ec',
                  }}>{s.status}</span>
                </div>
                <div style={{ fontSize: '12px', color: '#6b7770', marginTop: '3px', fontFamily: 'monospace' }}>
                  {s.sensor_code}
                </div>
                <div style={{ fontSize: '11.5px', color: '#9aa79d', marginTop: '3px' }}>
                  Installed {s.installed_at}{s.last_seen_at && ` · Last seen ${s.last_seen_at}`}
                </div>
              </div>
              <button type="button" style={deviceStyles.editBtn} onClick={() => setEditSensor(s)}>Edit</button>
            </div>
          ))}
        </div>
      )}

      {showRegister && (
        <RegisterDeviceModal
          farmId={farmId}
          onClose={() => setShowRegister(false)}
          onSuccess={() => { setShowRegister(false); handleChanged() }}
        />
      )}

      {editSensor && (
        <EditDeviceModal
          sensor={editSensor}
          onClose={() => setEditSensor(null)}
          onSuccess={() => { setEditSensor(null); handleChanged() }}
        />
      )}
    </Card>
  )
}

function RegisterDeviceModal({ farmId, onClose, onSuccess }) {
  const [deviceKey, setDeviceKey] = useState('')
  const [installedAt, setInstalledAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [registered, setRegistered] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.post('/admin/sensors', {
        farm_id: farmId,
        device_key: deviceKey,
        installed_at: installedAt,
      })
      setRegistered(res.data.data)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to register device.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={deviceStyles.overlay} onClick={registered ? undefined : onClose}>
      <div style={deviceStyles.modal} onClick={e => e.stopPropagation()}>
        {!registered ? (
          <>
            <div style={deviceStyles.header}>
              <h3 style={deviceStyles.title}>Register Device</h3>
              <span style={deviceStyles.close} onClick={onClose}>×</span>
            </div>

            <form onSubmit={handleSubmit}>
              {error && <div style={deviceStyles.errorBox}>{error}</div>}

              <label style={deviceStyles.label}>Device Key *</label>
              <input
                value={deviceKey}
                onChange={e => setDeviceKey(e.target.value)}
                placeholder="e.g. AGB-AVL0FQW2ZEOP4INCQC17OWGQUR1U7ZAY"
                style={deviceStyles.inputFull}
                required
                autoFocus
              />
              <p style={deviceStyles.hint}>
                Enter the device_key printed/labeled on the physical sensor unit.
              </p>

              <label style={deviceStyles.label}>Installation Date *</label>
              <input
                type="date"
                value={installedAt}
                onChange={e => setInstalledAt(e.target.value)}
                style={deviceStyles.inputFull}
                required
              />
              <p style={deviceStyles.hint}>
                The Device Name is generated automatically from the farm and this date once you register the device.
              </p>

              <div style={deviceStyles.actions}>
                <button type="button" onClick={onClose} style={deviceStyles.cancelBtn}>Cancel</button>
                <button type="submit" disabled={loading} style={deviceStyles.submitBtn}>
                  {loading ? 'Registering...' : 'Register Device'}
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <div style={deviceStyles.header}>
              <h3 style={deviceStyles.title}>Device Registered</h3>
            </div>

            <div style={deviceStyles.successBox}>
              <div style={deviceStyles.successLabel}>Device Name</div>
              <div style={deviceStyles.successCode}>{registered.device_name}</div>
              <p style={deviceStyles.successHint}>
                Write or print this on the device's sticker now, so it's identifiable in the field without needing to look up the system.
              </p>
            </div>

            <div style={deviceStyles.actions}>
              <button type="button" onClick={onSuccess} style={deviceStyles.submitBtn}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function EditDeviceModal({ sensor, onClose, onSuccess }) {
  const [status, setStatus] = useState(sensor.status)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.put(`/admin/sensors/${sensor.id}`, { status })
      onSuccess()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update device.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={deviceStyles.overlay} onClick={onClose}>
      <div style={deviceStyles.modal} onClick={e => e.stopPropagation()}>
        <div style={deviceStyles.header}>
          <h3 style={deviceStyles.title}>Edit Device</h3>
          <span style={deviceStyles.close} onClick={onClose}>×</span>
        </div>

        <p style={deviceStyles.hint}>{sensor.device_name}</p>

        <form onSubmit={handleSubmit}>
          {error && <div style={deviceStyles.errorBox}>{error}</div>}

          <label style={deviceStyles.label}>Status</label>
          <select value={status} onChange={e => setStatus(e.target.value)} style={deviceStyles.inputFull} autoFocus>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>

          <div style={deviceStyles.actions}>
            <button type="button" onClick={onClose} style={deviceStyles.cancelBtn}>Cancel</button>
            <button type="submit" disabled={loading} style={deviceStyles.submitBtn}>
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const SANS = "'Inter', sans-serif"

const styles = {
  stateText: { fontFamily: SANS, fontSize: '14px', color: '#4b5a50' },

  backBtn: {
    display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px',
    borderRadius: '999px', border: '1px solid #dcdfd6', backgroundColor: '#fff',
    color: '#33413a', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: SANS,
    marginBottom: '16px',
  },

  headerCard: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px',
    backgroundColor: '#fff', border: '1px solid #e7e8e0', borderRadius: '14px', padding: '26px 28px', marginBottom: '20px',
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '20px' },
  avatarCircle: {
    width: '68px', height: '68px', borderRadius: '50%', backgroundColor: '#eaf3ec', color: '#2c8047',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', fontWeight: 700,
    flexShrink: 0, overflow: 'hidden', border: '1px solid #d6e5da',
  },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  ownerName: { fontSize: '21px', fontWeight: 800, color: '#16311d', letterSpacing: '-0.01em' },
  farmSub: { fontSize: '13.5px', color: '#7b8a80', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '10px' },
  statusPill: { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '999px', fontSize: '11.5px', fontWeight: 700 },
  pillDot: { width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0 },

  headerActions: { display: 'flex', gap: '10px' },

  tabsRow: { display: 'flex', gap: '26px', borderBottom: '1px solid #e7e8e0', marginBottom: '20px', overflowX: 'auto' },
  tab: { border: 'none', background: 'none', padding: '12px 0', fontFamily: SANS, fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', color: '#8a968d', borderBottom: '2px solid transparent', marginBottom: '-1px' },
  tabActive: { color: '#2c8047', borderBottom: '2px solid #2c8047' },

  infoColumns: { display: 'flex', gap: '16px', alignItems: 'flex-start' },
  infoColumnsMobile: { flexDirection: 'column' },
  infoColumn: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '16px' },

  sectionDivider: { borderTop: '1px solid #eceee7', marginTop: '4px', marginBottom: '18px', paddingTop: '14px' },
  sectionDividerLabel: { fontSize: '11px', fontWeight: 700, color: '#8a968d', textTransform: 'uppercase', letterSpacing: '0.05em' },

  monitoringRow: { display: 'grid', gridTemplateColumns: '200px 1fr', gap: '16px', alignItems: 'stretch' },
  monitoringRowMobile: { gridTemplateColumns: '1fr' },

  heroCard: {
    borderRadius: '14px', padding: '22px 20px', fontFamily: SANS,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    textAlign: 'center', boxSizing: 'border-box', height: '100%', color: '#fff',
  },
  heroTitle: { fontSize: '18px', fontWeight: 800, color: '#fff', marginTop: '12px' },

  card: { backgroundColor: '#fff', border: '1px solid #e7e8e0', borderRadius: '14px', padding: '20px 22px', fontFamily: SANS, height: '100%', boxSizing: 'border-box' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  cardTitle: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 800, color: '#16311d' },
  sectionBadge: { padding: '3px 10px', borderRadius: '999px', fontSize: '10.5px', fontWeight: 700 },

  infoGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '18px 24px' },
  infoLabel: { fontSize: '10.5px', color: '#9aa79d', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '5px' },
  infoValue: { fontSize: '13.5px', color: '#16311d', fontWeight: 600, lineHeight: 1.4, wordBreak: 'break-word' },

  miniPill: { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 11px', borderRadius: '999px', fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap' },

  metricGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' },
  metricBox: { border: '1px solid #eceee7', borderRadius: '14px', padding: '16px 18px', backgroundColor: '#fff' },
  metricBoxHead: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' },
  metricBoxLabel: { fontSize: '13.5px', fontWeight: 700, color: '#16311d' },
  metricValueRow: { display: 'flex', alignItems: 'center', gap: '7px' },
  metricBoxValue: { fontSize: '18px', fontWeight: 700, color: '#16311d' },
  metricStatusWord: { display: 'block', fontSize: '12px', fontWeight: 700, marginTop: '6px' },

  empty: { fontSize: '13px', color: '#9aa79d' },

  insightCard: { backgroundColor: '#fafbf8', border: '1px solid #eceee7', borderRadius: '12px', padding: '16px 18px' },
  insightHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' },
  insightRootCause: { fontSize: '13.5px', fontWeight: 800, color: '#16311d' },
  confidenceTag: { fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '999px' },
  insightExplanation: { fontSize: '12.5px', color: '#5c6b60', lineHeight: 1.6, marginTop: '8px', marginBottom: 0 },
  insightExplanationUnavailable: { fontSize: '12px', color: '#9aa79d', fontStyle: 'italic', marginTop: '8px', marginBottom: 0 },

  recordModalPhoto: { width: '100%', borderRadius: '10px', marginBottom: '14px', cursor: 'zoom-in', display: 'block' },
}

const paginationStyles = {
  wrap: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginTop: '16px', paddingTop: '14px', borderTop: '1px solid #f0efe8', flexWrap: 'wrap', gap: '10px',
  },
  wrapMobile: { flexDirection: 'column', alignItems: 'stretch' },
  info: { fontSize: '12px', color: '#8a968d', whiteSpace: 'nowrap', fontFamily: SANS },
  controls: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
  controlsMobile: { justifyContent: 'space-between' },
  pageSizeSelect: {
    padding: '6px 10px', borderRadius: '8px', border: '1px solid #dcdfd6',
    fontSize: '12px', color: '#4b5a50', marginRight: '6px', fontFamily: SANS, backgroundColor: '#fff', cursor: 'pointer',
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

const tableStyles = {
  wrap: { overflowX: 'auto', marginTop: '14px', border: '1px solid #eceee7', borderRadius: '10px' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '10px 14px', fontSize: '13px', fontWeight: 600, color: '#8a968d', borderBottom: '1px solid #eceee7', backgroundColor: '#fafbf8', whiteSpace: 'nowrap' },
  thSortable: { cursor: 'pointer', userSelect: 'none' },
  td: { padding: '11px 14px', fontSize: '12px', color: '#4b5a50', borderBottom: '1px solid #f2f3ed', verticalAlign: 'top' },
  truncate: { display: 'block', maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  viewLink: {
    display: 'inline-block', padding: '6px 13px', borderRadius: '8px',
    fontSize: '12.5px', fontWeight: 600, cursor: 'pointer',
    border: '1px solid #e3e6dd', backgroundColor: '#fff', color: '#4b5a50', whiteSpace: 'nowrap',
  },
}

// Styling for the Disposal/Inspections/Service Requests tabs' inline
// horizontal filter bar — every dropdown is shown directly on the page
// (no popover), followed by Reset/Apply buttons.
const filterStyles = {
  filterBar: {
    display: 'flex', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap',
    marginTop: '4px', marginBottom: '18px', padding: '14px 16px',
    backgroundColor: '#fafbf8', border: '1px solid #eceee7', borderRadius: '12px',
  },
  filterField: { display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '160px' },
  filterLabel: { fontSize: '11.5px', fontWeight: 700, color: '#4b5a50', textTransform: 'uppercase', letterSpacing: '0.03em' },
  filterSelect: {
    padding: '9px 12px', borderRadius: '10px', border: '1px solid #dcdfd6',
    fontSize: '13px', color: '#33413a', backgroundColor: '#fff', cursor: 'pointer',
    fontFamily: SANS, boxSizing: 'border-box', minWidth: '160px',
  },
  filterActions: { display: 'flex', gap: '10px', marginLeft: 'auto' },
  filterResetBtn: {
    padding: '9px 18px', borderRadius: '10px', border: '1px solid #dcdfd6',
    backgroundColor: '#fff', color: '#33413a', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap',
  },
  filterApplyBtn: {
    padding: '9px 18px', borderRadius: '10px', border: 'none',
    backgroundColor: '#2c8047', color: '#fff', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap',
  },
}

const cleanoutModalStyles = {
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(15,38,22,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '16px' },
  modal: {
    backgroundColor: '#fff', border: '1px solid #e7e8e0', borderRadius: '14px',
    width: '760px', maxWidth: '95vw', maxHeight: '92vh',
    display: 'flex', flexDirection: 'column', fontFamily: SANS, overflow: 'hidden',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '18px 22px', borderBottom: '1px solid #f0efe8', flexShrink: 0,
  },
  headerTitle: { fontSize: '16px', fontWeight: 800, color: '#16311d' },
  close: { fontSize: '22px', cursor: 'pointer', color: '#8a968d', lineHeight: 1 },

  body: { flex: 1, overflowY: 'auto', padding: '20px 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '22px' },

  leftCol: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  photo: { width: '100%', height: '220px', borderRadius: '10px', objectFit: 'cover', display: 'block', cursor: 'zoom-in', border: '1px solid #eceee7' },
  photoEmpty: {
    width: '100%', height: '220px', borderRadius: '10px', border: '1px dashed #dcdfd6', backgroundColor: '#fafbf8',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px',
  },
  photoEmptyText: { fontSize: '12.5px', color: '#9aa79d', fontWeight: 600 },

  notesLabel: { fontSize: '11px', fontWeight: 700, color: '#8a968d', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '4px', marginBottom: '12px' },
  notesBox: {
    border: '1px solid #e7e8e0', borderRadius: '8px', backgroundColor: '#fafbf8',
    padding: '12px 14px', fontSize: '13px', color: '#4b5a50', lineHeight: 1.6,
    height: '140px', overflowY: 'auto', boxSizing: 'border-box',
  },

  rightCol: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  infoBox: {
    border: '1px solid #e7e8e0', borderRadius: '8px', backgroundColor: '#fafbf8',
    padding: '10px 13px', marginBottom: '16px', boxSizing: 'border-box',
  },
  infoLabel: { fontSize: '11.5px', fontWeight: 500, color: '#8a968d', marginBottom: '4px' },
  infoValue: { fontSize: '13.5px', fontWeight: 600, color: '#16311d' },

  footer: { display: 'flex', justifyContent: 'flex-end', padding: '14px 22px', borderTop: '1px solid #f0efe8', flexShrink: 0 },
  closeBtn: { padding: '9px 20px', borderRadius: '8px', border: '1px solid #dcdfd6', backgroundColor: '#fff', color: '#33413a', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: SANS },
}

const lightboxStyles = {
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(10,20,14,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: '24px', cursor: 'zoom-out' },
  closeBtn: { position: 'absolute', top: '20px', right: '24px', width: '36px', height: '36px', borderRadius: '50%', border: 'none', backgroundColor: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: '20px', cursor: 'pointer', zIndex: 2 },
  image: { maxWidth: '90vw', maxHeight: '88vh', borderRadius: '10px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', cursor: 'default' },
}

// Register/Edit Device modals + the Registered Devices list row, for the
// Devices tab's DevicesSection.
const deviceStyles = {
  registerBtn: {
    padding: '7px 14px', borderRadius: '8px', border: '1px solid #2c8047',
    backgroundColor: '#fff', color: '#2c8047', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', fontFamily: SANS,
  },
  editBtn: {
    flexShrink: 0, padding: '6px 13px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer',
    border: '1px solid #e3e6dd', backgroundColor: '#fff', color: '#4b5a50', fontFamily: SANS,
  },
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(15,38,22,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '16px' },
  modal: { backgroundColor: '#fff', borderRadius: '16px', padding: '26px', width: '440px', maxWidth: '92vw', maxHeight: '90vh', overflowY: 'auto', fontFamily: SANS },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  title: { fontSize: '16px', fontWeight: 800, color: '#16311d', margin: 0 },
  close: { fontSize: '20px', cursor: 'pointer', color: '#8a968d' },
  label: { display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#33413a', marginBottom: '5px', marginTop: '12px' },
  inputFull: { width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #dcdfd6', fontSize: '13.5px', boxSizing: 'border-box', fontFamily: SANS },
  hint: { fontSize: '11.5px', color: '#8a968d', margin: '6px 0 0', lineHeight: 1.5 },
  errorBox: { backgroundColor: '#fbeaea', border: '1px solid #f0c9c9', color: '#b91c1c', padding: '10px 14px', borderRadius: '10px', fontSize: '13px', marginBottom: '10px' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' },
  cancelBtn: { padding: '9px 16px', borderRadius: '10px', border: '1px solid #dcdfd6', backgroundColor: '#fff', fontSize: '13.5px', fontWeight: 600, color: '#33413a', cursor: 'pointer', fontFamily: SANS },
  submitBtn: { padding: '9px 16px', borderRadius: '10px', border: 'none', backgroundColor: '#2c8047', color: '#fff', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', fontFamily: SANS },
  successBox: { backgroundColor: '#eaf3ec', border: '1px solid #cfe0d3', borderRadius: '12px', padding: '18px', textAlign: 'center', marginTop: '8px' },
  successLabel: { fontSize: '11px', fontWeight: 700, color: '#5c8a6b', textTransform: 'uppercase', letterSpacing: '0.05em' },
  successCode: { fontSize: '22px', fontWeight: 800, color: '#1f5a34', fontFamily: 'monospace', margin: '8px 0', letterSpacing: '0.03em' },
  successHint: { fontSize: '12px', color: '#4b5a50', lineHeight: 1.5, margin: 0 },
}

// Matches the Manage Accounts (Account Details) inline-edit UI exactly, so
// editing behaves identically across the system: label-above-input fields,
// disabled/gray display state, and the same Edit / Save Changes / Cancel
// button styles.
const acctStyles = {
  editBtn: {
    backgroundColor: 'white', color: '#2E7D32', border: '1px solid #2E7D32',
    borderRadius: '8px', padding: '6px 14px', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: '6px',
  },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
  rowMobile: { gridTemplateColumns: '1fr', gap: '0px' },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' },
  label: { fontSize: '13px', fontWeight: '500', color: '#374151' },
  input: {
    padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db',
    fontSize: '14px', boxSizing: 'border-box', width: '100%',
  },
  inputDisabled: { backgroundColor: '#f9fafb', color: '#6b7280', cursor: 'not-allowed' },
  saveBtn: {
    backgroundColor: '#2E7D32', color: 'white', border: 'none', borderRadius: '8px',
    padding: '10px 20px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', marginTop: '4px',
  },
  cancelBtn: {
    backgroundColor: 'white', color: '#374151', border: '1px solid #d1d5db',
    borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', marginTop: '4px',
  },
  btnFull: { width: '100%', boxSizing: 'border-box' },
  errorBox: {
    backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626',
    padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '14px',
  },
  successBox: {
    backgroundColor: '#f0fdf4', border: '1px solid #86efac', color: '#166534',
    padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '14px',
  },
}

const photoUploadStyles = {
  wrap: { display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px', padding: '12px', backgroundColor: '#fafbf8', borderRadius: '12px', border: '1px solid #eceee7' },
  preview: { width: '56px', height: '56px', borderRadius: '50%', backgroundColor: '#eaf3ec', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, overflow: 'hidden', border: '2px dashed #cfe0d3' },
  previewImg: { width: '100%', height: '100%', objectFit: 'cover' },
  placeholder: { fontSize: '22px', color: '#2c8047', fontWeight: 700 },
  label: { fontSize: '13px', fontWeight: 700, color: '#16311d' },
  hint: { fontSize: '11.5px', color: '#9aa79d', marginTop: '2px' },
  btn: { fontSize: '12px', fontWeight: 700, color: '#2c8047', cursor: 'pointer', marginTop: '4px', display: 'inline-block' },
}