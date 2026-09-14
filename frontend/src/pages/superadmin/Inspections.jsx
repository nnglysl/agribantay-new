import { useState, useEffect, useMemo, useRef } from 'react'
import AdminLayout from '../../components/AdminLayout'
import SharedPagination from '../../components/Pagination'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useMonthFilter, filterByMonth } from '../../hooks/useMonthFilter'
import { formatDate, formatDateTime } from '../../utils/formatDate'
import { viewModalStyles as v } from '../../styles/viewModalStyles'

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const DAY_NAMES_SHORT = ['S','M','T','W','T','F','S']
const PAGE_SIZE_OPTIONS = [10, 25, 50]

function inspectionTypeStyle(type) {
  const isFollowUp = type === 'Follow-up'
  return {
    label: isFollowUp ? 'Follow-up Inspection' : 'General Inspection',
    bg: isFollowUp ? '#b45309' : '#2c8047',
    text: '#ffffff',
  }
}

function matchesSearch(i, search) {
  if (!search) return true
  const q = search.toLowerCase()
  const haystack = [i.farm_name, i.inspection_type, i.scheduled_by_name].filter(Boolean).join(' ').toLowerCase()
  return haystack.includes(q)
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function isPastDate(date) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const check = new Date(date)
  check.setHours(0, 0, 0, 0)
  return check < today
}

/**
 * Super Admin's Inspections page is view-only monitoring/oversight — no
 * scheduling, editing, rescheduling, assigning, cancelling, or completing.
 * Day-to-day inspection operations remain exclusive to Admin's own
 * Inspections page (pages/admin/Inspections.jsx). Kept as a fully separate
 * file (not a shared component with role flags) so the two roles'
 * permissions never risk bleeding into each other.
 */
