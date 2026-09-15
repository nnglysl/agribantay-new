import { useState } from 'react'
import FarmerLayout from '../../components/FarmerLayout'
import SharedPagination from '../../components/Pagination'
import api from '../../api/axios'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useSelectedFarm } from '../../hooks/useSelectedFarm'
import { viewModalStyles as v } from '../../styles/viewModalStyles'

const responsiveCss = `
  .mr-tabs {
    display: flex;
    gap: 28px;
    border-bottom: 1px solid #e7e8e0;
    margin-bottom: 20px;
    overflow-x: auto;
  }
  .mr-tab-btn {
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
  .mr-tab-btn.active {
    color: #1B4332;
    border-bottom-color: #1B4332;
  }

  .mr-stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 18px;
  }
  @media (max-width: 720px) {
    .mr-stats-grid { grid-template-columns: 1fr; }
  }

  .mr-actions-row {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 16px;
  }
  @media (max-width: 640px) {
    .mr-actions-row button { width: 100%; }
  }

  .mr-table-wrap {
    width: 100%;
    overflow-x: auto;
    margin-top: 14px;
    border: 1px solid #eceee7;
    border-radius: 10px;
  }
  .mr-table {
    width: 100%;
    border-collapse: collapse;
    min-width: 480px;
  }

  .mr-pagination {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 16px;
    padding-top: 14px;
    border-top: 1px solid #f0efe8;
  }

  .mr-modal-card {
    background: white;
    border-radius: 16px;
    padding: 26px;
    box-sizing: border-box;
    width: 100%;
    max-width: 440px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 12px 32px rgba(15,38,22,0.18);
  }
  @media (max-width: 640px) {
    .mr-modal-card {
      max-width: 100%;
      border-radius: 16px 16px 0 0;
      position: fixed;
      bottom: 0; left: 0; right: 0;
      max-height: 90vh;
    }
  }
`

const RECENT_LIMIT = 5

