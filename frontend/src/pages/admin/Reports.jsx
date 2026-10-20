import { matchesReportPeriod } from '../../utils/reportPeriod'
import AlertIncidentChart from '../../components/AlertIncidentChart'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Line, Bar, Doughnut } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip,
} from 'chart.js'
import AdminLayout from '../../components/AdminLayout'
import GeneratedReportsFilesTab from '../../components/GeneratedReportsFilesTab'
import AdminGeneratedReportView from '../../components/AdminGeneratedReportView'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useReportPeriod } from '../../hooks/useReportPeriod'
import ReportPeriodFields from '../../components/ReportPeriodFields'
import {
  C, styles, ReportStyles, PageHeader, Tabs, StatCard, Panel, DataTable, ChartFrame, Legend,
  DonutCenter, IconFilter, chartOptions, donutOptions, lineDataset,
  fmtDate, makeInRange, rangeLabelOf, scopeLabelOf, monthlyBucketsInRange,
  serviceTypeBadgeStyle, serviceTypeLabel,
} from '../../components/ReportsLayout'
import { DISPLAY_TIME_ZONE } from '../../utils/formatDate'
import { SkeletonStatCards, SkeletonBlock } from '../../components/Loading'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip)

const TABS = ['Overview', 'Inspections', 'Alerts', 'Maintenance', 'Service Requests', 'Files']
const MAINTENANCE_VIEWS = ['Overdue and non-compliant farms', 'Completed clean-out log']

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


  const inRange = makeInRange(fromDate, toDate)
  const rangeLabel = rangeLabelOf(fromDate, toDate)

  const allInspections = data?.completed_inspections ?? []
  const allAlerts = data?.alert_records ?? []
  const overdueFarms = [...(data?.maintenance_overdue_list ?? []), ...(data?.maintenance_non_compliant_list ?? [])]
  const allCleanouts = data?.maintenance_completed_list ?? []
  const allServices = data?.completed_services ?? []

  const inspections = useMemo(() => allInspections.filter(r => inRange(r.completed_at_raw)), [allInspections, fromDate, toDate])
  const alerts = useMemo(() => allAlerts.filter(r => inRange(r.triggered_at_raw)), [allAlerts, fromDate, toDate])
  const cleanouts = useMemo(() => allCleanouts.filter(r => inRange(r.performed_at_raw)), [allCleanouts, fromDate, toDate])
  const services = useMemo(() => allServices.filter(r => inRange(r.completed_at_raw)), [allServices, fromDate, toDate])

  const isRangeFiltered = Boolean(fromDate || toDate)

  const monthlyTrend = useMemo(() => (
    isRangeFiltered
      ? monthlyBucketsInRange(inspections, 'completed_at_raw')
      : monthlyBucketsInRange(allInspections, 'completed_at_raw')
  ), [inspections, allInspections, isRangeFiltered])

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
  const svc = data.service_summary ?? {}
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
      { value: farms.total, label: isRangeFiltered ? 'Farms Registered in Period' : 'Total Farms' },
      { value: insp.total, label: 'Total Inspections' },
      { value: alertSum.total_incidents ?? alertSum.total, label: 'Total Alerts' },
      { value: alertSum.critical_incidents, label: 'Critical Alerts' },
      { value: svc.pending, label: 'Pending Service Requests' },
    ],
    Inspections: [
      { value: insp.total, label: 'Total Inspections' },
      { value: insp.completed, label: 'Completed' },
      { value: insp.scheduled, label: 'Scheduled' },
      { value: insp.general, label: 'General' },
      { value: insp.follow_up, label: 'Follow-up' },
    ],
    // Every card here counts INCIDENTS, the same unit Alert History shows, so
    // the five numbers can be read across one row. Temperature and humidity
    // are advisory metrics the system never alerts on, so their cards counted
    // raw readings instead and reached five figures beside a Total of 87.
    // Ammonia and moisture are what actually raise alerts.
    Alerts: [
      { value: alertSum.total_incidents ?? alertSum.total, label: 'Total Alerts' },
      { value: alertSum.ammonia_incidents ?? 0, label: 'Ammonia Alerts' },
      { value: alertSum.moisture_incidents ?? 0, label: 'Moisture Alerts' },
      { value: alertSum.critical_incidents ?? 0, label: 'Critical Alerts' },
      { value: alertSum.resolved_incidents ?? 0, label: 'Resolved' },
    ],
    Maintenance: [
      { value: maint.completed_this_month, label: 'Clean-outs in Period' },
      { value: maint.overdue, label: 'Overdue at Cutoff' },
      { value: maint.non_compliant, label: 'Non-Compliant Farms' },
    ],
    'Service Requests': [
      { value: svc.total, label: 'Total Requests' },
      { value: svc.completed, label: 'Completed' },
      { value: svc.pending, label: 'Pending' },
    ],
  }

  return (
    <AdminLayout>
      <ReportStyles />

      <div className="screen-view rp">
        <PageHeader
          title="Reports"
          subtitle="Overall Farm Monitoring Summary"
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
          <p style={styles.filterNote}>{scopeLabelOf(fromDate, toDate)}</p>

          {tab !== 'Files' && (
            <div className="rp-stats">
              {statsByTab[tab].map(s => <StatCard key={s.label} {...s} />)}
            </div>
          )}

          {tab === 'Overview' && (
            <div className="rp-two">
              <Panel title="Inspections completed per month" subtitle={isRangeFiltered ? rangeLabel : 'All records'}>
                <ChartFrame>
                  <Line
                    data={{ labels: monthlyTrend.map(m => m.label), datasets: [lineDataset(monthlyTrend.map(m => m.count), C.green)] }}
                    options={chartOptions}
                  />
                </ChartFrame>
              </Panel>

              <Panel title="Latest recorded farm condition" subtitle={isRangeFiltered ? `Farms registered during ${rangeLabel}` : 'All registered farms'} style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ ...styles.donutRow, flex: 1 }}>
                  <div style={styles.donutWrap}>
                    <Doughnut
                      data={{
                        labels: ['Safe', 'Warning', 'Critical', 'Pending Setup'],
                        datasets: [{
                          data: [farms.normal ?? 0, farms.warning ?? 0, farms.critical ?? 0, farms.pendingSetup ?? 0],
                          backgroundColor: [C.green, C.amber, C.red, C.faint],
                          borderWidth: 0,
                        }],
                      }}
                      options={donutOptions}
                    />
                    <DonutCenter total={farms.total} />
                  </div>
                  <Legend items={[
                    { label: 'Safe', value: farms.normal, color: C.green },
                    { label: 'Warning', value: farms.warning, color: C.amber },
                    { label: 'Critical', value: farms.critical, color: C.red },
                    { label: 'Pending Setup', value: farms.pendingSetup, color: C.faint },
                  ]} />
                </div>
              </Panel>
            </div>
          )}

          {tab === 'Inspections' && (
            <>
              <Panel title="General vs Follow-up inspections" subtitle={rangeLabel}>
                <ChartFrame>
                  <Bar
                    data={{
                      labels: ['General', 'Follow-up'],
                      datasets: [{ data: [insp.general ?? 0, insp.follow_up ?? 0], backgroundColor: [C.green, C.card], borderRadius: 3, maxBarThickness: 130 }],
                    }}
                    options={chartOptions}
                  />
                </ChartFrame>
              </Panel>

              <DataTable
                title="Completed inspections"
                subtitle={rangeLabel}
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
            </>
          )}

          {tab === 'Alerts' && (
            <>
              <Panel title="Alert incidents over time" subtitle={`${rangeLabel} · incidents by ${data.alert_trend?.aggregation || 'day'} triggered`}>
                <AlertIncidentChart series={data.alert_trend} />
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
                  subtitle={`Manure clean-out status as of ${data.report_period?.status_as_of || 'today'}`}
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
              title="Completed service requests"
              subtitle={rangeLabel}
              columns={['Type', 'Farm', 'Owner', 'Barangay', 'Completed', 'Notes']}
              emptyText="No completed service requests in this range."
              rows={services.map(s => [
                { text: serviceTypeLabel(s.service_type), badgeStyle: serviceTypeBadgeStyle(s.service_type), dot: false },
                { text: s.farm_name },
                { text: s.owner_name },
                { text: s.barangay },
                { text: fmtDate(s.completed_at) },
                { text: s.notes },
              ])}
            />
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
