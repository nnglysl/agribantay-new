import { GREEN } from '../../theme/green'
import { useTableFetch } from '../../hooks/useTableFetch'
import DropdownList from '../../components/DropdownList'
import TableScroll from '../../components/TableScroll'
import ScrollableTabs from '../../components/ScrollableTabs'
import { useState, useEffect, useId, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'
import SharedPagination from '../../components/Pagination'
import ClearDateButton, { DateRangeHeader } from '../../components/ClearDateButton'
import { useCachedFetch, invalidateCache } from '../../hooks/useCachedFetch'
import { getUser } from '../../utils/auth'
import { LIVE_POLL_MS } from '../../constants/polling'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useMonthFilter } from '../../hooks/useMonthFilter'
import { formatDate, formatDateTime, parseLocalDate, DISPLAY_TIME_ZONE } from '../../utils/formatDate'
import { manilaDay } from '../../utils/reportPeriod'
import InspectionDetailsModal from '../../components/InspectionDetailsModal'
import CompleteInspectionModal from '../../components/CompleteInspectionModal'
import CancelInspectionModal from '../../components/CancelInspectionModal'
import InspectionActionModal from '../../components/InspectionActionModal'
import { SkeletonTable, BtnBusy } from '../../components/Loading'

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const DAY_NAMES_SHORT = ['S','M','T','W','T','F','S']
const PAGE_SIZE_OPTIONS = [10, 25, 50]

function inspectionTypeStyle(type) {
  const isFollowUp = type === 'Follow-up'
  return {
    label: isFollowUp ? 'Follow-up Inspection' : 'General Inspection',
    bg: isFollowUp ? '#b45309' : GREEN.primary,
    text: '#ffffff',
  }
}

// The Staff member who scheduled the inspection is the one who conducts it —
// there is no separate assignment step — so scheduled_by is the responsible
// Staff member shown everywhere.
function responsibleStaff(i) {
  return i.scheduled_by_name?.trim() || '—'
}

