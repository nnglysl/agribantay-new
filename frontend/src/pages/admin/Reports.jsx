import MonthlyReportBarChart from '../../components/MonthlyReportBarChart'
import InspectionTypeBarChart from '../../components/InspectionTypeBarChart'
import { matchesReportPeriod } from '../../utils/reportPeriod'
import { fillMonthlyReportBuckets } from '../../utils/fillMonthlyReportBuckets'
import AlertSensorMonthlyChart from '../../components/AlertSensorMonthlyChart'
import { monthlyAlertSensorCounts } from '../../utils/monthlyAlertSensorCounts'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip,
} from 'chart.js'
import AdminLayout from '../../components/AdminLayout'
import GeneratedReportsFilesTab from '../../components/GeneratedReportsFilesTab'
import AdminGeneratedReportView from '../../components/AdminGeneratedReportView'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useReportPeriod } from '../../hooks/useReportPeriod'
import ReportPeriodFields from '../../components/ReportPeriodFields'
import {
  C, styles, ReportStyles, PageHeader, Tabs, StatCard, Panel, DataTable,
  IconFilter, chartOptions,
  fmtDate, makeInRange, rangeLabelOf, monthlyBucketsInRange,
} from '../../components/ReportsLayout'
import { DISPLAY_TIME_ZONE } from '../../utils/formatDate'
import { SkeletonStatCards, SkeletonBlock } from '../../components/Loading'
import './reports-overview.css'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip)

// Retired Staff service requests are excluded from active reporting. Saved
// report files retain their original snapshots; Vet reports remain role-scoped.
const TABS = ['Overview', 'Inspections', 'Alerts', 'Maintenance', 'Files']
const MAINTENANCE_VIEWS = ['Non-Compliant farms', 'Completed clean-out log']

const overviewChartOptions = {
  ...chartOptions,
  plugins: {
    ...chartOptions.plugins,
    tooltip: {
      ...chartOptions.plugins.tooltip,
      callbacks: { label: context => `${context.parsed.y} completed inspection${context.parsed.y === 1 ? '' : 's'}` },
    },
  },
  scales: {
    ...chartOptions.scales,
    y: {
      ...chartOptions.scales.y,
      suggestedMax: 1,
      title: { display: true, text: 'Number of inspections', color: C.mute, font: { family: "'Inter', sans-serif", size: 11 } },
      ticks: { ...chartOptions.scales.y.ticks, maxTicksLimit: 6, color: C.mute },
    },
    x: { ...chartOptions.scales.x, ticks: { ...chartOptions.scales.x.ticks, color: C.mute } },
  },
}

