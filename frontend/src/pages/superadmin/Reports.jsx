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
  monthlyBucketsInRange, MONTH_NAMES, serviceTypeBadgeStyle, serviceTypeLabel, requestStatusBadgeStyle,
} from '../../components/ReportsLayout'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip)

const TABS = ['Overview', 'Inspections', 'Service Requests', 'Files']

export default function SuperAdminReports() {
  const { data: adminData, loading: adminLoading, error: adminError, refetch: refetchAdmin } = useCachedFetch('/admin/reports')
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
    if (adminData && vetData) setGeneratedAt(new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' }))
  }

  const [tab, setTab] = useState('Overview')
  const now = new Date()

  // From/To date-range filter — drives the record-listing tabs (Overview,
  // Inspections, Service Requests).
  const [draftFrom, setDraftFrom] = useState('')
  const [draftTo, setDraftTo] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

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

  const allInspections = adminData?.completed_inspections ?? []
  const allAdminServices = adminData?.completed_services ?? []
  const allVetServices = vetData?.completed_services ?? []

  const inspections = useMemo(() => allInspections.filter(r => inRange(r.completed_at_raw)), [allInspections, fromDate, toDate])
  const adminServices = useMemo(() => allAdminServices.filter(r => inRange(r.completed_at_raw)), [allAdminServices, fromDate, toDate])
  const vetServices = useMemo(() => allVetServices.filter(r => inRange(r.completed_at_raw)), [allVetServices, fromDate, toDate])

  const combinedServices = useMemo(() => [
    ...adminServices.map(s => ({ ...s, handled_by: 'LGU Admin' })),
    ...vetServices.map(v => ({ ...v, handled_by: v.vet_name || '—' })),
  ], [adminServices, vetServices])

  const isRangeFiltered = Boolean(fromDate || toDate)

  const inspTrend = useMemo(() => (
    isRangeFiltered
      ? monthlyBucketsInRange(inspections, 'completed_at_raw')
      : monthlyBuckets(allInspections, 'completed_at_raw', null, null)
  ), [inspections, allInspections, isRangeFiltered])

  const vetTrend = useMemo(() => (
    isRangeFiltered
      ? monthlyBucketsInRange(vetServices, 'completed_at_raw')
      : monthlyBuckets(allVetServices, 'completed_at_raw', null, null)
  ), [vetServices, allVetServices, isRangeFiltered])

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
                      <label style={styles.filterPopLabel}>From</label>
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
              <Panel title="Vet services per month" subtitle={isRangeFiltered ? `Vaccinations and blood tests · ${rangeLabel}` : 'Vaccinations and blood tests · last 6 months'}>
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
                { text: serviceTypeLabel(s.service_type), badgeStyle: serviceTypeBadgeStyle(s.service_type), dot: false },
                { text: s.farm_name },
                { text: s.owner_name },
                { text: s.barangay },
                { text: s.handled_by },
                { text: fmtDate(s.completed_at) },
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