function sameDay(a, b) {
  return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

// Grid cells are calendar dates represented in the browser's local timezone.
// Convert API instants to their office date before comparing them to a cell.
function officeCalendarDate(value = new Date()) {
  return parseLocalDate(manilaDay(value))
}

function calendarDay(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function isPastDate(date) {
  const day = typeof date === 'string' ? manilaDay(date) : calendarDay(date)
  return !!day && day < manilaDay()
}

// Overdue is DERIVED, not stored: a Scheduled inspection whose calendar date
// has passed without being completed or cancelled. Matches the date-only
// rule the backend uses for scheduling (today's inspection is still
// Scheduled until the day is over).
function isOverdue(i) {
  return i.status === 'Scheduled' && !!i.scheduled_at && isPastDate(i.scheduled_at)
}

// Label shown in badges/details — the stored status, except Overdue.
function displayStatus(i) {
  return isOverdue(i) ? 'Overdue' : i.status
}



export default function Inspections() {
  const [searchParams, setSearchParams] = useSearchParams()
  // Read once per render from the stored session, the same way Service
  // Requests does. The daily limit is per PERSON, so the page has to know
  // which person is looking at it.
  const currentUserId = getUser()?.id ?? null

  const [tab, setTab] = useState('schedule')
  const [search, setSearch] = useState('')
  const { month: viewDate, setMonth: setViewDate, prevMonth, nextMonth } = useMonthFilter()
  const [modalDate, setModalDate] = useState(null)
  const [prefillFarm, setPrefillFarm] = useState(null)
  const [confirmCancel, setConfirmCancel] = useState(null)
  const [completeInspection, setCompleteInspection] = useState(null)
  const [inspectionMessage, setInspectionMessage] = useState('')
  const [viewInspection, setViewInspection] = useState(null)
  const [rescheduleInspection, setRescheduleInspection] = useState(null)
  const isMobile = useIsMobile()

  const [appliedFromDate, setAppliedFromDate] = useState('')
  const [appliedToDate, setAppliedToDate] = useState('')
  const [appliedType, setAppliedType] = useState('')

  const { data: inspectionsData, loading: loadingInspections, error: errorInspections, refetch: fetchCalendar } = useCachedFetch('/admin/inspections', { calendar_month: viewDate.getMonth() + 1, calendar_year: viewDate.getFullYear(), summary_from: appliedFromDate, summary_to: appliedToDate, summary_type: appliedType }, { pollMs: LIVE_POLL_MS })
  const refetchInspections = () => { invalidateCache('/admin/inspections'); fetchCalendar() }
  const { data: farmsData, loading: loadingFarms, error: errorFarms, refetch: refetchFarms } = useCachedFetch('/admin/farms')

  const inspections = inspectionsData?.calendar || []
  const farms = farmsData || []
  const loading = loadingInspections || loadingFarms
  const error = errorInspections || errorFarms

  // Coming from a Critical farm pin on the Dashboard map: remember which
  // farm triggered this, land on the Schedule tab — but do NOT auto-pick
  // a date or open the modal. The Admin still has to click a day on the
  // calendar themselves; the farm just comes pre-filled once they do.
  useEffect(() => {
    const farmId = searchParams.get('farmId')
    if (farmId && farms.length > 0) {
      const farm = farms.find(f => String(f.id) === farmId)
      if (farm) {
        setPrefillFarm(farm)
        setTab('schedule')
      }
      setSearchParams(prev => {
        const next = new URLSearchParams(prev)
        next.delete('farmId')
        return next
      }, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farms.length])

  const refetchAll = () => {
    refetchInspections()
    refetchFarms()
  }

  const closeScheduleModal = () => {
    setModalDate(null)
    setPrefillFarm(null)
  }

  const statusColor = { Scheduled: '#b45309', Overdue: '#b91c1c', Completed: GREEN.hover, Cancelled: '#6b7280' }

  // One shared From/To date-range filter for the whole page (summary cards +
  // Scheduled/Completed/History tables). Independent from the Schedule
  // tab's calendar (viewDate), which keeps its own navigation untouched.
  const [filterOpen, setFilterOpen] = useState(false)
  const [draftFromDate, setDraftFromDate] = useState('')
  const [draftToDate, setDraftToDate] = useState('')
  const [draftType, setDraftType] = useState('')
  const filterRef = useRef(null)

  useEffect(() => {
    if (!filterOpen) return
    const handleClickOutside = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [filterOpen])

  const applyFilter = () => {
    setAppliedFromDate(draftFromDate)
    setAppliedToDate(draftToDate)
    setAppliedType(draftType)
    setFilterOpen(false)
  }

  const showAllFilter = () => {
    setAppliedFromDate('')
    setAppliedToDate('')
    setAppliedType('')
    setDraftFromDate('')
    setDraftToDate('')
    setDraftType('')
    setFilterOpen(false)
  }

  // Clears From/To immediately (applied + draft) so the list returns to
  // unfiltered results in one click; the type filter is left as-is.
  const clearDates = () => {
    setAppliedFromDate('')
    setAppliedToDate('')
    setDraftFromDate('')
    setDraftToDate('')
  }
  const hasDate = !!(draftFromDate || draftToDate || appliedFromDate || appliedToDate)

  const activeFilterCount = ((appliedFromDate || appliedToDate) ? 1 : 0) + (appliedType ? 1 : 0)
  const fmtPeriodDate = (v) => new Date(`${v}T09:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const periodLabel = (!appliedFromDate && !appliedToDate)
    ? 'All Time'
    : appliedFromDate && appliedToDate
      ? `${fmtPeriodDate(appliedFromDate)} – ${fmtPeriodDate(appliedToDate)}`
      : appliedFromDate ? `From ${fmtPeriodDate(appliedFromDate)}` : `Up to ${fmtPeriodDate(appliedToDate)}`

  const totalThisMonth = inspectionsData?.summary?.total || 0
  const followUpThisMonth = inspectionsData?.summary?.follow_up || 0
  const generalThisMonth = totalThisMonth - followUpThisMonth
  const tableFilters = { tab, search, from: appliedFromDate, to: appliedToDate, inspection_type: appliedType }

  return (
    <AdminLayout>
      <div style={{ ...styles.headerRow, ...(isMobile ? styles.headerRowMobile : {}) }}>
        <div>
          <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>Inspections</h1>
          <p style={styles.subtitle}>Schedule, manage, and monitor farm inspections</p>
        </div>
      </div>

      {inspectionMessage && <p className="inspection-completion-feedback" role="status">{inspectionMessage}</p>}

      <div style={{ ...styles.summaryGrid, ...(isMobile ? styles.summaryGridMobile : {}) }}>
        <SummaryCard label="Total Inspections" value={totalThisMonth} sub={periodLabel} variant="green" isMobile={isMobile} />
        <SummaryCard label="General Inspections" value={generalThisMonth} sub={periodLabel} variant="orange" isMobile={isMobile} />
        <SummaryCard label="Follow-up Inspections" value={followUpThisMonth} sub={periodLabel} variant="yellow" isMobile={isMobile} />
      </div>

      <div className="no-print" style={{ ...styles.toolbar, ...(isMobile ? styles.toolbarMobile : {}) }}>
        <ScrollableTabs style={styles.tabs} isMobile={isMobile}>
          {['schedule', 'scheduled', 'overdue', 'completed', 'history'].map(t => (
            <div className="agb-ui-tab"
              key={t}
              style={{ ...styles.tab, ...(tab === t ? styles.tabActive : {}) }}
              onClick={() => setTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </div>
          ))}
        </ScrollableTabs>
      </div>

      {tab !== 'schedule' && (
        <div className="no-print agb-search-filter-row" style={styles.listToolbar}>
          <div className="agb-search-field" style={styles.searchWrap}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="#9aa79d" strokeWidth="2" />
              <path d="M20 20l-3.5-3.5" stroke="#9aa79d" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              aria-label="Search inspections"
              placeholder={isMobile ? 'Search...' : 'Search inspections, farm, or staff...'}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button type="button" style={styles.clearSearchBtn} onClick={() => setSearch('')} aria-label="Clear search">&times;</button>
            )}
          </div>

          <div className="agb-search-filter-anchor" style={styles.filterAnchor} ref={filterRef}>
            <button className="agb-search-filter-button" aria-expanded={filterOpen}
              type="button"
              onClick={() => (filterOpen ? setFilterOpen(false) : setFilterOpen(true))}
              style={{ ...styles.filterBtn, ...(activeFilterCount > 0 ? styles.filterBtnActive : {}) }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M4 5h16l-6 8v6l-4-2v-4L4 5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              </svg>
              Filter
              {activeFilterCount > 0 && <span style={styles.filterCount}>{activeFilterCount}</span>}
            </button>

            {filterOpen && (
              <div style={{ ...styles.filterPanel, ...(isMobile ? styles.filterPanelMobile : {}) }}>
                <div style={styles.filterPanelHeader}>
                  <span style={styles.filterPanelTitle}>Filter</span>
                  <span style={styles.filterPanelClose} onClick={() => setFilterOpen(false)}>×</span>
                </div>

                <DateRangeHeader>
                  <label style={styles.filterLabel}>From</label>
                  <ClearDateButton visible={hasDate} onClick={clearDates} />
                </DateRangeHeader>
                <input type="date" value={draftFromDate} onChange={e => setDraftFromDate(e.target.value)} style={styles.filterSelect} />

                <label style={styles.filterLabel}>To</label>
                <input type="date" value={draftToDate} onChange={e => setDraftToDate(e.target.value)} style={styles.filterSelect} />

                <label style={styles.filterLabel}>Inspection Type</label>
                <select value={draftType} onChange={e => setDraftType(e.target.value)} style={styles.filterSelect}>
                  <option value="">All Types</option>
                  <option value="General Inspection">General Inspection</option>
                  <option value="Follow-up">Follow-up Inspection</option>
                </select>

                <div style={styles.filterActions}>
                  <button type="button" onClick={showAllFilter} style={styles.filterResetBtn}>Show all</button>
                  <button type="button" onClick={applyFilter} style={styles.filterApplyBtn}>Apply</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'schedule' && prefillFarm && !modalDate && (
        <div style={styles.criticalBanner}>
          <span style={styles.criticalBannerIcon}>⚠</span>
          <span>
            Critical Farm Detected — <strong>{prefillFarm.farm_name}</strong>. Please select an inspection date on the calendar below.
          </span>
          <span style={styles.criticalBannerClose} onClick={() => setPrefillFarm(null)}>×</span>
        </div>
      )}

      {loading && <SkeletonTable rows={6} columns={6} />}
      {error && <p style={{ ...styles.stateText, color: '#b91c1c' }}>{error}</p>}

      {!loading && !error && tab === 'schedule' && (
        <CalendarView
          inspections={inspections}
          currentUserId={currentUserId}
          viewDate={viewDate}
          setViewDate={setViewDate}
          onAddSchedule={(date) => setModalDate(date)}
          onViewEvent={setViewInspection}
          isMobile={isMobile}
        />
      )}

      {!loading && !error && tab === 'scheduled' && (
        <InspectionList
          filters={tableFilters}
          statusColor={statusColor}
          onCancel={setConfirmCancel}
          onComplete={setCompleteInspection}
          onReschedule={setRescheduleInspection}
          isMobile={isMobile}
        />
      )}

      {!loading && !error && tab === 'overdue' && (
        <InspectionList
          filters={tableFilters}
          statusColor={statusColor}
          onCancel={setConfirmCancel}
          onComplete={setCompleteInspection}
          onReschedule={setRescheduleInspection}
          isMobile={isMobile}
        />
      )}

      {!loading && !error && tab === 'completed' && (
        <InspectionList filters={tableFilters} statusColor={statusColor} onView={setViewInspection} isMobile={isMobile} />
      )}

      {!loading && !error && tab === 'history' && (
        <InspectionList
          filters={tableFilters}
          statusColor={statusColor}
          onView={setViewInspection}
          isMobile={isMobile}
        />
      )}

      {modalDate && (
        <ScheduleModal
          date={modalDate}
          farms={farms}
          prefillFarm={prefillFarm}
          onClose={closeScheduleModal}
          onSuccess={() => { closeScheduleModal(); refetchInspections() }}
          isMobile={isMobile}
          existingInspections={inspectionsData?.summary?.active_inspections || []}
        />
      )}

      {completeInspection && (
        <CompleteInspectionModal
          inspection={completeInspection}
          onClose={() => setCompleteInspection(null)}
          onSuccess={() => {
            setInspectionMessage(`${completeInspection.inspection_number} marked as completed.`)
            setCompleteInspection(null)
            refetchInspections()
          }}
        />
      )}

      {rescheduleInspection && (
        <RescheduleModal
          inspection={rescheduleInspection}
          onClose={() => setRescheduleInspection(null)}
          onSuccess={() => { setRescheduleInspection(null); refetchInspections() }}
        />
      )}

      {viewInspection && (() => {
        const c = statusColor[displayStatus(viewInspection)] || '#6b7280'
        const fields = [
          { label: 'Farm', value: viewInspection.farm_name },
          ...(viewInspection.owner_name ? [{ label: 'Farm Owner', value: viewInspection.owner_name }] : []),
          { label: 'Inspection Type', value: viewInspection.inspection_type },
          { label: 'Assigned Staff', value: responsibleStaff(viewInspection) },
          { label: 'Scheduled Date and Time', value: formatDateTime(viewInspection.scheduled_at) },
          // Shown only on a cancelled record, where it is the point of the row.
          ...(viewInspection.status === 'Cancelled' && viewInspection.cancellation_reason
            ? [{ label: 'Cancellation Reason', value: viewInspection.cancellation_reason }]
            : []),
          ...(viewInspection.completed_at ? [{ label: 'Completed Date and Time', value: formatDateTime(viewInspection.completed_at) }] : []),
        ]
        return (
          <InspectionDetailsModal
            inspectionNumber={viewInspection.inspection_number}
            status={displayStatus(viewInspection)}
            badgeStyle={{ color: c, backgroundColor: badgeBg(displayStatus(viewInspection)) }}
            fields={fields.map(field => ({ ...field, value: field.value || '—' }))}
            notes={viewInspection.notes}
            findings={viewInspection.findings}
            onClose={() => setViewInspection(null)}
          />
        )
      })()}

      {confirmCancel && (
        <CancelInspectionModal
          inspection={confirmCancel}
          onClose={() => setConfirmCancel(null)}
          onSuccess={() => {
            setInspectionMessage(`${confirmCancel.inspection_number} cancelled.`)
            setConfirmCancel(null)
            // Keep the existing owner-view invalidation and inspection refresh.
            invalidateCache('/farmer/inspections')
            refetchInspections()
          }}
        />
      )}
    </AdminLayout>
  )
}

function SummaryCard({ label, value, sub, variant, isMobile }) {
  const shortLabel = variant === 'green' ? 'Total' : variant === 'yellow' ? 'Follow-up' : 'General'

  if (isMobile) {
    return (
      <div style={styles.summaryCardPhone}>
        <div style={styles.summaryPhoneLabel}>{shortLabel}</div>
        <div style={styles.summaryPhoneValue}>{value}</div>
        <div style={styles.summaryPhoneSub}>{sub}</div>
      </div>
    )
  }

  return (
    <div style={styles.summaryCard}>
      <div style={styles.summaryValue}>{value}</div>
      <div style={styles.summaryLabel}>{label}</div>
      <div style={styles.summarySub}>{sub}</div>
    </div>
  )
}

function badgeBg(status) {
  if (status === 'Completed') return GREEN.soft
  if (status === 'Overdue') return '#fdecec'
  if (status === 'Scheduled') return '#fbf1e2'
  return '#eef1ea'
}

function InspectionList({ filters, statusColor, onCancel, onComplete, onReschedule, onView, isMobile }) {

  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const { data, loading, error } = useTableFetch('/admin/inspections', filters, currentPage, pageSize, setCurrentPage, { pollMs: LIVE_POLL_MS })
  const list = data?.items || []
  if (loading) return <SkeletonTable rows={6} columns={8} />
  if (error) return <div style={styles.tableEmpty}>{error}</div>

  if (list.length === 0) return <div style={styles.tableEmpty}>No inspections here yet.</div>

  const totalItems = data?.total || 0
  const totalPages = data?.last_page || 1
  const start = (currentPage - 1) * pageSize
  const paginated = list
  const rangeStart = totalItems === 0 ? 0 : start + 1
  const rangeEnd = Math.min(currentPage * pageSize, totalItems)

  const rowActions = (i) => (
    <div className="agb-table-actions" style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
      {onView && (
        <button type="button" className="agb-table-action" style={{ ...styles.actionBtn, ...styles.viewLink }} onClick={() => onView(i)}>View</button>
      )}
      {i.status === 'Scheduled' && onComplete && (
        <button type="button" className="agb-table-action" style={{ ...styles.actionBtn, ...styles.completeLink }} onClick={() => onComplete(i)}>Complete</button>
      )}
      {i.status === 'Scheduled' && onReschedule && (
        <button type="button" className="agb-table-action" style={{ ...styles.actionBtn, ...styles.rescheduleLink }} onClick={() => onReschedule(i)}>Reschedule</button>
      )}
      {i.status === 'Scheduled' && onCancel && (
        <button type="button" className="agb-table-action" style={{ ...styles.actionBtn, ...styles.cancelLink }} onClick={() => onCancel(i)}>Cancel</button>
      )}
    </div>
  )

  return (
    <div style={styles.tableCard}>
      <TableScroll style={styles.tableScroll}>
        <table style={{ ...styles.table, ...styles.tableMinWidth }}>
          <thead>
            <tr>
              <th style={styles.th}>Inspection</th>
              <th style={styles.th}>Farm</th>
              <th style={styles.th}>Date</th>
              <th style={styles.th}>Time</th>
              <th style={styles.th}>Type</th>
              <th style={styles.th}>Staff</th>
              <th style={styles.th}>Status</th>
              <th className="agb-table-actions-cell" style={{ ...styles.th, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map(i => {
              const barColor = statusColor[displayStatus(i)] || '#6b7280'
              return (
                <tr key={i.id}>
                  <td style={styles.td}>
                    <div style={styles.rowTitle}>{i.inspection_number}</div>
                  </td>
                  <td style={styles.td}>
                    <div>{i.farm_name}</div>
                    {i.owner_name && <div style={styles.rowMeta}>{i.owner_name}</div>}
                  </td>
                  <td style={styles.td}>{formatDate(i.scheduled_at)}</td>
                  <td style={styles.td}>{new Date(i.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: DISPLAY_TIME_ZONE })}</td>
                  <td style={styles.td}>{i.inspection_type}</td>
                  <td style={styles.td}>{responsibleStaff(i)}</td>
                  <td style={styles.td}>
                    <span style={{ ...styles.badge, color: barColor, backgroundColor: badgeBg(displayStatus(i)) }}>
                      {displayStatus(i)}
                    </span>
                  </td>
                  <td className="agb-table-actions-cell" style={styles.td}>{rowActions(i)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableScroll>

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
    </div>
  )
}

function Pagination({ currentPage, totalPages, pageSize, onPageChange, onPageSizeChange, rangeStart, rangeEnd, totalItems, isMobile }) {
  return (
    <div className="no-print agb-table-footer" style={{ ...paginationStyles.wrap, ...(isMobile ? paginationStyles.wrapMobile : {}) }}>
      <div style={paginationStyles.info}>
        {totalItems === 0 ? 'No results' : `Showing ${rangeStart}–${rangeEnd} of ${totalItems}`}
      </div>
      <div className="agb-table-footer-controls" style={{ ...paginationStyles.controls, ...(isMobile ? paginationStyles.controlsMobile : {}) }}>
        <select aria-label="Rows per page" value={pageSize} onChange={e => onPageSizeChange(Number(e.target.value))} style={paginationStyles.pageSizeSelect}>
          {PAGE_SIZE_OPTIONS.map(size => <option key={size} value={size}>{size} / page</option>)}
        </select>
        <SharedPagination currentPage={currentPage} totalPages={totalPages} onPageChange={onPageChange} isMobile={isMobile} />
      </div>
    </div>
  )
}

function CalendarView({ inspections, currentUserId, viewDate, setViewDate, onAddSchedule, onViewEvent, isMobile }) {
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const today = officeCalendarDate()
  const [selectedDate, setSelectedDate] = useState(null)

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstWeekday = new Date(year, month, 1).getDay()

  const cells = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  // Cancelled inspections are kept in the record and still appear in
  // History — but the calendar shows what is actually going to happen, and
  // a cancelled visit is not. Excluded here rather than at the call site so
  // the day tiles, the "+N more" count and the day detail panel all agree.
  const getInspectionsForDay = (day) => {
    if (!day) return []
    return inspections.filter(i => {
      if (i.status === 'Cancelled') return false
      const d = officeCalendarDate(i.scheduled_at)
      if (!d) return false
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day
    })
  }

  const isToday = (day) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear()

  const isSelected = (day) =>
    day && selectedDate && sameDay(new Date(year, month, day), selectedDate)

  const goPrev = () => setViewDate(new Date(year, month - 1, 1))
  const goNext = () => setViewDate(new Date(year, month + 1, 1))

  const handleEventClick = (e, insp) => {
    e.stopPropagation()
    e.currentTarget.focus()
    onViewEvent(insp)
  }

  const handleEventKeyDown = (event, inspection) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleEventClick(event, inspection)
    }
  }

  const selectDay = (date) => setSelectedDate(date)

  // Same exclusion as the day tiles. Filtering only the tiles left the panel
  // as a second way to reach a cancelled visit: the date read as free on the
  // grid while the panel beside it still listed the call-off.
  // Mirrors Rule 3 in AdminInspectionController::store(): one farm per
  // staff member per day, counting Scheduled and Completed (the visit
  // happened) but not Cancelled (nobody went).
  //
  // This is a convenience only — the server still refuses a duplicate, which
  // is what covers a stale page, two tabs, or a direct API call. Derived from
  // the same `inspections` list the calendar draws from, so one refetch
  // after scheduling, cancelling or completing updates the button too.
  const myInspectionThatDay = selectedDate && currentUserId
    ? inspections.find(i =>
        i.assigned_to_id === currentUserId
        && (i.status === 'Scheduled' || i.status === 'Completed')
        && sameDay(officeCalendarDate(i.scheduled_at), selectedDate))
    : null

  const panelInspections = selectedDate
    ? inspections
        .filter(i => i.status !== 'Cancelled' && sameDay(officeCalendarDate(i.scheduled_at), selectedDate))
        .slice()
        .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
    : []

  return (
    <div style={{ ...styles.calendarLayout, ...(isMobile ? styles.calendarLayoutMobile : {}) }}>
      <div style={{ ...styles.calendarCard, ...(isMobile ? styles.calendarCardMobile : {}) }}>
        <div style={styles.calendarHeader}>
          <h3 style={{ ...styles.calendarMonth, ...(isMobile ? styles.calendarMonthMobile : {}) }}>
            {isMobile ? `${MONTH_NAMES[month].slice(0, 3)} ${year}` : `${MONTH_NAMES[month]} ${year}`}
          </h3>
          <div style={styles.calendarNav}>
            <span style={styles.navBtn} onClick={goPrev}>‹</span>
            <span style={styles.navBtn} onClick={goNext}>›</span>
          </div>
        </div>

        <div style={styles.calendarGrid}>
          {(isMobile ? DAY_NAMES_SHORT : DAY_NAMES).map((d, i) => (
            <div key={i} style={styles.calendarDayName}>{d}</div>
          ))}

          {cells.map((day, idx) => {
            const dayInspections = getInspectionsForDay(day)
            const visibleEvents = dayInspections.slice(0, 2)
            const hiddenCount = dayInspections.length - visibleEvents.length
            const dateForDay = day ? new Date(year, month, day) : null
            const selected = isSelected(day)

            return (
              <div
                key={idx}
                style={{
                  ...styles.calendarCell,
                  ...(isMobile ? styles.calendarCellMobile : {}),
                  ...(day ? {} : styles.calendarCellEmpty),
                  ...(day && dateForDay && isPastDate(dateForDay) ? styles.calendarCellPast : {}),
                  ...(isToday(day) ? styles.calendarCellToday : {}),
                  ...(selected ? styles.calendarCellSelected : {}),
                }}
                onClick={() => {
                  if (!day) return
                  const clickedDate = new Date(year, month, day)
                  selectDay(clickedDate)
                }}
              >
                {day && (
                  <>
                    <div style={{ ...styles.calendarDayNum, ...(isMobile ? styles.calendarDayNumMobile : {}), ...(isToday(day) || selected ? styles.calendarDayNumToday : {}) }}>{day}</div>

                    {isMobile ? (
                      visibleEvents.length > 0 && (
                        <div style={styles.calendarEventsMobile}>
                          {visibleEvents.map((insp, i) => {
                            const t = inspectionTypeStyle(insp.inspection_type)
                            return (
                              <div
                                key={i}
                                style={{ ...styles.calendarEventMobile, backgroundColor: t.bg, color: t.text }}
                                onClick={(e) => handleEventClick(e, insp)}
                                role="button"
                                tabIndex={0}
                                className="inspection-details-trigger"
                                onKeyDown={e => handleEventKeyDown(e, insp)}
                                title={`${t.label} — ${insp.farm_name}`}
                              >
                                {insp.farm_name}
                              </div>
                            )
                          })}
                          {hiddenCount > 0 && (
                            <div style={styles.calendarMoreMobile} onClick={() => selectDay(dateForDay)}>
                              +{hiddenCount} more
                            </div>
                          )}
                        </div>
                      )
                    ) : (
                      <>
                        {visibleEvents.map((insp, i) => {
                          const t = inspectionTypeStyle(insp.inspection_type)
                          return (
                            <div
                              key={i}
                              style={{ ...styles.calendarEvent, backgroundColor: t.bg, color: t.text }}
                              onClick={(e) => handleEventClick(e, insp)}
                              role="button"
                              tabIndex={0}
                              className="inspection-details-trigger"
                              onKeyDown={e => handleEventKeyDown(e, insp)}
                            >
                              <div style={styles.calendarEventType}>{t.label}</div>
                              <div style={{ ...styles.calendarEventFarm, color: t.text }}>{insp.farm_name}</div>
                              <div style={{ ...styles.calendarEventTime, color: t.text }}>
                                {new Date(insp.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: DISPLAY_TIME_ZONE })}
                              </div>
                            </div>
                          )
                        })}
                        {hiddenCount > 0 && (
                          <div style={styles.calendarMoreDesktop} onClick={() => selectDay(dateForDay)}>
                            +{hiddenCount} more
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>

        <div style={{ ...styles.legend, ...(isMobile ? styles.legendMobile : {}) }}>
          <span style={styles.legendItem}><span style={{ ...styles.legendDot, backgroundColor: GREEN.primary }} /> General Inspection</span>
          <span style={styles.legendItem}><span style={{ ...styles.legendDot, backgroundColor: '#b45309' }} /> Follow-up Inspection</span>
        </div>
      </div>

      <div style={{ ...styles.sidePanel, ...(isMobile ? styles.sidePanelMobile : {}) }}>
        <div style={styles.sidePanelHead}>
          <div style={styles.sidePanelKicker}>Selected date</div>
          <div style={styles.sidePanelDate}>
            {selectedDate ? formatDate(calendarDay(selectedDate)) : 'Pick a date'}
          </div>
        </div>

        {selectedDate && (
          <div style={styles.sidePanelBtnWrap}>
            {isPastDate(selectedDate) ? (
              <div style={styles.pastDateNote}>Past dates cannot be scheduled.</div>
            ) : myInspectionThatDay ? (
              <>
                <button style={{ ...styles.addInspectionBtn, ...styles.addInspectionBtnDisabled }} disabled>
                  + Add Inspection
                </button>
                <div style={styles.limitNote}>
                  You already have an inspection scheduled for this date. A staff
                  member can only conduct one inspection per day.
                </div>
              </>
            ) : (
              <button style={styles.addInspectionBtn} onClick={() => onAddSchedule(selectedDate)}>
                + Add Inspection
              </button>
            )}
          </div>
        )}

        <div style={styles.scheduledLabel}>
          Scheduled Inspections{panelInspections.length > 0 ? ` (${panelInspections.length})` : ''}
        </div>

        <div style={styles.sidePanelList}>
          {!selectedDate ? (
            <p style={styles.selectedEmpty}>Select a date on the calendar to see its inspections.</p>
          ) : panelInspections.length === 0 ? (
            <p style={styles.selectedEmpty}>No inspections scheduled for this date.</p>
          ) : (
            panelInspections.map(insp => {
              const t = inspectionTypeStyle(insp.inspection_type)
              return (
                <div key={insp.id} style={styles.selectedItem} role="button" tabIndex={0} className="inspection-details-trigger" onClick={e => handleEventClick(e, insp)} onKeyDown={e => handleEventKeyDown(e, insp)}>
                  <span style={{ ...styles.selectedItemType, backgroundColor: t.bg, color: t.text }}>{t.label}</span>
                  <div style={styles.selectedItemFarm}>{insp.farm_name}</div>
                  <div style={styles.selectedItemTime}>
                    {new Date(insp.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: DISPLAY_TIME_ZONE })}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

function ScheduleModal({ date, farms, prefillFarm, onClose, onSuccess, isMobile, existingInspections = [] }) {
  const [farmId, setFarmId] = useState(prefillFarm?.id || '')
  const [farmSearch, setFarmSearch] = useState(prefillFarm ? `${prefillFarm.farm_name} — ${prefillFarm.owner_name}` : '')
  const [showFarmList, setShowFarmList] = useState(false)
  const [time, setTime] = useState('09:00')
  const [inspectionType, setInspectionType] = useState(prefillFarm ? 'Follow-up' : 'General Inspection')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // One ACTIVE inspection per farm: a farm with an inspection still in
  // 'Scheduled' status (overdue ones included) cannot be booked again until it
  // is completed or cancelled.
  //
  // Separate from the one-farm-per-STAFF-per-day limit, which is handled
  // before this modal opens (the Add Inspection button is disabled). Two
  // different rules: this one is about the farm, that one about the person.
  // The backend enforces both under a lock; these are only so the user never
  // picks something that is going to be refused.
  const activeByFarm = new Map(
    existingInspections
      .filter(i => i.status === 'Scheduled' && i.farm_id != null)
      .map(i => [String(i.farm_id), i])
  )
  const selectedFarmActive = farmId ? activeByFarm.get(String(farmId)) : null

  const dateLabel = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  const filteredFarms = farms.filter(f => {
    // Farms with an active inspection are not offered at all — see above.
    if (activeByFarm.has(String(f.id))) return false
    const combined = `${f.farm_name} — ${f.owner_name}`.toLowerCase()
    const search = farmSearch.toLowerCase()
    return combined.includes(search) ||
      f.farm_name.toLowerCase().includes(search) ||
      f.owner_name.toLowerCase().includes(search)
  })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!farmId) {
      setError('Please select a farm.')
      return
    }

    setLoading(true)
    try {
      const [hours, minutes] = time.split(':')
      const scheduledAt = new Date(date)
      scheduledAt.setHours(parseInt(hours), parseInt(minutes), 0)

      const pad = (n) => String(n).padStart(2, '0')
      const formatted = `${scheduledAt.getFullYear()}-${pad(scheduledAt.getMonth() + 1)}-${pad(scheduledAt.getDate())} ${pad(scheduledAt.getHours())}:${pad(scheduledAt.getMinutes())}:00`

      await api.post('/admin/inspections', {
        farm_id: farmId,
        inspection_type: inspectionType,
        scheduled_at: formatted,
        notes,
      })
      onSuccess()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to schedule inspection.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={{ ...modalStyles.modal, ...(isMobile ? modalStyles.modalMobile : {}) }} onClick={e => e.stopPropagation()}>
        <div style={modalStyles.header}>
          <h3 style={modalStyles.title}>Schedule Inspection</h3>
          <span style={modalStyles.close} onClick={onClose}>×</span>
        </div>
        <p style={modalStyles.dateLabel}>Schedule Date: {dateLabel}</p>
        {prefillFarm && (
          <div style={modalStyles.prefillBanner}>
            Critical Farm Detected — {prefillFarm.farm_name}. Please select an inspection date.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {error && <div style={modalStyles.errorBox}>{error}</div>}
          {selectedFarmActive && (
            <div style={modalStyles.errorBox}>
              This farm already has an active inspection ({selectedFarmActive.inspection_number} on{' '}
              {formatDate(selectedFarmActive.scheduled_at)}). Complete or cancel it before scheduling another.
            </div>
          )}

          <label style={modalStyles.label}>Farm *</label>
          <div style={{ position: 'relative' }}>
            <input className="agb-dropdown-trigger" data-selected={Boolean(farmId)} aria-label="Search farms for inspection" title={farmSearch}
              type="text"
              placeholder="Search by farm or owner name..."
              value={farmSearch}
              onChange={e => {
                setFarmSearch(e.target.value)
                setFarmId('')
                setShowFarmList(true)
              }}
              onFocus={() => { if (!farmId) setShowFarmList(true) }}
              style={modalStyles.input}
            />
            {showFarmList && (
              <DropdownList role="group" aria-label="Farm choices" style={modalStyles.dropdownList}>
                {filteredFarms.map(f => (
                  <button className="agb-dropdown-option" type="button"
                    key={f.id}
                    style={modalStyles.dropdownItem}
                    onClick={() => {
                      setFarmId(f.id)
                      setFarmSearch(`${f.farm_name} — ${f.owner_name}`)
                      setShowFarmList(false)
                    }}
                  >
                    {f.farm_name} — {f.owner_name}
                  </button>
                ))}
                {filteredFarms.length === 0 && (
                  <div style={modalStyles.dropdownEmpty}>
                    {farms.some(f => activeByFarm.has(String(f.id)) && `${f.farm_name} — ${f.owner_name}`.toLowerCase().includes(farmSearch.toLowerCase()))
                      ? 'That farm already has an active inspection.'
                      : 'No farms match your search.'}
                  </div>
                )}
              </DropdownList>
            )}
          </div>

          <div style={{ ...modalStyles.row, ...(isMobile ? modalStyles.rowMobile : {}) }}>
            <div>
              <label style={modalStyles.label}>Time *</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} style={modalStyles.input} />
            </div>
            <div>
              <label style={modalStyles.label}>Inspection Type *</label>
              <select value={inspectionType} onChange={e => setInspectionType(e.target.value)} style={modalStyles.input}>
                <option value="General Inspection">General Inspection</option>
                <option value="Follow-up">Follow-up</option>
              </select>
            </div>
          </div>

          <label style={modalStyles.label}>Notes for Inspection (optional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            style={{ ...modalStyles.input, minHeight: '70px', resize: 'vertical' }}
            placeholder="Add context or specific concerns"
          />

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
              disabled={loading || !!selectedFarmActive}
              style={{ ...modalStyles.submitBtn, ...(isMobile ? modalStyles.btnFull : {}), ...(selectedFarmActive ? modalStyles.submitBtnDisabled : {}) }}
            >
              {loading ? <BtnBusy label="Scheduling…" /> : 'Schedule Inspection'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function RescheduleModal({ inspection, onClose, onSuccess }) {
  const [date, setDate] = useState('')
  const [time, setTime] = useState('09:00')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const pending = useRef(false)
  const fieldId = useId()
  const errorId = useId()
  const requestClose = () => { if (!pending.current) onClose() }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (pending.current) return
    setError('')

    if (!date) {
      setError('Please select a new date.')
      return
    }
    if (!reason.trim()) {
      setError('Please explain why the inspection is being rescheduled.')
      return
    }

    pending.current = true
    setLoading(true)
    try {
      await api.patch(`/admin/inspections/${inspection.id}/reschedule`, {
        scheduled_at: `${date} ${time}:00`,
        reason,
      })
      onSuccess()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reschedule inspection.')
    } finally {
      pending.current = false
      setLoading(false)
    }
  }

  return (
    <InspectionActionModal
      title="Reschedule Inspection"
      subtitle={`${inspection.inspection_number} — ${inspection.farm_name} · Currently scheduled ${formatDateTime(inspection.scheduled_at)}`}
      busy={loading}
      onClose={requestClose}
      onSubmit={handleSubmit}
      actions={<>
        <button type="button" className="inspection-action-secondary" disabled={loading} onClick={requestClose}>Cancel</button>
        <button type="submit" className="inspection-action-primary" disabled={loading}>
          {loading ? <BtnBusy label="Saving…" /> : 'Reschedule Inspection'}
        </button>
      </>}
    >
      {inspection.previous_scheduled_at && (
        <p className="inspection-action-context">
          Already rescheduled once, from {formatDateTime(inspection.previous_scheduled_at)}
          {inspection.reschedule_reason ? ` — ${inspection.reschedule_reason}` : ''}
        </p>
      )}

      {error && <p id={errorId} className="inspection-action-error" role="alert">{error}</p>}

      <label className="inspection-action-label" htmlFor={`${fieldId}-reason`}>Reason for Rescheduling *</label>
      <textarea
        id={`${fieldId}-reason`}
        className="inspection-action-input"
        data-initial-focus
        required
        rows={3}
        value={reason}
        readOnly={loading}
        aria-describedby={error ? errorId : undefined}
        onChange={e => setReason(e.target.value)}
        placeholder="Example: Farm was unavailable on the originally scheduled date."
      />

      <div className="inspection-action-row">
        <div>
          <label className="inspection-action-label" htmlFor={`${fieldId}-date`}>New Date *</label>
          <input id={`${fieldId}-date`} className="inspection-action-input" type="date" required readOnly={loading} value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div>
          <label className="inspection-action-label" htmlFor={`${fieldId}-time`}>New Time *</label>
          <input id={`${fieldId}-time`} className="inspection-action-input" type="time" required readOnly={loading} value={time} onChange={e => setTime(e.target.value)} />
        </div>
      </div>
    </InspectionActionModal>
  )
}

const SANS = "'Inter', sans-serif"

const styles = {
  stateText: { fontFamily: SANS, fontSize: '14px', color: '#4b5a50' },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' },
  headerRowMobile: { flexDirection: 'column', gap: '12px' },
  title: { fontSize: '24px', fontWeight: 800, letterSpacing: '-0.015em', color: '#16311d', margin: 0 },
  titleMobile: { fontSize: '20px' },
  subtitle: { fontSize: '13.5px', color: '#6b7770', marginTop: '5px' },

  summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '14px', marginBottom: '22px' },
  summaryGridMobile: { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '11px' },
  summaryCard: { backgroundColor: GREEN.primary, border: '1px solid var(--agb-green-hover)', borderRadius: '14px', padding: '20px 22px' },
  summaryValue: { fontSize: '30px', fontWeight: 800, lineHeight: 1, letterSpacing: '-0.02em', color: '#ffffff' },
  summaryLabel: { fontSize: '12px', fontWeight: 700, marginTop: '8px', textTransform: 'uppercase', letterSpacing: '0.04em', color: GREEN.soft },
  summarySub: { fontSize: '11.5px', marginTop: '3px', color: '#a9c6b3' },

  summaryCardPhone: {
    position: 'relative', overflow: 'hidden', backgroundColor: GREEN.primary, border: '1px solid var(--agb-green-hover)',
    borderRadius: '14px', padding: '16px 14px 18px', minHeight: '118px',
  },
  summaryPhoneLabel: { fontSize: '13px', fontWeight: 700, color: GREEN.soft },
  summaryPhoneValue: { fontSize: '26px', fontWeight: 800, lineHeight: 1, letterSpacing: '-0.02em', marginTop: '10px', color: '#ffffff' },
  summaryPhoneSub: { fontSize: '10px', fontWeight: 600, marginTop: '6px', color: '#a9c6b3' },

  toolbar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: '14px', marginBottom: '18px', borderBottom: '1px solid #e7e8e0', flexWrap: 'wrap',
  },
  toolbarMobile: { flexDirection: 'column', flexWrap: 'nowrap', alignItems: 'stretch', gap: '12px' },
  listToolbar: { marginBottom: '18px' },
  searchWrap: { position: 'relative', flex: 1, minWidth: 0 },
  clearSearchBtn: { position: 'absolute', background: 'none', border: 'none', color: '#9aa79d', fontSize: '18px', cursor: 'pointer', lineHeight: 1 },

  // minWidth 0 is what lets overflowX work: without it a flex item refuses
  // to be narrower than its contents, so the row pushed the whole page
  // sideways instead of scrolling inside itself.
  tabs: { display: 'flex', gap: '4px', overflowX: 'auto', minWidth: 0, maxWidth: '100%', flexWrap: 'nowrap', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', },
  tab: { padding: '10px 16px', fontSize: '14px', fontWeight: 700, color: '#6b7770', cursor: 'pointer', borderBottom: '2px solid transparent', whiteSpace: 'nowrap', flexShrink: 0, },
  tabActive: { color: GREEN.primary, borderBottom: '2px solid var(--agb-green)' },

  filterAnchor: { position: 'relative', flexShrink: 0 },
  filterBtn: {
    display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 15px',
    borderRadius: '10px', border: '1px solid #dcdfd6', backgroundColor: '#fff',
    color: '#33413a', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
  },
  filterBtnActive: { borderColor: GREEN.primary, color: GREEN.primary },
  filterCount: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minWidth: '18px', height: '18px', borderRadius: '999px', backgroundColor: GREEN.primary,
    color: '#fff', fontSize: '11px', fontWeight: 700, padding: '0 4px',
  },
  filterPanel: {
    position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 40,
    backgroundColor: '#fff', border: '1px solid #e7e8e0', borderRadius: '14px',
    boxShadow: '0 8px 24px rgba(15,38,22,0.12)', padding: '18px', width: '280px',
    maxHeight: '70vh', overflowY: 'auto',
  },
  filterPanelMobile: { right: 0, width: '260px' },
  filterPanelHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' },
  filterPanelTitle: { fontSize: '15px', fontWeight: 800, color: '#16311d' },
  filterPanelClose: { fontSize: '19px', cursor: 'pointer', color: '#8a968d', lineHeight: 1 },
  filterLabel: { display: 'block', fontSize: '12px', fontWeight: 700, color: '#4b5a50', marginBottom: '7px', marginTop: '14px' },
  filterSelect: {
    width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #dcdfd6',
    fontSize: '13px', color: '#33413a', backgroundColor: '#fff', cursor: 'pointer',
    fontFamily: 'inherit', boxSizing: 'border-box',
  },
  filterActions: { display: 'flex', gap: '10px', marginTop: '20px' },
  filterResetBtn: {
    flex: 1, padding: '9px 0', borderRadius: '10px', border: '1px solid #dcdfd6',
    backgroundColor: '#fff', color: '#33413a', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  },
  filterApplyBtn: {
    flex: 1, padding: '9px 0', borderRadius: '10px', border: 'none',
    backgroundColor: GREEN.primary, color: '#fff', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  },

  criticalBanner: {
    display: 'flex', alignItems: 'center', gap: '10px',
    backgroundColor: '#fbeaea', border: '1px solid #f0c9c9', color: '#b91c1c',
    padding: '11px 16px', borderRadius: '10px', fontSize: '13px', marginBottom: '18px',
  },
  criticalBannerIcon: { fontSize: '15px', flexShrink: 0 },
  criticalBannerClose: { marginLeft: 'auto', fontSize: '18px', cursor: 'pointer', lineHeight: 1, flexShrink: 0, opacity: 0.75 },

  tableCard: { backgroundColor: '#fff', borderRadius: '14px', border: '1px solid #e7e8e0', overflow: 'hidden' },
  tableEmpty: { backgroundColor: '#fff', border: '1px solid #e7e8e0', borderRadius: '14px', padding: '32px', textAlign: 'center', color: '#9aa79d', fontSize: '14px' },
  scrollHint: { fontSize: '11px', color: '#9aa79d', margin: '12px 20px 0' },
  tableScroll: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  table: { width: '100%', borderCollapse: 'collapse' },
  tableMinWidth: { minWidth: '1040px' },
  th: {
    textAlign: 'left', padding: '13px 20px', fontSize: '13px', fontWeight: 600, color: '#8a968d',
    borderBottom: '1px solid #eceee7',
    whiteSpace: 'nowrap', backgroundColor: '#fafbf8',
  },
  td: { padding: '13px 20px', fontSize: '12px', color: '#4b5a50', borderBottom: '1px solid #f2f3ed', verticalAlign: 'middle' },
  rowMeta: { fontSize: '12px', color: '#8a968d', marginTop: '2px' },
  rowTitle: { fontSize: '14px', fontWeight: 400, color: '#16311d' },

  badge: {
    display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 11px',
    borderRadius: '999px', fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap',
  },
  actionBtn: {
    padding: '6px 13px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 600,
    cursor: 'pointer', border: '1px solid #e3e6dd', backgroundColor: '#fff', whiteSpace: 'nowrap',
  },
  completeLink: { color: GREEN.primary },
  rescheduleLink: { color: '#2f6bb0' },
  cancelLink: { color: '#b91c1c' },
  viewLink: { color: '#4b5a50' },

  calendarLayout: { display: 'flex', gap: '16px', alignItems: 'stretch' },
  calendarLayoutMobile: { flexDirection: 'column' },
  calendarCard: { flex: 1, minWidth: 0, backgroundColor: '#fff', borderRadius: '14px', padding: '22px', border: '1px solid #e7e8e0' },
  calendarCardMobile: { padding: '14px' },
  calendarHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  calendarMonth: { fontSize: '16px', fontWeight: 700, color: '#16311d', margin: 0 },
  calendarMonthMobile: { fontSize: '14px' },
  calendarNav: { display: 'flex', gap: '8px' },
  navBtn: {
    width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: '1px solid #dcdfd6', borderRadius: '8px', cursor: 'pointer', fontSize: '16px', color: '#33413a',
  },

  calendarGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '5px' },
  calendarDayName: { fontSize: '11px', fontWeight: 700, color: '#9aa79d', textAlign: 'center', padding: '6px 0', textTransform: 'uppercase', letterSpacing: '0.03em' },
  calendarCell: {
    minHeight: '104px', minWidth: 0, border: '1px solid #f2f3ed', borderRadius: '8px', padding: '7px',
    cursor: 'pointer', fontSize: '12px', overflow: 'hidden', backgroundColor: '#fff',
  },
  calendarCellMobile: { minHeight: '64px', padding: '3px', borderRadius: '6px' },
  calendarCellEmpty: { cursor: 'default', backgroundColor: 'transparent', border: '1px solid transparent' },
  calendarCellPast: { backgroundColor: '#fafaf8', opacity: 0.55 },
  calendarCellToday: { backgroundColor: '#eef5ef', border: '1px solid #bcd8c4' },
  calendarCellSelected: { backgroundColor: '#f4faf5', border: '1px solid var(--agb-green)', boxShadow: '0 0 0 1px var(--agb-green) inset' },
  calendarDayNum: { fontSize: '12.5px', fontWeight: 700, color: '#374151', marginBottom: '5px' },
  calendarDayNumMobile: { fontSize: '11px', marginBottom: '2px', textAlign: 'center' },
  calendarDayNumToday: { color: GREEN.hover },

  calendarEvent: { borderRadius: '6px', padding: '4px 6px', marginBottom: '3px', cursor: 'pointer', lineHeight: '1.25' },
  calendarEventType: { fontSize: '9.5px', fontWeight: 700 },
  calendarEventFarm: { fontSize: '9px', fontWeight: 600, opacity: 0.95, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  calendarEventTime: { fontSize: '8.5px', opacity: 0.85 },
  calendarMoreDesktop: { fontSize: '9.5px', color: '#6b7770', fontWeight: 600, marginTop: '1px', cursor: 'pointer' },

  calendarEventsMobile: { display: 'flex', flexDirection: 'column', gap: '2px' },
  calendarEventMobile: {
    fontSize: '7.5px', fontWeight: 600, borderRadius: '3px', padding: '1.5px 3px',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer',
  },
  calendarMoreMobile: { fontSize: '7.5px', color: '#6b7770', fontWeight: 600, cursor: 'pointer' },

  sidePanel: {
    width: '320px', flexShrink: 0, display: 'flex', flexDirection: 'column',
    backgroundColor: '#fff', border: '1px solid #e7e8e0', borderRadius: '14px',
    overflow: 'hidden', alignSelf: 'stretch',
  },
  sidePanelMobile: { width: '100%' },
  sidePanelHead: { padding: '18px 18px 14px', borderBottom: '1px solid #eceee7' },
  sidePanelKicker: { fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#8a968d' },
  sidePanelDate: { fontSize: '16px', fontWeight: 800, color: '#16311d', marginTop: '4px' },
  sidePanelBtnWrap: { padding: '14px 14px 4px' },
  sidePanelList: { padding: '6px 12px 14px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' },

  addInspectionBtn: {
    width: '100%', boxSizing: 'border-box', padding: '11px', borderRadius: '10px', border: 'none',
    backgroundColor: GREEN.primary, color: '#fff', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer',
  },
  addInspectionBtnDisabled: { backgroundColor: '#e7e8e0', color: '#9aa79d', cursor: 'not-allowed', boxShadow: 'none' },
  limitNote: { fontSize: '12px', color: '#8a6a2f', backgroundColor: '#fdf8f0', border: '1px solid #f0e2cf', borderRadius: '10px', padding: '9px 11px', marginTop: '8px', lineHeight: 1.55 },
  pastDateNote: {
    fontSize: '12.5px', color: '#9aa79d', textAlign: 'center', padding: '10px', fontStyle: 'italic',
  },
  scheduledLabel: {
    fontSize: '11px', fontWeight: 700, color: '#9aa79d', textTransform: 'uppercase',
    letterSpacing: '0.04em', padding: '10px 14px 4px',
  },
  selectedEmpty: { fontSize: '13px', color: '#9aa79d', padding: '8px 2px', lineHeight: 1.5 },
  selectedItem: { border: '1px solid #eceee7', borderRadius: '10px', padding: '12px', cursor: 'pointer' },
  selectedItemType: {
    display: 'inline-block', fontSize: '10.5px', fontWeight: 700, padding: '2px 9px',
    borderRadius: '999px', marginBottom: '8px',
  },
  selectedItemFarm: { fontSize: '14px', fontWeight: 700, color: '#16311d' },
  selectedItemTime: { fontSize: '12px', color: '#8a968d', marginTop: '2px' },

  legend: { display: 'flex', gap: '20px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #f2f3ed' },
  legendMobile: { gap: '12px', flexWrap: 'wrap' },
  legendItem: { display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12px', color: '#6b7770' },
  legendDot: { width: '9px', height: '9px', borderRadius: '50%' },
}

const paginationStyles = {
  wrap: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderTop: '1px solid #eceee7', flexWrap: 'wrap', gap: '10px' },
  wrapMobile: { flexDirection: 'column', flexWrap: 'nowrap', alignItems: 'stretch' },
  info: { fontSize: '12px', color: '#8a968d', whiteSpace: 'nowrap' },
  controls: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
  controlsMobile: { justifyContent: 'space-between' },
  pageSizeSelect: { padding: '6px 10px', borderRadius: '8px', border: '1px solid #dcdfd6', fontSize: '12px', color: '#4b5a50', marginRight: '6px' },
  navBtn: { minWidth: '30px', height: '30px', padding: '0 6px', borderRadius: '8px', border: '1px solid #dcdfd6', backgroundColor: '#fff', color: '#4b5a50', fontSize: '13px', cursor: 'pointer' },
  navBtnDisabled: { opacity: 0.4, cursor: 'not-allowed' },
  pageBtn: { minWidth: '30px', height: '30px', padding: '0 6px', borderRadius: '8px', border: '1px solid #dcdfd6', backgroundColor: '#fff', color: '#4b5a50', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' },
  pageBtnActive: { backgroundColor: GREEN.primary, borderColor: GREEN.primary, color: '#fff' },
  ellipsis: { padding: '0 4px', color: '#9aa79d', fontSize: '13px' },
}

const modalStyles = {
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(15,38,22,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  modal: { backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '440px', maxWidth: '90%', maxHeight: '90vh', overflowY: 'auto' },
  modalMobile: {
    width: '100%', maxWidth: '100%', borderRadius: '16px 16px 0 0',
    padding: '20px', margin: '0', position: 'fixed', bottom: 0, left: 0, maxHeight: '85vh',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' },
  title: { fontSize: '17px', fontWeight: 800, color: '#16311d', margin: 0 },
  close: { fontSize: '22px', cursor: 'pointer', color: '#8a968d' },
  dateLabel: { fontSize: '13px', color: '#6b7770', marginBottom: '16px' },
  prefillBanner: {
    backgroundColor: '#fbeaea', border: '1px solid #f0c9c9', color: '#b91c1c',
    padding: '8px 12px', borderRadius: '10px', fontSize: '12px', fontWeight: 600, marginBottom: '14px',
  },
  contextNote: { fontSize: '12px', color: '#6b7770', backgroundColor: '#fafbf8', border: '1px solid #eceee7', borderRadius: '9px', padding: '9px 12px', marginTop: '12px', lineHeight: '1.4' },
  label: { display: 'block', fontSize: '13px', fontWeight: 600, color: '#33413a', marginBottom: '6px', marginTop: '12px' },
  input: { width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #dcdfd6', fontSize: '14px', boxSizing: 'border-box', fontFamily: 'inherit' },
  row: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '12px' },
  rowMobile: { gridTemplateColumns: '1fr' },
  errorBox: { backgroundColor: '#fbeaea', border: '1px solid #f0c9c9', color: '#b91c1c', padding: '10px 14px', borderRadius: '10px', fontSize: '13px', marginBottom: '14px' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' },
  actionsMobile: { flexDirection: 'column-reverse' },
  btnFull: { width: '100%', boxSizing: 'border-box' },
  cancelBtn: { padding: '10px 18px', borderRadius: '10px', border: '1px solid #dcdfd6', backgroundColor: '#fff', fontSize: '14px', fontWeight: 600, color: '#33413a', cursor: 'pointer' },
  submitBtn: { padding: '10px 18px', borderRadius: '10px', border: 'none', backgroundColor: GREEN.primary, color: '#fff', fontSize: '14px', fontWeight: 700, cursor: 'pointer' },
  submitBtnDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  dropdownList: {
    position: 'absolute', top: '100%', left: 0, right: 0,
    backgroundColor: '#fff', border: '1px solid #dcdfd6', borderRadius: '10px',
    marginTop: '4px', maxHeight: '180px', overflowY: 'auto', zIndex: 10,
    boxShadow: '0 4px 12px rgba(20,48,28,0.12)',
  },
  dropdownItem: { padding: '10px 14px', fontSize: '14px', cursor: 'pointer', color: '#33413a' },
  dropdownEmpty: { padding: '10px 14px', fontSize: '13px', color: '#9aa79d' },
}
