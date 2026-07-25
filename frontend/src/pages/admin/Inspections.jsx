import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useMonthFilter, filterByMonth } from '../../hooks/useMonthFilter'

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const DAY_NAMES_SHORT = ['S','M','T','W','T','F','S']
const PAGE_SIZE_OPTIONS = [10, 25, 50]

// Calendar events keep the scannable convention: General → green, Follow-up → amber.
function inspectionTypeStyle(type) {
  const isFollowUp = type === 'Follow-up'
  return {
    label: isFollowUp ? 'Follow-up Inspection' : 'General Inspection',
    bg: isFollowUp ? '#b45309' : '#2c8047',
    text: '#ffffff',
  }
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export default function Inspections() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState('schedule')
  const { month: viewDate, setMonth: setViewDate, prevMonth, nextMonth, label: monthLabel } = useMonthFilter()
  const [modalDate, setModalDate] = useState(null)
  const [prefillFarm, setPrefillFarm] = useState(null)
  const [confirmCancel, setConfirmCancel] = useState(null)
  const [completeInspection, setCompleteInspection] = useState(null)
  const [viewInspection, setViewInspection] = useState(null)
  const isMobile = useIsMobile()

  const { data: inspectionsData, loading: loadingInspections, error: errorInspections, refetch: refetchInspections } = useCachedFetch('/admin/inspections')
  const { data: farmsData, loading: loadingFarms, error: errorFarms, refetch: refetchFarms } = useCachedFetch('/admin/farms')

  const inspections = inspectionsData || []
  const farms = farmsData || []
  const loading = loadingInspections || loadingFarms
  const error = errorInspections || errorFarms

  useEffect(() => {
    const farmId = searchParams.get('farmId')
    if (farmId && farms.length > 0) {
      const farm = farms.find(f => String(f.id) === farmId)
      if (farm) {
        setPrefillFarm(farm)
        setModalDate(new Date())
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

  const handleCancel = (inspection) => {
    setConfirmCancel(inspection)
  }

  const confirmCancelAction = async () => {
    await api.patch(`/admin/inspections/${confirmCancel.id}/cancel`)
    setConfirmCancel(null)
    refetchInspections()
  }

  const closeScheduleModal = () => {
    setModalDate(null)
    setPrefillFarm(null)
  }

  const scheduled = inspections.filter(i => i.status === 'Scheduled')
  const completed = inspections.filter(i => i.status === 'Completed')

  const statusColor = { Scheduled: '#b45309', Completed: '#256b3d', Cancelled: '#6b7280' }

  const monthInspections = filterByMonth(inspections, viewDate)
  const totalThisMonth = monthInspections.length
  const followUpThisMonth = monthInspections.filter(i => i.inspection_type === 'Follow-up').length
  const generalThisMonth = totalThisMonth - followUpThisMonth

  return (
    <AdminLayout>
      <div style={{ ...styles.headerRow, ...(isMobile ? styles.headerRowMobile : {}) }}>
        <div>
          <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>Inspections</h1>
          <p style={styles.subtitle}>Farm inspection scheduling & records</p>
        </div>
      </div>

      <div style={{ ...styles.summaryGrid, ...(isMobile ? styles.summaryGridMobile : {}) }}>
        <SummaryCard label="Total Inspections" value={totalThisMonth} sub={monthLabel} variant="green" isMobile={isMobile} />
        <SummaryCard label="General Inspections" value={generalThisMonth} sub={monthLabel} variant="orange" isMobile={isMobile} />
        <SummaryCard label="Follow-up Inspections" value={followUpThisMonth} sub={monthLabel} variant="yellow" isMobile={isMobile} />
      </div>

      <div style={styles.tabs}>
        {['schedule', 'scheduled', 'completed', 'history'].map(t => (
          <div
            key={t}
            style={{ ...styles.tab, ...(tab === t ? styles.tabActive : {}) }}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </div>
        ))}
      </div>

      {loading && <p style={styles.stateText}>Loading...</p>}
      {error && <p style={{ ...styles.stateText, color: '#b91c1c' }}>{error}</p>}

      {!loading && !error && tab === 'schedule' && (
        <CalendarView
          inspections={inspections}
          viewDate={viewDate}
          setViewDate={setViewDate}
          onAddSchedule={(date) => setModalDate(date)}
          onViewEvent={setViewInspection}
          isMobile={isMobile}
        />
      )}

      {!loading && !error && tab === 'scheduled' && (
        <InspectionList list={scheduled} statusColor={statusColor} onCancel={handleCancel} onComplete={setCompleteInspection} isMobile={isMobile} />
      )}

      {!loading && !error && tab === 'completed' && (
        <InspectionList list={completed} statusColor={statusColor} onView={setViewInspection} isMobile={isMobile} />
      )}

      {!loading && !error && tab === 'history' && (
        <InspectionList
          list={inspections.filter(i => i.status === 'Completed' || i.status === 'Cancelled')}
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
        />
      )}

      {completeInspection && (
        <CompleteModal
          inspection={completeInspection}
          onClose={() => setCompleteInspection(null)}
          onSuccess={() => { setCompleteInspection(null); refetchInspections() }}
          isMobile={isMobile}
        />
      )}

      {viewInspection && (
        <div style={modalStyles.overlay} onClick={() => setViewInspection(null)}>
          <div style={{ ...modalStyles.modal, ...(isMobile ? modalStyles.modalMobile : {}) }} onClick={e => e.stopPropagation()}>
            <div style={modalStyles.header}>
              <h3 style={modalStyles.title}>{viewInspection.inspection_number}</h3>
              <span style={modalStyles.close} onClick={() => setViewInspection(null)}>×</span>
            </div>

            <div style={detailStyles.row}>
              <span style={detailStyles.label}>Farm</span>
              <span style={detailStyles.value}>{viewInspection.farm_name}</span>
            </div>
            <div style={detailStyles.row}>
              <span style={detailStyles.label}>Type</span>
              <span style={detailStyles.value}>{viewInspection.inspection_type}</span>
            </div>
            <div style={detailStyles.row}>
              <span style={detailStyles.label}>Status</span>
              <span style={detailStyles.value}>{viewInspection.status}</span>
            </div>
            <div style={detailStyles.row}>
              <span style={detailStyles.label}>Scheduled</span>
              <span style={detailStyles.value}>
                {new Date(viewInspection.scheduled_at).toLocaleString()}
              </span>
            </div>
            {viewInspection.completed_at && (
              <div style={detailStyles.row}>
                <span style={detailStyles.label}>Completed</span>
                <span style={detailStyles.value}>
                  {new Date(viewInspection.completed_at).toLocaleString()}
                </span>
              </div>
            )}
            {viewInspection.notes && (
              <div style={detailStyles.block}>
                <span style={detailStyles.label}>Notes</span>
                <p style={detailStyles.text}>{viewInspection.notes}</p>
              </div>
            )}
            {viewInspection.findings && (
              <div style={detailStyles.block}>
                <span style={detailStyles.label}>Findings</span>
                <p style={detailStyles.text}>{viewInspection.findings}</p>
              </div>
            )}

            <div style={modalStyles.actions}>
              <button onClick={() => setViewInspection(null)} style={modalStyles.cancelBtn}>Close</button>
            </div>
          </div>
        </div>
      )}

      {confirmCancel && (
        <div style={modalStyles.overlay} onClick={() => setConfirmCancel(null)}>
          <div style={{ ...confirmStyles.modal, ...(isMobile ? modalStyles.modalMobile : {}) }} onClick={e => e.stopPropagation()}>
            <h3 style={confirmStyles.title}>Cancel Inspection</h3>
            <p style={confirmStyles.message}>
              Cancel {confirmCancel.inspection_number} for {confirmCancel.farm_name}?
            </p>
            <div style={{ ...modalStyles.actions, ...(isMobile ? modalStyles.actionsMobile : {}) }}>
              <button
                onClick={() => setConfirmCancel(null)}
                style={{ ...modalStyles.cancelBtn, ...(isMobile ? modalStyles.btnFull : {}) }}
              >
                Keep it
              </button>
              <button
                onClick={confirmCancelAction}
                style={{ ...modalStyles.submitBtn, ...(isMobile ? modalStyles.btnFull : {}), backgroundColor: '#b91c1c' }}
              >
                Cancel Inspection
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

function SummaryCard({ label, value, sub, variant, isMobile }) {
  const themes = {
    green:  { bg: 'linear-gradient(150deg, #1f5a34 0%, #14301c 100%)', fg: '#ffffff', sub: 'rgba(255,255,255,0.65)' },
    orange: { bg: 'linear-gradient(150deg, #ea7a1c 0%, #c2410c 100%)', fg: '#ffffff', sub: 'rgba(255,255,255,0.8)' },
    yellow: { bg: 'linear-gradient(150deg, #f2c744 0%, #d4a017 100%)', fg: '#14301c', sub: 'rgba(20,48,28,0.65)' },
  }
  const t = themes[variant] || themes.green
  const shortLabel = variant === 'green' ? 'Total' : variant === 'yellow' ? 'Follow-up' : 'General'

  if (isMobile) {
    return (
      <div style={{ ...styles.summaryCardPhone, background: t.bg, color: t.fg }}>
        <div style={styles.summaryPhoneLabel}>{shortLabel}</div>
        <div style={styles.summaryPhoneValue}>{value}</div>
        <div style={{ ...styles.summaryPhoneSub, color: t.sub }}>{sub}</div>
      </div>
    )
  }

  return (
    <div style={{ ...styles.summaryCard, background: t.bg, color: t.fg }}>
      <div style={styles.summaryValue}>{value}</div>
      <div style={styles.summaryLabel}>{label}</div>
      <div style={{ ...styles.summarySub, color: t.sub }}>{sub}</div>
    </div>
  )
}

// Soft tinted background for each status badge (matches the Farms page convention).
function badgeBg(status) {
  if (status === 'Completed') return '#eaf3ec'
  if (status === 'Scheduled') return '#fbf1e2'
  return '#eef1ea'
}

function InspectionList({ list, statusColor, onCancel, onComplete, onView, isMobile }) {
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  useEffect(() => { setCurrentPage(1) }, [list, pageSize])

  if (list.length === 0) return <div style={styles.tableEmpty}>No inspections here yet.</div>

  const totalItems = list.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const start = (currentPage - 1) * pageSize
  const paginated = list.slice(start, start + pageSize)
  const rangeStart = totalItems === 0 ? 0 : start + 1
  const rangeEnd = Math.min(currentPage * pageSize, totalItems)

  const rowActions = (i) => (
    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
      {onView && (
        <span style={{ ...styles.actionBtn, ...styles.viewLink }} onClick={() => onView(i)}>View</span>
      )}
      {i.status === 'Scheduled' && onComplete && (
        <span style={{ ...styles.actionBtn, ...styles.completeLink }} onClick={() => onComplete(i)}>Complete</span>
      )}
      {i.status === 'Scheduled' && onCancel && (
        <span style={{ ...styles.actionBtn, ...styles.cancelLink }} onClick={() => onCancel(i)}>Cancel</span>
      )}
    </div>
  )

  return (
    <div style={styles.tableCard}>
      {isMobile && <p style={styles.scrollHint}>Swipe left/right to see all columns →</p>}
      <div style={isMobile ? styles.tableScroll : undefined}>
        <table style={{ ...styles.table, ...(isMobile ? styles.tableMobile : {}) }}>
          <thead>
            <tr>
              <th style={styles.th}>Inspection / Farm</th>
              <th style={styles.th}>Date</th>
              <th style={styles.th}>Time</th>
              <th style={styles.th}>Type</th>
              <th style={styles.th}>Status</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map(i => {
              const barColor = statusColor[i.status] || '#6b7280'
              return (
                <tr key={i.id}>
                  <td style={styles.td}>
                    <div style={styles.rowTitle}>{i.inspection_number} — {i.farm_name}</div>
                    {i.findings && <div style={styles.rowSub}>{i.findings}</div>}
                  </td>
                  <td style={styles.td}>{new Date(i.scheduled_at).toLocaleDateString()}</td>
                  <td style={styles.td}>{new Date(i.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                  <td style={styles.td}>{i.inspection_type}</td>
                  <td style={styles.td}>
                    <span style={{ ...styles.badge, color: barColor, backgroundColor: badgeBg(i.status) }}>
                      <span style={{ ...styles.badgeDot, backgroundColor: barColor }} />
                      {i.status}
                    </span>
                  </td>
                  <td style={styles.td}>{rowActions(i)}</td>
                </tr>
              )
            })}
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
      <div style={paginationStyles.info}>
        {totalItems === 0 ? 'No results' : `Showing ${rangeStart}–${rangeEnd} of ${totalItems}`}
      </div>
      <div style={{ ...paginationStyles.controls, ...(isMobile ? paginationStyles.controlsMobile : {}) }}>
        <select value={pageSize} onChange={e => onPageSizeChange(Number(e.target.value))} style={paginationStyles.pageSizeSelect}>
          {PAGE_SIZE_OPTIONS.map(size => <option key={size} value={size}>{size} / page</option>)}
        </select>
        <button style={{ ...paginationStyles.navBtn, ...(currentPage === 1 ? paginationStyles.navBtnDisabled : {}) }} onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1} aria-label="Previous page">‹</button>
        {pageNumbers[0] > 1 && <span style={paginationStyles.ellipsis}>…</span>}
        {pageNumbers.map(p => (
          <button key={p} onClick={() => onPageChange(p)} style={{ ...paginationStyles.pageBtn, ...(p === currentPage ? paginationStyles.pageBtnActive : {}) }}>{p}</button>
        ))}
        {pageNumbers[pageNumbers.length - 1] < totalPages && <span style={paginationStyles.ellipsis}>…</span>}
        <button style={{ ...paginationStyles.navBtn, ...(currentPage === totalPages ? paginationStyles.navBtnDisabled : {}) }} onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages} aria-label="Next page">›</button>
      </div>
    </div>
  )
}

function CalendarView({ inspections, viewDate, setViewDate, onAddSchedule, onViewEvent, isMobile }) {
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const today = new Date()
  const [selectedDate, setSelectedDate] = useState(new Date())

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
      {/* -------------------------------------------------- Calendar */}
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
                  ...(isToday(day) ? styles.calendarCellToday : {}),
                  ...(selected ? styles.calendarCellSelected : {}),
                }}
                onClick={() => day && selectDay(dateForDay)}
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

      {/* --------------------------------------------- Side detail panel */}
      <div style={{ ...styles.sidePanel, ...(isMobile ? styles.sidePanelMobile : {}) }}>
        <div style={styles.sidePanelHead}>
          <div style={styles.sidePanelKicker}>Selected date</div>
          <div style={styles.sidePanelDate}>
            {selectedDate
              ? selectedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
              : 'Pick a date'}
          </div>
        </div>

        {selectedDate && (
          <div style={styles.sidePanelBtnWrap}>
            <button style={styles.addInspectionBtn} onClick={() => onAddSchedule(selectedDate)}>
              + Add Inspection
            </button>
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
                <div key={insp.id} style={styles.selectedItem} onClick={() => onViewEvent(insp)}>
                  <span style={{ ...styles.selectedItemType, backgroundColor: t.bg, color: t.text }}>{t.label}</span>
                  <div style={styles.selectedItemFarm}>{insp.farm_name}</div>
                  <div style={styles.selectedItemTime}>
                    {new Date(insp.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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

function ScheduleModal({ date, farms, prefillFarm, onClose, onSuccess, isMobile }) {
  const [farmId, setFarmId] = useState(prefillFarm?.id || '')
  const [farmSearch, setFarmSearch] = useState(prefillFarm ? `${prefillFarm.farm_name} — ${prefillFarm.owner_name}` : '')
  const [showFarmList, setShowFarmList] = useState(false)
  const [time, setTime] = useState('09:00')
  const [inspectionType, setInspectionType] = useState(prefillFarm ? 'Follow-up' : 'General Inspection')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const dateLabel = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  const filteredFarms = farms.filter(f => {
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
            Pre-selected from Critical Alert: {prefillFarm.farm_name}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {error && <div style={modalStyles.errorBox}>{error}</div>}

          <label style={modalStyles.label}>Farm *</label>
          <div style={{ position: 'relative' }}>
            <input
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
              <div style={modalStyles.dropdownList}>
                {filteredFarms.map(f => (
                  <div
                    key={f.id}
                    style={modalStyles.dropdownItem}
                    onClick={() => {
                      setFarmId(f.id)
                      setFarmSearch(`${f.farm_name} — ${f.owner_name}`)
                      setShowFarmList(false)
                    }}
                  >
                    {f.farm_name} — {f.owner_name}
                  </div>
                ))}
                {filteredFarms.length === 0 && (
                  <div style={modalStyles.dropdownEmpty}>No farms match your search.</div>
                )}
              </div>
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
              disabled={loading}
              style={{ ...modalStyles.submitBtn, ...(isMobile ? modalStyles.btnFull : {}) }}
            >
              {loading ? 'Scheduling...' : 'Schedule Inspection'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CompleteModal({ inspection, onClose, onSuccess, isMobile }) {
  const [findings, setFindings] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!findings.trim()) {
      setError('Please enter your findings for this inspection.')
      return
    }

    setLoading(true)
    try {
      await api.patch(`/admin/inspections/${inspection.id}/complete`, { findings })
      onSuccess()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to complete inspection.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={{ ...modalStyles.modal, ...(isMobile ? modalStyles.modalMobile : {}) }} onClick={e => e.stopPropagation()}>
        <div style={modalStyles.header}>
          <h3 style={modalStyles.title}>Complete Inspection</h3>
          <span style={modalStyles.close} onClick={onClose}>×</span>
        </div>
        <p style={modalStyles.dateLabel}>{inspection.inspection_number} — {inspection.farm_name}</p>

        <form onSubmit={handleSubmit}>
          {error && <div style={modalStyles.errorBox}>{error}</div>}

          <label style={modalStyles.label}>Findings *</label>
          <textarea
            value={findings}
            onChange={e => setFindings(e.target.value)}
            style={{ ...modalStyles.input, minHeight: '100px', resize: 'vertical' }}
            placeholder="e.g. All systems normal. No violations observed."
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
              disabled={loading}
              style={{ ...modalStyles.submitBtn, ...(isMobile ? modalStyles.btnFull : {}) }}
            >
              {loading ? 'Saving...' : 'Mark as Completed'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const SANS = "'Public Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

const styles = {
  stateText: { fontFamily: SANS, fontSize: '14px', color: '#4b5a50' },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' },
  headerRowMobile: { flexDirection: 'column', gap: '12px' },
  title: { fontSize: '24px', fontWeight: 800, letterSpacing: '-0.015em', color: '#16311d', margin: 0 },
  titleMobile: { fontSize: '20px' },
  subtitle: { fontSize: '13.5px', color: '#6b7770', marginTop: '5px' },

  summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '22px' },
  summaryGridMobile: { gridTemplateColumns: 'repeat(3, 1fr)', gap: '11px' },
  summaryCard: { borderRadius: '14px', padding: '20px 22px' },
  summaryValue: { fontSize: '30px', fontWeight: 800, lineHeight: 1, letterSpacing: '-0.02em' },
  summaryLabel: { fontSize: '12px', fontWeight: 700, marginTop: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' },
  summarySub: { fontSize: '11.5px', marginTop: '3px' },

  summaryCardPhone: {
    position: 'relative', overflow: 'hidden', borderRadius: '16px',
    padding: '16px 14px 18px', minHeight: '118px',
  },
  summaryPhoneLabel: { fontSize: '13px', fontWeight: 700 },
  summaryPhoneValue: { fontSize: '26px', fontWeight: 800, lineHeight: 1, letterSpacing: '-0.02em', marginTop: '10px' },
  summaryPhoneSub: { fontSize: '10px', fontWeight: 600, marginTop: '6px' },

  tabs: { display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: '1px solid #e7e8e0', overflowX: 'auto' },
  tab: { padding: '10px 16px', fontSize: '14px', color: '#6b7770', cursor: 'pointer', borderBottom: '2px solid transparent', whiteSpace: 'nowrap' },
  tabActive: { color: '#2c8047', fontWeight: 700, borderBottom: '2px solid #2c8047' },

  tableCard: { backgroundColor: '#fff', borderRadius: '14px', border: '1px solid #e7e8e0', overflow: 'hidden' },
  tableEmpty: { backgroundColor: '#fff', border: '1px solid #e7e8e0', borderRadius: '14px', padding: '32px', textAlign: 'center', color: '#9aa79d', fontSize: '14px' },
  scrollHint: { fontSize: '11px', color: '#9aa79d', margin: '12px 20px 0' },
  tableScroll: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  table: { width: '100%', borderCollapse: 'collapse' },
  tableMobile: { minWidth: '820px' },
  th: {
    textAlign: 'left', padding: '13px 20px', fontSize: '11px', fontWeight: 700, color: '#8a968d',
    borderBottom: '1px solid #eceee7', textTransform: 'uppercase', letterSpacing: '0.05em',
    whiteSpace: 'nowrap', backgroundColor: '#fafbf8',
  },
  td: { padding: '13px 20px', fontSize: '13px', color: '#4b5a50', borderBottom: '1px solid #f2f3ed', verticalAlign: 'middle' },
  rowTitle: { fontSize: '14px', fontWeight: 700, color: '#16311d' },
  rowSub: { fontSize: '12px', color: '#8a968d', marginTop: '3px', maxWidth: '420px' },

  badge: {
    display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 11px',
    borderRadius: '999px', fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap',
  },
  badgeDot: { width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0 },
  actionBtn: {
    padding: '6px 13px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 600,
    cursor: 'pointer', border: '1px solid #e3e6dd', backgroundColor: '#fff', whiteSpace: 'nowrap',
  },
  completeLink: { color: '#2c8047' },
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
  sidePanelBtnWrap: { padding: '14px 14px 4px' },
  sidePanelList: { padding: '6px 12px 14px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' },

  addInspectionBtn: {
    width: '100%', boxSizing: 'border-box', padding: '11px', borderRadius: '10px', border: 'none',
    backgroundColor: '#2c8047', color: '#fff', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer',
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
  label: { display: 'block', fontSize: '13px', fontWeight: 600, color: '#33413a', marginBottom: '6px', marginTop: '12px' },
  input: { width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #dcdfd6', fontSize: '14px', boxSizing: 'border-box', fontFamily: 'inherit' },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  rowMobile: { gridTemplateColumns: '1fr' },
  errorBox: { backgroundColor: '#fbeaea', border: '1px solid #f0c9c9', color: '#b91c1c', padding: '10px 14px', borderRadius: '10px', fontSize: '13px', marginBottom: '14px' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' },
  actionsMobile: { flexDirection: 'column-reverse' },
  btnFull: { width: '100%', boxSizing: 'border-box' },
  cancelBtn: { padding: '10px 18px', borderRadius: '10px', border: '1px solid #dcdfd6', backgroundColor: '#fff', fontSize: '14px', fontWeight: 600, color: '#33413a', cursor: 'pointer' },
  submitBtn: { padding: '10px 18px', borderRadius: '10px', border: 'none', backgroundColor: '#2c8047', color: '#fff', fontSize: '14px', fontWeight: 700, cursor: 'pointer' },
  dropdownList: {
    position: 'absolute', top: '100%', left: 0, right: 0,
    backgroundColor: '#fff', border: '1px solid #dcdfd6', borderRadius: '10px',
    marginTop: '4px', maxHeight: '180px', overflowY: 'auto', zIndex: 10,
    boxShadow: '0 4px 12px rgba(20,48,28,0.12)',
  },
  dropdownItem: { padding: '10px 14px', fontSize: '14px', cursor: 'pointer', color: '#33413a' },
  dropdownEmpty: { padding: '10px 14px', fontSize: '13px', color: '#9aa79d' },
}

const confirmStyles = {
  modal: { backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '400px', maxWidth: '90%' },
  title: { fontSize: '17px', fontWeight: 800, color: '#16311d', marginTop: 0, marginBottom: '10px' },
  message: { fontSize: '14px', color: '#6b7770', lineHeight: '1.5', marginBottom: '4px' },
}

const detailStyles = {
  row: { display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f2f3ed' },
  label: { fontSize: '13px', color: '#6b7770', fontWeight: 500 },
  value: { fontSize: '13px', color: '#16311d', fontWeight: 600 },
  block: { marginTop: '14px' },
  text: { fontSize: '13px', color: '#4b5a50', lineHeight: '1.5', marginTop: '4px' },
}