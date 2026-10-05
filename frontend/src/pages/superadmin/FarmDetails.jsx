import { useState, useMemo, useRef, useEffect } from 'react'
import { AMMONIA_UNIT } from '../../utils/ammonia'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import AdminLayout from '../../components/AdminLayout'
import TableScroll from '../../components/TableScroll'
import SharedPagination from '../../components/Pagination'
import ClearDateButton, { DateRangeHeader } from '../../components/ClearDateButton'
import { useCachedFetch, invalidateCache } from '../../hooks/useCachedFetch'
import { LIVE_POLL_MS } from '../../constants/polling'
import DeviceKeyField from '../../components/DeviceKeyField'
import { useIsMobile } from '../../hooks/useIsMobile'
import api from '../../api/axios'
import { parseLocalDate, DISPLAY_TIME_ZONE } from '../../utils/formatDate'
import { BARANGAYS } from '../../constants/barangays'
import { viewModalStyles as v } from '../../styles/viewModalStyles'
import { isValidPhoneNumber, sanitizePhoneInput, PHONE_VALIDATION_MESSAGE } from '../../utils/phoneValidation'
import { serviceTypeBadgeStyle, serviceTypeLabel, requestStatusBadgeStyle } from '../../utils/serviceBadgeStyle'
import VerifyEmailChangeModal from '../../components/VerifyEmailChangeModal'
import FarmLocationMap from '../../components/FarmLocationMap'
import { LOCATION_CONFLICT_MESSAGE, LOCATION_OUTSIDE_MESSAGE, isInsideSanJose } from '../../utils/farmLocation'
import { ALL_TYPES as ALL_SERVICE_TYPES } from '../../constants/serviceTypes'
import { SectionLoader, BtnBusy } from '../../components/Loading'

const FARM_SIZES = ['Small', 'Medium', 'Large']
// 5 is here because the Monitoring tables default to it — a select that
// cannot show its own current value reads as a bug even when the table is
// paging correctly.
const PAGE_SIZE_OPTIONS = [5, 10, 25, 50]

const INSPECTION_TYPES = ['General Inspection', 'Follow-up']
// Super Admin's per-farm Service Requests view is a completed-service history
// covering every type, including the Vet-only ones (see FarmController::serviceRequests()).
const SERVICE_REQUEST_TYPES = ALL_SERVICE_TYPES

// Shared by the Inspections / Manure Disposal / Service Requests tabs'
// From/To date range filters — an empty string on either side means
// "don't restrict that end of the range".
function matchesDateRange(dateValue, fromDate, toDate) {
  if (!fromDate && !toDate) return true
  if (!dateValue) return false
  const d = new Date(dateValue)
  if (isNaN(d.getTime())) return false
  const dOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  if (fromDate && dOnly < parseLocalDate(fromDate)) return false
  if (toDate && dOnly > parseLocalDate(toDate)) return false
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
  // Pinned to Manila. Without it this renders in the VIEWER'S timezone, so a
  // record created at 3am Manila (7pm UTC the day before) showed the previous
  // day on any machine not set to PH time.
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: DISPLAY_TIME_ZONE })
}

function maintBadgeColor(status) {
  if (status === 'Non-Compliant') return '#b91c1c'
  if (status === 'Overdue') return '#b45309'
  return '#2c8047'
}

const STATUS = {
  Safe:     { color: '#256b3d', bg: '#eaf3ec', border: '#cfe0d3' },
  Warning:  { color: '#b45309', bg: '#fbf1e2', border: '#f0e2cf' },
  Critical: { color: '#b91c1c', bg: '#fbeaea', border: '#f0c9c9' },
  'Pending Setup': { color: '#6b7280', bg: '#eef1ea', border: '#e0e3da' },
  Offline:  { color: '#6b7280', bg: '#eef1ea', border: '#e0e3da' },
}

