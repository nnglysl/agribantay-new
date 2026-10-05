import { useEffect, useMemo, useRef, useState } from 'react'
import { Line, Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip,
} from 'chart.js'
import AdminLayout from '../../components/AdminLayout'
import GeneratedReportsFilesTab from '../../components/GeneratedReportsFilesTab'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import {
  C, styles, ReportStyles, PageHeader, Tabs, StatCard, Panel, DataTable, ChartFrame,
  IconFilter, chartOptions, lineDataset, fmtDate, makeInRange, rangeLabelOf, scopeLabelOf, monthlyBuckets,
  monthlyBucketsInRange, dailyBuckets, dayOf, MONTH_NAMES, serviceTypeBadgeStyle, serviceTypeLabel, requestStatusBadgeStyle,
} from '../../components/ReportsLayout'
import {
  ODOR_CONTROL, FLY_CONTROL, FARM_BIOSECURITY, BLOOD_TEST, VACCINE_LEGACY,
} from '../../constants/serviceTypes'
import ClearDateButton, { DateRangeHeader } from '../../components/ClearDateButton'
import { DISPLAY_TIME_ZONE } from '../../utils/formatDate'
import { SkeletonStatCards, SkeletonBlock } from '../../components/Loading'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip)

// Oversight must not see less than the people it oversees. Alerts and
// Maintenance were on the Staff page only, so the Super Admin could read a
// Critical Alerts count with no way to open the incidents behind it, and had
// no view at all of which farms were behind on clean-out.
const TABS = ['Overview', 'Inspections', 'Alerts', 'Maintenance', 'Service Requests', 'Files']
const MAINTENANCE_VIEWS = ['Overdue and non-compliant farms', 'Completed clean-out log']

// Per-service colours for the stacked "Services completed per month" chart.
// The order is fixed and the stack is drawn in it: these four hues were
// validated as an ADJACENT pairlist -- the pairing a stacked bar actually
// produces -- and clear colour-blind separation, the normal-vision floor and
// 3:1 contrast against the white panel. Re-run that check before reordering
// them or adding a fifth; an arbitrary fourth hue fails more often than not.
const SERVICE_SERIES = [
  { type: ODOR_CONTROL, label: 'Odour control', color: '#2a78d6' },
  { type: FLY_CONTROL, label: 'Fly control', color: '#d9541f' },
  { type: FARM_BIOSECURITY, label: 'Farm biosecurity', color: '#1f8f63' },
  { type: BLOOD_TEST, label: 'Blood test', color: '#c98500' },
]

// Horizontal variant of the shared theme, for the by-type breakdown.
//
// It reads across instead of up for two reasons. The category names are long
// -- "Farm biosecurity", "Odour control" -- and on a vertical axis they have
// to be rotated or truncated, while a horizontal bar gives each one a full
// line of ordinary left-to-right text. And the bars are now ONE PER SERVICE
// rather than one per month, so there is no time order to preserve: they can
// be sorted longest-first, which is what makes the ranking readable at a
// glance.
//
// No legend: every bar is named on its own axis, so a legend would repeat what
// the chart already says. The colours stay because they tie each service to
// the same hue used elsewhere on the page, not because they carry identity
// here.
const serviceChartOptions = {
  ...chartOptions,
  indexAxis: 'y',
  // One bar per category, so pointing at a bar should read that bar, not the
  // whole row. 'index' mode is for the stacked/multi-series case this replaced.
  interaction: { mode: 'nearest', intersect: true },
  plugins: {
    ...chartOptions.plugins,
    tooltip: {
      ...chartOptions.plugins.tooltip,
      displayColors: true,
    },
  },
  scales: {
    // Counts are whole services, so precision 0 keeps the gridlines on whole
    // numbers -- a line at 2.5 would invite reading half a service off the axis.
    //
    // suggestedMax holds the axis open to 5 even when nothing comes close. Left
    // to fit the data, a month with a single service of each type gives a max of
    // 1, and every bar runs the full width of the panel: four ones drawn exactly
    // as four tens would be. The floor keeps a small number looking small. It is
    // only a SUGGESTION -- the moment the real count passes 5 the axis grows past
    // it, so this can never clip a bar.
    x: {
      ...chartOptions.scales.y,
      suggestedMax: 5,
    },
    y: { ...chartOptions.scales.x, grid: { display: false, drawBorder: false } },
  },
}

