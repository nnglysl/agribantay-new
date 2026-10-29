import MonthlyReportBarChart from '../../components/MonthlyReportBarChart'
import TableScroll from '../../components/TableScroll'
import { matchesReportPeriod } from '../../utils/reportPeriod'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip,
} from 'chart.js'
import VetLayout from '../../components/VetLayout'
import ReportLetterhead from '../../components/ReportLetterhead'
import GeneratedReportsFilesTab from '../../components/GeneratedReportsFilesTab'
import VetGeneratedReportView from '../../components/VetGeneratedReportView'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useReportPeriod } from '../../hooks/useReportPeriod'
import ReportPeriodFields from '../../components/ReportPeriodFields'
import { exportToCSV, exportPrintRefToPDF, todayStamp } from '../../utils/exportUtils'
import {
  C, styles, ReportStyles, PageHeader, Tabs, StatCard, Panel, DataTable, ChartFrame, Signatures,
  IconFilter, chartOptions, fmtDate, makeInRange, rangeLabelOf, scopeLabelOf,
  monthlyBucketsInRange, serviceTypeBadgeStyle, serviceTypeLabel, requestStatusBadgeStyle,
} from '../../components/ReportsLayout'
import { DISPLAY_TIME_ZONE } from '../../utils/formatDate'
import { SkeletonStatCards, SkeletonBlock } from '../../components/Loading'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip)

const TABS = ['Overview', 'Service History', 'Files']

const BIRD_ESTIMATES = {
  'Small': 'Up to 2,000 birds',
  'Semi-Commercial': '2,001–10,000 birds',
  'Commercial': '10,001+ birds',
}

const CSV_COLUMNS = [
  { key: 'id', label: 'Request No.' }, { key: 'service_type', label: 'Type' }, { key: 'farm_name', label: 'Farm' },
  { key: 'owner_name', label: 'Owner' }, { key: 'barangay', label: 'Barangay' }, { key: 'est_birds', label: 'Est. birds' },
  { key: 'completed_at', label: 'Date' }, { key: 'notes', label: 'Notes' }, { key: 'status', label: 'Status' },
]

export default function VetReports() {
  const { fromDate, toDate, draftPeriod, setDraftPeriod, periodError, openPeriod, applyPeriod, clearPeriod } = useReportPeriod()
  const reportParams = useMemo(() => ({ ...(fromDate ? { from: fromDate } : {}), ...(toDate ? { to: toDate } : {}) }), [fromDate, toDate])
  const { data, loading, error, refetch } = useCachedFetch('/vet/reports', reportParams)

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
    if (data) setGeneratedAt(new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short', timeZone: DISPLAY_TIME_ZONE }))
  }

  const [tab, setTab] = useState('Overview')
  const [exportingPdf, setExportingPdf] = useState(false)

  // From/To date-range filter — drives the Service History tab.

  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef(null)


  const inRange = makeInRange(fromDate, toDate)
  const rangeLabel = rangeLabelOf(fromDate, toDate)

  const allServices = data?.completed_services ?? []
  const services = useMemo(() => allServices.filter(v => inRange(v.completed_at_raw)), [allServices, fromDate, toDate])

  const isRangeFiltered = Boolean(fromDate || toDate)

  const monthlyTrend = useMemo(() => (
    isRangeFiltered
      ? monthlyBucketsInRange(services, 'completed_at_raw')
      : monthlyBucketsInRange(allServices, 'completed_at_raw')
  ), [services, allServices, isRangeFiltered])

  const typeSplit = useMemo(() => {
    const counts = {}
    allServices.forEach(v => { counts[v.service_type] = (counts[v.service_type] || 0) + 1 })
    return Object.entries(counts).map(([label, count]) => ({ label, count }))
  }, [allServices])

  // Single centralized refresh mechanism for the whole Reports page: fetch the
  // latest data as soon as the page opens (never wait for the interval), then
  // re-fetch every 30 minutes. Filter changes fetch server-scoped statistics and records.
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

  if (error) return <VetLayout><p style={{ ...styles.stateText, color: C.red }}>{error}</p></VetLayout>
  if (loading || !matchesReportPeriod(data, fromDate, toDate)) return <VetLayout><SkeletonStatCards count={4} /><SkeletonBlock height={260} style={{ marginBottom: '20px' }} /><SkeletonBlock height={260} /></VetLayout>

  const stats = tab === 'Overview'
    ? [
        { value: data.total_completed, label: 'Total Completed' },
        { value: data.farms_covered, label: 'Farms Covered' },
        { value: data.total_pending, label: 'Pending in Period' },
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
          subtitle="Farm biosecurity and blood test history and records"
          onPrint={handlePrint}
          onCsv={handleExportCsv}
          onPdf={handleExportPdf}
          exportingPdf={exportingPdf}
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
              {stats.map(s => <StatCard key={s.label} {...s} />)}
            </div>
          )}

          {tab === 'Overview' && (
            <div className="rp-two">
              <Panel title="Veterinary services per month" subtitle={isRangeFiltered ? rangeLabel : 'All records'}>
                {monthlyTrend.every(m => m.count === 0) ? (
                  <div style={styles.empty}>No service history yet.</div>
                ) : (
                  <MonthlyReportBarChart buckets={monthlyTrend} label="Completed veterinary services" emptyText="No service history yet." />
                )}
              </Panel>

              <Panel title="Services by type" subtitle={rangeLabel}>
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
              title="Completed veterinary services"
              subtitle={rangeLabel}
              columns={['Request No.', 'Type', 'Farm', 'Owner', 'Barangay', 'Date', 'Notes', 'Status']}
              emptyText="No completed services in this range."
              minWidth="880px"
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
              fromDate={fromDate}
              toDate={toDate}
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
        <div className="print-headblock">
          <ReportLetterhead />
          <h1 style={styles.printHead}>AgriBantay Vet Service Report</h1>
          <p style={styles.printSub}>Farm biosecurity and blood test history and records</p>
          <p style={styles.printSub}>Reporting period: {rangeLabel}</p>
          <p style={styles.printMeta}>Generated {generatedAt}</p>
        </div>

        <div className="print-section-title">
          Summary <span className="print-scope">(selected range; your own accepted services)</span>
        </div>
        <TableScroll hint={false}>
        <table className="print-table print-kv">
          <tbody>
            <tr><th>Total completed</th><td>{data.total_completed}</td></tr>
            <tr><th>Farms covered</th><td>{data.farms_covered}</td></tr>
            <tr><th>Pending in period</th><td>{data.total_pending}</td></tr>
          </tbody>
        </table>
        </TableScroll>

        <div className="print-section-title">Completed veterinary services — {rangeLabel}</div>
        {services.length === 0 ? (
          <p className="print-empty">No completed services in this range.</p>
        ) : (
          <TableScroll hint={false}>
          <table className="print-table">
            <colgroup>
              <col style={{ width: '5%' }} /><col style={{ width: '13%' }} /><col style={{ width: '13%' }} />
              <col style={{ width: '12%' }} /><col style={{ width: '11%' }} /><col style={{ width: '11%' }} />
              <col style={{ width: '10%' }} /><col style={{ width: '16%' }} /><col style={{ width: '9%' }} />
            </colgroup>
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
          </TableScroll>
        )}

        <Signatures right={data.vet_name || 'Municipal Veterinarian'} />
      </div>
    </VetLayout>
  )
}