export default function SuperAdminInspections() {
  const [tab, setTab] = useState('calendar')
  const { month: viewDate, setMonth: setViewDate, label: monthLabel } = useMonthFilter()
  const [viewInspection, setViewInspection] = useState(null)
  const isMobile = useIsMobile()

  const [search, setSearch] = useState('')

  // Scheduled tab filters
  const [schedFarm, setSchedFarm] = useState('')
  const [schedType, setSchedType] = useState('')
  const [schedScheduledBy, setSchedScheduledBy] = useState('')
  const [schedFrom, setSchedFrom] = useState('')
  const [schedTo, setSchedTo] = useState('')

  // Completed tab filters
  const [complFarm, setComplFarm] = useState('')
  const [complType, setComplType] = useState('')
  const [complScheduledBy, setComplScheduledBy] = useState('')
  const [complFrom, setComplFrom] = useState('')
  const [complTo, setComplTo] = useState('')

  // History tab filters
  const [historyFarm, setHistoryFarm] = useState('')
  const [historyStatus, setHistoryStatus] = useState('')
  const [historyFrom, setHistoryFrom] = useState('')
  const [historyTo, setHistoryTo] = useState('')

  // One Filter button/panel, reused across Scheduled, Completed, and History —
  // only one is ever visible at a time since they're separate tabs, so a
  // single open/draft state (branched on the active tab) is enough.
  const [filterOpen, setFilterOpen] = useState(false)
  const [draft, setDraft] = useState({})
  const filterRef = useRef(null)

  useEffect(() => {
    if (!filterOpen) return
    const handleClickOutside = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [filterOpen])

  const openFilter = () => {
    if (tab === 'scheduled') {
      setDraft({ farm: schedFarm, type: schedType, scheduledBy: schedScheduledBy, from: schedFrom, to: schedTo })
    } else if (tab === 'completed') {
      setDraft({ farm: complFarm, type: complType, scheduledBy: complScheduledBy, from: complFrom, to: complTo })
    } else if (tab === 'history') {
      setDraft({ farm: historyFarm, status: historyStatus, from: historyFrom, to: historyTo })
    }
    setFilterOpen(true)
  }

  const applyFilter = () => {
    if (tab === 'scheduled') {
      setSchedFarm(draft.farm || '')
      setSchedType(draft.type || '')
      setSchedScheduledBy(draft.scheduledBy || '')
      setSchedFrom(draft.from || '')
      setSchedTo(draft.to || '')
    } else if (tab === 'completed') {
      setComplFarm(draft.farm || '')
      setComplType(draft.type || '')
      setComplScheduledBy(draft.scheduledBy || '')
      setComplFrom(draft.from || '')
      setComplTo(draft.to || '')
    } else if (tab === 'history') {
      setHistoryFarm(draft.farm || '')
      setHistoryStatus(draft.status || '')
      setHistoryFrom(draft.from || '')
      setHistoryTo(draft.to || '')
    }
    setFilterOpen(false)
  }

  const resetFilter = () => {
    if (tab === 'history') {
      setDraft({ farm: '', status: '', from: '', to: '' })
    } else {
      setDraft({ farm: '', type: '', scheduledBy: '', from: '', to: '' })
    }
  }

  const activeFilterCount = tab === 'scheduled'
    ? [schedFarm, schedType, schedScheduledBy, schedFrom, schedTo].filter(Boolean).length
    : tab === 'completed'
    ? [complFarm, complType, complScheduledBy, complFrom, complTo].filter(Boolean).length
    : tab === 'history'
    ? [historyFarm, historyStatus, historyFrom, historyTo].filter(Boolean).length
    : 0

  const { data: inspectionsData, loading, error } = useCachedFetch('/admin/inspections')

  const inspections = useMemo(() => inspectionsData || [], [inspectionsData])

  const scheduled = inspections.filter(i => i.status === 'Scheduled')
  const completed = inspections.filter(i => i.status === 'Completed')
  const historyList = inspections.filter(i => i.status === 'Completed' || i.status === 'Cancelled')

  const farmOptions = useMemo(
    () => [...new Set(inspections.map(i => i.farm_name).filter(Boolean))].sort(),
    [inspections]
  )

  const scheduledByOptions = useMemo(
    () => [...new Set(inspections.map(i => i.scheduled_by_name?.trim()).filter(Boolean))].sort(),
    [inspections]
  )

  const filteredScheduled = useMemo(() => {
    return scheduled.filter(i => {
      if (schedFarm && i.farm_name !== schedFarm) return false
      if (schedType && i.inspection_type !== schedType) return false
      if (schedScheduledBy && (i.scheduled_by_name?.trim() || '') !== schedScheduledBy) return false
      const d = new Date(i.scheduled_at)
      if (schedFrom && d < new Date(schedFrom)) return false
      if (schedTo && d > new Date(`${schedTo}T23:59:59`)) return false
      return matchesSearch(i, search)
    })
  }, [scheduled, schedFarm, schedType, schedScheduledBy, schedFrom, schedTo, search])

  const filteredCompleted = useMemo(() => {
    return completed.filter(i => {
      if (complFarm && i.farm_name !== complFarm) return false
      if (complType && i.inspection_type !== complType) return false
      if (complScheduledBy && (i.scheduled_by_name?.trim() || '') !== complScheduledBy) return false
      const d = new Date(i.scheduled_at)
      if (complFrom && d < new Date(complFrom)) return false
      if (complTo && d > new Date(`${complTo}T23:59:59`)) return false
      return matchesSearch(i, search)
    })
  }, [completed, complFarm, complType, complScheduledBy, complFrom, complTo, search])

  const filteredHistory = useMemo(() => {
    return historyList.filter(i => {
      if (historyFarm && i.farm_name !== historyFarm) return false
      if (historyStatus && i.status !== historyStatus) return false
      const d = new Date(i.scheduled_at)
      if (historyFrom && d < new Date(historyFrom)) return false
      if (historyTo && d > new Date(`${historyTo}T23:59:59`)) return false
      return matchesSearch(i, search)
    })
  }, [historyList, historyFarm, historyStatus, historyFrom, historyTo, search])

  const monthInspections = filterByMonth(inspections, viewDate)
  const totalThisMonth = monthInspections.length
  const scheduledThisMonth = monthInspections.filter(i => i.status === 'Scheduled').length
  const completedThisMonth = monthInspections.filter(i => i.status === 'Completed').length

  return (
    <AdminLayout>
      <div style={{ ...styles.headerRow, ...(isMobile ? styles.headerRowMobile : {}) }}>
        <div>
          <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>Inspections</h1>
          <p style={styles.subtitle}>View inspection schedules, activities, and records across all farms.</p>
        </div>
      </div>

      <div style={{ ...styles.summaryGrid, ...(isMobile ? styles.summaryGridMobile : {}) }}>
        <SummaryCard label="Total Inspections" value={totalThisMonth} sub={monthLabel} isMobile={isMobile} />
        <SummaryCard label="Scheduled Inspections" value={scheduledThisMonth} sub={monthLabel} isMobile={isMobile} />
        <SummaryCard label="Completed Inspections" value={completedThisMonth} sub={monthLabel} isMobile={isMobile} />
      </div>

      <div style={{ ...styles.tabsRow, ...(isMobile ? styles.tabsRowMobile : {}) }}>
        <div style={styles.tabs}>
          {['calendar', 'scheduled', 'completed', 'history'].map(t => (
            <div
              key={t}
              style={{ ...styles.tab, ...(tab === t ? styles.tabActive : {}) }}
              onClick={() => setTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </div>
          ))}
        </div>

        {tab !== 'calendar' && (
          <div style={{ ...styles.toolbarRight, ...(isMobile ? styles.toolbarRightMobile : {}) }}>
            <div style={styles.searchWrap}>
              <svg style={styles.searchIcon} width="15" height="15" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="7" stroke="#9aa79d" strokeWidth="2" />
                <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="#9aa79d" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <input
                placeholder="Search farm, type, or scheduled by..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={styles.searchInput}
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} style={styles.clearBtn} aria-label="Clear search">
                  ×
                </button>
              )}
            </div>

            <div style={styles.filterAnchor} ref={filterRef}>
              <button
                type="button"
                onClick={() => (filterOpen ? setFilterOpen(false) : openFilter())}
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

                  <label style={styles.filterLabel}>Farm</label>
                  <select
                    value={draft.farm || ''}
                    onChange={e => setDraft(d => ({ ...d, farm: e.target.value }))}
                    style={styles.filterSelect}
                  >
                    <option value="">All Farms</option>
                    {farmOptions.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>

                  {(tab === 'scheduled' || tab === 'completed') && (
                    <>
                      <label style={styles.filterLabel}>Inspection Type</label>
                      <select
                        value={draft.type || ''}
                        onChange={e => setDraft(d => ({ ...d, type: e.target.value }))}
                        style={styles.filterSelect}
                      >
                        <option value="">All Types</option>
                        <option value="General Inspection">General Inspection</option>
                        <option value="Follow-up">Follow-up Inspection</option>
                      </select>
                    </>
                  )}

                  {tab === 'history' && (
                    <>
                      <label style={styles.filterLabel}>Status</label>
                      <select
                        value={draft.status || ''}
                        onChange={e => setDraft(d => ({ ...d, status: e.target.value }))}
                        style={styles.filterSelect}
                      >
                        <option value="">All Statuses</option>
                        <option value="Completed">Completed</option>
                        <option value="Cancelled">Cancelled</option>
                      </select>
                    </>
                  )}

                  <label style={styles.filterLabel}>Date Range</label>
                  <div style={styles.dateRangeStack}>
                    <input type="date" value={draft.from || ''} onChange={e => setDraft(d => ({ ...d, from: e.target.value }))} style={styles.filterSelect} />
                    <span style={styles.dateRangeSep}>to</span>
                    <input type="date" value={draft.to || ''} onChange={e => setDraft(d => ({ ...d, to: e.target.value }))} style={styles.filterSelect} />
                  </div>

                  {(tab === 'scheduled' || tab === 'completed') && (
                    <>
                      <label style={styles.filterLabel}>Scheduled By</label>
                      <select
                        value={draft.scheduledBy || ''}
                        onChange={e => setDraft(d => ({ ...d, scheduledBy: e.target.value }))}
                        style={styles.filterSelect}
                      >
                        <option value="">All</option>
                        {scheduledByOptions.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </>
                  )}

                  <div style={styles.filterActions}>
                    <button type="button" onClick={resetFilter} style={styles.filterResetBtn}>Reset</button>
                    <button type="button" onClick={applyFilter} style={styles.filterApplyBtn}>Apply</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {loading && <p style={styles.stateText}>Loading...</p>}
      {error && <p style={{ ...styles.stateText, color: '#b91c1c' }}>{error}</p>}

      {!loading && !error && tab === 'calendar' && (
        <CalendarView
          inspections={inspections}
          viewDate={viewDate}
          setViewDate={setViewDate}
          onViewEvent={setViewInspection}
          isMobile={isMobile}
        />
      )}

      {!loading && !error && tab === 'scheduled' && (
        <InspectionTable
          list={filteredScheduled}
          columns={SCHEDULED_COLUMNS}
          actionLabel="View"
          onView={setViewInspection}
          isMobile={isMobile}
          emptyText={
            search || schedFarm || schedType || schedScheduledBy || schedFrom || schedTo
              ? 'No scheduled inspections match your search or filter.'
              : 'No scheduled inspections.'
          }
        />
      )}

      {!loading && !error && tab === 'completed' && (
        <InspectionTable
          list={filteredCompleted}
          columns={COMPLETED_COLUMNS}
          actionLabel="View"
          onView={setViewInspection}
          isMobile={isMobile}
          emptyText={
            search || complFarm || complType || complScheduledBy || complFrom || complTo
              ? 'No completed inspections match your search or filter.'
              : 'No completed inspections.'
          }
        />
      )}

      {!loading && !error && tab === 'history' && (
        <InspectionTable
          list={filteredHistory}
          columns={HISTORY_COLUMNS}
          actionLabel="View"
          onView={setViewInspection}
          isMobile={isMobile}
          emptyText={
            search || historyFarm || historyStatus || historyFrom || historyTo
              ? 'No inspection history matches your search or filter.'
              : 'No inspection history found.'
          }
        />
      )}

      {viewInspection && (() => {
        const c = STATUS_COLOR[viewInspection.status] || '#6b7280'
        const fields = [
          { label: 'Farm', value: viewInspection.farm_name },
          { label: 'Type', value: viewInspection.inspection_type },
          { label: 'Scheduled By', value: viewInspection.scheduled_by_name?.trim() || '—' },
          { label: 'Scheduled', value: formatDateTime(viewInspection.scheduled_at) },
          ...(viewInspection.completed_at ? [{ label: 'Completed', value: formatDateTime(viewInspection.completed_at) }] : []),
        ]
        const hasText = viewInspection.notes || viewInspection.findings
        return (
          <div style={v.overlay} onClick={() => setViewInspection(null)}>
            <div style={{ ...v.modal, ...(isMobile ? v.modalMobile : {}) }} onClick={e => e.stopPropagation()}>
              <div style={v.header}>
                <div style={v.headerTitleRow}>
                  <h3 style={v.title}>{viewInspection.inspection_number}</h3>
                  <span style={{ ...v.badge, color: c, backgroundColor: badgeBg(viewInspection.status) }}>{viewInspection.status}</span>
                </div>
                <span style={v.close} onClick={() => setViewInspection(null)}>×</span>
              </div>

              <span style={v.sectionLabel}>Inspection Information</span>
              <div style={hasText ? v.grid : v.gridLast}>
                {fields.map(f => (
                  <div key={f.label} style={v.fieldBox}>
                    <div style={v.fieldLabel}>{f.label}</div>
                    <div style={v.fieldValue}>{f.value || '—'}</div>
                  </div>
                ))}
              </div>

              {viewInspection.notes && (
                <>
                  <span style={v.sectionLabel}>Notes</span>
                  <div style={{ ...v.notesBox, marginBottom: '18px' }}>
                    <p style={v.notes}>{viewInspection.notes}</p>
                  </div>
                </>
              )}
              {viewInspection.findings && (
                <>
                  <span style={v.sectionLabel}>Findings</span>
                  <div style={v.notesBox}>
                    <p style={v.notes}>{viewInspection.findings}</p>
                  </div>
                </>
              )}

              <div style={v.actions}>
                <button onClick={() => setViewInspection(null)} style={v.closeBtn}>Close</button>
              </div>
            </div>
          </div>
        )
      })()}
    </AdminLayout>
  )
}

function SummaryCard({ label, value, sub, isMobile }) {
  if (isMobile) {
    return (
      <div style={styles.summaryCardPhone}>
        <div style={styles.summaryPhoneLabel}>{label}</div>
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

const STATUS_COLOR = { Scheduled: '#b45309', Completed: '#256b3d', Cancelled: '#6b7280' }

function badgeBg(status) {
  if (status === 'Completed') return '#eaf3ec'
  if (status === 'Scheduled') return '#fbf1e2'
  return '#eef1ea'
}

function StatusBadge({ status }) {
  const color = STATUS_COLOR[status] || '#6b7280'
  return (
    <span style={{ ...styles.badge, color, backgroundColor: badgeBg(status) }}>
      <span style={{ ...styles.badgeDot, backgroundColor: color }} />
      {status}
    </span>
  )
}

const scheduledByOrDash = (i) => i.scheduled_by_name?.trim() || '—'

const SCHEDULED_COLUMNS = [
  { header: 'Farm', render: i => <span style={styles.rowTitle}>{i.farm_name}</span> },
  { header: 'Inspection Date', render: i => formatDate(i.scheduled_at) },
  { header: 'Scheduled By', render: scheduledByOrDash },
  { header: 'Type', render: i => i.inspection_type },
  { header: 'Status', render: i => <StatusBadge status={i.status} /> },
]

const COMPLETED_COLUMNS = [
  { header: 'Farm', render: i => <span style={styles.rowTitle}>{i.farm_name}</span> },
  { header: 'Inspection Date', render: i => formatDate(i.scheduled_at) },
  { header: 'Scheduled By', render: scheduledByOrDash },
  { header: 'Type', render: i => i.inspection_type },
  { header: 'Date Completed', render: i => formatDate(i.completed_at) },
]

const HISTORY_COLUMNS = [
  { header: 'Farm', render: i => <span style={styles.rowTitle}>{i.farm_name}</span> },
  { header: 'Inspection Date', render: i => formatDate(i.scheduled_at) },
  { header: 'Scheduled By', render: scheduledByOrDash },
  { header: 'Type', render: i => i.inspection_type },
  { header: 'Status', render: i => <StatusBadge status={i.status} /> },
  { header: 'Date Completed', render: i => formatDate(i.completed_at) },
]

function InspectionTable({ list, columns, actionLabel, onView, isMobile, emptyText }) {
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  useEffect(() => { setCurrentPage(1) }, [list, pageSize])

  if (list.length === 0) return <div style={styles.tableEmpty}>{emptyText}</div>

  const totalItems = list.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const start = (currentPage - 1) * pageSize
  const paginated = list.slice(start, start + pageSize)
  const rangeStart = totalItems === 0 ? 0 : start + 1
  const rangeEnd = Math.min(currentPage * pageSize, totalItems)

  return (
    <div style={styles.tableCard}>
      {isMobile && <p style={styles.scrollHint}>Swipe left/right to see all columns →</p>}
      <div style={isMobile ? styles.tableScroll : undefined}>
        <table style={{ ...styles.table, ...(isMobile ? styles.tableMobile : {}) }}>
          <thead>
            <tr>
              {columns.map(c => <th key={c.header} style={styles.th}>{c.header}</th>)}
              <th style={{ ...styles.th, textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map(i => (
              <tr key={i.id}>
                {columns.map(c => <td key={c.header} style={styles.td}>{c.render(i)}</td>)}
                <td style={{ ...styles.td, textAlign: 'right' }}>
                  <span style={{ ...styles.actionBtn, ...styles.viewLink }} onClick={() => onView(i)}>{actionLabel}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
    <div className="no-print" style={{ ...paginationStyles.wrap, ...(isMobile ? paginationStyles.wrapMobile : {}) }}>
      <div style={paginationStyles.info}>
        {totalItems === 0 ? 'No results' : `Showing ${rangeStart}–${rangeEnd} of ${totalItems}`}
      </div>
      <div style={{ ...paginationStyles.controls, ...(isMobile ? paginationStyles.controlsMobile : {}) }}>
        <select value={pageSize} onChange={e => onPageSizeChange(Number(e.target.value))} style={paginationStyles.pageSizeSelect}>
          {PAGE_SIZE_OPTIONS.map(size => <option key={size} value={size}>{size} / page</option>)}
        </select>
        <SharedPagination currentPage={currentPage} totalPages={totalPages} onPageChange={onPageChange} isMobile={isMobile} />
      </div>
    </div>
  )
}

function CalendarView({ inspections, viewDate, setViewDate, onViewEvent, isMobile }) {
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const today = new Date()
  const [selectedDate, setSelectedDate] = useState(null)

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstWeekday = new Date(year, month, 1).getDay()

  const cells = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const getInspectionsForDay = (day) => {
    if (!day) return []
    return inspections.filter(i => {
      const d = new Date(i.scheduled_at)
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
    onViewEvent(insp)
  }

  const selectDay = (date) => setSelectedDate(date)

  const panelInspections = selectedDate
    ? inspections
        .filter(i => sameDay(new Date(i.scheduled_at), selectedDate))
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
                            >
                              <div style={styles.calendarEventType}>{t.label}</div>
                              <div style={{ ...styles.calendarEventFarm, color: t.text }}>{insp.farm_name}</div>
                              <div style={{ ...styles.calendarEventTime, color: t.text }}>
                                {new Date(insp.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
          <span style={styles.legendItem}><span style={{ ...styles.legendDot, backgroundColor: '#2c8047' }} /> General Inspection</span>
          <span style={styles.legendItem}><span style={{ ...styles.legendDot, backgroundColor: '#b45309' }} /> Follow-up Inspection</span>
        </div>
      </div>

      <div style={{ ...styles.sidePanel, ...(isMobile ? styles.sidePanelMobile : {}) }}>
        <div style={styles.sidePanelHead}>
          <div style={styles.sidePanelKicker}>Selected Date</div>
          <div style={styles.sidePanelDate}>
            {selectedDate ? formatDate(selectedDate) : 'Pick a date'}
          </div>
        </div>

        <div style={styles.scheduledLabel}>Scheduled Inspections</div>

        <div style={styles.sidePanelList}>
          {!selectedDate ? (
            <p style={styles.selectedEmpty}>Select a date on the calendar to see its inspections.</p>
          ) : panelInspections.length === 0 ? (
            <p style={styles.selectedEmpty}>No inspections scheduled</p>
          ) : (
            panelInspections.map(insp => (
              <div key={insp.id} style={styles.selectedItem}>
                <div style={styles.selectedItemFarm}>{insp.farm_name}</div>
                <div style={styles.selectedItemType}>{insp.inspection_type}</div>
                <div style={styles.selectedItemMeta}>Scheduled By: {insp.scheduled_by_name?.trim() || '—'}</div>
                <div style={styles.selectedItemMeta}>Status: {insp.status}</div>
                <span style={styles.selectedItemLink} onClick={() => onViewEvent(insp)}>View Inspection Details</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
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

  summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '22px' },
  summaryGridMobile: { gridTemplateColumns: 'repeat(3, 1fr)', gap: '11px' },
  summaryCard: { backgroundColor: '#234A35', border: '1px solid #1b3a29', borderRadius: '14px', padding: '20px 22px' },
  summaryValue: { fontSize: '30px', fontWeight: 800, lineHeight: 1, letterSpacing: '-0.02em', color: '#ffffff' },
  summaryLabel: { fontSize: '12px', fontWeight: 700, marginTop: '8px', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#eaf3ec' },
  summarySub: { fontSize: '11.5px', marginTop: '3px', color: '#a9c6b3' },

  summaryCardPhone: {
    position: 'relative', overflow: 'hidden', backgroundColor: '#234A35', border: '1px solid #1b3a29',
    borderRadius: '14px', padding: '16px 14px 18px', minHeight: '118px',
  },
  summaryPhoneLabel: { fontSize: '13px', fontWeight: 700, color: '#eaf3ec' },
  summaryPhoneValue: { fontSize: '26px', fontWeight: 800, lineHeight: 1, letterSpacing: '-0.02em', marginTop: '10px', color: '#ffffff' },
  summaryPhoneSub: { fontSize: '10px', fontWeight: 600, marginTop: '6px', color: '#a9c6b3' },

  tabsRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: '16px', borderBottom: '1px solid #e7e8e0', gap: '10px',
  },
  tabsRowMobile: { flexDirection: 'column', alignItems: 'stretch', gap: '12px' },
  tabs: { display: 'flex', gap: '4px', overflowX: 'auto' },
  tab: { padding: '10px 16px', fontSize: '14px', color: '#6b7770', cursor: 'pointer', borderBottom: '2px solid transparent', whiteSpace: 'nowrap' },
  tabActive: { color: '#2c8047', fontWeight: 700, borderBottom: '2px solid #2c8047' },

  toolbarRight: { display: 'flex', alignItems: 'center', gap: '10px', paddingBottom: '10px' },
  toolbarRightMobile: { paddingBottom: '2px' },

  searchWrap: { position: 'relative', width: '240px', maxWidth: '100%' },
  searchIcon: { position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' },
  searchInput: {
    width: '100%', padding: '8px 34px 8px 34px', borderRadius: '10px',
    border: '1px solid #dcdfd6', fontSize: '13px', boxSizing: 'border-box',
    backgroundColor: '#fff', color: '#16311d', fontFamily: SANS,
  },
  clearBtn: {
    position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
    width: '18px', height: '18px', borderRadius: '50%', border: 'none',
    backgroundColor: '#eceee7', color: '#6b7770', fontSize: '13px', lineHeight: 1,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: SANS, padding: 0,
  },

  filterAnchor: { position: 'relative', flexShrink: 0 },
  filterBtn: {
    display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 15px',
    borderRadius: '10px', border: '1px solid #dcdfd6', backgroundColor: '#fff',
    color: '#33413a', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap',
  },
  filterBtnActive: { borderColor: '#2c8047', color: '#2c8047' },
  filterCount: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minWidth: '18px', height: '18px', borderRadius: '999px', backgroundColor: '#2c8047',
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
    fontFamily: SANS, boxSizing: 'border-box',
  },
  filterActions: { display: 'flex', gap: '10px', marginTop: '20px' },
  filterResetBtn: {
    flex: 1, padding: '9px 0', borderRadius: '10px', border: '1px solid #dcdfd6',
    backgroundColor: '#fff', color: '#33413a', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer', fontFamily: SANS,
  },
  filterApplyBtn: {
    flex: 1, padding: '9px 0', borderRadius: '10px', border: 'none',
    backgroundColor: '#2c8047', color: '#fff', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', fontFamily: SANS,
  },
  dateRangeStack: { display: 'flex', flexDirection: 'column', gap: '6px' },
  dateRangeSep: { fontSize: '11.5px', color: '#8a968d', textAlign: 'center' },

  tableCard: { backgroundColor: '#fff', borderRadius: '14px', border: '1px solid #e7e8e0', overflow: 'hidden' },
  tableEmpty: { backgroundColor: '#fff', border: '1px solid #e7e8e0', borderRadius: '14px', padding: '32px', textAlign: 'center', color: '#9aa79d', fontSize: '14px' },
  scrollHint: { fontSize: '11px', color: '#9aa79d', margin: '12px 20px 0' },
  tableScroll: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  table: { width: '100%', borderCollapse: 'collapse' },
  tableMobile: { minWidth: '820px' },
  th: {
    textAlign: 'left', padding: '13px 20px', fontSize: '13px', fontWeight: 600, color: '#8a968d',
    borderBottom: '1px solid #eceee7',
    whiteSpace: 'nowrap', backgroundColor: '#fafbf8',
  },
  td: { padding: '13px 20px', fontSize: '12px', color: '#4b5a50', borderBottom: '1px solid #f2f3ed', verticalAlign: 'middle' },
  rowTitle: { fontSize: '14px', fontWeight: 700, color: '#16311d' },

  badge: {
    display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 11px',
    borderRadius: '999px', fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap',
  },
  badgeDot: { width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0 },
  actionBtn: {
    padding: '6px 13px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 600,
    cursor: 'pointer', border: '1px solid #e3e6dd', backgroundColor: '#fff', whiteSpace: 'nowrap',
  },
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
  calendarCellSelected: { backgroundColor: '#f4faf5', border: '1px solid #2c8047', boxShadow: '0 0 0 1px #2c8047 inset' },
  calendarDayNum: { fontSize: '12.5px', fontWeight: 700, color: '#374151', marginBottom: '5px' },
  calendarDayNumMobile: { fontSize: '11px', marginBottom: '2px', textAlign: 'center' },
  calendarDayNumToday: { color: '#1f5a34' },

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
  sidePanelList: { padding: '6px 12px 14px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' },

  scheduledLabel: {
    fontSize: '11px', fontWeight: 700, color: '#9aa79d', textTransform: 'uppercase',
    letterSpacing: '0.04em', padding: '10px 14px 4px',
  },
  selectedEmpty: { fontSize: '13px', color: '#9aa79d', padding: '8px 2px', lineHeight: 1.5 },
  selectedItem: { border: '1px solid #eceee7', borderRadius: '10px', padding: '12px' },
  selectedItemFarm: { fontSize: '14px', fontWeight: 700, color: '#16311d' },
  selectedItemType: { fontSize: '12.5px', color: '#6b7770', marginTop: '2px' },
  selectedItemMeta: { fontSize: '12px', color: '#8a968d', marginTop: '6px' },
  selectedItemLink: {
    display: 'inline-block', marginTop: '10px', fontSize: '12.5px', fontWeight: 700,
    color: '#2c8047', cursor: 'pointer',
  },

  legend: { display: 'flex', gap: '20px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #f2f3ed' },
  legendMobile: { gap: '12px', flexWrap: 'wrap' },
  legendItem: { display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12px', color: '#6b7770' },
  legendDot: { width: '9px', height: '9px', borderRadius: '50%' },
}

const paginationStyles = {
  wrap: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderTop: '1px solid #eceee7', flexWrap: 'wrap', gap: '10px' },
  wrapMobile: { flexDirection: 'column', alignItems: 'stretch' },
  info: { fontSize: '12px', color: '#8a968d', whiteSpace: 'nowrap' },
  controls: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
  controlsMobile: { justifyContent: 'space-between' },
  pageSizeSelect: { padding: '6px 10px', borderRadius: '8px', border: '1px solid #dcdfd6', fontSize: '12px', color: '#4b5a50', marginRight: '6px' },
  navBtn: { minWidth: '30px', height: '30px', padding: '0 6px', borderRadius: '8px', border: '1px solid #dcdfd6', backgroundColor: '#fff', color: '#4b5a50', fontSize: '13px', cursor: 'pointer' },
  navBtnDisabled: { opacity: 0.4, cursor: 'not-allowed' },
  pageBtn: { minWidth: '30px', height: '30px', padding: '0 6px', borderRadius: '8px', border: '1px solid #dcdfd6', backgroundColor: '#fff', color: '#4b5a50', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' },
  pageBtnActive: { backgroundColor: '#2c8047', borderColor: '#2c8047', color: '#fff' },
  ellipsis: { padding: '0 4px', color: '#9aa79d', fontSize: '13px' },
}
