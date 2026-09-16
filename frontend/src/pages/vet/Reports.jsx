import { useEffect, useMemo, useRef, useState } from 'react'
import { Line, Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip,
} from 'chart.js'
import VetLayout from '../../components/VetLayout'
import ReportLetterhead from '../../components/ReportLetterhead'
import GeneratedReportsFilesTab from '../../components/GeneratedReportsFilesTab'
import VetGeneratedReportView from '../../components/VetGeneratedReportView'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { exportToCSV, exportPrintRefToPDF, todayStamp } from '../../utils/exportUtils'
import {
  C, styles, ReportStyles, PageHeader, Tabs, StatCard, Panel, DataTable, ChartFrame, Signatures,
  IconFilter, chartOptions, lineDataset, fmtDate, dayOf, makeInRange, rangeLabelOf, scopeLabelOf, monthlyBuckets,
  monthlyBucketsInRange, MONTH_NAMES, serviceTypeBadgeStyle, serviceTypeLabel, requestStatusBadgeStyle,
} from '../../components/ReportsLayout'
import ClearDateButton, { DateRangeHeader } from '../../components/ClearDateButton'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip)

const TABS = ['Overview', 'Service History', 'Files']

const BIRD_ESTIMATES = {
  'Small': 'Up to 2,000 birds',
  'Semi-Commercial': '2,001–10,000 birds',
  'Commercial': '10,001+ birds',
}

const CSV_COLUMNS = [
  { key: 'id', label: 'ID' }, { key: 'service_type', label: 'Type' }, { key: 'farm_name', label: 'Farm' },
  { key: 'owner_name', label: 'Owner' }, { key: 'barangay', label: 'Barangay' }, { key: 'est_birds', label: 'Est. birds' },
  { key: 'completed_at', label: 'Date' }, { key: 'notes', label: 'Notes' }, { key: 'status', label: 'Status' },
]

