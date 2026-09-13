import { useEffect, useMemo, useRef, useState } from 'react'
import { Line, Bar, Doughnut } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip,
} from 'chart.js'
import AdminLayout from '../../components/AdminLayout'
import GeneratedReportsFilesTab from '../../components/GeneratedReportsFilesTab'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import {
  C, styles, ReportStyles, PageHeader, Tabs, StatCard, Panel, DataTable, ChartFrame, Legend,
  DonutCenter, IconFilter, chartOptions, donutOptions, lineDataset,
  fmtDate, makeInRange, rangeLabelOf, monthlyBuckets, monthlyBucketsInRange, dailyBucketsForMonth,
  MONTH_NAMES, monthBounds,
} from '../../components/ReportsLayout'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip)

const TABS = ['Overview', 'Inspections', 'Alerts', 'Maintenance', 'Service Requests', 'Files']
const MAINTENANCE_VIEWS = ['Overdue and non-compliant farms', 'Completed clean-out log']

export default function AdminReports() {
  const { data, loading, error } = useCachedFetch('/admin/reports')

  const [tab, setTab] = useState('Overview')
  const [maintView, setMaintView] = useState(MAINTENANCE_VIEWS[0])
  const now = new Date()

  const [filterMonth, setFilterMonth] = useState(now.getMonth() + 1)
  const [filterYear, setFilterYear] = useState(now.getFullYear())
  const [filterOpen, setFilterOpen] = useState(false)
  const [appliedMonth, setAppliedMonth] = useState(now.getMonth() + 1)
  const [appliedYear, setAppliedYear] = useState(now.getFullYear())
  const filterRef = useRef(null)

  const reportYears = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)

  const { from, to } = (appliedMonth && appliedYear) ? monthBounds(appliedMonth, appliedYear) : { from: '', to: '' }
  const inRange = makeInRange(from, to)
  const rangeLabel = rangeLabelOf(from, to)

  const allInspections = data?.completed_inspections ?? []
  const allAlerts = data?.alert_records ?? []
  const overdueFarms = [...(data?.maintenance_overdue_list ?? []), ...(data?.maintenance_non_compliant_list ?? [])]
  const allCleanouts = data?.maintenance_completed_list ?? []
  const allServices = data?.completed_services ?? []

  const inspections = useMemo(() => allInspections.filter(r => inRange(r.completed_at_raw)), [allInspections, from, to])
  const alerts = useMemo(() => allAlerts.filter(r => inRange(r.triggered_at_raw)), [allAlerts, from, to])
  const cleanouts = useMemo(() => allCleanouts.filter(r => inRange(r.performed_at_raw)), [allCleanouts, from, to])
  const services = useMemo(() => allServices.filter(r => inRange(r.completed_at_raw)), [allServices, from, to])

  const monthlyTrend = useMemo(() => monthlyBuckets(allInspections, 'completed_at_raw', appliedMonth, appliedYear), [allInspections, appliedMonth, appliedYear])
  const alertTrend = useMemo(() => (
    (appliedMonth && appliedYear)
      ? dailyBucketsForMonth(alerts, 'triggered_at_raw', appliedMonth, appliedYear)
      : monthlyBucketsInRange(alerts, 'triggered_at_raw')
  ), [alerts, appliedMonth, appliedYear])

  useEffect(() => {
    if (!filterOpen) return
    const onClickOutside = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [filterOpen])

  const applyFilter = () => {
    setAppliedMonth(filterMonth)
    setAppliedYear(filterYear)
    setFilterOpen(false)
  }

  const clearFilter = () => {
    setAppliedMonth(null)
    setAppliedYear(null)
    setFilterOpen(false)
  }

  if (loading || !data) return <AdminLayout><p style={styles.stateText}>Loading...</p></AdminLayout>
  if (error) return <AdminLayout><p style={{ ...styles.stateText, color: C.red }}>{error}</p></AdminLayout>

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
  }

  const statsByTab = {
    Overview: [
      { value: farms.total, label: 'Total Farms' },
      { value: insp.total, label: 'Total Inspections' },
      { value: alertSum.total, label: 'Total Alerts' },
      { value: alertSum.critical_alerts, label: 'Critical Alerts' },
      { value: svc.pending, label: 'Pending Service Requests' },
    ],
    Inspections: [
      { value: insp.total, label: 'Total Inspections' },
      { value: insp.completed, label: 'Completed' },
      { value: insp.scheduled, label: 'Scheduled' },
      { value: insp.general, label: 'General' },
      { value: insp.follow_up, label: 'Follow-up' },
    ],
    Alerts: [
      { value: alertSum.total, label: 'Total Alerts' },
      { value: alertSum.ammonia_breaches, label: 'Ammonia Breaches' },
      { value: alertSum.temp_anomalies, label: 'Temperature Anomalies' },
      { value: alertSum.humidity_anomalies, label: 'Humidity Anomalies' },
      { value: alertSum.critical_alerts, label: 'Critical Alerts' },
    ],
    Maintenance: [
      { value: maint.completed_this_month, label: 'Completed This Month' },
      { value: maint.overdue, label: 'Currently Overdue' },
      { value: maint.non_compliant, label: 'Non-Compliant Farms' },
    ],
    'Service Requests': [
      { value: svc.total, label: 'Total Requests' },
      { value: svc.completed, label: 'Completed' },
      { value: svc.pending, label: 'Pending' },
    ],
  }

  const generatedAt = new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' })

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
              onClick={() => (filterOpen ? setFilterOpen(false) : setFilterOpen(true))}
              style={{ ...styles.filterToggleBtn, ...((appliedMonth && appliedYear) ? styles.filterToggleBtnActive : {}) }}
            >
              <IconFilter />
              Filter
              {appliedMonth && appliedYear && <span style={styles.filterToggleCount}>1</span>}
            </button>
            {filterOpen && (
              <div style={styles.filterPop}>
                <div style={styles.filterPopHeader}>
                  <span style={styles.filterPopTitle}>Filter</span>
                  <span style={styles.filterPopClose} onClick={() => setFilterOpen(false)}>×</span>
                </div>

                <div style={styles.filterPopRow}>
                  <div>
                    <label style={styles.filterPopLabel}>Month</label>
                    <select style={styles.filterPopSelect} value={filterMonth} onChange={e => setFilterMonth(Number(e.target.value))}>
                      {MONTH_NAMES.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={styles.filterPopLabel}>Year</label>
                    <select style={styles.filterPopSelect} value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}>
                      {reportYears.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                </div>

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
            <p style={styles.filterNote}>Stat cards show all-time totals. Charts and tables below reflect {rangeLabel}.</p>
          )}

          {tab !== 'Files' && (
            <div className="rp-stats">
              {statsByTab[tab].map(s => <StatCard key={s.label} {...s} />)}
            </div>
          )}

          {tab === 'Overview' && (
            <div className="rp-two">
              <Panel title="Inspections completed per month" subtitle="Last 6 months">
                <ChartFrame>
                  <Line
                    data={{ labels: monthlyTrend.map(m => m.label), datasets: [lineDataset(monthlyTrend.map(m => m.count), C.green)] }}
                    options={chartOptions}
                  />
                </ChartFrame>
              </Panel>

              <Panel title="Farm monitoring status" subtitle="All registered farms" style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ ...styles.donutRow, flex: 1 }}>
                  <div style={styles.donutWrap}>
                    <Doughnut
                      data={{
                        labels: ['Safe', 'Warning', 'Critical'],
                        datasets: [{
                          data: [farms.normal ?? 0, farms.warning ?? 0, farms.critical ?? 0],
                          backgroundColor: [C.green, C.amber, C.red],
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
                  ]} />
                </div>
              </Panel>
            </div>
          )}

          {tab === 'Inspections' && (
            <>
              <Panel title="General vs Follow-up inspections" subtitle="All-time completed count by type">
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
                columns={['ID', 'Farm', 'Owner', 'Type', 'Date', 'Status']}
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
                          // Alert counts are small whole numbers — force
                          // integer-only, 1-unit tick spacing instead of
                          // Chart.js's auto step (which could land on
                          // fractional or skipped values like 0, 2, 4).
                          y: {
                            ...chartOptions.scales.y,
                            ticks: { ...chartOptions.scales.y.ticks, stepSize: 1 },
                          },
                          x: (appliedMonth && appliedYear) ? {
                            ...chartOptions.scales.x,
                            ticks: {
                              ...chartOptions.scales.x.ticks,
                              autoSkip: false,
                              maxRotation: 0,
                              callback: (_value, index) => {
                                const day = index + 1
                                return (day === 1 || day % 5 === 0) ? day : ''
                              },
                            },
                          } : chartOptions.scales.x,
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
              title="Completed service requests"
              subtitle={rangeLabel}
              columns={['Type', 'Farm', 'Owner', 'Barangay', 'Completed', 'Notes']}
              emptyText="No completed service requests in this range."
              rows={services.map(s => [
                { text: s.service_type, strong: true },
                { text: s.farm_name },
                { text: s.owner_name },
                { text: s.barangay },
                { text: fmtDate(s.completed_at) },
                { text: s.notes },
              ])}
            />
          )}

          {tab === 'Files' && (
            <GeneratedReportsFilesTab appliedMonth={appliedMonth} appliedYear={appliedYear} />
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
