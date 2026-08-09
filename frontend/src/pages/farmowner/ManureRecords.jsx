import { useState } from 'react'
import FarmerLayout from '../../components/FarmerLayout'
import api from '../../api/axios'
import { useCachedFetch } from '../../hooks/useCachedFetch'

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
    font-family: 'Public Sans', system-ui, sans-serif;
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
    margin-top: 14px;
  }

  .mr-modal-card {
    background: white;
    border-radius: 14px;
    width: 100%;
    max-width: 440px;
    max-height: 85vh;
    overflow-y: auto;
    box-shadow: 0 12px 32px rgba(15,38,22,0.18);
  }
  @media (max-width: 640px) {
    .mr-modal-card {
      max-width: 100%;
      border-radius: 14px 14px 0 0;
      position: fixed;
      bottom: 0; left: 0; right: 0;
      max-height: 90vh;
    }
  }
`

export default function ManureRecords() {
  const { data: maintenance, loading: maintenanceLoading, refetch: refetchMaintenance } = useCachedFetch('/farmer/maintenance')
  const { data: disposalRecords, loading: disposalLoading, refetch: refetchDisposal } = useCachedFetch('/farmer/disposal-records')

  const [activeTab, setActiveTab] = useState('cleanout') // 'cleanout' | 'disposal'

  const [showMaintenanceForm, setShowMaintenanceForm] = useState(false)
  const [maintenanceDate, setMaintenanceDate] = useState('')
  const [maintenanceNotes, setMaintenanceNotes] = useState('')
  const [maintenancePhoto, setMaintenancePhoto] = useState(null)
  const [maintenanceSubmitting, setMaintenanceSubmitting] = useState(false)
  const [maintenanceError, setMaintenanceError] = useState('')

  const [showDisposalForm, setShowDisposalForm] = useState(false)
  const [disposalMethod, setDisposalMethod] = useState('Sold')
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

    setDisposalSubmitting(true)
    try {
      await api.post('/farmer/disposal-records', {
        disposal_method: disposalMethod,
        quantity: disposalQuantity,
        buyer_name: disposalMethod === 'Sold' ? disposalBuyerName : null,
        disposal_date: disposalDate,
        notes: disposalNotes,
      })
      setShowDisposalForm(false)
      setDisposalMethod('Sold')
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

  if (maintenanceLoading && disposalLoading) {
    return <FarmerLayout><p style={styles.stateText}>Loading...</p></FarmerLayout>
  }

  const recentMaintLogs = (maintenance?.recent_logs || []).slice(0, 5)
  const recentDisposalRecords = (disposalRecords || []).slice(0, 5)

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
              <span style={styles.statIconCircle}><CalendarIcon /></span>
              <div>
                <div style={styles.statMiniLabel}>Last clean-out</div>
                <div style={styles.statValueSm}>{maintenance?.status?.last_performed_at || 'Never'}</div>
                <div style={styles.statSubLabel}>{maintenance?.status?.days_since ?? '—'} days ago</div>
              </div>
            </div>

            <div style={styles.statCard}>
              <span style={styles.statIconCircle}><BroomIcon /></span>
              <div>
                <div style={styles.statMiniLabel}>Recommended frequency</div>
                <div style={styles.statValueSm}>
                  Every ~{maintenance?.status?.expected_interval_days ? Math.round(maintenance.status.expected_interval_days / 30) : '—'} mo.
                </div>
                <div style={styles.statSubLabel}>Based on your farm size</div>
              </div>
            </div>

            <div style={styles.statCard}>
              <span style={styles.statIconCircle}><ShieldIcon /></span>
              <div>
                <div style={styles.statMiniLabel}>Status</div>
                {maintenance?.status && (
                  <span style={{ ...styles.badge, ...maintBadgeStyle(maintenance.status.status) }}>
                    <span style={{ ...styles.badgeDot, backgroundColor: maintBadgeStyle(maintenance.status.status).color }} />
                    {maintenance.status.status}
                  </span>
                )}
              </div>
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
                            <button
                              style={styles.viewBtn}
                              onClick={() => setViewRecord({ type: 'cleanout', record: log })}
                              aria-label="View clean-out record"
                            >
                              <EyeIcon />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mr-pagination">
                  <span style={styles.paginationText}>
                    Showing 1 to {recentMaintLogs.length} of {recentMaintLogs.length} entries
                  </span>
                  <div style={styles.pagerBtns}>
                    <button style={styles.pagerBtn} disabled>‹</button>
                    <button style={styles.pagerBtnActive}>1</button>
                    <button style={styles.pagerBtn} disabled>›</button>
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
                        <td style={styles.td}>{r.disposal_method}</td>
                        <td style={styles.td}>{r.buyer_name || '—'}</td>
                        <td style={styles.tdStrong}>{r.quantity} kg</td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>
                          <button
                            style={styles.viewBtn}
                            onClick={() => setViewRecord({ type: 'disposal', record: r })}
                            aria-label="View disposal record"
                          >
                            <EyeIcon />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mr-pagination">
                <span style={styles.paginationText}>
                  Showing 1 to {recentDisposalRecords.length} of {recentDisposalRecords.length} entries
                </span>
                <div style={styles.pagerBtns}>
                  <button style={styles.pagerBtn} disabled>‹</button>
                  <button style={styles.pagerBtnActive}>1</button>
                  <button style={styles.pagerBtn} disabled>›</button>
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
                  padding: '11px 20px',
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
              onChange={e => setDisposalMethod(e.target.value)}
              style={styles.formInput}
            >
              <option value="Sold">Sold</option>
              <option value="Composted on-site">Composted on-site</option>
              <option value="Other">Other</option>
            </select>

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
                disabled={disposalSubmitting || !disposalQuantity || !disposalDate}
                style={{
                  ...styles.primaryBtnInline,
                  width: 'auto',
                  padding: '11px 20px',
                  opacity: (disposalSubmitting || !disposalQuantity || !disposalDate) ? 0.6 : 1,
                  cursor: (disposalSubmitting || !disposalQuantity || !disposalDate) ? 'not-allowed' : 'pointer',
                }}
              >
                {disposalSubmitting ? 'Saving...' : 'Save record'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {viewRecord && viewRecord.type === 'cleanout' && (
        <Modal title="Clean-out Details" onClose={() => setViewRecord(null)}>
          <div style={styles.viewDetail}>
            <DetailRow label="Date performed" value={viewRecord.record.performed_at} />
            <DetailRow label="Notes" value={viewRecord.record.notes || '—'} />
            {viewRecord.record.photo_url && (
              <div>
                <div style={styles.formLabel}>Photo</div>
                <img
                  src={viewRecord.record.photo_url}
                  alt="Clean-out"
                  style={styles.viewPhoto}
                />
              </div>
            )}
          </div>
        </Modal>
      )}

      {viewRecord && viewRecord.type === 'disposal' && (
        <Modal title="Disposal Record Details" onClose={() => setViewRecord(null)}>
          <div style={styles.viewDetail}>
            <DetailRow label="Date" value={viewRecord.record.disposal_date} />
            <DetailRow label="Disposal method" value={viewRecord.record.disposal_method} />
            {viewRecord.record.disposal_method === 'Sold' && (
              <DetailRow label="Buyer" value={viewRecord.record.buyer_name || '—'} />
            )}
            <DetailRow label="Quantity" value={`${viewRecord.record.quantity} kg`} />
            <DetailRow label="Notes" value={viewRecord.record.notes || '—'} />
          </div>
        </Modal>
      )}
    </FarmerLayout>
  )
}

function maintBadgeStyle(status) {
  if (status === 'Overdue') return { backgroundColor: '#fbe3e3', color: '#b91c1c' }
  if (status === 'Due') return { backgroundColor: '#fdf3e6', color: '#b45309' }
  return { backgroundColor: '#eaf3ec', color: '#256b3d' }
}

function DetailRow({ label, value }) {
  return (
    <div style={styles.detailRow}>
      <div style={styles.detailLabel}>{label}</div>
      <div style={styles.detailValue}>{value}</div>
    </div>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div className="mr-modal-card" onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <p style={styles.modalTitle}>{title}</p>
          <button style={styles.modalCloseBtn} onClick={onClose} aria-label="Close">×</button>
        </div>
        <div style={styles.modalBody}>{children}</div>
      </div>
    </div>
  )
}

const iconBase = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }

function CalendarIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" {...iconBase} strokeWidth="2" style={{ color: '#1B4332' }}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
}
function BroomIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" {...iconBase} strokeWidth="2" style={{ color: '#1B4332' }}><path d="M3 21l6-6M13 3l8 8-6 6-8-8z" /><path d="M9 13l-4 4" /></svg>
}
function ShieldIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" {...iconBase} strokeWidth="2" style={{ color: '#1B4332' }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
}
function EyeIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" {...iconBase} strokeWidth="2" style={{ color: '#5c6b60' }}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
}

const SANS = "'Public Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

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

  statCard: { display: 'flex', alignItems: 'flex-start', gap: '10px', border: '1px solid #e7e8e0', borderRadius: '12px', padding: '14px', background: '#fff' },
  statIconCircle: { width: '38px', height: '38px', borderRadius: '50%', background: '#eaf3ec', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  statMiniLabel: { fontSize: '11.5px', fontWeight: 700, color: '#5c6b60' },
  statValueSm: { fontSize: '15.5px', fontWeight: 800, color: '#16311d', marginTop: '2px' },
  statSubLabel: { fontSize: '11.5px', color: '#8a968d', fontWeight: 600, marginTop: '1px' },

  badge: { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap', width: 'fit-content', marginTop: '3px' },
  badgeDot: { width: '6px', height: '6px', borderRadius: '50%' },

  primaryBtnInline: { flexShrink: 0, padding: '12px 22px', borderRadius: '10px', border: 'none', background: '#1B4332', color: '#fff', fontFamily: SANS, fontSize: '14px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },

  historyLabel: { fontSize: '11px', fontWeight: 700, color: '#8a968d', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '4px 0 8px' },
  emptyText: { fontSize: '13px', color: '#9aa79d', fontStyle: 'italic', margin: 0 },

  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', fontSize: '11.5px', fontWeight: 700, color: '#8a968d', textTransform: 'uppercase', letterSpacing: '0.03em', padding: '8px 10px', borderBottom: '1px solid #eceee6' },
  td: { fontSize: '13px', color: '#5c6b60', padding: '10px', borderBottom: '1px solid #f2f3ed' },
  tdStrong: { fontSize: '13px', fontWeight: 700, color: '#16311d', padding: '10px', borderBottom: '1px solid #f2f3ed', whiteSpace: 'nowrap' },

  viewBtn: { width: '30px', height: '30px', borderRadius: '8px', border: '1px solid #e2e4dc', background: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' },

  paginationText: { fontSize: '12.5px', color: '#8a968d' },
  pagerBtns: { display: 'flex', gap: '6px' },
  pagerBtn: { width: '28px', height: '28px', borderRadius: '7px', border: '1px solid #e2e4dc', background: '#fff', color: '#9aa79d', fontSize: '13px', cursor: 'not-allowed' },
  pagerBtnActive: { width: '28px', height: '28px', borderRadius: '7px', border: '1px solid #1B4332', background: '#1B4332', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'default' },

  form: { display: 'flex', flexDirection: 'column', gap: '4px' },
  formError: { backgroundColor: '#fdf2f2', border: '1px solid #f3c9c9', color: '#b91c1c', padding: '10px 14px', borderRadius: '9px', fontSize: '13px', marginBottom: '8px' },
  formLabel: { fontSize: '12.5px', fontWeight: 600, color: '#33413a', marginTop: '10px', marginBottom: '4px' },
  formInput: { width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #dcdfd6', fontSize: '13.5px', boxSizing: 'border-box', fontFamily: SANS, color: '#16311d' },
  formActions: { display: 'flex', gap: '10px', marginTop: '16px' },
  cancelBtn: { padding: '11px 18px', borderRadius: '10px', border: '1px solid #d9dcd4', backgroundColor: 'white', fontSize: '14px', fontWeight: 600, color: '#33413a', cursor: 'pointer', fontFamily: SANS },

  viewDetail: { display: 'flex', flexDirection: 'column', gap: '2px' },
  detailRow: { display: 'flex', flexDirection: 'column', gap: '2px', padding: '10px 0', borderBottom: '1px solid #f2f3ed' },
  detailLabel: { fontSize: '11.5px', fontWeight: 700, color: '#8a968d', textTransform: 'uppercase', letterSpacing: '0.03em' },
  detailValue: { fontSize: '14px', fontWeight: 600, color: '#16311d' },
  viewPhoto: { width: '100%', borderRadius: '10px', marginTop: '4px', border: '1px solid #e7e8e0' },

  modalOverlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(15,38,22,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #f2f3ed', position: 'sticky', top: 0, backgroundColor: 'white', borderRadius: '14px 14px 0 0' },
  modalTitle: { fontSize: '16px', fontWeight: 800, color: '#16311d', margin: 0 },
  modalCloseBtn: { background: 'none', border: 'none', fontSize: '22px', lineHeight: 1, color: '#9aa79d', cursor: 'pointer', padding: '2px 6px' },
  modalBody: { padding: '18px 20px 20px' },
}