export default function AdminReports() {
  const [tab, setTab] = useState('Overview')
  const [maintView, setMaintView] = useState(MAINTENANCE_VIEWS[0])

  // Shared reporting period drives every tab, including saved report files.
  const { fromDate, toDate, draftPeriod, setDraftPeriod, periodError, openPeriod, applyPeriod, clearPeriod } = useReportPeriod()

  // Cards, charts and tables request the same applied reporting period.
  const reportParams = useMemo(() => {
    const p = {}
    if (fromDate) p.from = fromDate
    if (toDate) p.to = toDate
    return p
  }, [fromDate, toDate])

  const { data, loading, error, refetch } = useCachedFetch('/admin/reports', reportParams)

  // Tied to actual data refreshes only (initial load + each 30-minute
  // auto-refetch below) — never recomputed on every render, so it doesn't
  // silently creep forward just because the user opened a filter popover
  // or switched tabs. Computed during render (not in an effect) when `data`
  // changes reference, which only happens right after a fetch resolves.
  const [prevData, setPrevData] = useState(data)
  const [generatedAt, setGeneratedAt] = useState('')
  if (data !== prevData) {
    setPrevData(data)
    if (data) setGeneratedAt(new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short', timeZone: DISPLAY_TIME_ZONE }))
  }


  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef(null)
  const filterButtonRef = useRef(null)
  const filterId = useId()


  const inRange = makeInRange(fromDate, toDate)
  const rangeLabel = rangeLabelOf(fromDate, toDate)

  const allInspections = data?.completed_inspections ?? []
  const allAlerts = data?.alert_records ?? []
  const nonCompliantFarms = data?.maintenance_non_compliant_list ?? []
  const allCleanouts = data?.maintenance_completed_list ?? []

  const inspections = useMemo(() => allInspections.filter(r => inRange(r.completed_at_raw)), [allInspections, fromDate, toDate])
  const alerts = useMemo(() => allAlerts.filter(r => inRange(r.triggered_at_raw)), [allAlerts, fromDate, toDate])
  const cleanouts = useMemo(() => allCleanouts.filter(r => inRange(r.performed_at_raw)), [allCleanouts, fromDate, toDate])

  const isRangeFiltered = Boolean(fromDate || toDate)

  const monthlyTrend = useMemo(() => (
    fillMonthlyReportBuckets(monthlyBucketsInRange(inspections, 'completed_at_raw'), fromDate, toDate)
  ), [inspections, fromDate, toDate])
  const monthlyAlertSeries = useMemo(() => monthlyAlertSensorCounts(alerts, fromDate, toDate), [alerts, fromDate, toDate])

  // Single centralized refresh mechanism for the whole Reports page: fetch the
  // latest data as soon as the page opens (never wait for the interval), then
  // re-fetch every 30 minutes. Period changes also fetch scoped statistics.
  useEffect(() => {
    refetch()
    const interval = setInterval(refetch, 30 * 60 * 1000)
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
    openPeriod()
    setFilterOpen(true)
  }

  const applyFilter = () => {
    if (applyPeriod()) setFilterOpen(false)
  }
  const clearFilter = () => {
    clearPeriod()
    setFilterOpen(false)
  }

  const isFilterActive = isRangeFiltered

  if (error) return <AdminLayout><p style={{ ...styles.stateText, color: C.red }}>{error}</p></AdminLayout>
  if (loading || !matchesReportPeriod(data, fromDate, toDate)) return <AdminLayout><SkeletonStatCards count={4} /><SkeletonBlock height={260} style={{ marginBottom: '20px' }} /><SkeletonBlock height={260} /></AdminLayout>

  const insp = data.inspection_summary ?? {}
  const alertSum = data.alert_summary ?? {}
  const maint = data.maintenance_summary ?? {}
  const overview = data.overview_summary ?? {}
  const farms = {
    total: overview.total_farms,
    normal: overview.farm_status_breakdown?.normal,
    warning: overview.farm_status_breakdown?.warning,
    critical: overview.farm_status_breakdown?.critical,
    pendingSetup: overview.farm_status_breakdown?.pending_setup,
  }

  const statsByTab = {
    Overview: [
      { value: farms.total, label: 'Total Farms', foot: isRangeFiltered ? 'Registered in period' : 'All registered farms' },
      { value: insp.total, label: 'Total Inspections', foot: isRangeFiltered ? 'In selected period' : 'All records' },
      { value: alertSum.total_incidents ?? alertSum.total, label: 'Total Alerts', foot: isRangeFiltered ? 'Incidents in period' : 'All incidents' },
      { value: alertSum.critical_incidents, label: 'Critical Alerts', foot: isRangeFiltered ? 'Incidents in period' : 'All incidents' },
    ],
    Inspections: [
      { value: insp.total, label: 'Total Inspections', foot: 'Includes all statuses' },
      { value: insp.completed, label: 'Completed', foot: 'Marked as completed' },
      { value: insp.scheduled, label: 'Scheduled', foot: 'Scheduled status' },
    ],
    // All three cards retain the API's incident counts and report-cutoff rules.
    Alerts: [
      { value: alertSum.total_incidents ?? alertSum.total, label: 'Total Alerts', foot: 'Alert incidents' },
      { value: alertSum.critical_incidents ?? 0, label: 'Critical Alerts', foot: 'Critical incidents' },
      { value: alertSum.resolved_incidents ?? 0, label: 'Resolved Alerts', foot: 'Resolved by report cutoff' },
    ],
    Maintenance: [
      { value: maint.completed_this_month, label: 'Clean-outs in Period' },
      { value: maint.undetermined, label: 'Undetermined' },
      { value: maint.non_compliant, label: 'Non-Compliant Farms' },
    ],
  }

  return (
    <AdminLayout>
      <ReportStyles />

      <div className="screen-view rp staff-reports">
        <PageHeader
          title="Reports"
          subtitle={tab === 'Inspections' ? 'Inspection activity and completion records' : tab === 'Alerts' ? 'Alert trends and incident summary' : 'Overall Farm Monitoring Summary'}
          hideActions
        />
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
        <div className="rp-filter-toolbar">
          <p className="staff-report-period" aria-live="polite">Reporting period: <strong>{rangeLabel}</strong></p>
          <div ref={filterRef} style={{ position: 'relative' }}>
            <button
              ref={filterButtonRef}
              type="button"
              aria-expanded={filterOpen}
              aria-controls={filterId}
              onClick={() => (filterOpen ? setFilterOpen(false) : openFilter())}
              style={{ ...styles.filterToggleBtn, ...(isFilterActive ? styles.filterToggleBtnActive : {}) }}
            >
              <IconFilter />
              Filter
              {isFilterActive && <span style={styles.filterToggleCount}>1</span>}
            </button>
            {filterOpen && (
              <div id={filterId} role="group" aria-label="Report period filter" style={styles.filterPop} onKeyDown={event => {
                if (event.key === 'Escape') { event.preventDefault(); setFilterOpen(false); filterButtonRef.current.focus() }
              }}>
                <div style={styles.filterPopHeader}>
                  <span style={styles.filterPopTitle}>Filter</span>
                  <button type="button" className="staff-report-filter-close" aria-label="Close report period filter" onClick={() => { setFilterOpen(false); filterButtonRef.current.focus() }}>×</button>
                </div>

                <ReportPeriodFields value={draftPeriod} onChange={setDraftPeriod} error={periodError} />

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
            <div className={`rp-stats${tab === 'Overview' ? ' staff-overview-stats' : tab === 'Inspections' ? ' staff-inspection-stats' : tab === 'Alerts' ? ' staff-alert-stats' : ''}`}>
              {statsByTab[tab].map(s => <StatCard key={s.label} {...s} />)}
            </div>
          )}

          {tab === 'Overview' && (
            <Panel title="Inspections Completed per Month" subtitle="Number of inspections marked as completed within the selected period." style={{ borderRadius: 10, padding: '20px' }} subtitleStyle={{ color: C.mute, lineHeight: 1.55 }}>
              <MonthlyReportBarChart buckets={monthlyTrend} label="Completed inspections" emptyText="No completed inspections in this reporting period." options={overviewChartOptions} height="clamp(220px, 24vw, 280px)" describeValues />
            </Panel>
          )}

          {tab === 'Inspections' && (
            <div className="staff-inspections-report">
              <Panel title="Inspections by Type" subtitle="Number of inspections per type within the selected period." style={{ borderRadius: 10, padding: 20 }} subtitleStyle={{ color: C.mute, lineHeight: 1.55 }}>
                <InspectionTypeBarChart general={insp.general} followUp={insp.follow_up} />
              </Panel>

              <DataTable
                variant="compact"
                minWidth="780px"
                columnWidths={['14%', '18%', '18%', '18%', '16%', '16%']}
                resetKey={`${fromDate}:${toDate}`}
                title="Completed Inspections"
                subtitle="Inspections marked as completed within the selected period."
                columns={['Inspection No.', 'Farm', 'Owner', 'Type', 'Date', 'Status']}
                emptyText="No completed inspections in this range."
                rows={inspections.map(i => [
                  { text: i.inspection_number },
                  { text: i.farm_name, strong: true },
                  { text: i.owner_name },
                  { text: i.inspection_type },
                  { text: fmtDate(i.completed_at) },
                  { text: i.status || 'Completed', tone: 'green' },
                ])}
              />
            </div>
          )}

          {tab === 'Alerts' && (
            <div className="staff-alerts-report">
              <Panel title="Alert Incidents by Sensor" subtitle="Monthly number of alert incidents for ammonia and moisture." style={{ borderRadius: 10, padding: 20 }} subtitleStyle={{ color: C.mute, lineHeight: 1.55 }}>
                <AlertSensorMonthlyChart series={monthlyAlertSeries} ammoniaTotal={alertSum.ammonia_incidents} moistureTotal={alertSum.moisture_incidents} />
              </Panel>

              <DataTable
                variant="compact"
                minWidth="840px"
                columnWidths={['18%', '18%', '12%', '14%', '22%', '16%']}
                resetKey={`${fromDate}:${toDate}`}
                title="Alert Incidents"
                subtitle="Alert incidents within the selected period."
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
            </div>
          )}

          {tab === 'Maintenance' && (
            <>
              <Tabs tabs={MAINTENANCE_VIEWS} active={maintView} onChange={setMaintView} />

              {maintView === 'Non-Compliant farms' && (
                <DataTable
                resetKey={`${fromDate}:${toDate}`}
                  title="Non-Compliant farms"
                  subtitle={`Manure clean-out status as of ${data.report_period?.status_as_of || 'today'}`}
                  columns={['Farm', 'Owner', 'Barangay', 'Last clean-out', 'Due date', 'Overdue by', 'Status']}
                  emptyText="No Non-Compliant farms at this cutoff. Check Undetermined totals for missing dates."
                  rows={nonCompliantFarms.map(f => [
                    { text: f.farm_name, strong: true },
                    { text: f.owner_name },
                    { text: f.barangay },
                    { text: fmtDate(f.last_performed_at) },
                    { text: fmtDate(f.due_date) },
                    { text: `${f.days_overdue} days` },
                    { text: f.status, tone: 'red' },
                  ])}
                />
              )}

              {maintView === 'Completed clean-out log' && (
                <DataTable
                resetKey={`${fromDate}:${toDate}`}
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

          {tab === 'Files' && (
            <GeneratedReportsFilesTab fromDate={fromDate} toDate={toDate} ReportView={AdminGeneratedReportView} />
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
