import { useEffect, useMemo, useRef, useState } from 'react'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'
import DeviceKeyField from '../../components/DeviceKeyField'
import TableFooter from '../../components/TableFooter'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useOverflowX } from '../../hooks/useOverflowX'
import { SkeletonTable } from '../../components/Loading'
import { invalidateCache } from '../../hooks/useCachedFetch'

// Inventory view for every unit the LGU owns, assigned or not. Registration
// lives here rather than inside a farm because minting a device is an
// inventory action — a new unit belongs to the LGU before it belongs
// anywhere. Assignment stays a separate, reversible step, which is what the
// weekly rotation between farms actually does.
//
// The Devices tab inside Farm Details is NOT replaced by this: that answers
// "what is installed at this farm", which is a different question from "where
// are all our units".

const KEY_PATTERN = /^AGB-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/
const POLL_MS = 45000

const ASSIGNMENTS = [
  { value: '', label: 'All Devices' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'unassigned', label: 'Unassigned' },
]
const CONNECTIVITY = ['Online', 'Offline', 'Pending Setup']
const STATES = ['Active', 'Inactive']

function StatusPill({ device }) {
  const map = {
    Online: { bg: '#e7f2ea', fg: '#1f5a34', dot: '#2c8047' },
    Offline: { bg: '#fdf4e7', fg: '#8a5a12', dot: '#c98a1e' },
    'Pending Setup': { bg: '#f1f2ed', fg: '#6b7770', dot: '#9aa79d' },
  }
  const tone = map[device.connectivity] || map['Pending Setup']

  return (
    <span style={{ ...pill.base, backgroundColor: tone.bg, color: tone.fg }}>
      <span style={{ ...pill.dot, backgroundColor: tone.dot }} />
      {device.connectivity}
    </span>
  )
}