export default function VetReports() {
  const { data, loading, error, refetch } = useCachedFetch('/vet/reports')
  const printRef = useRef(null)

  // Tied to actual data refreshes only (initial load + each 30-minute
  // auto-refetch below) — never recomputed on every render, so it doesn't
  // silently creep forward just because the user opened a filter popover
  // or switched tabs. Computed during render (not in an effect) when `data`
  // changes reference, which only happens right after a fetch resolves.
  const [prevData, setPrevData] = useState(data)
  const [generatedAt, setGeneratedAt] = useState('')
  if (data !== prevData) {
    setPrevData(data)
    if (data) setGeneratedAt(new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' }))
  }

  const [tab, setTab] = useState('Overview')
  const [exportingPdf, setExportingPdf] = useState(false)
  const now = new Date()

  // From/To date-range filter — drives the Service History tab.
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

  const allServices = data?.completed_services ?? []
  const services = useMemo(() => allServices.filter(v => inRange(v.completed_at_raw)), [allServices, fromDate, toDate])

  const completedThisMonth = useMemo(() => {
    const n = new Date()
    const prefix = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
    return allServices.filter(v => dayOf(v.completed_at_raw).startsWith(prefix)).length
  }, [allServices])

  const isRangeFiltered = Boolean(fromDate || toDate)

  const monthlyTrend = useMemo(() => (
    isRangeFiltered
      ? monthlyBucketsInRange(services, 'completed_at_raw')
      : monthlyBuckets(allServices, 'completed_at_raw', null, null)
  ), [services, allServices, isRangeFiltered])

  const typeSplit = useMemo(() => {
    const counts = {}
    allServices.forEach(v => { counts[v.service_type] = (counts[v.service_type] || 0) + 1 })
    return Object.entries(counts).map(([label, count]) => ({ label, count }))
  }, [allServices])

  // Single centralized refresh mechanism for the whole Reports page: fetch the
  // latest data as soon as the page opens (never wait for the interval), then
  // re-fetch every 30 minutes. Filter changes never trigger a fetch — they
  // just re-filter the already-loaded dataset client-side (see useMemo above).
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

  const handlePrint = () => window.print()

  const handleExportPdf = async () => {
    setExportingPdf(true)
    try {
      await exportPrintRefToPDF(printRef, `AgriBantay_Vet_Report_${todayStamp()}.pdf`)
    } catch (err) {
      console.error('PDF export failed:', err)
      alert('Could not generate PDF. Please try again.')
    } finally {
      setExportingPdf(false)
    }
  }

  const handleExportCsv = () => {
    const rows = services.map(v => ({
      id: v.id,
      service_type: v.service_type,
      farm_name: v.farm_name,
      owner_name: v.owner_name,
      barangay: v.barangay,
      est_birds: BIRD_ESTIMATES[v.farm_size] || '—',
      completed_at: v.completed_at,
      notes: v.notes,
      status: v.status,
    }))
    exportToCSV(rows, CSV_COLUMNS, `AgriBantay_Vet_Report_${todayStamp()}.csv`)
  }

  if (loading || !data) return <VetLayout><p style={styles.stateText}>Loading...</p></VetLayout>
  if (error) return <VetLayout><p style={{ ...styles.stateText, color: C.red }}>{error}</p></VetLayout>

  const stats = tab === 'Overview'
    ? [
        { value: data.total_completed, label: 'Total Completed' },
        { value: data.farms_covered, label: 'Farms Covered' },
        { value: completedThisMonth, label: 'Completed This Month' },
      ]
    : [
        { value: data.total_completed, label: 'Total Completed' },
        { value: services.length, label: 'In Selected Range' },
        { value: data.farms_covered, label: 'Farms Covered' },
      ]

  return (
    <VetLayout>
      <ReportStyles />

      <div className="screen-view rp">
        <PageHeader
          title="Reports"
          subtitle="Vaccination and blood test history and records"
          onPrint={handlePrint}
          onCsv={handleExportCsv}
          onPdf={handleExportPdf}
          exportingPdf={exportingPdf}
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
              {stats.map(s => <StatCard key={s.label} {...s} />)}
            </div>
          )}

          {tab === 'Overview' && (
            <div className="rp-two">
              <Panel title="Vaccinations and blood tests per month" subtitle={isRangeFiltered ? rangeLabel : 'Last 6 months'}>
                {monthlyTrend.every(m => m.count === 0) ? (
                  <div style={styles.empty}>No service history yet.</div>
                ) : (
                  <ChartFrame>
                    <Line
                      data={{ labels: monthlyTrend.map(m => m.label), datasets: [lineDataset(monthlyTrend.map(m => m.count), C.green)] }}
                      options={chartOptions}
                    />
                  </ChartFrame>
                )}
              </Panel>

              <Panel title="Services by type" subtitle="All-time completed count">
                {typeSplit.length === 0 ? (
                  <div style={styles.empty}>No service history yet.</div>
                ) : (
                  <ChartFrame>
                    <Bar
                      data={{
                        labels: typeSplit.map(t => t.label),
                        datasets: [{ data: typeSplit.map(t => t.count), backgroundColor: [C.green, C.card, C.greenDeep], borderRadius: 3, maxBarThickness: 110 }],
                      }}
                      options={chartOptions}
                    />
                  </ChartFrame>
                )}
              </Panel>
            </div>
          )}

          {tab === 'Service History' && (
            <DataTable
              title="Completed vaccinations and blood tests"
              subtitle={rangeLabel}
              columns={['ID', 'Type', 'Farm', 'Owner', 'Barangay', 'Date', 'Notes', 'Status']}
              emptyText="No completed services in this range."
              minWidth="820px"
              rows={services.map(v => [
                { text: v.id },
                { text: serviceTypeLabel(v.service_type), badgeStyle: serviceTypeBadgeStyle(v.service_type), dot: false },
                { text: v.farm_name },
                { text: v.owner_name },
                { text: v.barangay },
                { text: fmtDate(v.completed_at) },
                { text: v.notes || '—' },
                { text: v.status, badgeStyle: requestStatusBadgeStyle(v.status), dot: false },
              ])}
            />
          )}

          {tab === 'Files' && (
            <GeneratedReportsFilesTab
              appliedMonth={filesMonth}
              appliedYear={filesYear}
              basePath="/vet/generated-reports"
              ReportView={VetGeneratedReportView}
            />
          )}

          {tab !== 'Files' && (
            <p style={styles.footNote}>
              Generated {generatedAt}
            </p>
          )}
        </div>
      </div>

      <div className="print-view" ref={printRef}>
        <ReportLetterhead />
        <h1 style={styles.printHead}>AgriBantay Vet Service Report</h1>
        <p style={styles.printSub}>Vaccination and blood test history and records</p>
        <p style={styles.printSub}>Period: {rangeLabel}</p>
        <p style={styles.printMeta}>Generated {generatedAt}</p>

        <div className="print-section-title">Summary</div>
        <table className="print-table">
          <tbody>
            <tr><th>Total completed</th><td>{data.total_completed}</td></tr>
            <tr><th>Farms covered</th><td>{data.farms_covered}</td></tr>
            <tr><th>Completed this month</th><td>{completedThisMonth}</td></tr>
          </tbody>
        </table>

        <div className="print-section-title">Completed vaccinations and blood tests — {rangeLabel}</div>
        {services.length === 0 ? (
          <p style={{ fontSize: 12 }}>No completed services in this range.</p>
        ) : (
          <table className="print-table">
            <thead>
              <tr><th>ID</th><th>Type</th><th>Farm</th><th>Owner</th><th>Barangay</th><th>Est. birds</th><th>Date</th><th>Notes</th><th>Status</th></tr>
            </thead>
            <tbody>
              {services.map(v => (
                <tr key={v.id}>
                  <td>{v.id}</td><td>{v.service_type}</td><td>{v.farm_name}</td><td>{v.owner_name}</td>
                  <td>{v.barangay}</td><td>{BIRD_ESTIMATES[v.farm_size] || '—'}</td>
                  <td>{fmtDate(v.completed_at)}</td><td>{v.notes}</td><td>{v.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <Signatures right={data.vet_name || 'Municipal Veterinarian'} />
      </div>
    </VetLayout>
  )
}