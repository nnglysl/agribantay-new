import MonthlyReportBarChart from '../../components/MonthlyReportBarChart'
import AnnualMaintenanceComplianceChart from '../../components/AnnualMaintenanceComplianceChart'
import { matchesReportPeriod } from '../../utils/reportPeriod'
import AlertIncidentChart from '../../components/AlertIncidentChart'
import { useEffect, useMemo, useRef, useState } from 'react'
import AdminLayout from '../../components/AdminLayout'
import GeneratedReportsFilesTab from '../../components/GeneratedReportsFilesTab'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useReportPeriod } from '../../hooks/useReportPeriod'
import ReportPeriodFields from '../../components/ReportPeriodFields'
import {
  C, styles, ReportStyles, PageHeader, Tabs, StatCard, Panel, DataTable,
  IconFilter, fmtDate, makeInRange, rangeLabelOf, scopeLabelOf,
  monthlyBucketsInRange, serviceTypeBadgeStyle, serviceTypeLabel, requestStatusBadgeStyle,
} from '../../components/ReportsLayout'
import { DISPLAY_TIME_ZONE } from '../../utils/formatDate'
import { SkeletonStatCards, SkeletonBlock } from '../../components/Loading'

// Oversight must not see less than the people it oversees. Alerts and
// Maintenance were on the Staff page only, so the Super Admin could read a
// Critical Alerts count with no way to open the incidents behind it, and had
// no view at all of which farms were behind on clean-out.
const TABS = ['Overview', 'Inspections', 'Alerts', 'Maintenance', 'Service Requests', 'Files']
const MAINTENANCE_VIEWS = ['Non-Compliant farms', 'Completed clean-out log']

