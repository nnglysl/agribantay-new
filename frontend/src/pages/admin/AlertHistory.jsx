import { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import AdminLayout from '../../components/AdminLayout'
import SharedPagination from '../../components/Pagination'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { LIVE_POLL_MS } from '../../constants/polling'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useOverflowX } from '../../hooks/useOverflowX'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { SkeletonTable } from '../../components/Loading'

const PAGE_SIZE_OPTIONS = [10, 25, 50]
// Only the metrics that actually raise alerts. Temperature and humidity are
// advisory — config/sensors.php 'alerting_metrics' is the source of truth and
// lists ammonia and moisture, so no alert_history row can ever carry the other
// two and offering them only produced filters that always came back empty.
// Their READINGS are untouched; this is the filter list, not the data.
const SENSOR_TYPES = ['Ammonia', 'Moisture']
const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest Triggered First' },
  { value: 'oldest', label: 'Oldest Triggered First' },
]

export default function AlertHistory() {
  const [severityFilter, setSeverityFilter] = useState('') // '' | 'Warning' | 'Critical'
  const [sensorFilter, setSensorFilter] = useState('')
  const [houseFilter, setHouseFilter] = useState('')
  const [farmFilter, setFarmFilter] = useState('')
  const [barangayFilter, setBarangayFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('') // '' | 'Ongoing' | 'Resolved'
  const [sortMode, setSortMode] = useState('newest')
  // Deep links (e.g. from a Super Admin dashboard notification) can preset
  // the tab and search via ?tab= / ?search= so the relevant record is in view.
  const [searchParams] = useSearchParams()
  const [search, setSearch] = useState(() => searchParams.get('search') || '')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const isMobile = useIsMobile()
  const [tableScrollRef, tableOverflows] = useOverflowX()

  const [filterOpen, setFilterOpen] = useState(false)
  const [draftSeverity, setDraftSeverity] = useState(severityFilter)
  const [draftSensor, setDraftSensor] = useState(sensorFilter)
  const [draftHouse, setDraftHouse] = useState('')
  const [draftFarm, setDraftFarm] = useState('')
  const [draftBarangay, setDraftBarangay] = useState('')
  // Typed text for the searchable Farm picker, kept apart from the chosen id.
  const [farmQuery, setFarmQuery] = useState('')
  const [draftStatus, setDraftStatus] = useState(statusFilter)
  const [draftSort, setDraftSort] = useState(sortMode)
  const filterRef = useRef(null)

  useEffect(() => {
    if (!filterOpen) return
    const handleClickOutside = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [filterOpen])

  const openFilter = () => {
    setDraftSeverity(severityFilter)
    setDraftSensor(sensorFilter)
    setDraftHouse(houseFilter)
    setDraftFarm(farmFilter)
    setDraftBarangay(barangayFilter)
    setFarmQuery('')
    setDraftStatus(statusFilter)
    setDraftSort(sortMode)
    setFilterOpen(true)
  }

  const applyFilter = () => {
    setSeverityFilter(draftSeverity)
    setSensorFilter(draftSensor)
    setHouseFilter(draftHouse)
    setFarmFilter(draftFarm)
    setBarangayFilter(draftBarangay)
    setStatusFilter(draftStatus)
    setSortMode(draftSort)
    setFilterOpen(false)
  }

  const resetFilter = () => {
    setDraftSeverity('')
    setDraftSensor('')
    setDraftHouse('')
    setDraftFarm('')
    setDraftBarangay('')
    setFarmQuery('')
    setDraftStatus('')
    setDraftSort('newest')
  }

  const activeFilterCount = (severityFilter ? 1 : 0) + (sensorFilter ? 1 : 0) + (houseFilter ? 1 : 0) + (farmFilter ? 1 : 0) + (barangayFilter ? 1 : 0) + (statusFilter ? 1 : 0) + (sortMode !== 'newest' ? 1 : 0)

  const params = {}
  if (severityFilter) params.status = severityFilter
  if (sensorFilter) params.sensor_type = sensorFilter
  if (houseFilter) params.sensor_id = houseFilter
  if (farmFilter) params.farm_id = farmFilter
  if (barangayFilter) params.barangay = barangayFilter
  // Ongoing / Resolved — distinct from `status`, which the backend already
  // uses for severity (Warning / Critical).
  if (statusFilter) params.alert_status = statusFilter
  // Debounced so typing doesn't fire a request per keystroke.
  const debouncedSearch = useDebouncedValue(search)
  if (debouncedSearch) params.search = debouncedSearch

  const { data: history, loading, error } = useCachedFetch('/admin/alert-history', params, { pollMs: LIVE_POLL_MS })

  // Populates the House filter. Every registered unit, not just the ones that
  // happen to appear in the current page of results — filtering to a quiet
  // house (no alerts at all) is a legitimate way to confirm it is fine.
  const { data: allSensors } = useCachedFetch('/admin/sensors')
  const houseOptions = allSensors || []

  // Populates the Farm filter. This endpoint is paginated for some roles and
  // a plain array for others, so accept either shape rather than guessing.
  const { data: allFarms } = useCachedFetch('/admin/farms')
  // Memoised so the derived lists below do not see a brand-new array on every
  // render and recompute for nothing.
  const farmOptions = useMemo(
    () => (Array.isArray(allFarms) ? allFarms : (allFarms?.data ?? [])),
    [allFarms]
  )

  // Barangays come from the farm records themselves — never a fixed list.
  // Taken from every registered farm rather than only those with alerts, for
  // the same reason the House filter lists quiet units: narrowing to a
  // barangay and seeing nothing is a legitimate way to confirm it is clear.
  const barangayOptions = useMemo(
    () => [...new Set(farmOptions.map(f => f.barangay).filter(Boolean))].sort(),
    [farmOptions]
  )

  // Suggestions for the typeable Farm picker. Filtered locally; the farm list
  // is already loaded, so typing costs no request.
  //
  // Empty box means no list. This sits inside a narrow filter popover with
  // five other controls, and opening with every farm already listed pushed
  // the rest of them out of view for a filter the user may not even want.
  // The list is an answer to what was typed, not a permanent menu.
  const farmSuggestions = useMemo(() => {
    const q = farmQuery.trim().toLowerCase()
    if (!q) return []
    return farmOptions.filter(f =>
      (f.farm_name || '').toLowerCase().includes(q) ||
      (f.owner_name || '').toLowerCase().includes(q)
    )
  }, [farmOptions, farmQuery])

  const selectedFarm = farmOptions.find(f => String(f.id) === String(draftFarm)) || null

  const severityColor = { Warning: '#b45309', Critical: '#b91c1c' }
  const severityBg = { Warning: '#fbf1e2', Critical: '#fbeaea' }

  const rawHistory = history || []

  // Sorted on triggered_at_raw, the ISO instant the API now sends alongside
  // the display string. The display string ("Jul 21, 2026 8:23 AM") must
  // never be parsed for this: `new Date()` handles that shape
  // inconsistently across browsers and can yield NaN, which turns a sort
  // into a silent no-op. Reversing the list used to stand in for sorting;
  // that only held while the backend order was the single source of
  // truth, and broke as soon as anything else reordered the rows.
  const allHistory = useMemo(() => {
    const at = row => {
      const ms = Date.parse(row.triggered_at_raw)
      return Number.isNaN(ms) ? 0 : ms
    }
    const dir = sortMode === 'oldest' ? 1 : -1
    return [...rawHistory].sort((a, b) => (at(a) - at(b)) * dir)
  }, [rawHistory, sortMode])

  useEffect(() => { setCurrentPage(1) }, [severityFilter, sensorFilter, houseFilter, farmFilter, barangayFilter, statusFilter, sortMode, search, pageSize])

  const totalItems = allHistory.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [totalPages, currentPage])

  const paginatedHistory = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return allHistory.slice(start, start + pageSize)
  }, [allHistory, currentPage, pageSize])

  const rangeStart = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const rangeEnd = Math.min(currentPage * pageSize, totalItems)

  return (
    <AdminLayout>
      <h1 style={{ ...styles.title, ...(isMobile ? styles.titleMobile : {}) }}>Alert History</h1>
      <p style={styles.subtitle}>View past and ongoing alerts from all monitored farms.</p>

      <div className="no-print" style={{ ...styles.toolbar, ...(isMobile ? styles.toolbarMobile : {}) }}>
        <div style={styles.searchWrap}>
          <svg style={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="#9aa79d" strokeWidth="2" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="#9aa79d" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            placeholder="Search by farm name or owner..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={styles.searchInput}
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} style={styles.clearBtn} aria-label="Clear search">
              ×
            </button>
          )}
        </div>

        <div style={styles.filterAnchor} ref={filterRef}>
          <button
            type="button"
            onClick={() => (filterOpen ? setFilterOpen(false) : openFilter())}
            style={{ ...styles.filterBtn, ...(activeFilterCount > 0 ? styles.filterBtnActive : {}) }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M4 5h16l-6 8v6l-4-2v-4L4 5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            </svg>
            Filter
            {activeFilterCount > 0 && <span style={styles.filterCount}>{activeFilterCount}</span>}
          </button>

          {filterOpen && (
            <div style={{ ...styles.filterPanel, ...(isMobile ? styles.filterPanelMobile : {}) }}>
              <div style={styles.filterPanelHeader}>
                <span style={styles.filterPanelTitle}>Filter</span>
                <span style={styles.filterPanelClose} onClick={() => setFilterOpen(false)}>×</span>
              </div>

              <label style={styles.filterLabel}>Sort By</label>
              <select value={draftSort} onChange={e => setDraftSort(e.target.value)} style={styles.filterSelect}>
                {SORT_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>

              {/* Narrowing to one farm used to mean typing its name into the
                  search box — and farm names are not unique, so two farms
                  sharing a name came back mixed together. This filters on
                  the farm's id, which is exact. */}
              {barangayOptions.length > 1 && (
                <>
                  <label style={styles.filterLabel}>Barangay</label>
                  <select value={draftBarangay} onChange={e => setDraftBarangay(e.target.value)} style={styles.filterSelect}>
                    <option value="">All Barangays</option>
                    {barangayOptions.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </>
              )}

              {farmOptions.length > 1 && (
                <>
                  <label style={styles.filterLabel}>Farm</label>
                  {selectedFarm ? (
                    <div style={styles.pickedFarm}>
                      <span style={styles.pickedFarmName}>{selectedFarm.farm_name}</span>
                      <span style={styles.clearFarmLink} onClick={() => { setDraftFarm(''); setFarmQuery('') }}>Clear</span>
                    </div>
                  ) : (
                    <>
                      <input
                        value={farmQuery}
                        onChange={e => setFarmQuery(e.target.value)}
                        placeholder="Type a farm name…"
                        style={styles.filterSelect}
                      />
                      {farmSuggestions.length > 0 && (
                        <div style={styles.farmResultsList}>
                          {farmSuggestions.map(f => (
                            <div key={f.id} style={styles.farmResultItem} onClick={() => setDraftFarm(String(f.id))}>
                              <div style={styles.farmResultName}>{f.farm_name}</div>
                              <div style={styles.farmResultMeta}>
                                {f.owner_name || 'No owner on record'}{f.barangay ? ` · ${f.barangay}` : ''}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {farmQuery.trim() !== '' && farmSuggestions.length === 0 && (
                        <div style={styles.farmEmptyResult}>No farm matches “{farmQuery.trim()}”.</div>
                      )}
                    </>
                  )}
                </>
              )}

              <label style={styles.filterLabel}>Severity</label>
              <select value={draftSeverity} onChange={e => setDraftSeverity(e.target.value)} style={styles.filterSelect}>
                <option value="">All Severity</option>
                <option value="Warning">Warning</option>
                <option value="Critical">Critical</option>
              </select>

              <label style={styles.filterLabel}>Sensor</label>
              <select value={draftSensor} onChange={e => setDraftSensor(e.target.value)} style={styles.filterSelect}>
                <option value="">All Sensors</option>
                {SENSOR_TYPES.map(s => <option key={s} value={s.toLowerCase()}>{s}</option>)}
              </select>

              {/* A farm runs one device per poultry house, so "which house"
                  is usually the next question after seeing an alert. Only
                  worth showing once more than one unit exists. */}
              {houseOptions.length > 1 && (
                <>
                  <label style={styles.filterLabel}>House</label>
                  <select value={draftHouse} onChange={e => setDraftHouse(e.target.value)} style={styles.filterSelect}>
                    <option value="">All Houses</option>
                    {houseOptions.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.device_name}{d.farm_name ? ` — ${d.farm_name}` : ''}
                      </option>
                    ))}
                  </select>
                </>
              )}

              <label style={styles.filterLabel}>Status</label>
              <select value={draftStatus} onChange={e => setDraftStatus(e.target.value)} style={styles.filterSelect}>
                <option value="">All Statuses</option>
                <option value="Ongoing">Ongoing</option>
                <option value="Resolved">Resolved</option>
              </select>

              <div style={styles.filterActions}>
                <button type="button" onClick={resetFilter} style={styles.filterResetBtn}>Reset</button>
                <button type="button" onClick={applyFilter} style={styles.filterApplyBtn}>Apply</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {loading && <SkeletonTable rows={6} columns={6} />}
      {error && <p style={{ ...styles.stateText, color: '#b91c1c' }}>{error}</p>}

      {!loading && !error && (
        <div style={styles.tableCard}>
          {tableOverflows && paginatedHistory.length > 0 && (
            <p style={styles.scrollHint}>{isMobile ? 'Swipe' : 'Scroll'} left/right to see all columns →</p>
          )}
          <div ref={tableScrollRef} style={styles.tableScroll}>
            <table style={{ ...styles.table, ...styles.tableMinWidth }}>
              <thead>
                <tr>
                  <th style={styles.th}>Farm</th>
                  <th style={styles.th}>Farm Owner</th>
                  {/* Which poultry house. A farm runs one device per house, so
                      without this an alert said a farm was hot but not where
                      to walk. Dash for incidents recorded before per-device
                      tracking existed. */}
                  <th style={styles.th}>House</th>
                  <th style={styles.th}>Sensor</th>
                  <th style={styles.th}>Severity</th>
                  <th style={styles.th}>Triggered</th>
                  <th style={styles.th}>Duration</th>
                  <th style={styles.th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {paginatedHistory.map(h => {
                  const c = severityColor[h.status] || '#6b7280'
                  return (
                    <tr key={h.id}>
                      <td style={{ ...styles.td, fontWeight: 600, color: '#16311d' }}>{h.farm_name}</td>
                      {/* Name only. The mobile number used to sit under it as
                          a tie-breaker, since two owners can both call a farm
                          "Gly's Farm" — but this is a monitoring log, not a
                          contact list, and it made every row two lines tall.
                          The number is still on the farm profile and in the
                          API response if it is ever needed back here. */}
                      <td style={styles.td}>{h.farm_owner_name || '—'}</td>
                      <td style={styles.td}>{h.device_name || '—'}</td>
                      <td style={styles.td}>{h.sensor_type}</td>
                      <td style={styles.td}>
                        <span style={{ ...styles.badge, color: c, backgroundColor: severityBg[h.status] || '#eef1ea' }}>
                          {h.status}
                        </span>
                      </td>
                      <td style={styles.td}>{h.triggered_at}</td>
                      <td style={styles.td}>{h.duration}</td>
                      <td style={styles.td}>
                        {h.is_ongoing ? (
                          <span style={{ ...styles.badge, color: '#b91c1c', backgroundColor: '#fbeaea' }}>Ongoing</span>
                        ) : (
                          <span style={{ ...styles.badge, color: '#256b3d', backgroundColor: '#eaf3ec' }}>Resolved</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {allHistory.length === 0 && (
            <div style={styles.empty}>
              {search || severityFilter || sensorFilter || houseFilter || farmFilter || statusFilter
                ? 'No alerts match your search or filter.'
                : 'No alert history recorded yet.'}
            </div>
          )}

          {allHistory.length > 0 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              totalItems={totalItems}
              isMobile={isMobile}
            />
          )}
        </div>
      )}
    </AdminLayout>
  )
}

function Pagination({
  currentPage, totalPages, pageSize, onPageChange, onPageSizeChange,
  rangeStart, rangeEnd, totalItems, isMobile,
}) {
  return (
    <div className="no-print" style={{ ...paginationStyles.wrap, ...(isMobile ? paginationStyles.wrapMobile : {}) }}>
      <div style={paginationStyles.info}>
        {totalItems === 0 ? 'No results' : `Showing ${rangeStart}–${rangeEnd} of ${totalItems}`}
      </div>

      <div style={{ ...paginationStyles.controls, ...(isMobile ? paginationStyles.controlsMobile : {}) }}>
        <select value={pageSize} onChange={e => onPageSizeChange(Number(e.target.value))} style={paginationStyles.pageSizeSelect}>
          {PAGE_SIZE_OPTIONS.map(size => (
            <option key={size} value={size}>{size} / page</option>
          ))}
        </select>

        <SharedPagination currentPage={currentPage} totalPages={totalPages} onPageChange={onPageChange} isMobile={isMobile} />
      </div>
    </div>
  )
}

const SANS = "'Inter', sans-serif"

const styles = {
  stateText: { fontFamily: SANS, fontSize: '14px', color: '#4b5a50' },
  title: { fontSize: '24px', fontWeight: 800, letterSpacing: '-0.015em', color: '#16311d', margin: 0 },
  titleMobile: { fontSize: '20px' },
  subtitle: { fontSize: '13.5px', color: '#6b7770', marginTop: '5px', marginBottom: '20px' },

  toolbar: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' },
  toolbarMobile: { flexDirection: 'column', flexWrap: 'nowrap', alignItems: 'stretch' },

  searchWrap: { position: 'relative', flex: 1 },
  searchIcon: { position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' },
  searchInput: {
    width: '100%', padding: '11px 40px 11px 40px', borderRadius: '10px',
    border: '1px solid #dcdfd6', fontSize: '14px', boxSizing: 'border-box',
    backgroundColor: '#fff', color: '#16311d', fontFamily: SANS,
  },
  clearBtn: {
    position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
    width: '22px', height: '22px', borderRadius: '50%', border: 'none',
    backgroundColor: '#eceee7', color: '#6b7770', fontSize: '15px', lineHeight: 1,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: SANS, padding: 0,
  },

  filterAnchor: { position: 'relative', flexShrink: 0 },
  filterBtn: {
    display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 16px',
    borderRadius: '10px', border: '1px solid #dcdfd6', backgroundColor: '#fff',
    color: '#33413a', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap',
  },
  filterBtnActive: { borderColor: '#2c8047', color: '#2c8047' },
  filterCount: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minWidth: '18px', height: '18px', borderRadius: '999px', backgroundColor: '#2c8047',
    color: '#fff', fontSize: '11px', fontWeight: 700, padding: '0 4px',
  },
  filterPanel: {
    position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 40,
    backgroundColor: '#fff', border: '1px solid #e7e8e0', borderRadius: '14px',
    boxShadow: '0 8px 24px rgba(15,38,22,0.12)', padding: '18px', width: '280px',
  },
  filterPanelMobile: { right: 0, width: '260px' },
  filterPanelHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' },
  filterPanelTitle: { fontSize: '15px', fontWeight: 800, color: '#16311d' },
  filterPanelClose: { fontSize: '19px', cursor: 'pointer', color: '#8a968d', lineHeight: 1 },
  filterLabel: { display: 'block', fontSize: '12px', fontWeight: 700, color: '#4b5a50', marginBottom: '7px', marginTop: '14px' },
  filterSelect: {
    width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #dcdfd6',
    fontSize: '13px', color: '#33413a', backgroundColor: '#fff', cursor: 'pointer',
    fontFamily: SANS, boxSizing: 'border-box',
  },
  // Searchable Farm picker — same shape as the Assign Device and
  // "Add Farm to Existing Owner" pickers, so all three read as one pattern.
  farmResultsList: { border: '1px solid #dcdfd6', borderRadius: '10px', marginTop: '6px', maxHeight: '180px', overflowY: 'auto' },
  farmResultItem: { padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f2f3ed' },
  farmResultName: { fontSize: '13px', fontWeight: 700, color: '#16311d', fontFamily: SANS },
  farmResultMeta: { fontSize: '11.5px', color: '#6b7770', marginTop: '2px', fontFamily: SANS },
  farmEmptyResult: { fontSize: '12px', color: '#9aa79d', padding: '8px 2px', fontFamily: SANS },
  pickedFarm: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px',
    border: '1px solid #cfe0d3', backgroundColor: '#f6faf7', borderRadius: '10px', padding: '9px 12px',
  },
  pickedFarmName: { fontSize: '13px', fontWeight: 700, color: '#16311d', fontFamily: SANS },
  clearFarmLink: { color: '#2c8047', fontWeight: 700, fontSize: '12px', cursor: 'pointer', textDecoration: 'underline', flexShrink: 0, fontFamily: SANS },

  filterActions: { display: 'flex', gap: '10px', marginTop: '20px' },
  filterResetBtn: {
    flex: 1, padding: '9px 0', borderRadius: '10px', border: '1px solid #dcdfd6',
    backgroundColor: '#fff', color: '#33413a', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer', fontFamily: SANS,
  },
  filterApplyBtn: {
    flex: 1, padding: '9px 0', borderRadius: '10px', border: 'none',
    backgroundColor: '#2c8047', color: '#fff', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', fontFamily: SANS,
  },

  tableCard: { backgroundColor: '#fff', borderRadius: '14px', border: '1px solid #e7e8e0', overflow: 'hidden' },
  scrollHint: { fontSize: '11px', color: '#9aa79d', margin: '12px 20px 0' },
  tableScroll: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  table: { width: '100%', borderCollapse: 'collapse' },
  tableMinWidth: { minWidth: '860px' },
  th: {
    textAlign: 'left', padding: '13px 20px', fontSize: '13px', fontWeight: 600, color: '#8a968d',
    borderBottom: '1px solid #eceee7', whiteSpace: 'nowrap',
    backgroundColor: '#fafbf8',
  },
  td: { padding: '13px 20px', fontSize: '12px', color: '#4b5a50', borderBottom: '1px solid #f2f3ed', verticalAlign: 'middle' },
  subCell: { fontSize: '11px', color: '#9aa79d', marginTop: '2px' },
  badge: {
    display: 'inline-flex', alignItems: 'center', padding: '4px 11px',
    borderRadius: '999px', fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap',
  },
  empty: { padding: '32px', textAlign: 'center', color: '#9aa79d', fontSize: '14px' },
}

const paginationStyles = {
  wrap: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 20px', borderTop: '1px solid #eceee7', flexWrap: 'wrap', gap: '10px',
  },
  wrapMobile: { flexDirection: 'column', flexWrap: 'nowrap', alignItems: 'stretch' },
  info: { fontSize: '12px', color: '#8a968d', whiteSpace: 'nowrap' },
  controls: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
  controlsMobile: { justifyContent: 'space-between' },
  pageSizeSelect: { padding: '6px 10px', borderRadius: '8px', border: '1px solid #dcdfd6', fontSize: '12px', color: '#4b5a50', marginRight: '6px' },
  navBtn: { minWidth: '30px', height: '30px', padding: '0 6px', borderRadius: '8px', border: '1px solid #dcdfd6', backgroundColor: '#fff', color: '#4b5a50', fontSize: '13px', cursor: 'pointer' },
  navBtnDisabled: { opacity: 0.4, cursor: 'not-allowed' },
  pageBtn: { minWidth: '30px', height: '30px', padding: '0 6px', borderRadius: '8px', border: '1px solid #dcdfd6', backgroundColor: '#fff', color: '#4b5a50', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' },
  pageBtnActive: { backgroundColor: '#2c8047', borderColor: '#2c8047', color: '#fff' },
  ellipsis: { padding: '0 4px', color: '#9aa79d', fontSize: '13px' },
}