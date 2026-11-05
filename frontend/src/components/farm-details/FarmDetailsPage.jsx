import HouseMonitoring from '../HouseMonitoring'
import DeviceAssignmentDialog from '../DeviceAssignmentDialog'
import { GREEN } from '../../theme/green'
import { ALL_TYPES as ALL_SERVICE_TYPES, isRetiredService } from '../../constants/serviceTypes'
import { useTableFetch } from '../../hooks/useTableFetch'
import { FarmOverview, FarmCompliance, FarmBadge, FarmIcon } from './FarmProfileSections'
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
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
import { DISPLAY_TIME_ZONE } from '../../utils/formatDate'
import { BARANGAYS } from '../../constants/barangays'
import { viewModalStyles as v } from '../../styles/viewModalStyles'
import { isValidPhoneNumber, sanitizePhoneInput, PHONE_VALIDATION_MESSAGE } from '../../utils/phoneValidation'
import { serviceTypeBadgeStyle, serviceTypeLabel, requestStatusBadgeStyle } from '../../utils/serviceBadgeStyle'
import VerifyEmailChangeModal from '../../components/VerifyEmailChangeModal'
import FarmLocationMap from '../../components/FarmLocationMap'
import { LOCATION_CONFLICT_MESSAGE, LOCATION_OUTSIDE_MESSAGE, isInsideSanJose } from '../../utils/farmLocation'
import { SectionLoader, BtnBusy } from '../../components/Loading'
import FarmPrintDialog from '../farm-print/FarmPrintDialog'
import PoultryHouses from '../PoultryHouses'

const FARM_SIZES = ['Small', 'Medium', 'Large']
// 5 is here because the Monitoring tables default to it — a select that
// cannot show its own current value reads as a bug even when the table is
// paging correctly.
const PAGE_SIZE_OPTIONS = [5, 10, 25, 50]

const INSPECTION_TYPES = ['General Inspection', 'Follow-up']
const serviceHistoryLabel = type => `${isRetiredService(type) ? 'Legacy — ' : ''}${serviceTypeLabel(type)}`

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

const STATUS = {
  Safe:     { color: GREEN.hover, bg: GREEN.soft, border: '#cfe0d3' },
  Warning:  { color: '#b45309', bg: '#fbf1e2', border: '#f0e2cf' },
  Critical: { color: '#b91c1c', bg: '#fbeaea', border: '#f0c9c9' },
  'Pending Setup': { color: '#6b7280', bg: '#eef1ea', border: '#e0e3da' },
  Offline:  { color: '#6b7280', bg: '#eef1ea', border: '#e0e3da' },
}