const TABS = [
  { key: 'info', label: 'Farm Information' },
  // Condition-right-now, kept out of 'Farm Information' — that tab answers
  // who and where the farm is, which does not change minute to minute.
  { key: 'monitoring', label: 'Monitoring' },
  { key: 'cleanout', label: 'Manure Clean-out' },
  { key: 'disposal', label: 'Manure Disposal' },
  { key: 'inspections', label: 'Inspections' },
  { key: 'servicerequests', label: 'Service Requests' },
  { key: 'devices', label: 'Devices' },
]



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

  const { data: farm, loading, error, refetch } = useCachedFetch(`/admin/farms/${farmId}`, {}, { pollMs: LIVE_POLL_MS })
  const [activeTab, setActiveTab] = useState('info')

  const [isEditingAccount, setIsEditingAccount] = useState(false)
  // Held apart, because that is how they are stored. Merging them into one
  // box meant the save had to guess where the first name ended.
  const [editFirstName, setEditFirstName] = useState('')
  const [editLastName, setEditLastName] = useState('')
  const [editMobileNumber, setEditMobileNumber] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editPhoto, setEditPhoto] = useState(null)
  const [editFarmName, setEditFarmName] = useState('')
  const [editLotNumber, setEditLotNumber] = useState('')
  const [editStreet, setEditStreet] = useState('')
  const [editBarangay, setEditBarangay] = useState('')
  const [editLandmark, setEditLandmark] = useState('')
  const [editFarmSize, setEditFarmSize] = useState('')
  // Pin dragged on the edit map — null means "untouched", so the backend
  // keeps re-geocoding from the address exactly as before.
  const [editPin, setEditPin] = useState(null)
  const [editLocationConflict, setEditLocationConflict] = useState(false)
  // Server verdict on the edited pin + barangay (null while unchanged).
  const [editLocationCheck, setEditLocationCheck] = useState(null)
  const [accountEditError, setAccountEditError] = useState('')
  const [accountEditSuccess, setAccountEditSuccess] = useState('')
  const [accountSaving, setAccountSaving] = useState(false)
  const [pendingOwnerEmail, setPendingOwnerEmail] = useState(null)
  const [resending, setResending] = useState(false)
  const [resendResult, setResendResult] = useState(null)

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

  // One-click Clear Date per tab: clears draft + applied dates immediately;
  // the tab's other filter (method/type) is untouched.
  const clearDisposalDates = () => {
    setDraftDisposalFrom(''); setDraftDisposalTo('')
    setDisposalFromDate(''); setDisposalToDate('')
  }
  const hasDisposalDate = !!(draftDisposalFrom || draftDisposalTo || disposalFromDate || disposalToDate)
  const clearInspectionDates = () => {
    setDraftInspectionFrom(''); setDraftInspectionTo('')
    setInspectionFromDate(''); setInspectionToDate('')
  }
  const hasInspectionDate = !!(draftInspectionFrom || draftInspectionTo || inspectionFromDate || inspectionToDate)
  const clearServiceRequestDates = () => {
    setDraftServiceRequestFrom(''); setDraftServiceRequestTo('')
    setServiceRequestFromDate(''); setServiceRequestToDate('')
  }
  const hasServiceRequestDate = !!(draftServiceRequestFrom || draftServiceRequestTo || serviceRequestFromDate || serviceRequestToDate)

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
  // Reuses the Alert History endpoint filtered to this farm. An earlier
  // /admin/farms/{id}/alerts was assumed here and never existed, so this
  // panel answered "No recent alerts" for every farm, including ones with
  // open incidents sitting in the Alert History page.
  const { data: alertsData, loading: alertsLoading } = useCachedFetch(
    activeTab === 'monitoring' ? '/admin/alert-history' : null,
    { farm_id: farmId },
    { pollMs: LIVE_POLL_MS }
  )

  // Newest first, keyed on the ISO instant rather than the display string
  // or on whatever order the rows happened to arrive in — so an alert that
  // appears on the next poll lands in the right row, not at the bottom.
  const sortedAlerts = useMemo(() => {
    const at = row => {
      const ms = Date.parse(row.triggered_at_raw)
      return Number.isNaN(ms) ? 0 : ms
    }
    return [...(alertsData || [])].sort((a, b) => at(b) - at(a))
  }, [alertsData])

  // Both Monitoring tables page at five rows. A farm can hold ten houses
  // and the alert list is unbounded, and neither is worth a page-length
  // scroll to reach whatever sits under it.
  const [devicePage, setDevicePage] = useState(1)
  const [devicePageSize, setDevicePageSize] = useState(5)
  const [alertPage, setAlertPage] = useState(1)
  const [alertPageSize, setAlertPageSize] = useState(5)

  const initials = farm ? getInitials(farm.owner_name) : ''
  const isActive = farm?.status === 'Active'

  // Two different things used to both read "Active" on this page: the pill
  // beside the farm name (farms.status) and a field LABELLED "Account Status"
  // that was also showing farms.status. The owner's real login state
  // (users.status) was never displayed at all, so a farm owner locked out of
  // the system still looked Active here. The pill now says which one it is,
  // and this field reports the account.
  // Shown only when it is NOT the normal state. As a permanent field reading
  // "Can sign in" it was noise on every farm, and a field that always says the
  // same thing stops being read — including on the one farm where it would
  // have said "Sign-in disabled".
  const ownerActive = farm?.user?.status === 'active'
  const ownerSignInProblem = !farm?.user
    ? 'This farm has no owner account, so nobody can sign in to it.'
    : !ownerActive
      ? 'This owner is deactivated and cannot sign in, even with a new password.'
      : null

  // A farm runs one device per poultry house, so this panel lists every
  // registered unit with its OWN status. It used to be one comma-joined line
  // sharing a single farm-level Online/Offline pill, which could not say
  // which house had gone quiet. `device_list` is built by the backend;
  // falling back to `sensors` keeps this readable if the API is older than
  // the deployed frontend.
  // Which metrics this page may badge. The server owns the list, so Admin
  // and the farm owner always agree on whether a house is Critical.
  const alertingMetrics = Array.isArray(farm?.alerting_metrics) && farm.alerting_metrics.length
    ? farm.alerting_metrics
    : ['ammonia']

  const deviceList = farm?.device_list ?? (farm?.sensors ?? []).map(s => ({
    id: s.id,
    device_name: s.label || s.sensor_code,
    status: s.status,
    connectivity: farm?.connectivity === 'Online' ? 'Online' : 'Offline',
    last_seen_at: s.last_seen_at,
    installed_at: s.installed_at,
  }))

  // Only houses that have actually reported appear in the monitoring
  // table, and the paging maths has to count the same list the rows do.
  const reportingDevices = deviceList.filter(d => d.has_reading)

  const sortedCleanoutLogs = useMemo(() => {
    const list = cleanoutData?.logs || []
    return [...list].sort((a, b) => {
      const da = new Date(a.performed_at || 0)
      const db = new Date(b.performed_at || 0)
      return cleanoutSort === 'asc' ? da - db : db - da
    })
  }, [cleanoutData, cleanoutSort])

  // Served by the API from the canonical list plus anything this farm has
  // actually stored, so every valid method is offered no matter which
  // records landed on the current page. The old version read only the
  // loaded page, so a method with no row on that page vanished from the
  // filter. Falls back to deriving from the page if an older API build
  // does not send the list.
  const disposalMethods = useMemo(() => {
    if (disposalData?.disposal_methods?.length) return disposalData.disposal_methods
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
    // From the stored columns, not by re-splitting the joined copy.
    setEditFirstName(farm.user?.first_name || '')
    setEditLastName(farm.user?.last_name || '')
    setEditMobileNumber(farm.mobile_number || '')
    setEditEmail(farm.user?.email || '')
    setEditPhoto(null)
    setEditFarmName(farm.farm_name || '')
    setEditLotNumber(farm.lot_number || '')
    setEditStreet(farm.street || '')
    setEditBarangay(farm.barangay || BARANGAYS[0])
    setEditLandmark(farm.landmark || '')
    setEditFarmSize(farm.farm_size || FARM_SIZES[0])
    setEditPin(null)
    setEditLocationConflict(false)
    setEditLocationCheck(null)
    setAccountEditError('')
    setAccountEditSuccess('')
    setIsEditingAccount(true)
  }

  const cancelEditAccount = () => {
    setIsEditingAccount(false)
    setEditPhoto(null)
    setAccountEditError('')
  }

  // Issues a fresh temporary password and texts it to the owner. The old
  // password stops working immediately, so when the SMS fails the API hands
  // the new one back for the Admin to relay by hand — otherwise the owner
  // would be locked out with no way in short of editing the database.
  const handleResendSms = async () => {
    const ownerId = farm?.user?.id
    if (!ownerId || resending) return

    setResending(true)
    setResendResult(null)

    try {
      const res = await api.post(`/admin/farms/${ownerId}/resend-sms`)
      setResendResult(res.data)
    } catch (err) {
      setResendResult({
        success: false,
        message: err.response?.data?.message || 'Could not reach the server. Try again.',
      })
    } finally {
      setResending(false)
    }
  }

  const handleSaveAccount = async (e) => {
    e.preventDefault()
    setAccountEditError('')
    setAccountEditSuccess('')

    if (!isValidPhoneNumber(editMobileNumber)) {
      setAccountEditError(PHONE_VALIDATION_MESSAGE)
      return
    }

    if (editLocationConflict) {
      setAccountEditError(LOCATION_CONFLICT_MESSAGE)
      return
    }
    if (editPin && !isInsideSanJose(editPin.lat, editPin.lng)) {
      setAccountEditError(LOCATION_OUTSIDE_MESSAGE)
      return
    }
    // Outside / barangay mismatch / still checking — the server re-runs the
    // same rules on save regardless.
    if (editLocationCheck && !editLocationCheck.ok) {
      setAccountEditError(editLocationCheck.message)
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

      const formData = new FormData()
      formData.append('_method', 'PUT')
      formData.append('first_name', editFirstName.trim())
      formData.append('last_name', editLastName.trim())
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
      if (editPin) {
        formData.append('latitude', editPin.lat)
        formData.append('longitude', editPin.lng)
      }

      const res = await api.post(`/admin/farms/${farm.id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      // A 2xx that still reports success: false means the write did not
      // land. Treated as a failure so the form can never claim a save the
      // database did not make.
      if (res.data?.success === false) {
        throw new Error(res.data?.message || 'Unable to update the farm information. Please try again.')
      }
      invalidateCache('/admin/farms')
      await refetch()
      setIsEditingAccount(false)
      setEditPhoto(null)

      if (emailChanged && newEmail) {
        setPendingOwnerEmail(newEmail)
      } else {
        // The server's own wording, so the confirmation comes from the
        // response that proved the update rather than from a constant.
        setAccountEditSuccess(res.data?.message || 'Farm information updated successfully.')
      }
    } catch (err) {
      setAccountEditError(err.response?.data?.message || err.message || 'Unable to update the farm information. Please try again.')
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
                Farm {farm.status}
              </span>
              {farm.user && !ownerActive && (
                <span style={{ ...styles.statusPill, color: "#b45309", backgroundColor: "#fbf1e2" }}>
                  <span style={{ ...styles.pillDot, backgroundColor: "#b45309" }} />
                  Owner sign-in disabled
                </span>
              )}
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
                  <FarmField label="First Name" value={editFirstName} onChange={setEditFirstName} editing={isEditingAccount} display={farm.user?.first_name} />
                  <FarmField label="Last Name" value={editLastName} onChange={setEditLastName} editing={isEditingAccount} display={farm.user?.last_name} />
                </div>

                <div style={{ ...acctStyles.row, ...(isMobile ? acctStyles.rowMobile : {}) }}>
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
                  <FarmField label="Email Address" value={editEmail} onChange={setEditEmail} editing={isEditingAccount} display={farm.user?.email} type="email" />
                </div>

                {!isEditingAccount && (
                  <div style={styles.loginAccess}>
                    <div style={{ minWidth: 0 }}>
                      <div style={styles.loginAccessTitle}>Login access</div>
                      <div style={styles.loginAccessHint}>
                        Send the owner a new temporary password by SMS. Their current password stops working right away.
                      </div>
                      {/* Resending to a deactivated owner succeeds and still
                          leaves them unable to log in, so the state is said
                          here, next to the button that would be used. */}
                      {ownerSignInProblem && (
                        <div style={styles.loginAccessWarn}>{ownerSignInProblem}</div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleResendSms}
                      disabled={resending}
                      style={{ ...styles.loginAccessBtn, ...(resending ? styles.loginAccessBtnBusy : {}) }}
                    >
                      {resending ? 'Sending…' : 'Resend Password'}
                    </button>
                  </div>
                )}

                {resendResult && (
                  <div style={resendResult.success ? styles.resendOk : styles.resendWarn}>
                    <div>{resendResult.message}</div>
                    {resendResult.temp_password && (
                      <div style={styles.resendKey}>{resendResult.temp_password}</div>
                    )}
                  </div>
                )}

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
                  <FarmField label="Street / Purok (optional)" value={editStreet} onChange={setEditStreet} editing={isEditingAccount} display={farm.street || '—'} />
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
                  <div style={acctStyles.fieldGroup}>
                    <label style={acctStyles.label}>Location Preview</label>
                    <FarmLocationMap
                      excludeFarmId={farm.id}
                      initialPosition={farm.latitude != null && farm.longitude != null ? { lat: Number(farm.latitude), lng: Number(farm.longitude) } : null}
                      onPositionChange={(lat, lng) => setEditPin({ lat, lng })}
                      onConflictChange={(conflictFarm) => setEditLocationConflict(!!conflictFarm)}
                      initialBarangay={farm.barangay}
                      barangay={editBarangay}
                      onValidityChange={setEditLocationCheck}
                    />
                  </div>
                )}

                {isEditingAccount && (
                  <div style={{ display: 'flex', gap: '10px', ...(isMobile ? { flexDirection: 'column' } : {}) }}>
                    <button
                      type="submit"
                      disabled={accountSaving}
                      style={{ ...acctStyles.saveBtn, ...(isMobile ? acctStyles.btnFull : {}) }}
                    >
                      {accountSaving ? <BtnBusy label="Saving…" /> : 'Save Changes'}
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
              <DeviceList devices={deviceList} />
            </Card>
          </div>
        </div>
      )}

      {activeTab === 'monitoring' && (
        <div style={styles.cardStack}>
            {/* One block per poultry house. The farm-level `reading` used to
                drive this panel is whichever house reported most recently, so
                on a multi-house farm it showed one house's numbers under the
                farm's name — and swapped between houses as they took turns
                reporting. Each house now carries its own row. */}
            {reportingDevices.length > 0 ? (
              <Card title="Current Monitoring Status">
                {/* A table, not one block per house. A farm runs one device
                    per poultry house and the fleet rotates, so this panel has
                    to stay readable at ten houses as well as two — a coloured
                    hero card each made two houses fill the screen. */}
                <TableScroll style={tableStyles.wrap}>
                  <table style={{ ...tableStyles.table, minWidth: '826px' }}>
                    <thead>
                      <tr>
                        <th style={tableStyles.th}>House / Device</th>
                        <th style={tableStyles.th}>Ammonia</th>
                        <th style={tableStyles.th}>Temperature</th>
                        <th style={tableStyles.th}>Humidity</th>
                        <th style={tableStyles.th}>Moisture</th>
                        <th style={tableStyles.th}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportingDevices.slice((devicePage - 1) * devicePageSize, devicePage * devicePageSize).map(d => {
                        const worst = worstOfDevice(d, alertingMetrics)
                        const tone = STATUS[worst] || STATUS.Offline
                        return (
                          <tr key={d.id}>
                            <td style={tableStyles.td}>
                              <div style={monitorStyles.houseName}>{d.device_name}</div>
                              <div style={monitorStyles.houseSub}>{d.connectivity}</div>
                            </td>
                            <MonitorCell device={d} metric="ammonia" unit={AMMONIA_UNIT} alerting={alertingMetrics} />
                            <MonitorCell device={d} metric="temperature" unit="°C" alerting={alertingMetrics} />
                            <MonitorCell device={d} metric="humidity" unit="%" alerting={alertingMetrics} />
                            <MonitorCell device={d} metric="moisture" unit="%" alerting={alertingMetrics} />
                            <td style={tableStyles.td}>
                              <span style={{
                                ...styles.miniPill,
                                color: tone.color,
                                backgroundColor: tone.bg || '#f0f1ec',
                              }}>
                                {worst}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </TableScroll>

                {/* The same control every other tab on this page uses, shown
                    unconditionally — a footer that appears only past five rows
                    makes the page look different from one farm to the next. */}
                <Pagination
                  currentPage={devicePage}
                  lastPage={Math.max(1, Math.ceil(reportingDevices.length / devicePageSize))}
                  pageSize={devicePageSize}
                  total={reportingDevices.length}
                  onPageChange={setDevicePage}
                  onPageSizeChange={(size) => { setDevicePageSize(size); setDevicePage(1) }}
                  isMobile={isMobile}
                />
              </Card>
            ) : (
              <Card title="Current Monitoring Status">
                <div style={styles.empty}>No sensor connected to this farm yet.</div>
              </Card>
            )}

            <Card title="Recent Alerts">
              {alertsLoading && <SectionLoader />}
              {!alertsLoading && (alertsData?.length ?? 0) === 0 && (
                <div style={styles.empty}>No recent alerts for this farm.</div>
              )}
              {!alertsLoading && alertsData?.length > 0 && (
                <TableScroll style={tableStyles.wrap}>
                  <table style={{ ...tableStyles.table, minWidth: '826px' }}>
                    <thead>
                      <tr>
                        <th style={tableStyles.th}>Triggered</th>
                        <th style={tableStyles.th}>House</th>
                        <th style={tableStyles.th}>Sensor</th>
                        <th style={tableStyles.th}>Reading</th>
                        <th style={tableStyles.th}>Severity</th>
                        <th style={tableStyles.th}>Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedAlerts.slice((alertPage - 1) * alertPageSize, alertPage * alertPageSize).map(a => (
                        <tr key={a.id}>
                          <td style={tableStyles.td}>{a.triggered_at}</td>
                          <td style={tableStyles.td}>{a.device_name || '—'}</td>
                          <td style={tableStyles.td}>{a.sensor_type}</td>
                          <td style={tableStyles.td}>{a.value}</td>
                          <td style={tableStyles.td}>
                            <span style={{ color: (STATUS[a.status] || STATUS.Offline).color, fontWeight: 700 }}>{a.status}</span>
                          </td>
                          <td style={tableStyles.td}>
                            {a.duration}{a.is_ongoing ? ' · ongoing' : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableScroll>
              )}

              {!alertsLoading && (
                <Pagination
                  currentPage={alertPage}
                  lastPage={Math.max(1, Math.ceil((alertsData?.length ?? 0) / alertPageSize))}
                  pageSize={alertPageSize}
                  total={alertsData?.length ?? 0}
                  onPageChange={setAlertPage}
                  onPageSizeChange={(size) => { setAlertPageSize(size); setAlertPage(1) }}
                  isMobile={isMobile}
                />
              )}
            </Card>
        </div>
      )}

      {activeTab === 'cleanout' && (
        <Card title="Manure Clean-out" badge={farm.maintenance_status?.status} badgeColor={maintBadgeColor(farm.maintenance_status?.status)}>
          <div style={styles.infoGrid}>
            <InfoCell label="Last Logged" value={farm.maintenance_status?.last_performed_at || 'No clean-out logged yet'} />
            <InfoCell label="Days Since" value={farm.maintenance_status ? `${farm.maintenance_status.days_since} of ~${farm.maintenance_status.expected_interval_days} expected` : null} />
          </div>

          {cleanoutLoading && <SectionLoader />}
          {!cleanoutLoading && (cleanoutData?.logs?.length ?? 0) === 0 && (
            <div style={styles.empty}>No clean-out records logged for this farm yet.</div>
          )}
          {!cleanoutLoading && cleanoutData?.logs?.length > 0 && (
            <>
              <TableScroll style={tableStyles.wrap}>
                <table style={{ ...tableStyles.table, minWidth: '520px' }}>
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
              </TableScroll>
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
          {disposalLoading && <SectionLoader />}
          {!disposalLoading && (disposalData?.records?.length ?? 0) === 0 && (
            <div style={styles.empty}>No disposal records logged for this farm yet.</div>
          )}
          {!disposalLoading && disposalData?.records?.length > 0 && (
            <>
              <div className="no-print" style={filterStyles.filterBar}>
                <div style={filterStyles.filterField}>
                  <DateRangeHeader>
                    <label style={filterStyles.filterLabel}>From</label>
                    <ClearDateButton visible={hasDisposalDate} onClick={clearDisposalDates} />
                  </DateRangeHeader>
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

              <TableScroll style={tableStyles.wrap}>
                <table style={{ ...tableStyles.table, minWidth: '708px' }}>
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
              </TableScroll>
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
          {inspectionLoading && <SectionLoader />}
          {!inspectionLoading && (inspectionData?.inspections?.length ?? 0) === 0 && (
            <div style={styles.empty}>No inspections recorded for this farm yet.</div>
          )}
          {!inspectionLoading && inspectionData?.inspections?.length > 0 && (
            <>
              <div className="no-print" style={filterStyles.filterBar}>
                <div style={filterStyles.filterField}>
                  <DateRangeHeader>
                    <label style={filterStyles.filterLabel}>From</label>
                    <ClearDateButton visible={hasInspectionDate} onClick={clearInspectionDates} />
                  </DateRangeHeader>
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

              <TableScroll style={tableStyles.wrap}>
                <table style={{ ...tableStyles.table, minWidth: '708px' }}>
                  <thead>
                    <tr>
                      <th style={{ ...tableStyles.th, ...tableStyles.thSortable }} onClick={() => toggleInspectionSort('type')}>
                        Type {inspectionSort.field === 'type' && (inspectionSort.dir === 'asc' ? '▲' : '▼')}
                      </th>
                      <th style={tableStyles.th}>Status</th>
                      <th style={{ ...tableStyles.th, ...tableStyles.thSortable }} onClick={() => toggleInspectionSort('date')}>
                        Date {inspectionSort.field === 'date' && (inspectionSort.dir === 'asc' ? '▲' : '▼')}
                      </th>
                      <th style={tableStyles.th}>Scheduled By</th>
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
                          {/* The Staff account stored on the record. Dash for rows
                              created before scheduled_by existed. */}
                          <td style={tableStyles.td}>{i.scheduled_by_name || '—'}</td>
                          <td style={{ ...tableStyles.td, textAlign: 'right' }}>
                            <span style={tableStyles.viewLink} onClick={() => setInspectionViewRecord(i)}>View</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </TableScroll>
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
          {serviceRequestLoading && <SectionLoader />}
          {!serviceRequestLoading && (serviceRequestData?.requests?.length ?? 0) === 0 && (
            <div style={styles.empty}>No service requests recorded for this farm yet.</div>
          )}
          {!serviceRequestLoading && serviceRequestData?.requests?.length > 0 && (
            <>
              <div className="no-print" style={filterStyles.filterBar}>
                <div style={filterStyles.filterField}>
                  <DateRangeHeader>
                    <label style={filterStyles.filterLabel}>From</label>
                    <ClearDateButton visible={hasServiceRequestDate} onClick={clearServiceRequestDates} />
                  </DateRangeHeader>
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

              <TableScroll style={tableStyles.wrap}>
                <table style={{ ...tableStyles.table, minWidth: '826px' }}>
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
              </TableScroll>
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
        <DevicesSection farmId={farm.id} farmName={farm.farm_name} onDeviceChange={() => { invalidateCache('/admin/farms'); refetch() }} />
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
            { label: 'Scheduled By', value: inspectionViewRecord.scheduled_by_name || '—' },
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


// Per-device rows instead of one comma-joined "Device Names" cell. A farm
// runs one unit per poultry house, so the question an Admin actually has is
// "which house stopped reporting" — a shared farm-level pill cannot answer
// that, and the joined line got unreadable past two devices.
const DEVICE_TONE = {
  Online: { fg: '#2c8047', bg: '#eaf3ec' },
  Offline: { fg: '#b45309', bg: '#fbf1e2' },
  Unassigned: { fg: '#9ca3af', bg: '#f0f1ec' },
}


// Worst of a house's four metrics — the same "worst wins" rule the reading
// truth table uses, so a house summarised as Safe never hides a Critical.
const DEVICE_SEVERITY = { Safe: 0, Warning: 1, Critical: 2 }

/**
 * Worst status across a house's ALERTING metrics.
 *
 * Temperature and humidity are advisory — measured and shown, but they no
 * longer set a level. Scoring them here would have this page call a farm
 * Critical on a 31 C reading while the owner's own dashboard, which already
 * honours the same config, shows Safe.
 */
function worstOfDevice(device, alerting = ['ammonia']) {
  return ['ammonia', 'temperature', 'humidity', 'moisture'].filter(m => alerting.includes(m)).reduce((acc, metric) => {
    const status = device[`${metric}_status`]
    if (!status || !(status in DEVICE_SEVERITY)) return acc
    return DEVICE_SEVERITY[status] > DEVICE_SEVERITY[acc] ? status : acc
  }, 'Safe')
}

const monitorStyles = {
  houseName: { fontSize: '13.5px', fontWeight: 800, color: '#16311d', lineHeight: 1.3 },
  houseSub: { fontSize: '11.5px', color: '#9aa79d', marginTop: '4px', lineHeight: 1.3 },
  cellValue: { fontSize: '13px', fontWeight: 700, color: '#16311d', lineHeight: 1.3 },
  // The reading is the figure; the status is a note about it. They were
  // the same weight 2px apart, which read as one glued block rather than
  // a value with a label under it. Lighter and further down, so the eye
  // lands on the number first.
  cellStatus: { fontSize: '11px', fontWeight: 600, marginTop: '5px', lineHeight: 1.3, letterSpacing: '0.01em' },
}

/**
 * One reading in the monitoring table.
 *
 * An advisory metric renders the number alone. A badge is a judgement, and
 * these carry none any more — showing one next to a reading the system will
 * not act on teaches the reader to discount the colour, which then costs
 * something when ammonia really is badged.
 */
function MonitorCell({ device, metric, unit, alerting }) {
  const value = device[metric]
  const status = device[`${metric}_status`]

  if (value === null || value === undefined) {
    return <td style={tableStyles.td}><span style={styles.muted}>&mdash;</span></td>
  }

  const shown = `${value}${unit ? ` ${unit}` : ''}`

  if (!alerting.includes(metric) || !status) {
    return <td style={tableStyles.td}><span style={monitorStyles.cellValue}>{shown}</span></td>
  }

  const tone = STATUS[status] || STATUS.Offline
  return (
    <td style={tableStyles.td}>
      <div style={monitorStyles.cellValue}>{shown}</div>
      <div style={{ ...monitorStyles.cellStatus, color: tone.color }}>{status}</div>
    </td>
  )
}
function DeviceList({ devices }) {
  if (!devices.length) {
    return (
      <div style={devicePanel.empty}>
        No device is registered to this farm yet. Register the unit under Devices, then assign it here.
      </div>
    )
  }

  return (
    <>
      <p style={devicePanel.caption}>
        {devices.length} device{devices.length === 1 ? '' : 's'} installed &mdash; one per poultry house.
      </p>
      <ul style={devicePanel.list}>
        {devices.map(d => {
          const tone = DEVICE_TONE[d.connectivity] || DEVICE_TONE.Unassigned
          return (
            <li key={d.id} style={devicePanel.item}>
              <div style={devicePanel.itemMain}>
                <span style={devicePanel.name}>{d.device_name}</span>
                {d.status !== 'Active' && <span style={devicePanel.inactive}>Inactive</span>}
              </div>
              <div style={devicePanel.itemSide}>
                <span style={{ ...styles.miniPill, color: tone.fg, backgroundColor: tone.bg }}>
                  <span style={{ ...styles.pillDot, backgroundColor: tone.fg }} />
                  {d.connectivity}
                </span>
                <span style={devicePanel.seen}>
                  {d.last_seen_at
                    ? `Last sync ${new Date(d.last_seen_at).toLocaleString(undefined, { timeZone: DISPLAY_TIME_ZONE })}`
                    : 'No readings yet'}
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </>
  )
}

const devicePanel = {
  caption: { fontSize: '11.5px', color: '#9aa79d', margin: '0 0 10px' },
  empty: { fontSize: '13px', color: '#8a968d', lineHeight: 1.55 },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' },
  item: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
    flexWrap: 'wrap', padding: '11px 14px', borderRadius: '10px',
    border: '1px solid #eceee7', backgroundColor: '#fafbf8',
  },
  itemMain: { display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 },
  itemSide: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginLeft: 'auto' },
  name: { fontSize: '13.5px', fontWeight: 700, color: '#16311d' },
  inactive: { padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, backgroundColor: '#f1f2ed', color: '#6b7770' },
  seen: { fontSize: '11.5px', color: '#9aa79d', whiteSpace: 'nowrap' },
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

// Each farm owner owns the device installed on their farm, so a farm runs
// one Active device and there is no move-between-farms action here. Unassign
// covers the real cases: damaged, under repair, retired, or being replaced.
// Unassigning never touches historical readings — the backend stamps farm_id
// and sensor_id on each reading at ingestion time, so a replaced device's
// old readings keep pointing at it and at this farm.
function DevicesSection({ farmId, farmName, onDeviceChange }) {
  const { data: sensors, loading, error, refetch } = useCachedFetch(`/admin/farms/${farmId}/sensors`, {}, { pollMs: LIVE_POLL_MS })
  // Devices with no current farm (farm_id = null) — a unit that was
  // unassigned for repair/replacement, listed here so it can be put back on
  // a farm without a separate Devices module.
  const { data: allSensors, refetch: refetchAll } = useCachedFetch('/admin/sensors')
  const [showRegister, setShowRegister] = useState(false)
  const [editSensor, setEditSensor] = useState(null)
  const [unassignSensor, setUnassignSensor] = useState(null)
  const [assignSensor, setAssignSensor] = useState(null)
  const list = sensors || []

  // After turnover the LGU has the sticker in hand, so the Device Key printed
  // on it is the natural way to find the right unit. Matches the Device Name
  // too, and is a plain client-side filter over the already-loaded list.
  const [deviceSearch, setDeviceSearch] = useState('')
  const pool = (allSensors || []).filter(s => !s.farm_id)
  const needle = deviceSearch.trim().toUpperCase()
  const unassigned = needle
    ? pool.filter(s =>
        (s.device_key || '').toUpperCase().includes(needle) ||
        (s.device_name || '').toUpperCase().includes(needle))
    : pool

  const handleChanged = () => {
    // An assignment change affects the Farms list and the unassigned pool too.
    invalidateCache('/admin/farms')
    invalidateCache('/admin/sensors')
    refetch()
    refetchAll()
    onDeviceChange?.()
  }

  const statusPill = (s) => (
    <span style={{
      fontSize: '10.5px', fontWeight: 700, padding: '2px 9px', borderRadius: '999px',
      color: s.status === 'Active' ? '#2c8047' : '#6b7280',
      backgroundColor: s.status === 'Active' ? '#eaf3ec' : '#f0f1ec',
    }}>{s.status}</span>
  )

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
        <div style={styles.empty}>No devices assigned to this farm yet.</div>
      )}
      {!loading && !error && list.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
          {list.map(s => (
            <div key={s.id} style={deviceStyles.row}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#16311d' }}>{s.device_name}</span>
                  {statusPill(s)}
                </div>
                <DeviceKeyField deviceKey={s.device_key} />
                <div style={{ fontSize: '11.5px', color: '#9aa79d', marginTop: '3px' }}>
                  Installed {s.installed_at}{s.last_seen_at && ` · Last seen ${s.last_seen_at}`}
                </div>
              </div>
              <div style={deviceStyles.rowActions}>
                <button type="button" style={deviceStyles.editBtn} onClick={() => setUnassignSensor(s)}>Unassign</button>
                <button type="button" style={deviceStyles.editBtn} onClick={() => setEditSensor(s)}>Edit</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {pool.length > 0 && (
        <div style={{ marginTop: '22px' }}>
          <div style={deviceStyles.subheading}>Unassigned Devices</div>
          <input
            value={deviceSearch}
            onChange={e => setDeviceSearch(e.target.value)}
            placeholder="Search by Device Key or Device Name (from the sticker)"
            style={deviceStyles.searchInput}
          />
          {unassigned.length === 0 && (
            <div style={styles.empty}>No unassigned device matches that key.</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {unassigned.map(s => (
              <div key={s.id} style={deviceStyles.row}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#16311d' }}>{s.device_name}</span>
                    {statusPill(s)}
                  </div>
                  <DeviceKeyField deviceKey={s.device_key} />
                  <div style={{ fontSize: '11.5px', color: '#9aa79d', marginTop: '3px' }}>
                    Farm: <strong style={{ color: '#6b7770' }}>Unassigned</strong>
                    {s.last_seen_at && ` · Last seen ${s.last_seen_at}`}
                  </div>
                </div>
                <div style={deviceStyles.rowActions}>
                  {/* A farm can hold several devices — one per poultry house —
                      so this stays available no matter what is already here. */}
                  <button
                    type="button"
                    style={deviceStyles.editBtn}
                    onClick={() => setAssignSensor(s)}
                  >
                    Assign to this farm
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showRegister && (
        <RegisterDeviceModal
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

      {unassignSensor && (
        <UnassignDeviceModal
          sensor={unassignSensor}
          onClose={() => setUnassignSensor(null)}
          onSuccess={() => { setUnassignSensor(null); handleChanged() }}
        />
      )}

      {assignSensor && (
        <AssignDeviceModal
          sensor={assignSensor}
          farmId={farmId}
          farmName={farmName}
          onClose={() => setAssignSensor(null)}
          onSuccess={() => { setAssignSensor(null); handleChanged() }}
        />
      )}
    </Card>
  )
}

// Read-only identity block shared by the assignment modals — the same
// Device Name / Device Key are shown on every move so it is obvious they
// are not what changes.
function DeviceIdentity({ sensor, children }) {
  return (
    <div style={deviceStyles.identity}>
      <div style={deviceStyles.identityRow}>
        <span style={deviceStyles.identityLabel}>Device</span>
        <span style={deviceStyles.identityValue}>{sensor.device_name}</span>
      </div>
      <div style={deviceStyles.identityRow}>
        <span style={deviceStyles.identityLabel}>Device Key</span>
        <DeviceKeyField deviceKey={sensor.device_key} label="" style={{ marginTop: 0, justifyContent: 'flex-end' }} />
      </div>
      {children}
    </div>
  )
}

function UnassignDeviceModal({ sensor, onClose, onSuccess }) {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleConfirm = async () => {
    setError('')
    setLoading(true)
    try {
      await api.patch(`/admin/sensors/${sensor.id}/unassign`)
      onSuccess()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to unassign device.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={deviceStyles.overlay} onClick={onClose}>
      <div style={deviceStyles.modal} onClick={e => e.stopPropagation()}>
        <div style={deviceStyles.header}>
          <h3 style={deviceStyles.title}>Unassign Device</h3>
          <span style={deviceStyles.close} onClick={onClose}>×</span>
        </div>

        {error && <div style={deviceStyles.errorBox}>{error}</div>}

        <p style={deviceStyles.confirmText}>
          Are you sure you want to unassign <strong>{sensor.device_name}</strong> from this farm?
        </p>
        <p style={deviceStyles.hint}>
          Use this when the device is temporarily removed from the farm for repair, maintenance, replacement, or reassignment. The device will remain registered, and its previous readings will be preserved. New readings from an unassigned device will not be accepted until it is assigned to a farm again. This farm will show as Pending Setup while it has no active assigned device.
        </p>

        <div style={deviceStyles.actions}>
          <button type="button" onClick={onClose} style={deviceStyles.cancelBtn}>Cancel</button>
          <button type="button" onClick={handleConfirm} disabled={loading} style={deviceStyles.submitBtn}>
            {loading ? <BtnBusy label="Unassigning…" /> : 'Unassign'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AssignDeviceModal({ sensor, farmId, farmName, onClose, onSuccess }) {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleConfirm = async () => {
    setError('')
    setLoading(true)
    try {
      await api.patch(`/admin/sensors/${sensor.id}/assign`, { farm_id: farmId })
      onSuccess()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to assign device.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={deviceStyles.overlay} onClick={onClose}>
      <div style={deviceStyles.modal} onClick={e => e.stopPropagation()}>
        <div style={deviceStyles.header}>
          <h3 style={deviceStyles.title}>Assign Device</h3>
          <span style={deviceStyles.close} onClick={onClose}>×</span>
        </div>

        {error && <div style={deviceStyles.errorBox}>{error}</div>}

        <DeviceIdentity sensor={sensor}>
          <div style={deviceStyles.identityRow}>
            <span style={deviceStyles.identityLabel}>Assign to Farm</span>
            <span style={deviceStyles.identityValue}>{farmName}</span>
          </div>
        </DeviceIdentity>

        <div style={deviceStyles.actions}>
          <button type="button" onClick={onClose} style={deviceStyles.cancelBtn}>Cancel</button>
          <button type="button" onClick={handleConfirm} disabled={loading} style={deviceStyles.submitBtn}>
            {loading ? <BtnBusy label="Assigning…" /> : 'Assign'}
          </button>
        </div>
      </div>
    </div>
  )
}

// The Device Key is pre-provisioned: it is minted by the developer with the
// artisan command, printed on the unit's sticker and flashed into its
// firmware before turnover. Registration is where an Admin types that
// existing key in, so the success screen only confirms what was stored — it
// never echoes the key back, since whoever typed it already has it.
function RegisterDeviceModal({ onClose, onSuccess }) {
  const [deviceName, setDeviceName] = useState('')
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
        label: deviceName,
        device_key: deviceKey.trim(),
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

              <label style={deviceStyles.label}>Device Name *</label>
              <input
                value={deviceName}
                onChange={e => setDeviceName(e.target.value)}
                placeholder="e.g. AGB-D01"
                style={deviceStyles.inputFull}
                required
                autoFocus
              />
              <p style={deviceStyles.hint}>
                This is the name used to identify the device in the system. You can change it later.
              </p>

              <label style={deviceStyles.label}>Device Key *</label>
              <input
                value={deviceKey}
                onChange={e => setDeviceKey(e.target.value.toUpperCase())}
                placeholder="AGB-XXXXXXXX"
                style={deviceStyles.inputFull}
                required
              />
              <p style={deviceStyles.hint}>
                This key is already set in the device. Enter it correctly to connect the device to AgriBantay.
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
                Select the date the device was installed.
              </p>
              <p style={deviceStyles.hint}>
                Date the unit was first installed. Used only for record-keeping.
              </p>

              <p style={deviceStyles.hint}>
                The device starts Unassigned — assign it to a farm after turnover.
              </p>

              <div style={deviceStyles.actions}>
                <button type="button" onClick={onClose} style={deviceStyles.cancelBtn}>Cancel</button>
                <button type="submit" disabled={loading} style={deviceStyles.submitBtn}>
                  {loading ? <BtnBusy label="Registering…" /> : 'Register Device'}
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <div style={deviceStyles.successTop}>
              <div style={deviceStyles.successMark}>&#10003;</div>
              <div>
                <div style={deviceStyles.successHeadline}>Device registered</div>
                <div style={deviceStyles.successSubline}>The system now recognises this unit.</div>
              </div>
            </div>

            <div style={deviceStyles.detailCard}>
              <div style={deviceStyles.detailRow}>
                <span style={deviceStyles.detailLabel}>Device Name</span>
                <span style={deviceStyles.detailValue}>{registered.device_name}</span>
              </div>
              <div style={deviceStyles.detailRow}>
                <span style={deviceStyles.detailLabel}>Device Key</span>
                <span style={deviceStyles.detailMuted}>Stored &middot; hidden</span>
              </div>
              <div style={deviceStyles.detailRowLast}>
                <span style={deviceStyles.detailLabel}>Assignment</span>
                <span style={deviceStyles.detailMuted}>Unassigned</span>
              </div>
            </div>

            <p style={deviceStyles.successNote}>
              Assign it to a farm so it can start recording readings. The key stays masked in the device list &mdash; use Show if you need to check it against the sticker.
            </p>

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
              {loading ? <BtnBusy label="Saving…" /> : 'Save Changes'}
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

  // minWidth 0 is what lets overflowX work: without it a flex item refuses
  // to be narrower than its contents, so the row pushed the whole page
  // sideways instead of scrolling inside itself.
  tabsRow: { display: 'flex', gap: '26px', borderBottom: '1px solid #e7e8e0', marginBottom: '20px', overflowX: 'auto', minWidth: 0, flexWrap: 'nowrap', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', },
  tab: { border: 'none', background: 'none', padding: '12px 0', fontFamily: SANS, fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', color: '#8a968d', borderBottom: '2px solid transparent', marginBottom: '-1px', flexShrink: 0, },
  tabActive: { color: '#2c8047', borderBottom: '2px solid #2c8047' },

  // Stacked, not side by side. Account Information runs long and the device
  // list is three lines, so two columns left a column-height blank beside the
  // form. Full width also gives the account fields room to pair up.
  infoColumns: { display: 'flex', flexDirection: 'column', gap: '16px' },
  infoColumnsMobile: { flexDirection: 'column' },
  infoColumn: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '16px' },

  sectionDivider: { borderTop: '1px solid #eceee7', marginTop: '4px', marginBottom: '18px', paddingTop: '14px' },
  sectionDividerLabel: { fontSize: '11px', fontWeight: 700, color: '#8a968d', textTransform: 'uppercase', letterSpacing: '0.05em' },
  loginAccess: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap',
    backgroundColor: '#f7f8f4', border: '1px solid #e3e6dd', borderRadius: '12px',
    padding: '13px 16px', marginTop: '14px',
  },
  loginAccessWarn: { fontSize: '12px', color: '#b45309', marginTop: '6px', lineHeight: 1.5 },
  loginAccessTitle: { fontSize: '13px', fontWeight: 700, color: '#16311d' },
  loginAccessHint: { fontSize: '12px', color: '#8a968d', marginTop: '3px', lineHeight: 1.5 },
  loginAccessBtn: {
    flexShrink: 0, padding: '8px 15px', borderRadius: '10px', fontSize: '12.5px', fontWeight: 700,
    cursor: 'pointer', border: '1px solid #2c8047', backgroundColor: '#fff', color: '#2c8047',
  },
  loginAccessBtnBusy: { cursor: 'wait', borderColor: '#cfe0d3', color: '#8a968d' },
  resendOk: {
    backgroundColor: '#eaf3ec', border: '1px solid #cfe0d3', color: '#1f5a34',
    borderRadius: '10px', padding: '11px 14px', fontSize: '12.5px', marginTop: '10px', lineHeight: 1.5,
  },
  resendWarn: {
    backgroundColor: '#fdf4e7', border: '1px solid #f0dcc0', color: '#8a5a12',
    borderRadius: '10px', padding: '11px 14px', fontSize: '12.5px', marginTop: '10px', lineHeight: 1.5,
  },
  resendKey: {
    fontFamily: 'monospace', fontSize: '16px', fontWeight: 700, letterSpacing: '0.06em',
    color: '#16311d', marginTop: '7px', wordBreak: 'break-all',
  },

  monitoringRow: { display: 'grid', gridTemplateColumns: '200px 1fr', gap: '16px', alignItems: 'stretch' },
  monitoringRowMobile: { gridTemplateColumns: '1fr' },

  heroCard: {
    borderRadius: '14px', padding: '22px 20px', fontFamily: SANS,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    textAlign: 'center', boxSizing: 'border-box', height: '100%', color: '#fff',
  },
  heroTitle: { fontSize: '18px', fontWeight: 800, color: '#fff', marginTop: '12px' },

  // No height: 100% — it made a card stretch to whatever its container was
  // tall, which on the Monitoring tab left a two-row table sitting in a card
  // the height of the screen.
  card: { backgroundColor: '#fff', border: '1px solid #e7e8e0', borderRadius: '14px', padding: '20px 22px', fontFamily: SANS, boxSizing: 'border-box' },
  // Stacked cards carry no margin of their own, so two in a row sat almost
  // edge to edge and read as one panel with a line through it. The gap lives
  // on the container rather than on the card, so a card used inside an
  // already-spaced column does not get a second helping.
  cardStack: { display: 'flex', flexDirection: 'column', gap: '18px' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  cardTitle: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 800, color: '#16311d' },
  sectionBadge: { padding: '3px 10px', borderRadius: '999px', fontSize: '10.5px', fontWeight: 700 },

  infoGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '18px 24px' },
  infoLabel: { fontSize: '10.5px', color: '#9aa79d', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '5px' },
  infoValue: { fontSize: '13.5px', color: '#16311d', fontWeight: 600, lineHeight: 1.4, wordBreak: 'break-word' },

  miniPill: { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 11px', borderRadius: '999px', fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap' },

  metricGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' },
  metricBox: { border: '1px solid #eceee7', borderRadius: '14px', padding: '16px 18px', backgroundColor: '#fff' },
  metricBoxHead: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' },
  metricBoxLabel: { fontSize: '13.5px', fontWeight: 700, color: '#16311d' },
  metricValueRow: { display: 'flex', alignItems: 'center', gap: '7px' },
  metricBoxValue: { fontSize: '18px', fontWeight: 700, color: '#16311d' },
  metricStatusWord: { display: 'block', fontSize: '12px', fontWeight: 700, marginTop: '6px' },
  metricNote: { display: 'block', fontSize: '10px', color: '#9aa79d', fontStyle: 'italic', marginTop: '3px' },

  empty: { fontSize: '13px', color: '#9aa79d' },

  insightCard: { backgroundColor: '#fafbf8', border: '1px solid #eceee7', borderRadius: '12px', padding: '16px 18px' },
  insightHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' },
  insightRootCause: { fontSize: '13.5px', fontWeight: 800, color: '#16311d' },
  confidenceTag: { fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '999px' },
  insightExplanation: { fontSize: '12.5px', color: '#5c6b60', lineHeight: 1.6, marginTop: '8px', marginBottom: 0 },
  insightExplanationUnavailable: { fontSize: '12px', color: '#9aa79d', fontStyle: 'italic', marginTop: '8px', marginBottom: 0 },
  insightGenerated: { fontSize: '10.5px', color: '#9aa79d', margin: '8px 0 0', fontStyle: 'italic' },

  recordModalPhoto: { width: '100%', borderRadius: '10px', marginBottom: '14px', cursor: 'zoom-in', display: 'block' },
}

const paginationStyles = {
  wrap: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginTop: '16px', paddingTop: '14px', borderTop: '1px solid #f0efe8', flexWrap: 'wrap', gap: '10px',
  },
  wrapMobile: { flexDirection: 'column', flexWrap: 'nowrap', alignItems: 'stretch' },
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
  // Grows to share the bar evenly instead of sitting at its minimum and
  // leaving a stripe of empty space to the right of the last input.
  filterField: { display: 'flex', flexDirection: 'column', gap: '6px', flex: '1 1 160px', minWidth: '160px' },
  filterLabel: { fontSize: '11.5px', fontWeight: 700, color: '#4b5a50', textTransform: 'uppercase', letterSpacing: '0.03em' },
  filterSelect: {
    padding: '9px 12px', borderRadius: '10px', border: '1px solid #dcdfd6',
    fontSize: '13px', color: '#33413a', backgroundColor: '#fff', cursor: 'pointer',
    fontFamily: SANS, boxSizing: 'border-box', width: '100%', minWidth: 0,
  },
  // Sits on the baseline with the inputs rather than being pushed to the
  // far edge by margin, so the bar reads as one row of controls.
  filterActions: { display: 'flex', gap: '10px', marginLeft: 'auto', flex: '0 0 auto' },
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

  body: { flex: 1, overflowY: 'auto', padding: '20px 22px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '22px' },

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
  editBtnDisabled: {
    flexShrink: 0, padding: '6px 13px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 600, cursor: 'not-allowed',
    border: '1px solid #ecefe7', backgroundColor: '#f7f8f4', color: '#9aa79d', fontFamily: SANS,
  },
  successTop: { display: 'flex', alignItems: 'center', gap: '12px', margin: '4px 0 14px' },
  successMark: {
    width: '34px', height: '34px', borderRadius: '50%', flexShrink: 0,
    backgroundColor: '#e7f2ea', color: '#2c8047', display: 'flex',
    alignItems: 'center', justifyContent: 'center', fontSize: '17px', fontWeight: 700,
  },
  successHeadline: { fontSize: '14.5px', fontWeight: 700, color: '#16311d' },
  successSubline: { fontSize: '12.5px', color: '#8a968d', marginTop: '2px' },
  successNote: { fontSize: '12px', color: '#8a968d', lineHeight: 1.55, margin: '12px 2px 0' },
  detailCard: { backgroundColor: '#f7f8f4', border: '1px solid #e3e6dd', borderRadius: '12px', padding: '4px 14px' },
  detailRow: { display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '9px 0', fontSize: '13px', borderBottom: '1px solid #ecefe7' },
  detailRowLast: { display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '9px 0', fontSize: '13px' },
  detailLabel: { color: '#8a968d', fontWeight: 600, flexShrink: 0 },
  detailValue: { color: '#16311d', fontWeight: 700, textAlign: 'right', wordBreak: 'break-all' },
  detailMuted: { color: '#8a968d', fontWeight: 600, textAlign: 'right' },
  searchInput: {
    width: '100%', padding: '8px 12px', borderRadius: '10px', border: '1px solid #dcdfd6',
    fontSize: '13px', boxSizing: 'border-box', fontFamily: SANS, marginBottom: '10px',
  },
  row: { display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '13px 0', borderBottom: '1px solid #f2f3ed' },
  rowActions: { display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'flex-start', flexShrink: 0 },
  subheading: { fontSize: '12px', fontWeight: 700, color: '#5c8a6b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' },
  identity: { backgroundColor: '#f7f8f4', border: '1px solid #e3e6dd', borderRadius: '12px', padding: '12px 14px', marginTop: '8px' },
  identityRow: { display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '4px 0', fontSize: '13px' },
  identityLabel: { color: '#8a968d', fontWeight: 600, flexShrink: 0 },
  identityValue: { color: '#16311d', fontWeight: 700, textAlign: 'right', wordBreak: 'break-all' },
  confirmText: { fontSize: '14px', color: '#33413a', lineHeight: 1.5, margin: '8px 0 0' },
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
  row: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '16px' },
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