export default function SuperAdminReports() {
  const [tab, setTab] = useState('Overview')

  // From/To date-range filter — drives the record-listing tabs (Overview,
  // Inspections, Service Requests).
  const { fromDate, toDate, draftPeriod, setDraftPeriod, periodError, openPeriod, applyPeriod, clearPeriod } = useReportPeriod()

  // Cards, charts and tables request the same applied reporting period.
  const reportParams = useMemo(() => {
    const p = {}
    if (fromDate) p.from = fromDate
    if (toDate) p.to = toDate
    return p
  }, [fromDate, toDate])

  const { data: adminData, loading: adminLoading, error: adminError, refetch: refetchAdmin } = useCachedFetch('/admin/reports', reportParams)
  const { data: vetData, loading: vetLoading, error: vetError, refetch: refetchVet } = useCachedFetch('/vet/reports', reportParams)

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


  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef(null)


  const inRange = makeInRange(fromDate, toDate)
  const rangeLabel = rangeLabelOf(fromDate, toDate)

  // Overview charts: completed records only (as before).
  const allInspections = adminData?.completed_inspections ?? []
  const inspections = useMemo(() => allInspections.filter(r => inRange(r.completed_at_raw)), [allInspections, fromDate, toDate])

  // Alerts and clean-outs come from the same /admin/reports payload this page
  // already fetches — the records were on hand all along, only unrendered.
  const allAlerts = adminData?.alert_records ?? []
  const nonCompliantFarms = adminData?.maintenance_non_compliant_list ?? []
  const allCleanouts = adminData?.maintenance_completed_list ?? []

  const alerts = useMemo(() => allAlerts.filter(r => inRange(r.triggered_at_raw)), [allAlerts, fromDate, toDate])
  const cleanouts = useMemo(() => allCleanouts.filter(r => inRange(r.performed_at_raw)), [allCleanouts, fromDate, toDate])

  // Inspections / Service Requests tabs: Completed AND Scheduled records.
  // `date_raw` is the completion date for Completed rows and the scheduled
  // date for Scheduled rows, so the From/To filter applies to both alike.
  const allInspectionRecords = adminData?.inspection_records ?? []
  const allServiceRecords = useMemo(() => [
    ...(vetData?.service_records ?? []).map(v => ({ ...v, handled_by: v.vet_name || '—' })),
  ].sort((a, b) => (b.date_raw || '').localeCompare(a.date_raw || '')), [vetData])

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
      : monthlyBucketsInRange(allInspections, 'completed_at_raw')
  ), [inspections, allInspections, isRangeFiltered])


  // Single centralized refresh mechanism for the whole Reports page: fetch the
  // latest data (both sources) as soon as the page opens (never wait for the
  // interval), then re-fetch every 30 minutes. Period changes also fetch scoped
  // statistics from both sources.
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

  if (adminError) return <AdminLayout><p style={{ ...styles.stateText, color: C.red }}>{adminError}</p></AdminLayout>
  if (vetError) return <AdminLayout><p style={{ ...styles.stateText, color: C.red }}>{vetError}</p></AdminLayout>
  if (adminLoading || vetLoading || !matchesReportPeriod(adminData, fromDate, toDate) || !matchesReportPeriod(vetData, fromDate, toDate)) return <AdminLayout><SkeletonStatCards count={3} /><SkeletonBlock height={260} style={{ marginBottom: '20px' }} /><SkeletonBlock height={260} /></AdminLayout>

  const insp = adminData.inspection_summary ?? {}
  const alertSum = adminData.alert_summary ?? {}
  const maint = adminData.maintenance_summary ?? {}

  const statsByTab = {
    Overview: [
      { value: insp.total, label: 'Total Inspections' },
      { value: alertSum.critical_incidents, label: 'Critical Alerts' },
      { value: maint.non_compliant, label: 'Non-Compliant Farms' },
    ],
    Inspections: [
      { value: inspectionRecords.length, label: 'Completed / Scheduled Visits', onClick: () => selectStatusView('Inspections', 'all'), active: statusView.Inspections === 'all' },
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
      { value: maint.completed_this_month, label: 'Clean-outs in Period' },
      { value: maint.undetermined, label: 'Undetermined' },
      { value: maint.non_compliant, label: 'Non-Compliant Farms' },
    ],
    'Service Requests': [
      { value: serviceRecords.length, label: 'Completed / Scheduled Requests', onClick: () => selectStatusView('Service Requests', 'all'), active: statusView['Service Requests'] === 'all' },
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

        <Tabs tabs={TABS} active={tab} onChange={setTab} />
        <div className="rp-filter-toolbar">
          <p style={{ ...styles.filterNote, margin: 0 }}>{scopeLabelOf(fromDate, toDate)}</p>
          <div ref={filterRef} style={{ position: 'relative' }}>
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

          {tab !== 'Files' && (
            <div className="rp-stats">
              {statsByTab[tab].map(s => <StatCard key={s.label} {...s} />)}
            </div>
          )}
          {tab === 'Overview' && (
            <div className="rp-two">
              <Panel title="Inspections completed per month" subtitle={isRangeFiltered ? rangeLabel : 'All records'}>
                <MonthlyReportBarChart buckets={inspTrend} label="Completed inspections" emptyText="No completed inspections in this reporting period." />
              </Panel>
              <Panel title="Annual Maintenance Compliance" subtitle={`Compliant vs. Non-Compliant farms as of ${adminData.report_period?.status_as_of || 'today'}; one qualifying clean-out every 12 calendar months.`}>
                <AnnualMaintenanceComplianceChart compliant={maint.compliant} nonCompliant={maint.non_compliant} undetermined={maint.undetermined} />
              </Panel>
            </div>
          )}

          {tab === 'Inspections' && (
            <DataTable
                resetKey={`${fromDate}:${toDate}`}
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
              <Panel title="Alert incidents over time" subtitle={`${rangeLabel} · incidents by ${adminData.alert_trend?.aggregation || 'day'} triggered`}>
                <AlertIncidentChart series={adminData.alert_trend} />
              </Panel>

              <DataTable
                resetKey={`${fromDate}:${toDate}`}
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

              {maintView === 'Non-Compliant farms' && (
                <DataTable
                resetKey={`${fromDate}:${toDate}`}
                  title="Non-Compliant farms"
                  subtitle={`Manure clean-out status as of ${adminData.report_period?.status_as_of || 'today'}`}
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

          {tab === 'Service Requests' && (
            <DataTable
                resetKey={`${fromDate}:${toDate}`}
              title="Vet Service Request Records"
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
            <GeneratedReportsFilesTab fromDate={fromDate} toDate={toDate} />
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
