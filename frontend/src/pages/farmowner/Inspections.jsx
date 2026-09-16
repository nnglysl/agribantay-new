import { useState } from 'react'
import FarmerLayout from '../../components/FarmerLayout'
import SharedPagination from '../../components/Pagination'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useSelectedFarm } from '../../hooks/useSelectedFarm'
import { viewModalStyles as v } from '../../styles/viewModalStyles'
import { formatDate as formatDateFull, isWithinLocalDateRange } from '../../utils/formatDate'
import { useIsMobile } from '../../hooks/useIsMobile'
import FilterPopover from '../../components/FilterPopover'
import { filterStyles } from '../../styles/filterStyles'
import ClearDateButton, { DateRangeHeader } from '../../components/ClearDateButton'

const responsiveCss = `
  .insp-tabs {
    display: flex;
    gap: 28px;
    border-bottom: 1px solid #e7e8e0;
    margin-bottom: 20px;
    overflow-x: auto;
  }
  .insp-tab-btn {
    background: none;
    border: none;
    padding: 0 2px 12px;
    font-family: 'Inter', sans-serif;
    font-size: 14px;
    font-weight: 700;
    color: #8a968d;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    white-space: nowrap;
  }
  .insp-tab-btn.active {
    color: #1B4332;
    border-bottom-color: #1B4332;
  }

  .insp-table-wrap {
    width: 100%;
    overflow-x: auto;
    margin-top: 14px;
    border: 1px solid #eceee7;
    border-radius: 10px;
  }
  .insp-table {
    width: 100%;
    border-collapse: collapse;
    min-width: 620px;
  }

  .insp-pagination {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 16px;
    padding-top: 14px;
    border-top: 1px solid #f0efe8;
  }
`

const RECENT_LIMIT = 10

function statusBadgeStyle(status) {
  if (status === 'Scheduled') return { backgroundColor: '#e9eef6', color: '#2f5fa0' }
  if (status === 'Completed') return { backgroundColor: '#eaf3ec', color: '#256b3d' }
  if (status === 'Cancelled') return { backgroundColor: '#eef0ea', color: '#6b7770' }
  return { backgroundColor: '#eef0ea', color: '#6b7770' }
}