export default function Devices() {
  const [devices, setDevices] = useState([])
  const [farms, setFarms] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showRegister, setShowRegister] = useState(false)
  const [assigning, setAssigning] = useState(null)
  // Unassigning is destructive to a live data stream, so it goes through a
  // confirmation step instead of firing on the first click.
  const [unassigning, setUnassigning] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [banner, setBanner] = useState(null)

  const isMobile = useIsMobile()
  const [tableScrollRef, tableOverflows] = useOverflowX()

  // Applied filters, plus the drafts the popover edits until Apply is pressed
  // — the same two-tier pattern the other Admin list pages use, so Filter
  // behaves identically here (Reset/Apply, active-count badge) instead of
  // this being the one module with its own instant-apply pills.
  const [assignmentFilter, setAssignmentFilter] = useState('')
  const [connectivityFilter, setConnectivityFilter] = useState('')
  const [stateFilter, setStateFilter] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [draftAssignment, setDraftAssignment] = useState('')
  const [draftConnectivity, setDraftConnectivity] = useState('')
  const [draftState, setDraftState] = useState('')
  const filterRef = useRef(null)

  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // `quiet` is the background-refresh path: it must never flip the page back
  // into its skeleton or replace the rows on screen with an error banner,
  // because the Admin is usually mid-task when a poll lands.
  const load = async ({ quiet = false } = {}) => {
    try {
      const [d, f] = await Promise.all([
        api.get('/admin/sensors'),
        api.get('/admin/farms'),
      ])
      setDevices(d.data.data || [])
      // The farms endpoint is paginated in some roles and a plain array in
      // others; accept either shape rather than guessing.
      const rows = f.data?.data?.data ?? f.data?.data ?? []
      setFarms(Array.isArray(rows) ? rows : [])
    } catch {
      if (!quiet) setBanner({ tone: 'error', text: 'Could not load devices. Refresh to try again.' })
    } finally {
      if (!quiet) setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Units go Online and Offline on their own as they report in from the
  // farms, so this list has to keep up without the Admin reloading. Polling
  // pauses while the tab is hidden and catches up as soon as it is visible.
  useEffect(() => {
    const tick = () => { if (!document.hidden) load({ quiet: true }) }
    const timer = setInterval(tick, POLL_MS)
    const onVisibility = () => { if (!document.hidden) tick() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  useEffect(() => {
    if (!filterOpen) return
    const handleClickOutside = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [filterOpen])

  const openFilter = () => {
    setDraftAssignment(assignmentFilter)
    setDraftConnectivity(connectivityFilter)
    setDraftState(stateFilter)
    setFilterOpen(o => !o)
  }

  const applyFilter = () => {
    setAssignmentFilter(draftAssignment)
    setConnectivityFilter(draftConnectivity)
    setStateFilter(draftState)
    setCurrentPage(1)
    setFilterOpen(false)
  }

  const resetFilter = () => {
    setDraftAssignment('')
    setDraftConnectivity('')
    setDraftState('')
    setAssignmentFilter('')
    setConnectivityFilter('')
    setStateFilter('')
    setCurrentPage(1)
  }

  const activeFilterCount = [assignmentFilter, connectivityFilter, stateFilter].filter(Boolean).length

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return devices.filter(d => {
      if (assignmentFilter === 'assigned' && !d.farm_id) return false
      if (assignmentFilter === 'unassigned' && d.farm_id) return false
      if (connectivityFilter && d.connectivity !== connectivityFilter) return false
      if (stateFilter && d.status !== stateFilter) return false
      if (!q) return true
      return (
        (d.device_name || '').toLowerCase().includes(q) ||
        (d.device_key || '').toLowerCase().includes(q) ||
        (d.farm_name || '').toLowerCase().includes(q)
      )
    })
  }, [devices, search, assignmentFilter, connectivityFilter, stateFilter])

  const totalItems = visible.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))

  // Clamped while rendering rather than corrected afterwards in an effect, so
  // the last page emptying out (a device unassigned, or a background poll
  // dropping a row) never briefly renders a blank page before snapping back.
  const page = Math.min(Math.max(1, currentPage), totalPages)

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize
    return visible.slice(start, start + pageSize)
  }, [visible, page, pageSize])

  const rangeStart = totalItems === 0 ? 0 : (page - 1) * pageSize + 1
  const rangeEnd = Math.min(page * pageSize, totalItems)

  // Moving a device changes what the farm pages show — their device list,
  // monitoring status and connectivity. Those pages are served by
  // useCachedFetch, so dropping the cached farm responses is what lets any of
  // them that are currently mounted reload themselves. Called only after the
  // request succeeded.
  const refreshFarmViews = () => {
    invalidateCache('/admin/farms')
    invalidateCache('/admin/sensors')
    invalidateCache('/farmer/farms')
  }

  const handleUnassign = async (device) => {
    setBusyId(device.id)
    setBanner(null)
    try {
      await api.patch(`/admin/sensors/${device.id}/unassign`)
      setBanner({
        tone: 'ok',
        text: `${device.device_name} is now unassigned. It keeps the same Device Name and Device Key, so it does not have to be reflashed before its next farm.`,
      })
      setUnassigning(null)
      refreshFarmViews()
      await load({ quiet: true })
    } catch (err) {
      setBanner({ tone: 'error', text: err.response?.data?.message || 'Could not unassign that device.' })
    } finally {
      setBusyId(null)
    }
  }

  const handleAssign = async (device, farmId) => {
    setBusyId(device.id)
    setBanner(null)
    try {
      const farm = farms.find(f => String(f.id) === String(farmId))
      await api.patch(`/admin/sensors/${device.id}/assign`, { farm_id: farmId })
      setBanner({ tone: 'ok', text: `${device.device_name} assigned to ${farm?.farm_name || 'the farm'}.` })
      setAssigning(null)
      refreshFarmViews()
      await load({ quiet: true })
    } catch (err) {
      setBanner({ tone: 'error', text: err.response?.data?.message || 'Could not assign that device.' })
    } finally {
      setBusyId(null)
    }
  }

  const isFiltered = activeFilterCount > 0 || search.trim() !== ''

  return (
    <AdminLayout>
      <div style={{ ...s.head, ...(isMobile ? s.headMobile : {}) }}>
        <div>
          <h1 style={{ ...s.title, ...(isMobile ? s.titleMobile : {}) }}>Devices</h1>
          <p style={s.subtitle}>Every monitoring unit the LGU owns, and where it is installed.</p>
        </div>
        <button type="button" style={s.primaryBtn} onClick={() => setShowRegister(true)}>
          + Register Device
        </button>
      </div>

      {banner && (
        <div style={banner.tone === 'ok' ? s.bannerOk : s.bannerError}>{banner.text}</div>
      )}

      <div style={{ ...s.toolbar, ...(isMobile ? s.toolbarMobile : {}) }}>
        <div style={s.searchWrap}>
          <svg style={s.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="#9aa79d" strokeWidth="2" />
            <path d="M20 20l-3.5-3.5" stroke="#9aa79d" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setCurrentPage(1) }}
            placeholder="Search by Device Name, Device Key, or farm"
            style={s.searchInput}
          />
          {search && (
            <button type="button" style={s.clearBtn} onClick={() => { setSearch(''); setCurrentPage(1) }} aria-label="Clear search">&times;</button>
          )}
        </div>

        <div style={s.filterAnchor} ref={filterRef}>
          <button
            type="button"
            onClick={openFilter}
            style={{ ...s.filterBtn, ...(activeFilterCount > 0 ? s.filterBtnActive : {}) }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M4 5h16l-6 8v6l-4-2v-4L4 5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            </svg>
            Filter
            {activeFilterCount > 0 && <span style={s.filterCount}>{activeFilterCount}</span>}
          </button>

          {filterOpen && (
            <div style={{ ...s.filterPanel, ...(isMobile ? s.filterPanelMobile : {}) }}>
              <div style={s.filterPanelHeader}>
                <span style={s.filterPanelTitle}>Filter</span>
                <span style={s.filterPanelClose} onClick={() => setFilterOpen(false)}>&times;</span>
              </div>

              <label style={s.filterLabel}>Assignment</label>
              <select value={draftAssignment} onChange={e => setDraftAssignment(e.target.value)} style={s.filterSelect}>
                {ASSIGNMENTS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>

              <label style={s.filterLabel}>Connectivity</label>
              <select value={draftConnectivity} onChange={e => setDraftConnectivity(e.target.value)} style={s.filterSelect}>
                <option value="">All</option>
                {CONNECTIVITY.map(c => <option key={c} value={c}>{c}</option>)}
              </select>

              <label style={s.filterLabel}>Device State</label>
              <select value={draftState} onChange={e => setDraftState(e.target.value)} style={s.filterSelect}>
                <option value="">All</option>
                {STATES.map(st => <option key={st} value={st}>{st}</option>)}
              </select>

              <div style={s.filterActions}>
                <button type="button" onClick={resetFilter} style={s.filterResetBtn}>Reset</button>
                <button type="button" onClick={applyFilter} style={s.filterApplyBtn}>Apply</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <p style={s.countText}>
        {totalItems} device{totalItems === 1 ? '' : 's'}
        {isFiltered ? ` matching, of ${devices.length} total` : ''}
      </p>

      {loading ? (
        <SkeletonTable rows={6} columns={6} />
      ) : (
        <div style={s.tableCard}>
          {tableOverflows && totalItems > 0 && (
            <p style={s.scrollHint}>{isMobile ? 'Swipe' : 'Scroll'} left/right to see all columns &rarr;</p>
          )}
          <div ref={tableScrollRef} style={s.tableScroll}>
            <table style={{ ...s.table, ...s.tableMinWidth }}>
              <thead>
                <tr>
                  <th style={s.th}>Device Name</th>
                  <th style={s.th}>Assigned Farm</th>
                  <th style={s.th}>Connectivity</th>
                  <th style={s.th}>Last Seen</th>
                  <th style={s.th}>Installed</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(d => (
                  <tr key={d.id}>
                    <td style={s.td}>
                      <span style={s.deviceName}>{d.device_name}</span>
                      {d.status !== 'Active' && <span style={s.inactivePill}>Inactive</span>}
                    </td>
                    <td style={s.td}>
                      {d.farm_id
                        ? <span style={s.metaStrong}>{d.farm_name}</span>
                        : <span style={s.metaMuted}>Unassigned</span>}
                    </td>
                    <td style={s.td}><StatusPill device={d} /></td>
                    <td style={s.td}>{d.last_seen_at || '—'}</td>
                    <td style={s.td}>{d.installed_at || '—'}</td>
                    <td style={s.td}>
                      <div style={s.actionGroup}>
                      <button type="button" style={s.ghostBtn} onClick={() => setViewing(d)}>View</button>
                      {d.farm_id ? (
                        <button
                          type="button"
                          style={s.ghostBtn}
                          disabled={busyId === d.id}
                          onClick={() => setUnassigning(d)}
                        >
                          {busyId === d.id ? 'Working…' : 'Unassign'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          style={s.ghostBtn}
                          disabled={busyId === d.id}
                          onClick={() => { setBanner(null); setAssigning(d) }}
                        >
                          Assign to farm
                        </button>
                      )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalItems === 0 && (
            <div style={s.empty}>
              {devices.length === 0
                ? 'No devices registered yet. Use Register Device to add the first unit.'
                : 'No device matches your search or filter.'}
            </div>
          )}

          {totalItems > 0 && (
            <TableFooter
              currentPage={page}
              totalPages={totalPages}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={size => { setPageSize(size); setCurrentPage(1) }}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              totalItems={totalItems}
              isMobile={isMobile}
            />
          )}
        </div>
      )}

      {viewing && (
        <DeviceDetailsModal device={viewing} onClose={() => setViewing(null)} />
      )}

      {unassigning && (
        <div style={m.overlay} onClick={() => setUnassigning(null)}>
          <div style={m.modal} onClick={e => e.stopPropagation()}>
            <h3 style={m.title}>Unassign Device?</h3>
            <p style={m.lead}>
              Are you sure you want to unassign <strong>{unassigning.device_name}</strong> from{' '}
              <strong>{unassigning.farm_name || 'its current farm'}</strong>? The device will become
              Unassigned and will no longer contribute new readings to this farm.
            </p>
            <p style={m.hint}>
              Readings already collected stay with the farm they were recorded at, and the unit keeps
              its Device Name and Device Key, so it does not have to be reflashed.
            </p>

            <div style={m.actions}>
              <button type="button" onClick={() => setUnassigning(null)} style={m.cancelBtn}>Cancel</button>
              <button
                type="button"
                disabled={busyId === unassigning.id}
                onClick={() => handleUnassign(unassigning)}
                style={{ ...m.submitBtn, ...(busyId === unassigning.id ? m.submitBtnOff : {}) }}
              >
                {busyId === unassigning.id ? 'Unassigning…' : 'Unassign Device'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRegister && (
        <RegisterDeviceModal
          onClose={() => setShowRegister(false)}
          onDone={async () => { setShowRegister(false); await load({ quiet: true }) }}
        />
      )}

      {assigning && (
        <AssignModal
          device={assigning}
          farms={farms}
          busy={busyId === assigning.id}
          onClose={() => setAssigning(null)}
          onConfirm={farmId => handleAssign(assigning, farmId)}
        />
      )}
    </AdminLayout>
  )
}


/**
 * The poultry house a unit sits in, editable in place.
 *
 * This is the only name a farm owner ever sees for their building, but it is
 * the LGU that installs the unit and knows which house it went into — so it
 * is set here rather than on the owner's side. Editing inline keeps it a
 * two-second correction instead of a modal; devices are usually named once,
 * right after installation, and then left alone.
 */

/**
 * Everything the LGU holds about one unit, including its Device Key.
 *
 * The key used to sit in its own table column with Show/Copy on every row.
 * That made the widest column on the page one that is read perhaps twice in
 * a device's life — at registration and when re-flashing firmware — and it
 * put a secret one stray click from being revealed while someone was doing
 * something else entirely. Behind a View action it is still two clicks away
 * when genuinely needed, and out of sight the rest of the time.
 */
function DeviceDetailsModal({ device, onClose }) {
  return (
    <div style={m.overlay} onClick={onClose}>
      <div style={m.modal} onClick={e => e.stopPropagation()}>
        <h3 style={m.title}>{device.device_name}</h3>
        <p style={m.lead}>Registered monitoring unit.</p>

        <div style={m.detailCard}>
          <div style={m.detailRow}>
            <span style={m.detailLabel}>Device Name</span>
            <span style={m.detailValue}>{device.device_name}</span>
          </div>
          <div style={m.detailRow}>
            <span style={m.detailLabel}>Assigned Farm</span>
            <span style={device.farm_id ? m.detailValue : m.detailMuted}>
              {device.farm_name || 'Unassigned'}
            </span>
          </div>
          <div style={m.detailRow}>
            <span style={m.detailLabel}>Connectivity</span>
            <span style={m.detailValue}>{device.connectivity}</span>
          </div>
          <div style={m.detailRow}>
            <span style={m.detailLabel}>Device State</span>
            <span style={m.detailValue}>{device.status}</span>
          </div>
          <div style={m.detailRow}>
            <span style={m.detailLabel}>Installed</span>
            <span style={m.detailValue}>{device.installed_at || '—'}</span>
          </div>
          <div style={m.detailRowLast}>
            <span style={m.detailLabel}>Last Seen</span>
            <span style={m.detailValue}>{device.last_seen_at || 'Never'}</span>
          </div>
        </div>

        <label style={m.label}>Device Key</label>
        <DeviceKeyField deviceKey={device.device_key} />
        <p style={m.hint}>
          The key flashed into this unit&rsquo;s firmware. It never changes, not
          even when the device moves to another farm. Treat it as a secret.
        </p>

        <div style={m.actions}>
          <button type="button" onClick={onClose} style={m.submitBtn}>Close</button>
        </div>
      </div>
    </div>
  )
}

// The key is pre-provisioned: minted with the artisan command, printed on the
// unit's sticker and flashed into its firmware before turnover. This form is
// where an Admin types that existing key in — it is never generated here, and
// the success screen never echoes it back.
function RegisterDeviceModal({ onClose, onDone }) {
  const [deviceName, setDeviceName] = useState('')
  const [deviceKey, setDeviceKey] = useState('')
  const [installedAt, setInstalledAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [registered, setRegistered] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setError('')

    const key = deviceKey.trim().toUpperCase()
    if (!KEY_PATTERN.test(key)) {
      setError('The device key must look like AGB-XXXXXXXX, using capital letters and numbers only (no O, I, L, 0 or 1).')
      return
    }

    setSaving(true)
    try {
      const res = await api.post('/admin/sensors', {
        device_key: key,
        label: deviceName.trim() || null,
        installed_at: installedAt || null,
      })
      setRegistered(res.data.data)
    } catch (err) {
      const errors = err.response?.data?.errors
      setError(errors ? Object.values(errors).flat()[0] : (err.response?.data?.message || 'Could not register that device.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={m.overlay} onClick={onClose}>
      <div style={m.modal} onClick={e => e.stopPropagation()}>
        {!registered ? (
          <form onSubmit={submit}>
            <h3 style={m.title}>Register Device</h3>
            <p style={m.lead}>Enter the device key shown on the unit&rsquo;s sticker.</p>

            {error && <div style={m.error}>{error}</div>}

            <label style={m.label}>Device Key *</label>
            <input
              value={deviceKey}
              onChange={e => setDeviceKey(e.target.value.toUpperCase())}
              placeholder="AGB-XXXXXXXX"
              style={m.input}
              required
            />
            <p style={m.hint}>
              This key is already set in the device. Enter it correctly to connect the device to AgriBantay.
            </p>

            <label style={m.label}>Device Name</label>
            <input
              value={deviceName}
              onChange={e => setDeviceName(e.target.value)}
              placeholder="AGB-D01"
              maxLength={50}
              style={m.input}
            />
            <p style={m.hint}>
              This is the name used to identify the device in the system. You can change it later.
            </p>

            <label style={m.label}>Installation Date</label>
            <input type="date" value={installedAt} onChange={e => setInstalledAt(e.target.value)} style={m.input} />
            <p style={m.hint}>
              Select the date the device was installed.
            </p>

            <div style={m.actions}>
              <button type="button" onClick={onClose} style={m.cancelBtn}>Cancel</button>
              <button type="submit" disabled={saving} style={m.submitBtn}>
                {saving ? 'Registering…' : 'Register Device'}
              </button>
            </div>
          </form>
        ) : (
          <>
            <div style={m.successTop}>
              <div style={m.successMark}>&#10003;</div>
              <div>
                <div style={m.successHeadline}>Device registered</div>
                <div style={m.successSubline}>The system now recognises this unit.</div>
              </div>
            </div>

            <div style={m.detailCard}>
              <div style={m.detailRow}>
                <span style={m.detailLabel}>Device Name</span>
                <span style={m.detailValue}>{registered.device_name}</span>
              </div>
              <div style={m.detailRow}>
                <span style={m.detailLabel}>Device Key</span>
                <span style={m.detailMuted}>Stored &middot; hidden</span>
              </div>
              <div style={m.detailRowLast}>
                <span style={m.detailLabel}>Assignment</span>
                <span style={m.detailMuted}>Unassigned</span>
              </div>
            </div>

            <p style={m.successNote}>
              Assign it to a farm so it can start recording readings. The key stays masked in this list &mdash; use Show if you need to check it against the sticker.
            </p>

            <div style={m.actions}>
              <button type="button" onClick={onDone} style={m.submitBtn}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function AssignModal({ device, farms, busy, onClose, onConfirm }) {
  // One typeable field that shows matching farms underneath, mirroring the
  // "Add Farm to Existing Owner" picker. It replaces a search box that only
  // filtered a separate <select> — two controls for one choice, where the
  // select kept showing its own value and the typing looked like it did
  // nothing. Filtering is local: `farms` is already loaded, so no request is
  // made while typing.
  const [selectedFarm, setSelectedFarm] = useState(null)
  const [search, setSearch] = useState('')

  const options = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return farms
    return farms.filter(f =>
      (f.farm_name || '').toLowerCase().includes(q) ||
      (f.owner_name || '').toLowerCase().includes(q)
    )
  }, [farms, search])

  const farmId = selectedFarm ? String(selectedFarm.id) : ''

  return (
    <div style={m.overlay} onClick={onClose}>
      <div style={m.modal} onClick={e => e.stopPropagation()}>
        <h3 style={m.title}>Assign {device.device_name}</h3>
        <p style={m.lead}>
          Readings sent from this point on are recorded against the farm you pick. Earlier readings stay with the farm they were collected at.
        </p>

        <label style={m.label}>Find a farm *</label>

        {selectedFarm ? (
          <div style={m.pickedFarm}>
            <div>
              <div style={m.pickedFarmName}>{selectedFarm.farm_name}</div>
              <div style={m.pickedFarmMeta}>
                {selectedFarm.owner_name || 'No owner on record'}
                {selectedFarm.barangay ? ` · ${selectedFarm.barangay}` : ''}
              </div>
            </div>
            <span
              style={m.changeFarmLink}
              onClick={() => { setSelectedFarm(null); setSearch('') }}
            >
              Change
            </span>
          </div>
        ) : (
          <>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Type a farm or owner name…"
              style={m.input}
              autoFocus
            />

            {options.length > 0 && (
              <div style={m.farmResultsList}>
                {options.map(f => (
                  <div
                    key={f.id}
                    style={m.farmResultItem}
                    onClick={() => setSelectedFarm(f)}
                  >
                    <div style={m.farmResultName}>{f.farm_name}</div>
                    <div style={m.farmResultMeta}>
                      {f.owner_name || 'No owner on record'}
                      {f.barangay ? ` · ${f.barangay}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {options.length === 0 && (
              <div style={m.farmEmptyResult}>
                {farms.length === 0
                  ? 'No farms are available to assign to.'
                  : `No farm matches “${search.trim()}”.`}
              </div>
            )}
          </>
        )}

        <p style={m.hint}>A farm can hold several devices &mdash; one per poultry house. Install only one unit per house so their readings stay separate.</p>

        <div style={m.actions}>
          <button type="button" onClick={onClose} style={m.cancelBtn}>Cancel</button>
          <button
            type="button"
            disabled={!farmId || busy}
            onClick={() => onConfirm(farmId)}
            style={{ ...m.submitBtn, ...(!farmId || busy ? m.submitBtnOff : {}) }}
          >
            {busy ? 'Assigning…' : 'Assign Device'}
          </button>
        </div>
      </div>
    </div>
  )
}

const SANS = "'Inter', sans-serif"

const pill = {
  base: { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 9px', borderRadius: '999px', fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap' },
  dot: { width: '6px', height: '6px', borderRadius: '50%' },
}

const s = {
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap', marginBottom: '18px' },
  headMobile: { flexDirection: 'column', flexWrap: 'nowrap', alignItems: 'stretch' },
  title: { fontSize: '22px', fontWeight: 800, color: '#16311d', margin: 0, letterSpacing: '-0.01em' },
  titleMobile: { fontSize: '20px' },
  subtitle: { fontSize: '13px', color: '#8a968d', margin: '4px 0 0' },
  primaryBtn: { flexShrink: 0, padding: '10px 17px', borderRadius: '10px', border: 'none', backgroundColor: '#2c8047', color: '#fff', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', fontFamily: SANS },
  bannerOk: { backgroundColor: '#eaf3ec', border: '1px solid #cfe0d3', color: '#1f5a34', borderRadius: '10px', padding: '11px 14px', fontSize: '13px', marginBottom: '14px', lineHeight: 1.5 },
  bannerError: { backgroundColor: '#fbeaea', border: '1px solid #f0c9c9', color: '#b91c1c', borderRadius: '10px', padding: '11px 14px', fontSize: '13px', marginBottom: '14px', lineHeight: 1.5 },

  toolbar: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' },
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
  filterActions: { display: 'flex', gap: '10px', marginTop: '20px' },
  filterResetBtn: {
    flex: 1, padding: '9px 0', borderRadius: '10px', border: '1px solid #dcdfd6',
    backgroundColor: '#fff', color: '#33413a', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer', fontFamily: SANS,
  },
  filterApplyBtn: {
    flex: 1, padding: '9px 0', borderRadius: '10px', border: 'none',
    backgroundColor: '#2c8047', color: '#fff', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', fontFamily: SANS,
  },

  countText: { fontSize: '12.5px', color: '#8a968d', margin: '0 0 12px', fontFamily: SANS },

  tableCard: { backgroundColor: '#fff', borderRadius: '14px', border: '1px solid #e7e8e0', overflow: 'hidden' },
  scrollHint: { fontSize: '11px', color: '#9aa79d', margin: '12px 20px 0' },
  tableScroll: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  table: { width: '100%', borderCollapse: 'collapse' },
  tableMinWidth: { minWidth: '980px' },
  th: {
    textAlign: 'left', padding: '13px 20px', fontSize: '13px', fontWeight: 600, color: '#8a968d',
    borderBottom: '1px solid #eceee7', whiteSpace: 'nowrap', backgroundColor: '#fafbf8',
  },
  td: { padding: '13px 20px', fontSize: '12px', color: '#4b5a50', borderBottom: '1px solid #f2f3ed', verticalAlign: 'middle', whiteSpace: 'nowrap' },
  deviceName: { fontSize: '13px', fontWeight: 800, color: '#16311d' },
  inactivePill: { marginLeft: '8px', padding: '3px 9px', borderRadius: '999px', fontSize: '11.5px', fontWeight: 700, backgroundColor: '#f1f2ed', color: '#6b7770' },
  metaStrong: { color: '#16311d', fontWeight: 600 },
  metaMuted: { color: '#9aa79d' },
  ghostBtn: { padding: '6px 13px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', border: '1px solid #e3e6dd', backgroundColor: '#fff', color: '#4b5a50', fontFamily: SANS, whiteSpace: 'nowrap' },
  actionGroup: { display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' },
  empty: { padding: '32px', textAlign: 'center', color: '#9aa79d', fontSize: '14px' },

}

const m = {
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(15,38,22,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '16px' },
  modal: { backgroundColor: '#fff', borderRadius: '16px', padding: '26px', width: '460px', maxWidth: '92vw', maxHeight: '90vh', overflowY: 'auto', fontFamily: SANS },
  title: { fontSize: '16px', fontWeight: 800, color: '#16311d', margin: 0 },
  lead: { fontSize: '12.5px', color: '#8a968d', margin: '6px 0 4px', lineHeight: 1.55 },
  label: { display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#33413a', marginBottom: '5px', marginTop: '14px' },
  input: { width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #dcdfd6', fontSize: '13.5px', boxSizing: 'border-box', fontFamily: SANS },
  hint: { fontSize: '11.5px', color: '#8a968d', margin: '6px 0 0', lineHeight: 1.5 },

  // Same shape as the "Add Farm to Existing Owner" result list, so the two
  // pickers read as one pattern.
  farmResultsList: { border: '1px solid #dcdfd6', borderRadius: '10px', marginTop: '8px', maxHeight: '220px', overflowY: 'auto' },
  farmResultItem: { padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f2f3ed' },
  farmResultName: { fontSize: '13.5px', fontWeight: 700, color: '#16311d' },
  farmResultMeta: { fontSize: '12px', color: '#6b7770', marginTop: '2px' },
  farmEmptyResult: { fontSize: '12.5px', color: '#9aa79d', padding: '10px 2px' },
  pickedFarm: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', border: '1px solid #cfe0d3', backgroundColor: '#f6faf7', borderRadius: '10px', padding: '10px 14px' },
  pickedFarmName: { fontSize: '13.5px', fontWeight: 700, color: '#16311d' },
  pickedFarmMeta: { fontSize: '12px', color: '#6b7770', marginTop: '2px' },
  changeFarmLink: { color: '#2c8047', fontWeight: 700, fontSize: '12.5px', cursor: 'pointer', textDecoration: 'underline', flexShrink: 0 },
  error: { backgroundColor: '#fbeaea', border: '1px solid #f0c9c9', color: '#b91c1c', padding: '10px 14px', borderRadius: '10px', fontSize: '13px', marginTop: '12px' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '22px' },
  cancelBtn: { padding: '9px 16px', borderRadius: '10px', border: '1px solid #dcdfd6', backgroundColor: '#fff', fontSize: '13.5px', fontWeight: 600, color: '#33413a', cursor: 'pointer', fontFamily: SANS },
  submitBtn: { padding: '9px 16px', borderRadius: '10px', border: 'none', backgroundColor: '#2c8047', color: '#fff', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', fontFamily: SANS },
  submitBtnOff: { backgroundColor: '#cfe0d3', cursor: 'not-allowed' },
  successTop: { display: 'flex', alignItems: 'center', gap: '12px', margin: '4px 0 14px' },
  successMark: { width: '34px', height: '34px', borderRadius: '50%', flexShrink: 0, backgroundColor: '#e7f2ea', color: '#2c8047', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '17px', fontWeight: 700 },
  successHeadline: { fontSize: '14.5px', fontWeight: 700, color: '#16311d' },
  successSubline: { fontSize: '12.5px', color: '#8a968d', marginTop: '2px' },
  successNote: { fontSize: '12px', color: '#8a968d', lineHeight: 1.55, margin: '12px 2px 0' },
  detailCard: { backgroundColor: '#f7f8f4', border: '1px solid #e3e6dd', borderRadius: '12px', padding: '4px 14px' },
  detailRow: { display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '9px 0', fontSize: '13px', borderBottom: '1px solid #ecefe7' },
  detailRowLast: { display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '9px 0', fontSize: '13px' },
  detailLabel: { color: '#8a968d', fontWeight: 600, flexShrink: 0 },
  detailValue: { color: '#16311d', fontWeight: 700, textAlign: 'right', wordBreak: 'break-all' },
  detailMuted: { color: '#8a968d', fontWeight: 600, textAlign: 'right' },
}