export default function SuperAdminReports() {
  const [tab, setTab] = useState('Overview')
  const now = new Date()

  // From/To date-range filter — drives the record-listing tabs (Overview,
  // Inspections, Service Requests).
  const [draftFrom, setDraftFrom] = useState('')
  const [draftTo, setDraftTo] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  // Same reasoning as the Admin Reports page: the stat cards are counted on
  // the server, so the range has to reach it. Counting the returned detail
  // lists here instead would silently under-report, because they are capped
  // at 300 rows. No range = all-time, exactly as before.
  const reportParams = useMemo(() => {
    const p = {}
    if (fromDate) p.from = fromDate
    if (toDate) p.to = toDate
    return p
  }, [fromDate, toDate])

  const { data: adminData, loading: adminLoading, error: adminError, refetch: refetchAdmin } = useCachedFetch('/admin/reports', reportParams)
  const { data: vetData, loading: vetLoading, error: vetError, refetch: refetchVet } = useCachedFetch('/vet/reports')

  // Tied to actual data refreshes only (initial load + each 30-minute
  // auto-refetch below) — never recomputed on every render, so it doesn't
  // silently creep forward just because the user opened a filter popover
  // or switched tabs. Computed during render (not in an effect) when either
  // source changes reference, which only happens right after a fetch resolves.
  const [prevAdminData, setPrevAdminData] = useState(adminData)
  const [prevVetData, setPrevVetData] = useState(vetData)
  const [generatedAt, setGeneratedAt] = useState('')
  if (adminData !== prevAdminData || vetData !== prevVetData) {
    setPrevAdminData(adminData)
    setPrevVetData(vetData)
    if (adminData && vetData) setGeneratedAt(new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short', timeZone: DISPLAY_TIME_ZONE }))
  }


  // Separate Month + Year filter — used only by the Files tab, which picks
  // ONE archived monthly report rather than filtering a list of records.
  const [draftFilesMonth, setDraftFilesMonth] = useState('')
  const [draftFilesYear, setDraftFilesYear] = useState('')
  const [filesMonth, setFilesMonth] = useState('')
  const [filesYear, setFilesYear] = useState('')

  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef(null)

  const reportYears = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)

  const inRange = makeInRange(fromDate, toDate)
  const rangeLabel = rangeLabelOf(fromDate, toDate)

  // Overview charts: completed records only (as before).
  const allInspections = adminData?.completed_inspections ?? []
  const allVetServices = vetData?.completed_services ?? []
  // Odour and fly control — handled by LGU staff, and half of what the
  // municipality actually does. The Overview chart counted only the vet
  // side, so a Super Admin "overview" showed two of the four service types.
  const allAdminServices = adminData?.completed_services ?? []

  const inspections = useMemo(() => allInspections.filter(r => inRange(r.completed_at_raw)), [allInspections, fromDate, toDate])
  const vetServices = useMemo(() => allVetServices.filter(r => inRange(r.completed_at_raw)), [allVetServices, fromDate, toDate])
  const adminServices = useMemo(() => allAdminServices.filter(r => inRange(r.completed_at_raw)), [allAdminServices, fromDate, toDate])

  // Bucketed from one combined list rather than by adding two separate
  // bucket arrays: computed apart, each side derives its own month labels
  // and an empty side would produce a shorter array that no longer lines up.
  const allServicesCombined = useMemo(() => [...allAdminServices, ...allVetServices], [allAdminServices, allVetServices])
  const servicesCombined = useMemo(() => [...adminServices, ...vetServices], [adminServices, vetServices])

  // Alerts and clean-outs come from the same /admin/reports payload this page
  // already fetches — the records were on hand all along, only unrendered.
  const allAlerts = adminData?.alert_records ?? []
  const overdueFarms = [...(adminData?.maintenance_overdue_list ?? []), ...(adminData?.maintenance_non_compliant_list ?? [])]
  const allCleanouts = adminData?.maintenance_completed_list ?? []

  const alerts = useMemo(() => allAlerts.filter(r => inRange(r.triggered_at_raw)), [allAlerts, fromDate, toDate])
  const cleanouts = useMemo(() => allCleanouts.filter(r => inRange(r.performed_at_raw)), [allCleanouts, fromDate, toDate])

  // Inspections / Service Requests tabs: Completed AND Scheduled records.
  // `date_raw` is the completion date for Completed rows and the scheduled
  // date for Scheduled rows, so the From/To filter applies to both alike.
  const allInspectionRecords = adminData?.inspection_records ?? []
  const allServiceRecords = useMemo(() => [
    ...(adminData?.service_records ?? []).map(s => ({ ...s, handled_by: 'LGU Admin' })),
    ...(vetData?.service_records ?? []).map(v => ({ ...v, handled_by: v.vet_name || '—' })),
  ].sort((a, b) => (b.date_raw || '').localeCompare(a.date_raw || '')), [adminData, vetData])

  const inspectionRecords = useMemo(() => allInspectionRecords.filter(r => inRange(r.date_raw)), [allInspectionRecords, fromDate, toDate])
  const serviceRecords = useMemo(() => allServiceRecords.filter(r => inRange(r.date_raw)), [allServiceRecords, fromDate, toDate])

  // Summary-card selection per tab: 'all' | 'Completed' | 'Scheduled'.
  // Cards count the date-filtered records; the table shows the selected
  // subset of those same records. Clicking Total (or the active card again)
  // returns to all filtered records.
  const [statusView, setStatusView] = useState({ Inspections: 'all', 'Service Requests': 'all' })
  const [maintView, setMaintView] = useState(MAINTENANCE_VIEWS[0])
  const selectStatusView = (t, value) => setStatusView(v => ({ ...v, [t]: v[t] === value ? 'all' : value }))
  const countBy = (rows, status) => rows.filter(r => r.status === status).length
  const visibleInspectionRecords = statusView.Inspections === 'all' ? inspectionRecords : inspectionRecords.filter(r => r.status === statusView.Inspections)
  const visibleServiceRecords = statusView['Service Requests'] === 'all' ? serviceRecords : serviceRecords.filter(r => r.status === statusView['Service Requests'])

  const isRangeFiltered = Boolean(fromDate || toDate)

  const inspTrend = useMemo(() => (
    isRangeFiltered
      ? monthlyBucketsInRange(inspections, 'completed_at_raw')
      : monthlyBuckets(allInspections, 'completed_at_raw', null, null)
  ), [inspections, allInspections, isRangeFiltered])


  const serviceTrend = useMemo(() => (
    isRangeFiltered
      ? monthlyBucketsInRange(servicesCombined, 'completed_at_raw')
      : monthlyBuckets(allServicesCombined, 'completed_at_raw', null, null)
  ), [servicesCombined, allServicesCombined, isRangeFiltered])

  // Per-type counts indexed against serviceTrend's own month keys rather than
  // bucketed one type at a time: bucketed separately, a type with no rows in a
  // month yields a shorter array that stops lining up with the labels -- the
  // same trap the combined list above is written to avoid.
  const serviceTrendByType = useMemo(() => {
    const rows = isRangeFiltered ? servicesCombined : allServicesCombined
    const slotOf = new Map(serviceTrend.map((m, i) => [m.key, i]))
    const series = SERVICE_SERIES.map(s => ({ ...s, data: serviceTrend.map(() => 0) }))
    rows.forEach(r => {
      const day = dayOf(r.completed_at_raw)
      if (!day) return
      const d = new Date(`${day}T09:00:00`)
      const slot = slotOf.get(`${d.getFullYear()}-${d.getMonth()}`)
      if (slot === undefined) return
      // "Vaccine Request" was retired in favour of Farm Biosecurity, so its old
      // rows count toward the service that replaced it instead of vanishing
      // from a chart whose single bar still has to equal the month's total.
      const type = r.service_type === VACCINE_LEGACY ? FARM_BIOSECURITY : r.service_type
      const hit = series.find(x => x.type === type)
      if (hit) hit.data[slot] += 1
    })
    return series
  }, [serviceTrend, servicesCombined, allServicesCombined, isRangeFiltered])

  // Totals per service for the horizontal bars, longest first.
  //
  // Summed from serviceTrendByType rather than counted again from the rows, so
  // the two can never disagree about what a month held -- and the legacy
  // "Vaccine Request" folding is applied once, where it already was.
  //
  // Ties keep SERVICE_SERIES order so the chart does not reshuffle itself
  // between renders. The colour travels with the service, never with the
  // position, so a service that climbs the ranking keeps its own hue.
  const serviceTotals = useMemo(() => (
    serviceTrendByType
      .map((s, i) => ({ ...s, total: s.data.reduce((a, b) => a + b, 0), order: i }))
      .sort((a, b) => b.total - a.total || a.order - b.order)
  ), [serviceTrendByType])

  // By day while a range is set, by month otherwise — the same rule the
  // Staff page uses, so the two charts are read the same way.
  const alertTrend = useMemo(() => (
    isRangeFiltered
      ? dailyBuckets(alerts, 'triggered_at_raw')
      : monthlyBucketsInRange(allAlerts, 'triggered_at_raw')
  ), [alerts, allAlerts, isRangeFiltered])

  // Single centralized refresh mechanism for the whole Reports page: fetch the
  // latest data (both sources) as soon as the page opens (never wait for the
  // interval), then re-fetch every 30 minutes. Filter changes never trigger a
  // fetch — they just re-filter the already-loaded dataset client-side.
  useEffect(() => {
    refetchAdmin()
    refetchVet()
    const interval = setInterval(() => {
      refetchAdmin()
      refetchVet()
    }, 30 * 60 * 1000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!filterOpen) return
    const onClickOutside = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [filterOpen])

  const openFilter = () => {
    setDraftFrom(fromDate)
    setDraftTo(toDate)
    setDraftFilesMonth(filesMonth)
    setDraftFilesYear(filesYear)
    setFilterOpen(true)
  }

  // One-click Clear Date: clears draft + applied dates immediately (the
  // Files tab's month/year filter is separate and untouched).
  const clearDates = () => {
    setDraftFrom(''); setDraftTo('')
    setFromDate(''); setToDate('')
  }
  const hasDate = !!(draftFrom || draftTo || fromDate || toDate)

  const applyFilter = () => {
    if (tab === 'Files') {
      setFilesMonth(draftFilesMonth)
      setFilesYear(draftFilesYear)
    } else {
      setFromDate(draftFrom)
      setToDate(draftTo)
    }
    setFilterOpen(false)
  }

  const clearFilter = () => {
    if (tab === 'Files') {
      setFilesMonth('')
      setFilesYear('')
      setDraftFilesMonth('')
      setDraftFilesYear('')
    } else {
      setFromDate('')
      setToDate('')
      setDraftFrom('')
      setDraftTo('')
    }
    setFilterOpen(false)
  }

  const isFilterActive = tab === 'Files' ? Boolean(filesMonth && filesYear) : isRangeFiltered

  if (adminLoading || vetLoading || !adminData || !vetData) return <AdminLayout><SkeletonStatCards count={4} /><SkeletonBlock height={260} style={{ marginBottom: '20px' }} /><SkeletonBlock height={260} /></AdminLayout>
  if (adminError) return <AdminLayout><p style={{ ...styles.stateText, color: C.red }}>{adminError}</p></AdminLayout>
  if (vetError) return <AdminLayout><p style={{ ...styles.stateText, color: C.red }}>{vetError}</p></AdminLayout>

  const insp = adminData.inspection_summary ?? {}
  const alertSum = adminData.alert_summary ?? {}
  const maint = adminData.maintenance_summary ?? {}
  const svc = adminData.service_summary ?? {}

  const statsByTab = {
    Overview: [
      { value: insp.total, label: 'Total Inspections' },
      { value: insp.completed, label: 'Completed Inspections' },
      { value: alertSum.critical_incidents, label: 'Critical Alerts' },
      { value: svc.total, label: 'Total Service Requests' },
      { value: vetData.total_completed, label: 'Vet Services Completed' },
    ],
    Inspections: [
      { value: inspectionRecords.length, label: 'Total Inspections', onClick: () => selectStatusView('Inspections', 'all'), active: statusView.Inspections === 'all' },
      { value: countBy(inspectionRecords, 'Completed'), label: 'Completed', onClick: () => selectStatusView('Inspections', 'Completed'), active: statusView.Inspections === 'Completed' },
      { value: countBy(inspectionRecords, 'Scheduled'), label: 'Scheduled', onClick: () => selectStatusView('Inspections', 'Scheduled'), active: statusView.Inspections === 'Scheduled' },
    ],
    // Incidents throughout, the same unit Alert History uses. Temperature and
    // humidity are advisory and raise no alert, so they are not counted here.
    Alerts: [
      { value: alertSum.total_incidents ?? alertSum.total, label: 'Total Alerts' },
      { value: alertSum.ammonia_incidents ?? 0, label: 'Ammonia Alerts' },
      { value: alertSum.moisture_incidents ?? 0, label: 'Moisture Alerts' },
      { value: alertSum.critical_incidents ?? 0, label: 'Critical Alerts' },
      { value: alertSum.resolved_incidents ?? 0, label: 'Resolved' },
    ],
    Maintenance: [
      { value: maint.completed_this_month, label: 'Completed This Month' },
      { value: maint.overdue, label: 'Currently Overdue' },
      { value: maint.non_compliant, label: 'Non-Compliant Farms' },
    ],
    'Service Requests': [
      { value: serviceRecords.length, label: 'Total Requests', onClick: () => selectStatusView('Service Requests', 'all'), active: statusView['Service Requests'] === 'all' },
      { value: countBy(serviceRecords, 'Completed'), label: 'Completed', onClick: () => selectStatusView('Service Requests', 'Completed'), active: statusView['Service Requests'] === 'Completed' },
      { value: countBy(serviceRecords, 'Scheduled'), label: 'Scheduled', onClick: () => selectStatusView('Service Requests', 'Scheduled'), active: statusView['Service Requests'] === 'Scheduled' },
    ],
  }
  const viewLabel = (t) => [statusView[t] === 'all' ? '' : statusView[t], rangeLabel].filter(Boolean).join(' · ')

  return (
    <AdminLayout>
      <ReportStyles />

      <div className="screen-view rp">
        <PageHeader
          title="Reports"
          subtitle="Municipality-wide records and analytics"
          hideActions
        />

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Tabs tabs={TABS} active={tab} onChange={setTab} />
          </div>

          <div ref={filterRef} style={{ position: 'relative', marginBottom: 10 }}>
            <button
              type="button"
              onClick={() => (filterOpen ? setFilterOpen(false) : openFilter())}
              style={{ ...styles.filterToggleBtn, ...(isFilterActive ? styles.filterToggleBtnActive : {}) }}
            >
              <IconFilter />
              Filter
              {isFilterActive && <span style={styles.filterToggleCount}>1</span>}
            </button>
            {filterOpen && (
              <div style={styles.filterPop}>
                <div style={styles.filterPopHeader}>
                  <span style={styles.filterPopTitle}>Filter</span>
                  <span style={styles.filterPopClose} onClick={() => setFilterOpen(false)}>×</span>
                </div>

                {tab === 'Files' ? (
                  <div style={styles.filterPopRow}>
                    <div>
                      <label style={styles.filterPopLabel}>Month</label>
                      <select
                        style={styles.filterPopSelect}
                        value={draftFilesMonth}
                        onChange={e => setDraftFilesMonth(e.target.value === '' ? '' : Number(e.target.value))}
                      >
                        <option value="">All Months</option>
                        {MONTH_NAMES.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={styles.filterPopLabel}>Year</label>
                      <select
                        style={styles.filterPopSelect}
                        value={draftFilesYear}
                        onChange={e => setDraftFilesYear(e.target.value === '' ? '' : Number(e.target.value))}
                      >
                        <option value="">All Years</option>
                        {reportYears.map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                  </div>
                ) : (
                  <div style={styles.filterPopRow}>
                    <div>
                      <DateRangeHeader>
                        <label style={styles.filterPopLabel}>From</label>
                        <ClearDateButton visible={hasDate} onClick={clearDates} />
                      </DateRangeHeader>
                      <input
                        type="date"
                        style={styles.filterPopSelect}
                        value={draftFrom}
                        onChange={e => setDraftFrom(e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={styles.filterPopLabel}>To</label>
                      <input
                        type="date"
                        style={styles.filterPopSelect}
                        value={draftTo}
                        onChange={e => setDraftTo(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                <div style={styles.filterPopActions}>
                  <button type="button" onClick={clearFilter} style={styles.filterPopClear}>Show all</button>
                  <button type="button" onClick={applyFilter} style={styles.filterPopApply}>Apply</button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={styles.body}>
          {tab !== 'Files' && (
            <p style={styles.filterNote}>{scopeLabelOf(fromDate, toDate)}</p>
          )}

          {tab !== 'Files' && (
            <div className="rp-stats">
              {statsByTab[tab].map(s => <StatCard key={s.label} {...s} />)}
            </div>
          )}

          {tab === 'Overview' && (
            <div className="rp-two">
              <Panel title="Inspections completed per month" subtitle={isRangeFiltered ? rangeLabel : 'Last 6 months'}>
                <ChartFrame>
                  <Line
                    data={{ labels: inspTrend.map(m => m.label), datasets: [lineDataset(inspTrend.map(m => m.count), C.green)] }}
                    options={chartOptions}
                  />
                </ChartFrame>
              </Panel>
              <Panel
                title="Services completed by type"
                subtitle={isRangeFiltered ? rangeLabel : 'Last 6 months'}
              >
                <ChartFrame>
                  <Bar
                    data={{
                      labels: serviceTotals.map(s => s.label),
                      datasets: [{
                        label: 'Completed',
                        data: serviceTotals.map(s => s.total),
                        backgroundColor: serviceTotals.map(s => s.color),
                        // Rounded on the end the bar grows towards, square where
                        // it meets the baseline, so the zero end stays anchored.
                        borderRadius: { topRight: 4, bottomRight: 4 },
                        maxBarThickness: 34,
                      }],
                    }}
                    options={serviceChartOptions}
                  />
                </ChartFrame>
              </Panel>
            </div>
          )}

          {tab === 'Inspections' && (
            <DataTable
              title="Inspection Records"
              subtitle={viewLabel('Inspections')}
              columns={['Inspection No.', 'Farm', 'Owner', 'Type', 'Date', 'Status']}
              emptyText="No inspection records in this range."
              rows={visibleInspectionRecords.map(i => [
                { text: i.inspection_number },
                { text: i.farm_name, strong: true },
                { text: i.owner_name },
                { text: i.inspection_type },
                { text: fmtDate(i.date) },
                { text: i.status, badgeStyle: requestStatusBadgeStyle(i.status), dot: false },
              ])}
            />
          )}

          {tab === 'Alerts' && (
            <>
              <Panel title="Alert volume over time" subtitle={`${rangeLabel} · incidents by day triggered`}>
                {alertTrend.length === 0 ? (
                  <div style={styles.empty}>No alerts recorded in this range.</div>
                ) : (
                  <ChartFrame>
                    <Line
                      data={{ labels: alertTrend.map(b => b.label), datasets: [lineDataset(alertTrend.map(b => b.count), C.amber)] }}
                      options={{
                        ...chartOptions,
                        scales: {
                          ...chartOptions.scales,
                          // Whole incidents — a tick of 0.5 alerts means nothing.
                          y: {
                            ...chartOptions.scales.y,
                            ticks: { ...chartOptions.scales.y.ticks, stepSize: 1 },
                          },
                        },
                      }}
                    />
                  </ChartFrame>
                )}
              </Panel>

              <DataTable
                title="Alert incidents"
                subtitle={rangeLabel}
                columns={['Farm', 'Owner', 'Sensor', 'Severity', 'Triggered', 'Status']}
                emptyText="No alerts recorded in this range."
                rows={alerts.map(a => [
                  { text: a.farm_name, strong: true },
                  { text: a.owner_name },
                  { text: a.sensor_type },
                  { text: a.status, tone: a.status === 'Critical' ? 'red' : 'amber' },
                  { text: a.triggered_at },
                  { text: a.is_ongoing ? 'Ongoing' : 'Resolved', tone: a.is_ongoing ? 'amber' : 'green' },
                ])}
              />
            </>
          )}

          {tab === 'Maintenance' && (
            <>
              <Tabs tabs={MAINTENANCE_VIEWS} active={maintView} onChange={setMaintView} />

              {maintView === 'Overdue and non-compliant farms' && (
                <DataTable
                  title="Overdue and non-compliant farms"
                  subtitle="Manure clean-out status as of today · not affected by the date filter"
                  columns={['Farm', 'Owner', 'Barangay', 'Last clean-out', 'Overdue by', 'Status']}
                  emptyText="All farms are compliant with clean-out schedules."
                  rows={overdueFarms.map(f => [
                    { text: f.farm_name, strong: true },
                    { text: f.owner_name },
                    { text: f.barangay },
                    { text: fmtDate(f.last_performed_at) },
                    { text: `${f.days_overdue} days` },
                    { text: f.status, tone: f.status === 'Non-Compliant' ? 'red' : 'amber' },
                  ])}
                />
              )}

              {maintView === 'Completed clean-out log' && (
                <DataTable
                  title="Completed clean-out log"
                  subtitle={rangeLabel}
                  columns={['Farm', 'Owner', 'Barangay', 'Completed', 'Method']}
                  emptyText="No completed clean-outs in this range."
                  rows={cleanouts.map(m => [
                    { text: m.farm_name, strong: true },
                    { text: m.owner_name },
                    { text: m.barangay },
                    { text: fmtDate(m.performed_at) },
                    { text: m.method },
                  ])}
                />
              )}
            </>
          )}

          {tab === 'Service Requests' && (
            <DataTable
              title="Service Request Records"
              subtitle={viewLabel('Service Requests')}
              columns={['Request No.', 'Type', 'Farm', 'Owner', 'Barangay', 'Handled By', 'Date', 'Status']}
              emptyText="No service request records in this range."
              minWidth="840px"
              rows={visibleServiceRecords.map(s => [
                { text: s.id },
                { text: serviceTypeLabel(s.service_type), badgeStyle: serviceTypeBadgeStyle(s.service_type), dot: false },
                { text: s.farm_name },
                { text: s.owner_name },
                { text: s.barangay },
                { text: s.handled_by },
                { text: fmtDate(s.date) },
                { text: s.status, badgeStyle: requestStatusBadgeStyle(s.status), dot: false },
              ])}
            />
          )}

          {tab === 'Files' && (
            <GeneratedReportsFilesTab appliedMonth={filesMonth} appliedYear={filesYear} />
          )}

          {tab !== 'Files' && (
            <p style={styles.footNote}>
              Generated {generatedAt} 
            </p>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
