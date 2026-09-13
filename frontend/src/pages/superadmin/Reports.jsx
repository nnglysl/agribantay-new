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
  IconFilter, chartOptions, lineDataset, fmtDate, makeInRange, rangeLabelOf, monthlyBuckets,
  monthBounds, MONTH_NAMES,
} from '../../components/ReportsLayout'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip)

const TABS = ['Overview', 'Inspections', 'Service Requests', 'Files']

export default function SuperAdminReports() {
  const { data: adminData, loading: adminLoading, error: adminError } = useCachedFetch('/admin/reports')
  const { data: vetData, loading: vetLoading, error: vetError } = useCachedFetch('/vet/reports')

  const [tab, setTab] = useState('Overview')
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

  const allInspections = adminData?.completed_inspections ?? []
  const allAdminServices = adminData?.completed_services ?? []
  const allVetServices = vetData?.completed_services ?? []

  const inspections = useMemo(() => allInspections.filter(r => inRange(r.completed_at_raw)), [allInspections, from, to])
  const adminServices = useMemo(() => allAdminServices.filter(r => inRange(r.completed_at_raw)), [allAdminServices, from, to])
  const vetServices = useMemo(() => allVetServices.filter(r => inRange(r.completed_at_raw)), [allVetServices, from, to])

  const combinedServices = useMemo(() => [
    ...adminServices.map(s => ({ ...s, handled_by: 'LGU Admin' })),
    ...vetServices.map(v => ({ ...v, handled_by: v.vet_name || '—' })),
  ], [adminServices, vetServices])

  const inspTrend = useMemo(() => monthlyBuckets(allInspections, 'completed_at_raw', appliedMonth, appliedYear), [allInspections, appliedMonth, appliedYear])
  const vetTrend = useMemo(() => monthlyBuckets(allVetServices, 'completed_at_raw', appliedMonth, appliedYear), [allVetServices, appliedMonth, appliedYear])

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

  if (adminLoading || vetLoading || !adminData || !vetData) return <AdminLayout><p style={styles.stateText}>Loading...</p></AdminLayout>
  if (adminError) return <AdminLayout><p style={{ ...styles.stateText, color: C.red }}>{adminError}</p></AdminLayout>
  if (vetError) return <AdminLayout><p style={{ ...styles.stateText, color: C.red }}>{vetError}</p></AdminLayout>

  const insp = adminData.inspection_summary ?? {}
  const alertSum = adminData.alert_summary ?? {}
  const svc = adminData.service_summary ?? {}

  const statsByTab = {
    Overview: [
      { value: insp.total, label: 'Total Inspections' },
      { value: insp.completed, label: 'Completed Inspections' },
      { value: alertSum.critical_alerts, label: 'Critical Alerts' },
      { value: svc.total, label: 'Total Service Requests' },
      { value: vetData.total_completed, label: 'Vet Services Completed' },
    ],
    Inspections: [
      { value: insp.total, label: 'Total Inspections' },
      { value: insp.completed, label: 'Completed' },
      { value: insp.scheduled, label: 'Scheduled' },
    ],
    'Service Requests': [
      { value: svc.total + vetData.total_completed + vetData.total_pending, label: 'Total Requests' },
      { value: svc.completed + vetData.total_completed, label: 'Completed' },
      { value: svc.pending + vetData.total_pending, label: 'Pending' },
    ],
  }

  const generatedAt = new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' })

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
                    data={{ labels: inspTrend.map(m => m.label), datasets: [lineDataset(inspTrend.map(m => m.count), C.green)] }}
                    options={chartOptions}
                  />
                </ChartFrame>
              </Panel>
              <Panel title="Vet services per month" subtitle="Vaccinations and blood tests · last 6 months">
                <ChartFrame>
                  <Bar
                    data={{
                      labels: vetTrend.map(m => m.label),
                      datasets: [{ data: vetTrend.map(m => m.count), backgroundColor: C.card, borderRadius: 3, maxBarThickness: 46 }],
                    }}
                    options={chartOptions}
                  />
                </ChartFrame>
              </Panel>
            </div>
          )}

          {tab === 'Inspections' && (
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
                { text: i.status || 'Completed', tone: 'green', dot: false },
              ])}
            />
          )}

          {tab === 'Service Requests' && (
            <DataTable
              title="Completed service requests"
              subtitle={rangeLabel}
              columns={['ID', 'Type', 'Farm', 'Owner', 'Barangay', 'Handled By', 'Date', 'Status']}
              emptyText="No completed service requests in this range."
              minWidth="780px"
              rows={combinedServices.map(s => [
                { text: s.id },
                { text: s.service_type, strong: true },
                { text: s.farm_name },
                { text: s.owner_name },
                { text: s.barangay },
                { text: s.handled_by },
                { text: fmtDate(s.completed_at) },
                { text: s.status, tone: 'green', dot: false },
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