export default function ManureRecords() {
  const { selectedFarmId, farmsLoading } = useSelectedFarm()
  const farmParams = { farm_id: selectedFarmId }
  const { data: maintenance, loading: maintenanceLoading, refetch: refetchMaintenance } = useCachedFetch(selectedFarmId ? '/farmer/maintenance' : null, farmParams)
  const { data: disposalRecords, loading: disposalLoading, refetch: refetchDisposal } = useCachedFetch(selectedFarmId ? '/farmer/disposal-records' : null, farmParams)

  const [activeTab, setActiveTab] = useState('cleanout') // 'cleanout' | 'disposal'

  const [showMaintenanceForm, setShowMaintenanceForm] = useState(false)
  const [maintenanceDate, setMaintenanceDate] = useState('')
  const [maintenanceNotes, setMaintenanceNotes] = useState('')
  const [maintenancePhoto, setMaintenancePhoto] = useState(null)
  const [maintenanceSubmitting, setMaintenanceSubmitting] = useState(false)
  const [maintenanceError, setMaintenanceError] = useState('')

  const [showDisposalForm, setShowDisposalForm] = useState(false)
  const [disposalMethod, setDisposalMethod] = useState('Sold')
  const [disposalCustomMethod, setDisposalCustomMethod] = useState('')
  const [disposalQuantity, setDisposalQuantity] = useState('')
  const [disposalBuyerName, setDisposalBuyerName] = useState('')
  const [disposalDate, setDisposalDate] = useState('')
  const [disposalNotes, setDisposalNotes] = useState('')
  const [disposalSubmitting, setDisposalSubmitting] = useState(false)
  const [disposalError, setDisposalError] = useState('')

  // View-record modal (client-side only, uses data already fetched)
  const [viewRecord, setViewRecord] = useState(null) // { type: 'cleanout' | 'disposal', record: {...} }

  const handleDisposalSubmit = async (e) => {
    e.preventDefault()
    setDisposalError('')

    if (!disposalQuantity || !disposalDate) {
      setDisposalError('Quantity and date are both required.')
      return
    }

    if (disposalMethod === 'Other' && !disposalCustomMethod.trim()) {
      setDisposalError('Please specify the disposal method.')
      return
    }

    setDisposalSubmitting(true)
    try {
      await api.post('/farmer/disposal-records', {
        disposal_method: disposalMethod,
        other_method_detail: disposalMethod === 'Other' ? disposalCustomMethod.trim() : null,
        quantity: disposalQuantity,
        buyer_name: disposalMethod === 'Sold' ? disposalBuyerName : null,
        disposal_date: disposalDate,
        notes: disposalNotes,
        farm_id: selectedFarmId,
      })
      setShowDisposalForm(false)
      setDisposalMethod('Sold')
      setDisposalCustomMethod('')
      setDisposalQuantity('')
      setDisposalBuyerName('')
      setDisposalDate('')
      setDisposalNotes('')
      refetchDisposal()
    } catch (err) {
      setDisposalError(err.response?.data?.message || 'Failed to log disposal record. Please try again.')
    } finally {
      setDisposalSubmitting(false)
    }
  }

  const handleMaintenanceSubmit = async (e) => {
    e.preventDefault()
    setMaintenanceError('')

    if (!maintenanceDate || !maintenancePhoto) {
      setMaintenanceError('Date and a photo are both required.')
      return
    }

    const formData = new FormData()
    formData.append('performed_at', maintenanceDate)
    formData.append('notes', maintenanceNotes)
    formData.append('photo', maintenancePhoto)
    formData.append('farm_id', selectedFarmId)

    setMaintenanceSubmitting(true)
    try {
      await api.post('/farmer/maintenance', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setShowMaintenanceForm(false)
      setMaintenanceDate('')
      setMaintenanceNotes('')
      setMaintenancePhoto(null)
      refetchMaintenance()
    } catch (err) {
      setMaintenanceError(err.response?.data?.message || 'Failed to log clean-out. Please try again.')
    } finally {
      setMaintenanceSubmitting(false)
    }
  }

  if (farmsLoading || (maintenanceLoading && disposalLoading)) {
    return <FarmerLayout><p style={styles.stateText}>Loading...</p></FarmerLayout>
  }

  const recentMaintLogs = (maintenance?.recent_logs || []).slice(0, RECENT_LIMIT)
  const recentDisposalRecords = (disposalRecords || []).slice(0, RECENT_LIMIT)

  return (
    <FarmerLayout>
      <style>{responsiveCss}</style>

      <h1 style={styles.title}>Manure Records</h1>
      <p style={styles.subtitle}>
        Keep track of manure clean-outs and where the manure goes.
      </p>

      <div className="mr-tabs">
        <button
          className={`mr-tab-btn ${activeTab === 'cleanout' ? 'active' : ''}`}
          onClick={() => setActiveTab('cleanout')}
        >
          Clean-out Logs
        </button>
        <button
          className={`mr-tab-btn ${activeTab === 'disposal' ? 'active' : ''}`}
          onClick={() => setActiveTab('disposal')}
        >
          Disposal Records
        </button>
      </div>

      {activeTab === 'cleanout' ? (
        <>
          <div className="mr-stats-grid">
            <div style={styles.statCard}>
              <div style={styles.statMiniLabel}>Last clean-out</div>
              <div style={styles.statValueSm}>{maintenance?.status?.last_performed_at || 'Never'}</div>
              <div style={styles.statSubLabel}>{maintenance?.status?.days_since ?? '—'} days ago</div>
            </div>

            <div style={styles.statCard}>
              <div style={styles.statMiniLabel}>Recommended frequency</div>
              <div style={styles.statValueSm}>
                Every ~{maintenance?.status?.expected_interval_days ? Math.round(maintenance.status.expected_interval_days / 30) : '—'} mo.
              </div>
              <div style={styles.statSubLabel}>Based on your farm size</div>
            </div>

            <div style={styles.statCard}>
              <div style={styles.statMiniLabel}>Status</div>
              {maintenance?.status && (
                <span style={{ ...styles.badge, ...maintBadgeStyle(maintenance.status.status) }}>
                  <span style={{ ...styles.badgeDot, backgroundColor: maintBadgeStyle(maintenance.status.status).color }} />
                  {maintenance.status.status}
                </span>
              )}
            </div>
          </div>

          <section style={styles.card}>
            <div className="mr-actions-row">
              <button style={styles.primaryBtnInline} onClick={() => setShowMaintenanceForm(true)}>
                + Log a Clean-out
              </button>
            </div>

            <div style={styles.historyLabel}>Recent Clean-outs</div>
            {recentMaintLogs.length > 0 ? (
              <>
                <div className="mr-table-wrap">
                  <table className="mr-table" style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Date</th>
                        <th style={styles.th}>Notes</th>
                        <th style={{ ...styles.th, textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentMaintLogs.map(log => (
                        <tr key={log.id}>
                          <td style={styles.tdStrong}>{log.performed_at}</td>
                          <td style={styles.td}>{log.notes || '—'}</td>
                          <td style={{ ...styles.td, textAlign: 'right' }}>
                            <span style={styles.viewBtn} onClick={() => setViewRecord({ type: 'cleanout', record: log })}>
                              View
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mr-pagination">
                  <span style={styles.paginationText}>
                    Showing 1–{recentMaintLogs.length} of {recentMaintLogs.length}
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
              <p style={styles.emptyText}>No clean-out records yet.</p>
            )}
          </section>
        </>
      ) : (
        <section style={styles.card}>
          <div className="mr-actions-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <div style={styles.cardTitle}>Where the manure went</div>
              <div style={styles.cardSub}>Sold, composted on-site, or hauled away</div>
            </div>
            <button style={styles.primaryBtnInline} onClick={() => setShowDisposalForm(true)}>
              + Log a Disposal Record
            </button>
          </div>

          <div style={styles.historyLabel}>Recent Records</div>
          {recentDisposalRecords.length > 0 ? (
            <>
              <div className="mr-table-wrap">
                <table className="mr-table" style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Date</th>
                      <th style={styles.th}>Method</th>
                      <th style={styles.th}>Buyer</th>
                      <th style={styles.th}>Quantity</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentDisposalRecords.map(r => (
                      <tr key={r.id}>
                        <td style={styles.tdStrong}>{r.disposal_date}</td>
                        <td style={styles.td}>{r.disposal_method === 'Other' ? (r.other_method_detail || 'Other') : r.disposal_method}</td>
                        <td style={styles.td}>{r.buyer_name || '—'}</td>
                        <td style={styles.tdStrong}>{r.quantity} kg</td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>
                          <span style={styles.viewBtn} onClick={() => setViewRecord({ type: 'disposal', record: r })}>
                            View
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mr-pagination">
                <span style={styles.paginationText}>
                  Showing 1–{recentDisposalRecords.length} of {recentDisposalRecords.length}
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
            <p style={styles.emptyText}>No disposal records yet.</p>
          )}
        </section>
      )}

      {showMaintenanceForm && (
        <Modal title="Log a Clean-out" onClose={() => { setShowMaintenanceForm(false); setMaintenanceError('') }}>
          <form onSubmit={handleMaintenanceSubmit} style={styles.form}>
            {maintenanceError && <div style={styles.formError}>{maintenanceError}</div>}

            <label style={styles.formLabel}>Date performed *</label>
            <input
              type="date"
              value={maintenanceDate}
              onChange={e => setMaintenanceDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              style={styles.formInput}
              required
            />

            <label style={styles.formLabel}>Notes (optional)</label>
            <textarea
              value={maintenanceNotes}
              onChange={e => setMaintenanceNotes(e.target.value)}
              placeholder="Removed all litter, added fresh bedding"
              style={{ ...styles.formInput, minHeight: '60px', resize: 'vertical' }}
            />

            <label style={styles.formLabel}>Photo *</label>
            <input
              type="file"
              accept="image/*"
              onChange={e => setMaintenancePhoto(e.target.files?.[0] || null)}
              style={styles.formInput}
              required
            />

            <div style={styles.formActions}>
              <button
                type="button"
                onClick={() => { setShowMaintenanceForm(false); setMaintenanceError('') }}
                style={styles.cancelBtn}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={maintenanceSubmitting || !maintenanceDate || !maintenancePhoto}
                style={{
                  ...styles.primaryBtnInline,
                  width: 'auto',
                  padding: '9px 16px',
                  fontSize: '13.5px',
                  opacity: (maintenanceSubmitting || !maintenanceDate || !maintenancePhoto) ? 0.6 : 1,
                  cursor: (maintenanceSubmitting || !maintenanceDate || !maintenancePhoto) ? 'not-allowed' : 'pointer',
                }}
              >
                {maintenanceSubmitting ? 'Saving...' : 'Save log'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {showDisposalForm && (
        <Modal title="Log a Disposal Record" onClose={() => { setShowDisposalForm(false); setDisposalError('') }}>
          <form onSubmit={handleDisposalSubmit} style={styles.form}>
            {disposalError && <div style={styles.formError}>{disposalError}</div>}

            <label style={styles.formLabel}>Disposal method *</label>
            <select
              value={disposalMethod}
              onChange={e => {
                setDisposalMethod(e.target.value)
                if (e.target.value !== 'Other') setDisposalCustomMethod('')
              }}
              style={styles.formInput}
            >
              <option value="Sold">Sold</option>
              <option value="Composted on-site">Composted on-site</option>
              <option value="Other">Other</option>
            </select>

            {disposalMethod === 'Other' && (
              <>
                <label style={styles.formLabel}>Specify disposal method *</label>
                <input
                  type="text"
                  value={disposalCustomMethod}
                  onChange={e => setDisposalCustomMethod(e.target.value)}
                  placeholder="e.g. Given away to neighboring farm"
                  style={styles.formInput}
                  required
                />
              </>
            )}

            <label style={styles.formLabel}>Quantity (kg) *</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={disposalQuantity}
              onChange={e => setDisposalQuantity(e.target.value)}
              placeholder="e.g. 200"
              style={styles.formInput}
              required
            />

            {disposalMethod === 'Sold' && (
              <>
                <label style={styles.formLabel}>Buyer name (optional)</label>
                <input
                  type="text"
                  value={disposalBuyerName}
                  onChange={e => setDisposalBuyerName(e.target.value)}
                  placeholder="e.g. Mang Rudy"
                  style={styles.formInput}
                />
              </>
            )}

            <label style={styles.formLabel}>Date *</label>
            <input
              type="date"
              value={disposalDate}
              onChange={e => setDisposalDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              style={styles.formInput}
              required
            />

            <label style={styles.formLabel}>Notes (optional)</label>
            <textarea
              value={disposalNotes}
              onChange={e => setDisposalNotes(e.target.value)}
              placeholder="Any additional details"
              style={{ ...styles.formInput, minHeight: '60px', resize: 'vertical' }}
            />

            <div style={styles.formActions}>
              <button
                type="button"
                onClick={() => { setShowDisposalForm(false); setDisposalError('') }}
                style={styles.cancelBtn}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={disposalSubmitting || !disposalQuantity || !disposalDate || (disposalMethod === 'Other' && !disposalCustomMethod.trim())}
                style={{
                  ...styles.primaryBtnInline,
                  width: 'auto',
                  padding: '9px 16px',
                  fontSize: '13.5px',
                  opacity: (disposalSubmitting || !disposalQuantity || !disposalDate || (disposalMethod === 'Other' && !disposalCustomMethod.trim())) ? 0.6 : 1,
                  cursor: (disposalSubmitting || !disposalQuantity || !disposalDate || (disposalMethod === 'Other' && !disposalCustomMethod.trim())) ? 'not-allowed' : 'pointer',
                }}
              >
                {disposalSubmitting ? 'Saving...' : 'Save record'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {viewRecord && viewRecord.type === 'cleanout' && (
        <RecordDetailModal
          title="Clean-out Details"
          photoUrl={viewRecord.record.photo_url}
          onClose={() => setViewRecord(null)}
          rows={[
            { label: 'Date Performed', value: viewRecord.record.performed_at },
            { label: 'Notes', value: viewRecord.record.notes },
          ]}
        />
      )}

      {viewRecord && viewRecord.type === 'disposal' && (
        <RecordDetailModal
          title="Disposal Record Details"
          onClose={() => setViewRecord(null)}
          rows={[
            { label: 'Date', value: viewRecord.record.disposal_date },
            {
              label: 'Disposal Method',
              value: viewRecord.record.disposal_method === 'Other'
                ? (viewRecord.record.other_method_detail || 'Other')
                : viewRecord.record.disposal_method,
            },
            ...(viewRecord.record.disposal_method === 'Sold'
              ? [{ label: 'Buyer', value: viewRecord.record.buyer_name }]
              : []),
            { label: 'Quantity', value: `${viewRecord.record.quantity} kg` },
            { label: 'Notes', value: viewRecord.record.notes },
          ]}
        />
      )}
    </FarmerLayout>
  )
}

function maintBadgeStyle(status) {
  if (status === 'Non-Compliant') return { backgroundColor: '#fbeaea', color: '#b91c1c' }
  if (status === 'Overdue') return { backgroundColor: '#fbf1e2', color: '#b45309' }
  return { backgroundColor: '#eaf3ec', color: '#2c8047' } // 'Compliant'
}

function RecordDetailModal({ title, rows, photoUrl, onClose }) {
  // "Notes" is free text, not a fixed field — gets the larger bordered
  // notes box instead of sitting in the field grid like the rest.
  const fieldRows = rows.filter(r => r.label !== 'Notes')
  const notesRow = rows.find(r => r.label === 'Notes')

  return (
    <div style={v.overlay} onClick={onClose}>
      <div style={v.modal} onClick={e => e.stopPropagation()}>
        <div style={v.header}>
          <h3 style={v.title}>{title}</h3>
          <span style={v.close} onClick={onClose}>×</span>
        </div>

        {photoUrl && (
          <img src={photoUrl} alt="Record" style={styles.recordModalPhoto} />
        )}

        <span style={v.sectionLabel}>Record Details</span>
        <div style={notesRow ? v.grid : v.gridLast}>
          {fieldRows.map(r => (
            <div key={r.label} style={v.fieldBox}>
              <div style={v.fieldLabel}>{r.label}</div>
              <div style={v.fieldValue}>{r.value ?? '—'}</div>
            </div>
          ))}
        </div>

        {notesRow && (
          <>
            <span style={v.sectionLabel}>Notes</span>
            <div style={v.notesBox}>
              <p style={v.notes}>{notesRow.value || 'No notes provided.'}</p>
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

function Modal({ title, onClose, children }) {
  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div className="mr-modal-card" onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h3 style={styles.modalTitle}>{title}</h3>
          <span style={styles.modalCloseBtn} onClick={onClose}>×</span>
        </div>
        {children}
      </div>
    </div>
  )
}

const SANS = "'Inter', sans-serif"

const styles = {
  stateText: { fontFamily: SANS, fontSize: '14px', color: '#4b5a50' },

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

  cardTitle: { fontSize: '15px', fontWeight: 800, color: '#16311d' },
  cardSub: { fontSize: '12.5px', color: '#8a968d', marginTop: '2px' },

  statCard: {
    display: 'flex', flexDirection: 'column', gap: '2px',
    borderRadius: '14px', padding: '16px 18px',
    background: '#1B4332', fontFamily: SANS,
  },
  statMiniLabel: { fontSize: '11.5px', fontWeight: 700, color: '#9dc4ac' },
  statValueSm: { fontSize: '16px', fontWeight: 800, color: '#fff', marginTop: '3px' },
  statSubLabel: { fontSize: '11.5px', color: '#a9c9b5', fontWeight: 600, marginTop: '2px' },

  badge: { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap', width: 'fit-content', marginTop: '5px' },
  badgeDot: { width: '6px', height: '6px', borderRadius: '50%' },

  primaryBtnInline: { flexShrink: 0, padding: '12px 22px', borderRadius: '10px', border: 'none', background: '#1B4332', color: '#fff', fontFamily: SANS, fontSize: '14px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },

  historyLabel: { fontSize: '11px', fontWeight: 700, color: '#8a968d', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '4px 0 8px' },
  emptyText: { fontSize: '13px', color: '#9aa79d', fontStyle: 'italic', margin: 0 },

  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'left', padding: '10px 14px', fontSize: '13px', fontWeight: 600, color: '#8a968d',
    borderBottom: '1px solid #eceee7',
    backgroundColor: '#fafbf8', whiteSpace: 'nowrap',
  },
  td: { padding: '11px 14px', fontSize: '12px', color: '#4b5a50', borderBottom: '1px solid #f2f3ed', verticalAlign: 'top' },
  tdStrong: { padding: '11px 14px', fontSize: '12px', fontWeight: 700, color: '#16311d', borderBottom: '1px solid #f2f3ed', verticalAlign: 'top', whiteSpace: 'nowrap' },

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

  form: { display: 'flex', flexDirection: 'column', gap: '4px' },
  formError: { backgroundColor: '#fbeaea', border: '1px solid #f0c9c9', color: '#b91c1c', padding: '10px 14px', borderRadius: '10px', fontSize: '13px', marginBottom: '10px' },
  formLabel: { display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#33413a', marginTop: '12px', marginBottom: '5px' },
  formInput: { width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #dcdfd6', fontSize: '13.5px', boxSizing: 'border-box', fontFamily: SANS, color: '#16311d' },
  formActions: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' },
  cancelBtn: { padding: '9px 16px', borderRadius: '10px', border: '1px solid #dcdfd6', backgroundColor: '#fff', fontSize: '13.5px', fontWeight: 600, color: '#33413a', cursor: 'pointer', fontFamily: SANS },

  recordModalPhoto: { width: '100%', borderRadius: '10px', marginBottom: '14px', display: 'block' },

  modalOverlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(15,38,22,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  modalTitle: { fontSize: '16px', fontWeight: 800, color: '#16311d', margin: 0 },
  modalCloseBtn: { fontSize: '20px', cursor: 'pointer', color: '#8a968d', lineHeight: 1 },
}