function formatDateTime(value) {
  if (!value) return '—'
  const d = new Date(value)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function Inspections() {
  const { selectedFarmId, farmsLoading } = useSelectedFarm()
  const { data, loading } = useCachedFetch(selectedFarmId ? '/farmer/inspections' : null, { farm_id: selectedFarmId }, { pollMs: 45000 })
  const [activeTab, setActiveTab] = useState('upcoming') // 'upcoming' | 'past'
  const [viewInspection, setViewInspection] = useState(null)
  const isMobile = useIsMobile()

  // From/To (scheduled date, inclusive local calendar dates) + Inspection
  // Type. Upcoming/Past tabs already split by status, so no Status filter;
  // the page is scoped to one farm, so no Farm filter.
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [draftFrom, setDraftFrom] = useState('')
  const [draftTo, setDraftTo] = useState('')
  const [draftType, setDraftType] = useState('')

  const openFilter = () => { setDraftFrom(fromDate); setDraftTo(toDate); setDraftType(typeFilter) }
  const applyFilter = () => { setFromDate(draftFrom); setToDate(draftTo); setTypeFilter(draftType) }
  const resetFilter = () => { setDraftFrom(''); setDraftTo(''); setDraftType('') }
  // One-click Clear Date: clears draft + applied dates immediately; the type
  // filter is untouched.
  const clearDates = () => { setDraftFrom(''); setDraftTo(''); setFromDate(''); setToDate('') }
  const hasDate = !!(draftFrom || draftTo || fromDate || toDate)
  const activeFilterCount = (fromDate || toDate ? 1 : 0) + (typeFilter ? 1 : 0)

  if (farmsLoading || loading || !data) return <FarmerLayout><p style={styles.stateText}>Loading...</p></FarmerLayout>

  const matches = (i) =>
    isWithinLocalDateRange(i.scheduled_at, fromDate, toDate) &&
    (!typeFilter || i.inspection_type === typeFilter)

  const upcoming = (data?.upcoming || []).filter(matches).slice(0, RECENT_LIMIT)
  const past = (data?.past || []).filter(matches).slice(0, RECENT_LIMIT)
  const list = activeTab === 'upcoming' ? upcoming : past
  const isFiltered = activeFilterCount > 0

  return (
    <FarmerLayout>
      <style>{responsiveCss}</style>

      <h1 style={styles.title}>Inspections</h1>
      <p style={styles.subtitle}>
        See when the LGU has scheduled a farm inspection.
      </p>

      <div style={styles.tabsRow}>
        <div className="insp-tabs" style={{ marginBottom: 0, borderBottom: 'none', flex: 1 }}>
        <button
          className={`insp-tab-btn ${activeTab === 'upcoming' ? 'active' : ''}`}
          onClick={() => setActiveTab('upcoming')}
        >
          Upcoming ({upcoming.length})
        </button>
        <button
          className={`insp-tab-btn ${activeTab === 'past' ? 'active' : ''}`}
          onClick={() => setActiveTab('past')}
        >
          Past Inspections
        </button>
        </div>

        <FilterPopover activeCount={activeFilterCount} onOpen={openFilter} onReset={resetFilter} onApply={applyFilter} isMobile={isMobile}>
          <DateRangeHeader>
            <label style={filterStyles.filterLabel}>From Date</label>
            <ClearDateButton visible={hasDate} onClick={clearDates} />
          </DateRangeHeader>
          <input type="date" value={draftFrom} onChange={e => setDraftFrom(e.target.value)} style={filterStyles.filterSelect} />

          <label style={filterStyles.filterLabel}>To Date</label>
          <input type="date" value={draftTo} onChange={e => setDraftTo(e.target.value)} style={filterStyles.filterSelect} />

          <label style={filterStyles.filterLabel}>Inspection Type</label>
          <select value={draftType} onChange={e => setDraftType(e.target.value)} style={filterStyles.filterSelect}>
            <option value="">All Types</option>
            <option value="General Inspection">General Inspection</option>
            <option value="Follow-up">Follow-up Inspection</option>
          </select>
        </FilterPopover>
      </div>

      <section style={styles.card}>
        {list.length > 0 ? (
          <>
            <div className="insp-table-wrap">
              <table className="insp-table" style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Inspection #</th>
                    <th style={styles.th}>Type</th>
                    <th style={styles.th}>Scheduled Date</th>
                    <th style={styles.th}>Status</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map(i => (
                    <tr key={i.id}>
                      <td style={styles.tdStrong}>{i.inspection_number}</td>
                      <td style={styles.td}>{i.inspection_type}</td>
                      <td style={styles.td}>{formatDateTime(i.scheduled_at)}</td>
                      <td style={styles.td}>
                        <span style={{ ...styles.badge, ...statusBadgeStyle(i.status) }}>{i.status}</span>
                      </td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>
                        <span style={styles.viewBtn} onClick={() => setViewInspection(i)}>View</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="insp-pagination">
              <span style={styles.paginationText}>
                Showing 1–{list.length} of {list.length}
              </span>
              <div style={styles.pagerBtns}>
                <select value={RECENT_LIMIT} disabled style={styles.pageSizeSelect}>
                  <option value={RECENT_LIMIT}>{RECENT_LIMIT} / page</option>
                </select>
                <SharedPagination currentPage={1} totalPages={1} onPageChange={() => {}} />
              </div>
            </div>
          </>
        ) : (
          <p style={styles.emptyText}>
            {isFiltered
              ? 'No inspections match your filter.'
              : activeTab === 'upcoming' ? 'No upcoming inspections scheduled.' : 'No past inspections yet.'}
          </p>
        )}
      </section>

      {viewInspection && (
        <InspectionDetailModal inspection={viewInspection} onClose={() => setViewInspection(null)} />
      )}
    </FarmerLayout>
  )
}

function InspectionDetailModal({ inspection, onClose }) {
  const fieldRows = [
    { label: 'Inspection Type', value: inspection.inspection_type },
    { label: 'Scheduled Date', value: formatDateTime(inspection.scheduled_at) },
    { label: 'Scheduled By', value: inspection.scheduled_by },
    { label: 'Status', value: inspection.status },
    ...(inspection.reschedule_reason
      ? [{ label: 'Reschedule Reason', value: inspection.reschedule_reason }]
      : []),
    ...(inspection.status === 'Completed'
      ? [{ label: 'Completed Date', value: inspection.completed_at ? formatDateFull(inspection.completed_at) : '—' }]
      : []),
  ]

  return (
    <div style={v.overlay} onClick={onClose}>
      <div style={v.modal} onClick={e => e.stopPropagation()}>
        <div style={v.header}>
          <div style={v.headerTitleRow}>
            <h3 style={v.title}>{inspection.inspection_number}</h3>
            <span style={{ ...v.badge, ...statusBadgeStyle(inspection.status) }}>{inspection.status}</span>
          </div>
          <span style={v.close} onClick={onClose}>×</span>
        </div>

        <span style={v.sectionLabel}>Inspection Details</span>
        <div style={v.grid}>
          {fieldRows.map(r => (
            <div key={r.label} style={v.fieldBox}>
              <div style={v.fieldLabel}>{r.label}</div>
              <div style={v.fieldValue}>{r.value ?? '—'}</div>
            </div>
          ))}
        </div>

        {(inspection.findings || inspection.notes) && (
          <>
            <span style={v.sectionLabel}>Notes / Findings</span>
            <div style={v.notesBox}>
              <p style={v.notes}>{inspection.findings || inspection.notes}</p>
            </div>
          </>
        )}

        <div style={v.actions}>
          <button onClick={onClose} style={v.closeBtn}>Close</button>
        </div>
      </div>
    </div>
  )
}

const SANS = "'Inter', sans-serif"

const styles = {
  stateText: { fontFamily: SANS, fontSize: '14px', color: '#4b5a50' },

  tabsRow: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px', borderBottom: '1px solid #e7e8e0', marginBottom: '20px', flexWrap: 'wrap' },
  title: { fontSize: '25px', fontWeight: 800, letterSpacing: '-0.01em', color: '#16311d', margin: 0, fontFamily: SANS },
  subtitle: { fontSize: '14px', color: '#6b7770', marginTop: '5px', marginBottom: '22px', fontFamily: SANS, lineHeight: 1.6 },

  card: {
    background: '#fff',
    border: '1px solid #e7e8e0',
    borderRadius: '14px',
    padding: '22px',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: SANS,
  },

  emptyText: { fontSize: '13px', color: '#9aa79d', fontStyle: 'italic', margin: 0 },

  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'left', padding: '10px 14px', fontSize: '13px', fontWeight: 600, color: '#8a968d',
    borderBottom: '1px solid #eceee7',
    backgroundColor: '#fafbf8', whiteSpace: 'nowrap',
  },
  td: { padding: '11px 14px', fontSize: '12px', color: '#4b5a50', borderBottom: '1px solid #f2f3ed', verticalAlign: 'top' },
  tdStrong: { padding: '11px 14px', fontSize: '12px', fontWeight: 700, color: '#16311d', borderBottom: '1px solid #f2f3ed', verticalAlign: 'top', whiteSpace: 'nowrap' },

  badge: { display: 'inline-flex', alignItems: 'center', padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap' },

  viewBtn: {
    display: 'inline-block', padding: '6px 13px', borderRadius: '8px',
    fontSize: '12.5px', fontWeight: 600, cursor: 'pointer',
    border: '1px solid #e3e6dd', backgroundColor: '#fff', color: '#4b5a50', whiteSpace: 'nowrap',
  },

  paginationText: { fontSize: '12px', color: '#8a968d', whiteSpace: 'nowrap', fontFamily: SANS },
  pagerBtns: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
  pageSizeSelect: {
    padding: '6px 10px', borderRadius: '8px', border: '1px solid #dcdfd6',
    fontSize: '12px', color: '#4b5a50', marginRight: '6px', fontFamily: SANS, backgroundColor: '#fff',
  },
  pagerBtn: {
    minWidth: '30px', height: '30px', padding: '0 6px', borderRadius: '8px',
    border: '1px solid #dcdfd6', backgroundColor: '#fff', color: '#4b5a50',
    fontSize: '13px', fontFamily: SANS, opacity: 0.4, cursor: 'not-allowed',
  },
  pagerBtnActive: {
    minWidth: '30px', height: '30px', padding: '0 6px', borderRadius: '8px',
    border: '1px solid #2c8047', backgroundColor: '#2c8047', color: '#fff',
    fontSize: '12.5px', fontWeight: 600, fontFamily: SANS, cursor: 'default',
  },
}