const TABS = [
  { key: 'overview', label: 'Overview', icon: 'farm' },
  { key: 'monitoring', label: 'Monitoring', icon: 'monitor' },
  { key: 'compliance', label: 'Compliance', icon: 'check' },
  { key: 'records', label: 'Records', icon: 'records' },
]
const RECORD_TABS = [
  { key: 'inspections', label: 'Inspections' }, { key: 'manure', label: 'Manure Records' },
  { key: 'alerts', label: 'Alerts' },
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

export default function FarmDetailsPage({ isSuperAdmin = false }) {
  const recordTabs = isSuperAdmin ? [...RECORD_TABS, { key: 'servicerequests', label: 'Service History' }] : RECORD_TABS
  const farmsPath = isSuperAdmin ? '/superadmin/farms' : '/admin/farms'
  const { farmId } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const isMobile = useIsMobile()

  const { data: farmPayload, loading: farmLoading, error, refetch } = useCachedFetch(`/admin/farms/${farmId}`, {}, { pollMs: LIVE_POLL_MS })
  const farm = String(farmPayload?.id) === String(farmId) ? farmPayload : null
  const loading = farmLoading || (!farm && !error)
  const [activeTab, setActiveTab] = useState('overview')
  const [recordTab, setRecordTab] = useState('inspections')
  const [manureView, setManureView] = useState('cleanout')
  const [showPrint, setShowPrint] = useState(false)
  const closePrint = useCallback(() => setShowPrint(false), [])
  const locationRef = useRef(null)
  const recordKey = recordTab === 'manure' ? manureView : recordTab
  const showServiceHistory = isSuperAdmin && activeTab === 'records' && recordKey === 'servicerequests'
  const openRecords = (tab, view) => { setActiveTab('records'); setRecordTab(tab); if (view) setManureView(view) }

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

  const { data: cleanoutData, loading: cleanoutLoading, error: cleanoutError } = useTableFetch(
    (activeTab === 'records' && recordKey === 'cleanout') ? `/admin/farms/${farmId}/maintenance-logs` : null, { dir: cleanoutSort }, cleanoutPage, cleanoutPageSize, setCleanoutPage
  )
  const { data: disposalData, loading: disposalLoading, error: disposalError } = useTableFetch(
    (activeTab === 'records' && recordKey === 'disposal') ? `/admin/farms/${farmId}/disposal-records` : null, { sort: disposalSort.field, dir: disposalSort.dir, disposal_method: disposalMethodFilter, from: disposalFromDate, to: disposalToDate }, disposalPage, disposalPageSize, setDisposalPage
  )
  const { data: inspectionData, loading: inspectionLoading, error: inspectionError } = useTableFetch(
    (activeTab === 'records' && recordKey === 'inspections') ? `/admin/farms/${farmId}/inspection-records` : null, { sort: inspectionSort.field, dir: inspectionSort.dir, inspection_type: inspectionTypeFilter, from: inspectionFromDate, to: inspectionToDate }, inspectionPage, inspectionPageSize, setInspectionPage
  )
  const { data: serviceRequestData, loading: serviceRequestLoading, error: serviceRequestError } = useTableFetch(
    showServiceHistory ? `/admin/farms/${farmId}/service-requests` : null, { service_type: serviceRequestTypeFilter, from: serviceRequestFromDate, to: serviceRequestToDate }, serviceRequestPage, serviceRequestPageSize, setServiceRequestPage
  )

  const handleCleanoutPageSizeChange = (size) => { setCleanoutPageSize(size); setCleanoutPage(1) }
  const handleDisposalPageSizeChange = (size) => { setDisposalPageSize(size); setDisposalPage(1) }
  const handleInspectionPageSizeChange = (size) => { setInspectionPageSize(size); setInspectionPage(1) }
  const handleServiceRequestPageSizeChange = (size) => { setServiceRequestPageSize(size); setServiceRequestPage(1) }
  // Reuses the Alert History endpoint filtered to this farm. An earlier
  // /admin/farms/{id}/alerts was assumed here and never existed, so this
  // panel answered "No recent alerts" for every farm, including ones with
  // open incidents sitting in the Alert History page.
  const [alertPage, setAlertPage] = useState(1)
  const [alertPageSize, setAlertPageSize] = useState(5)
  const { data: alertsData, loading: alertsLoading, error: alertsError } = useTableFetch(
    activeTab === 'records' && recordKey === 'alerts' ? '/admin/alert-history' : null,
    { farm_id: farmId, sort: 'newest' }, alertPage, alertPageSize, setAlertPage, { pollMs: LIVE_POLL_MS }
  )

  const sortedAlerts = alertsData?.items || []

  const initials = farm ? getInitials(farm.owner_name) : ''


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


  const deviceList = farm?.device_list ?? (farm?.sensors ?? []).map(s => ({
    id: s.id,
    device_name: s.label || s.sensor_code,
    status: s.status,
    connectivity: farm?.connectivity === 'Online' ? 'Online' : 'Offline',
    last_seen_at: s.last_seen_at,
    installed_at: s.installed_at,
  }))

  // Installed devices remain visible before their first reading.

  const sortedCleanoutLogs = cleanoutData?.logs || []

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

  const filteredSortedDisposal = disposalData?.records || []

  const toggleDisposalSort = (field) => {
    setDisposalSort(s => (s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' }))
  }


  const filteredSortedInspections = inspectionData?.inspections || []

  const toggleInspectionSort = (field) => {
    setInspectionSort(s => (s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' }))
  }

  const filteredServiceRequests = serviceRequestData?.requests || []

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
      {showPrint && <FarmPrintDialog farmId={farmId} onClose={closePrint} />}
      <div className="fd-page">
      <nav className="fd-breadcrumb" aria-label="Breadcrumb"><button type="button" onClick={() => navigate(farmsPath)}>&#8592; Farms</button><span aria-hidden="true">/</span><strong>{farm.farm_name}</strong></nav>
      <header className="fd-header">
        <div className="fd-heading-row"><div className="fd-title"><div className="fd-title-line"><h1>{farm.farm_name}</h1><FarmBadge value={farm.status} /></div><p><FarmIcon name="pin" size={14} />{farm.address || farm.barangay || 'Address not available'}</p></div>
          <div className="fd-header-actions"><button type="button" className="fd-button" onClick={() => setShowPrint(true)}>Print</button><button type="button" className="fd-button fd-button--green" onClick={() => { setActiveTab('overview'); startEditAccount() }}><FarmIcon name="edit" size={14} />Edit Farm</button><button type="button" className="fd-button" onClick={() => { setActiveTab('overview'); requestAnimationFrame(() => locationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })) }}><FarmIcon name="pin" size={14} />View on Map</button></div>
        </div>
        <div className="fd-main-tabs" role="tablist" aria-label="Farm detail tabs">{TABS.map((tab, index) => <button type="button" className="fd-tab" key={tab.key} id={`farm-tab-button-${tab.key}`} role="tab" aria-selected={activeTab === tab.key} aria-controls={`farm-panel-${tab.key}`} onClick={() => setActiveTab(tab.key)} onKeyDown={event => { const next = event.key === 'ArrowRight' ? (index + 1) % TABS.length : event.key === 'ArrowLeft' ? (index + TABS.length - 1) % TABS.length : event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : null; if (next != null) { event.preventDefault(); setActiveTab(TABS[next].key); event.currentTarget.parentElement.children[next].focus() } }}><FarmIcon name={tab.icon} size={16} />{tab.label}</button>)}</div>
      </header>
      {!isEditingAccount && accountEditSuccess && <div role="status" style={acctStyles.successBox}>{accountEditSuccess}</div>}
      <section role="tabpanel" id={`farm-panel-${activeTab}`} aria-labelledby={`farm-tab-button-${activeTab}`}>
      {activeTab === 'overview' && <><FarmOverview farm={farm} registrationDate={formatRegistrationDate(farm.created_at)} onEdit={startEditAccount} locationRef={locationRef} accountAccess={<details className="fd-account-access"><summary>Account access</summary><p>Send the owner a new temporary password by SMS. Their current password stops working right away.</p>{ownerSignInProblem && <p style={styles.loginAccessWarn}>{ownerSignInProblem}</p>}<button type="button" className="fd-button" onClick={handleResendSms} disabled={resending}>{resending ? 'Sending...' : 'Resend Password'}</button>{resendResult && <div role="status" style={resendResult.success ? styles.resendOk : styles.resendWarn}>{resendResult.message}</div>}</details>} /><PoultryHouses key={farmId} farmId={farmId} /></>}
      {activeTab === 'monitoring' && <HouseMonitoring farmId={farmId} />}
      {activeTab === 'compliance' && <FarmCompliance farm={farm} onRecords={openRecords} />}
      {activeTab === 'records' && <div className="fd-subtabs" role="tablist" aria-label="Farm records">{recordTabs.map(tab => <button type="button" className="fd-subtab" key={tab.key} role="tab" aria-selected={recordTab === tab.key} onClick={() => setRecordTab(tab.key)}>{tab.label}</button>)}</div>}
      {showServiceHistory && <p className="fd-caption">Read-only history of completed Vet services and retired Odor/Fly requests. Legacy statuses and dates are preserved; they do not represent active appointments.</p>}
      {activeTab === 'records' && recordKey === 'alerts' && (<Card title="Alert History" description="Recorded sensor alerts, readings, and incident durations for this farm.">
              {alertsLoading && <SectionLoader />}
              {alertsError && <p role="alert" className="fd-empty">{alertsError}</p>}
              {!alertsLoading && !alertsError && (alertsData?.total ?? 0) === 0 && (
                <div style={styles.empty}>No recent alerts for this farm.</div>
              )}
              {!alertsLoading && !alertsError && alertsData?.total > 0 && (
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
                      {sortedAlerts.map(a => (
                        <tr key={a.id}>
                          <td style={tableStyles.td}>{a.triggered_at}</td>
                          <td style={tableStyles.td}>{a.device_name || '—'}</td>
                          <td style={tableStyles.td}>{a.sensor_type}</td>
                          <td style={tableStyles.td}>{a.value}{String(a.sensor_type).toLowerCase() === 'ammonia' ? ' ppm estimate' : String(a.sensor_type).toLowerCase() === 'moisture' ? '%' : ''}</td>
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

              {!alertsLoading && !alertsError && (
                <Pagination
                  currentPage={alertPage}
                  lastPage={alertsData?.last_page || 1}
                  pageSize={alertPageSize}
                  total={alertsData?.total ?? 0}
                  onPageChange={setAlertPage}
                  onPageSizeChange={(size) => { setAlertPageSize(size); setAlertPage(1) }}
                  isMobile={isMobile}
                />
              )}
            </Card>)}

      {(activeTab === 'records' && recordKey === 'cleanout') && (
        <Card key="manure-records" title="Clean-out History" description="Recorded clean-outs and maintenance notes for this farm." navigation={<ManureRecordTabs value={manureView} onChange={setManureView} />}>
          {cleanoutLoading && <SectionLoader />}
          {cleanoutError && <p role="alert" className="fd-empty">{cleanoutError}</p>}
          {!cleanoutLoading && !cleanoutError && (cleanoutData?.logs?.length ?? 0) === 0 && (
            <div style={styles.empty}>No clean-out records logged for this farm yet.</div>
          )}
          {!cleanoutLoading && !cleanoutError && cleanoutData?.logs?.length > 0 && (
            <>
              <TableScroll style={tableStyles.wrap}>
                <table style={{ ...tableStyles.table, minWidth: '520px' }}>
                  <thead>
                    <tr>
                      <th style={{ ...tableStyles.th, ...tableStyles.thSortable }} onClick={() => setCleanoutSort(s => (s === 'asc' ? 'desc' : 'asc'))}>
                        Date {cleanoutSort === 'asc' ? '▲' : '▼'}
                      </th>
                      <th style={tableStyles.th}>Notes</th>
                      <th className="agb-table-actions-cell" style={{ ...tableStyles.th, textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCleanoutLogs.map(log => (
                      <tr key={log.id}>
                        <td style={tableStyles.td}>{log.performed_at}</td>
                        <td style={tableStyles.td}><small>{log.maintenance_type || 'Activity not specified'}</small><br /><span style={tableStyles.truncate}>{log.notes || '—'}</span></td>
                        <td className="agb-table-actions-cell" style={{ ...tableStyles.td, textAlign: 'right' }}>
                          <button type="button" className="agb-table-action" style={tableStyles.viewLink} onClick={() => setCleanoutViewLog(log)}><FarmIcon name="eye" size={16} />View</button>
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

      {(activeTab === 'records' && recordKey === 'disposal') && (
        <Card key="manure-records" title="Manure Disposal History" description="Recorded disposal methods, quantities, and buyer details." navigation={<ManureRecordTabs value={manureView} onChange={setManureView} />} controls={
              <div className="no-print fd-record-filters" style={filterStyles.filterBar}>
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
        }>
          {disposalLoading && <SectionLoader />}
          {disposalError && <p role="alert" className="fd-empty">{disposalError}</p>}
          {!disposalLoading && !disposalError && (disposalData?.records?.length ?? 0) === 0 && (
            <div style={styles.empty}>No disposal records logged for this farm yet.</div>
          )}
          {!disposalLoading && !disposalError && disposalData?.records?.length > 0 && (
            <>


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
                      <th className="agb-table-actions-cell" style={{ ...tableStyles.th, textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSortedDisposal.map(r => (
                      <tr key={r.id}>
                        <td style={tableStyles.td}>{r.disposal_date}</td>
                        <td style={tableStyles.td}>{r.disposal_method}</td>
                        <td style={tableStyles.td}>{r.buyer_name || '—'}</td>
                        <td style={tableStyles.td}>{r.quantity} kg</td>
                        <td className="agb-table-actions-cell" style={{ ...tableStyles.td, textAlign: 'right' }}>
                          <button type="button" className="agb-table-action" style={tableStyles.viewLink} onClick={() => setDisposalViewRecord(r)}><FarmIcon name="eye" size={16} />View</button>
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

      {(activeTab === 'records' && recordKey === 'inspections') && (
        <Card title="Inspection History" description="General and follow-up inspection records for this farm." controls={
              <div className="no-print fd-record-filters" style={filterStyles.filterBar}>
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
        }>
          {inspectionLoading && <SectionLoader />}
          {inspectionError && <p role="alert" className="fd-empty">{inspectionError}</p>}
          {!inspectionLoading && !inspectionError && (inspectionData?.inspections?.length ?? 0) === 0 && (
            <div style={styles.empty}>No inspections recorded for this farm yet.</div>
          )}
          {!inspectionLoading && !inspectionError && inspectionData?.inspections?.length > 0 && (
            <>


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
                      <th className="agb-table-actions-cell" style={{ ...tableStyles.th, textAlign: 'right' }}>Action</th>
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
                              color: done ? GREEN.hover : '#b45309',
                              backgroundColor: done ? GREEN.soft : '#fbf1e2',
                            }}>{i.status}</span>
                          </td>
                          <td style={tableStyles.td}>{done ? i.completed_at : i.scheduled_at}</td>
                          {/* The Staff account stored on the record. Dash for rows
                              created before scheduled_by existed. */}
                          <td style={tableStyles.td}>{i.scheduled_by_name || '—'}</td>
                          <td className="agb-table-actions-cell" style={{ ...tableStyles.td, textAlign: 'right' }}>
                            <button type="button" className="agb-table-action" style={tableStyles.viewLink} onClick={() => setInspectionViewRecord(i)}><FarmIcon name="eye" size={16} />View</button>
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

      {showServiceHistory && (
        <Card title="Service Request History" description="Read-only records with their original statuses and personnel." controls={
              <div className="no-print fd-record-filters" style={filterStyles.filterBar}>
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
                    {ALL_SERVICE_TYPES.map(t => (
                      <option key={t} value={t}>{serviceHistoryLabel(t)}</option>
                    ))}
                  </select>
                </div>

                <div style={filterStyles.filterActions}>
                  <button type="button" onClick={resetServiceRequestFilter} style={filterStyles.filterResetBtn}>Reset</button>
                  <button type="button" onClick={applyServiceRequestFilter} style={filterStyles.filterApplyBtn}>Apply</button>
                </div>
              </div>
        }>
          {serviceRequestLoading && <SectionLoader />}
          {serviceRequestError && <p role="alert" className="fd-empty">{serviceRequestError}</p>}
          {!serviceRequestLoading && !serviceRequestError && (serviceRequestData?.requests?.length ?? 0) === 0 && (
            <div style={styles.empty}>No service requests recorded for this farm yet.</div>
          )}
          {!serviceRequestLoading && !serviceRequestError && serviceRequestData?.requests?.length > 0 && (
            <>


              <TableScroll style={tableStyles.wrap}>
                <table style={{ ...tableStyles.table, minWidth: '826px' }}>
                  <thead>
                    <tr>
                      <th style={tableStyles.th}>Request Type</th>
                      <th style={tableStyles.th}>Request Date</th>
                      <th style={tableStyles.th}>Original Status</th>
                      <th style={tableStyles.th}>Accepted By</th>
                      <th style={tableStyles.th}>Date Completed</th>
                      <th className="agb-table-actions-cell" style={{ ...tableStyles.th, textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredServiceRequests.map(r => {
                      return (
                        <tr key={r.id}>
                          <td style={tableStyles.td}>
                            <span style={{ ...styles.miniPill, ...serviceTypeBadgeStyle(r.request_type) }}>
                              {serviceHistoryLabel(r.request_type)}
                            </span>
                          </td>
                          <td style={tableStyles.td}>{r.request_date}</td>
                          <td style={tableStyles.td}>
                            <span style={{ ...styles.miniPill, ...requestStatusBadgeStyle(r.status) }}>{r.status}</span>
                          </td>
                          <td style={tableStyles.td}>{r.accepted_by || '—'}</td>
                          <td style={tableStyles.td}>{r.completed_at || '—'}</td>
                          <td className="agb-table-actions-cell" style={{ ...tableStyles.td, textAlign: 'right' }}>
                            <button type="button" className="agb-table-action" style={tableStyles.viewLink} onClick={() => setServiceRequestViewRecord(r)}><FarmIcon name="eye" size={16} />View</button>
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

      </section>
      {isEditingAccount && <EditFarmDialog onClose={cancelEditAccount} busy={accountSaving}><div className="fd-edit-heading"><h2 id="farm-edit-title">Edit Farm and Owner</h2><button type="button" aria-label="Close edit form" disabled={accountSaving} onClick={cancelEditAccount}>&times;</button></div>{accountEditError && <div role="alert" style={acctStyles.errorBox}>{accountEditError}</div>}              <form onSubmit={handleSaveAccount}>
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
              </form></EditFarmDialog>}

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

      {isSuperAdmin && serviceRequestViewRecord && (
        <RecordDetailModal
          title={isRetiredService(serviceRequestViewRecord.request_type) ? 'Legacy Service Request' : 'Service Request History'}
          onClose={() => setServiceRequestViewRecord(null)}
          rows={[
            { label: 'Request Type', value: (
              <span style={{ ...styles.miniPill, ...serviceTypeBadgeStyle(serviceRequestViewRecord.request_type) }}>
                {serviceHistoryLabel(serviceRequestViewRecord.request_type)}
              </span>
            ) },
            { label: 'Request Date', value: serviceRequestViewRecord.request_date },
            { label: 'Original Status', value: (
              <span style={{ ...styles.miniPill, ...requestStatusBadgeStyle(serviceRequestViewRecord.status) }}>
                {serviceRequestViewRecord.status}
              </span>
            ) },
            { label: 'Accepted By', value: serviceRequestViewRecord.accepted_by || '—' },
            { label: 'Date Completed', value: serviceRequestViewRecord.completed_at || '—' },
          ]}
        />
      )}
      </div>
    </AdminLayout>
  )
}

function EditFarmDialog({ children, onClose, busy }) {
  const dialog = useRef(null)
  useEffect(() => {
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.current?.querySelector('input:not([type="file"]):not([disabled])')?.focus()
    return () => { document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus() }
  }, [])
  const handleKey = event => {
    if (event.key === 'Escape' && !busy) { event.stopPropagation(); onClose(); return }
    if (event.key !== 'Tab') return
    const fields = [...dialog.current.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]')].filter(element => element.offsetParent !== null)
    const first = fields[0], last = fields[fields.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }
  return <div className="fd-edit-overlay" onClick={() => { if (!busy) onClose() }}><div ref={dialog} className="fd-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="farm-edit-title" onClick={event => event.stopPropagation()} onKeyDown={handleKey}>{children}</div></div>
}

function ManureRecordTabs({ value, onChange }) {
  return (
    <div className="fd-manure-switch" role="group" aria-label="Manure records">
      <button type="button" aria-pressed={value === 'cleanout'} onClick={() => onChange('cleanout')}>Clean-out Logs</button>
      <button type="button" aria-pressed={value === 'disposal'} onClick={() => onChange('disposal')}>Disposal Records</button>
    </div>
  )
}

function Card({ title, description, controls, navigation, children, action }) {
  return (
    <div className="fd-record-card" style={styles.card}>
      {navigation && <div className="fd-record-navigation">{navigation}</div>}
      <div className="fd-record-heading" style={styles.cardHeader}>
        <div className="fd-record-heading-copy">
          <span className="fd-record-title" style={styles.cardTitle}>{title}</span>
          {description && <p className="fd-record-description">{description}</p>}
        </div>
        {controls && <div className="fd-record-controls">{controls}</div>}
        {action}
      </div>
      {children}
    </div>
  )
}


// Per-device rows instead of one comma-joined "Device Names" cell. A farm
// runs one unit per poultry house, so the question an Admin actually has is
// "which house stopped reporting" — a shared farm-level pill cannot answer
// that, and the joined line got unreadable past two devices.

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

function Pagination({ currentPage, lastPage, pageSize, total, onPageChange, onPageSizeChange, isMobile }) {
  const rangeStart = total === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const rangeEnd = Math.min(currentPage * pageSize, total)

  return (
    <div className="no-print agb-table-footer" style={{ ...paginationStyles.wrap, ...(isMobile ? paginationStyles.wrapMobile : {}) }}>
      <div style={paginationStyles.info}>
        {total === 0 ? 'No results' : `Showing ${rangeStart}–${rangeEnd} of ${total}`}
      </div>
      <div className="agb-table-footer-controls" style={{ ...paginationStyles.controls, ...(isMobile ? paginationStyles.controlsMobile : {}) }}>
        <select aria-label="Rows per page" value={pageSize} onChange={e => onPageSizeChange(Number(e.target.value))} style={paginationStyles.pageSizeSelect}>
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

// Farm devices retain physical identity across explicit monitoring placements.
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
      color: s.status === 'Active' ? GREEN.primary : '#6b7280',
      backgroundColor: s.status === 'Active' ? GREEN.soft : '#f0f1ec',
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
                {s.farm_id && <div style={deviceStyles.hint}>{s.house_name || 'House not selected (legacy)'}</div>}
                <div style={{ fontSize: '11.5px', color: '#9aa79d', marginTop: '3px' }}>
                  Installed {s.installed_at}{s.last_seen_at && ` · Last seen ${s.last_seen_at}`}
                </div>
              </div>
              <div style={deviceStyles.rowActions}>
                <button type="button" style={deviceStyles.editBtn} onClick={() => setAssignSensor(s)}>Change Assignment</button>
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
          farmName={farmName}
          onClose={() => setUnassignSensor(null)}
          onSuccess={() => { setUnassignSensor(null); handleChanged() }}
        />
      )}

      {assignSensor && (
        <DeviceAssignmentDialog
          device={assignSensor}
          onClose={() => { setAssignSensor(null); handleChanged() }}
          onSuccess={() => { setAssignSensor(null); handleChanged() }}
        />
      )}
    </Card>
  )
}

function UnassignDeviceModal({ sensor, farmName, onClose, onSuccess }) {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleConfirm = async () => {
    setError('')
    setLoading(true)
    try {
      await api.patch(`/admin/sensors/${sensor.id}/unassign`, { expected_assignment_version: sensor.assignment_version ?? 0 })
      onSuccess()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to unassign device.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={deviceStyles.overlay} onClick={onClose}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="fd-unassign-title" aria-describedby="fd-unassign-question fd-unassign-support" style={{ ...deviceStyles.modal, width: '420px', padding: '20px' }} onClick={e => e.stopPropagation()}>
        <div style={deviceStyles.header}>
          <h3 id="fd-unassign-title" style={deviceStyles.title}>Unassign Device?</h3>
          <span style={deviceStyles.close} onClick={onClose}>×</span>
        </div>

        {error && <div style={deviceStyles.errorBox}>{error}</div>}

        <p id="fd-unassign-question" style={deviceStyles.confirmText}>
          Unassign <strong>{sensor.device_name}</strong> from <strong>{farmName || sensor.farm_name || 'its current farm'}</strong>?
        </p>
        <p id="fd-unassign-support" style={deviceStyles.hint}>
          Previous readings will remain with this farm.
        </p>
        <p style={deviceStyles.hint}>Unassignment ends software monitoring placement, without transferring ownership or retrieving the device.</p>

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
    width: '68px', height: '68px', borderRadius: '50%', backgroundColor: GREEN.soft, color: GREEN.primary,
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
  tabActive: { color: GREEN.primary, borderBottom: '2px solid var(--agb-green)' },

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
    cursor: 'pointer', border: '1px solid var(--agb-green)', backgroundColor: '#fff', color: GREEN.primary,
  },
  loginAccessBtnBusy: { cursor: 'wait', borderColor: '#cfe0d3', color: '#8a968d' },
  resendOk: {
    backgroundColor: GREEN.soft, border: '1px solid #cfe0d3', color: GREEN.hover,
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
  pageBtnActive: { backgroundColor: GREEN.primary, borderColor: GREEN.primary, color: '#fff' },
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
    display: 'flex', alignItems: 'flex-end', gap: '10px', flexWrap: 'wrap',
    margin: 0,
  },
  // Grows to share the bar evenly instead of sitting at its minimum and
  // leaving a stripe of empty space to the right of the last input.
  filterField: { display: 'flex', flexDirection: 'column', gap: '5px', flex: '1 1 130px', minWidth: 0 },
  filterLabel: { fontSize: '11px', fontWeight: 600, color: '#536158' },
  filterSelect: {
    padding: '8px 10px', height: '36px', borderRadius: '7px', border: '1px solid #dce2dc',
    fontSize: '12px', color: '#33413a', backgroundColor: '#fff', cursor: 'pointer',
    fontFamily: SANS, boxSizing: 'border-box', width: '100%', minWidth: 0,
  },
  // Sits on the baseline with the inputs rather than being pushed to the
  // far edge by margin, so the bar reads as one row of controls.
  filterActions: { display: 'flex', gap: '8px', marginLeft: 'auto', flex: '0 0 auto' },
  filterResetBtn: {
    padding: '8px 12px', height: '36px', borderRadius: '7px', border: '1px solid #dce2dc',
    backgroundColor: '#fff', color: '#33413a', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap',
  },
  filterApplyBtn: {
    padding: '8px 12px', height: '36px', borderRadius: '7px', border: '1px solid var(--agb-green)',
    backgroundColor: GREEN.primary, color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap',
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
    padding: '7px 14px', borderRadius: '8px', border: '1px solid var(--agb-green)',
    backgroundColor: '#fff', color: GREEN.primary, fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', fontFamily: SANS,
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
    backgroundColor: '#e7f2ea', color: GREEN.primary, display: 'flex',
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
  submitBtn: { padding: '9px 16px', borderRadius: '10px', border: 'none', backgroundColor: GREEN.primary, color: '#fff', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', fontFamily: SANS },
  successBox: { backgroundColor: GREEN.soft, border: '1px solid #cfe0d3', borderRadius: '12px', padding: '18px', textAlign: 'center', marginTop: '8px' },
  successLabel: { fontSize: '11px', fontWeight: 700, color: '#5c8a6b', textTransform: 'uppercase', letterSpacing: '0.05em' },
  successCode: { fontSize: '22px', fontWeight: 800, color: GREEN.hover, fontFamily: 'monospace', margin: '8px 0', letterSpacing: '0.03em' },
  successHint: { fontSize: '12px', color: '#4b5a50', lineHeight: 1.5, margin: 0 },
}

// Matches the Manage Accounts (Account Details) inline-edit UI exactly, so
// editing behaves identically across the system: label-above-input fields,
// disabled/gray display state, and the same Edit / Save Changes / Cancel
// button styles.
const acctStyles = {
  editBtn: {
    backgroundColor: 'white', color: GREEN.primary, border: '1px solid var(--agb-green)',
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
    backgroundColor: GREEN.primary, color: 'white', border: 'none', borderRadius: '8px',
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
    backgroundColor: '#f0fdf4', border: '1px solid #86efac', color: GREEN.primary,
    padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '14px',
  },
}

const photoUploadStyles = {
  wrap: { display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px', padding: '12px', backgroundColor: '#fafbf8', borderRadius: '12px', border: '1px solid #eceee7' },
  preview: { width: '56px', height: '56px', borderRadius: '50%', backgroundColor: GREEN.soft, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, overflow: 'hidden', border: '2px dashed #cfe0d3' },
  previewImg: { width: '100%', height: '100%', objectFit: 'cover' },
  placeholder: { fontSize: '22px', color: GREEN.primary, fontWeight: 700 },
  label: { fontSize: '13px', fontWeight: 700, color: '#16311d' },
  hint: { fontSize: '11.5px', color: '#9aa79d', marginTop: '2px' },
  btn: { fontSize: '12px', fontWeight: 700, color: GREEN.primary, cursor: 'pointer', marginTop: '4px', display: 'inline-block' },
}
