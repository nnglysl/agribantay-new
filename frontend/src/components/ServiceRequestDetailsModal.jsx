import { formatDate, formatDateTime } from '../utils/formatDate'
import { viewModalStyles as v } from '../styles/viewModalStyles'

// Status keeps AgriBantay's usual semantic colors — the one deliberate
// exception to this modal's otherwise neutral palette.
const STATUS_COLOR = { Pending: '#b45309', Scheduled: '#2f6bb0', Completed: '#256b3d', Cancelled: '#6b7280' }

function badgeBg(status) {
  if (status === 'Pending') return '#fbf1e2'
  if (status === 'Scheduled') return '#e8eff8'
  if (status === 'Cancelled') return '#eef1ea'
  return '#eaf3ec'
}

// Generic " Request" suffix strip — works for every role's service types
// (Vet: "Vaccine Request"/"Blood Test Request", Admin: "Odor Control
// Request"/"Fly Control Request") without hardcoding either vocabulary.
function requestTypeLabel(type) {
  return type ? type.replace(' Request', '') : '—'
}

const BIRD_ESTIMATES = {
  Small: 'Below 10,000 layers',
  Medium: '10,000–50,000 layers',
  Large: 'Above 50,000 layers',
}

function farmSizeLabel(size) {
  if (!size) return null
  return BIRD_ESTIMATES[size] || size
}

/**
 * Single-request detail view — a plain administrative record, not a
 * dashboard card. Shared by the main Service Requests table and by Farms →
 * View Farm → Service Requests tab, so "View" always opens this exact modal
 * no matter where it's clicked from. Shows only the selected request — a
 * farm's complete request history lives on the Farm Details page itself,
 * not duplicated in here.
 *
 * `request` fields expected: request_number, farm_name, owner_name,
 * barangay, farm_size, service_type, created_at, scheduled_at,
 * completed_at, accepted_by, status, notes. Callers whose own data source
 * doesn't already carry every field (e.g. farm-scoped request lists) should
 * merge in the missing ones — like farm_name/owner_name/barangay/farm_size
 * from the farm already loaded on that page — before passing `request` in.
 */
export default function ServiceRequestDetailsModal({ request, onClose, isMobile }) {
  const color = STATUS_COLOR[request.status] || '#6b7280'

  const farmFields = [
    { label: 'Farm Name', value: request.farm_name },
    { label: 'Farm Owner', value: request.owner_name },
    { label: 'Location', value: request.barangay },
    { label: 'Farm Size', value: farmSizeLabel(request.farm_size) },
  ]

  const requestFields = [
    { label: 'Service Type', value: requestTypeLabel(request.service_type) },
    { label: 'Request Date', value: request.created_at ? formatDate(request.created_at) : null },
    { label: 'Scheduled Date', value: request.scheduled_at ? formatDateTime(request.scheduled_at) : null },
    ...(request.status === 'Completed'
      ? [{ label: 'Completed Date', value: request.completed_at ? formatDateTime(request.completed_at) : null }]
      : []),
    { label: 'Handled By', value: request.accepted_by },
    { label: 'Status', value: request.status },
  ]

  return (
    <div style={v.overlay} onClick={onClose}>
      <div style={{ ...v.modal, ...(isMobile ? v.modalMobile : {}) }} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={styles.headerTop}>
            <div style={v.headerTitleRow}>
              <h3 style={v.title}>{request.request_number || 'Service Request'}</h3>
              <span style={{ ...v.badge, color, backgroundColor: badgeBg(request.status) }}>{request.status}</span>
            </div>
            <span style={v.close} onClick={onClose}>×</span>
          </div>
          <div style={styles.headerSub}>{request.farm_name}</div>
          <div style={styles.headerSubMuted}>{request.owner_name} • {request.barangay}</div>
        </div>

        <span style={v.sectionLabel}>Farm Information</span>
        <div style={v.grid}>
          {farmFields.map(f => (
            <div key={f.label} style={v.fieldBox}>
              <div style={v.fieldLabel}>{f.label}</div>
              <div style={v.fieldValue}>{f.value || '—'}</div>
            </div>
          ))}
        </div>

        <span style={v.sectionLabel}>Request Information</span>
        <div style={v.grid}>
          {requestFields.map(f => (
            <div key={f.label} style={v.fieldBox}>
              <div style={v.fieldLabel}>{f.label}</div>
              <div style={v.fieldValue}>{f.value || '—'}</div>
            </div>
          ))}
        </div>

        <span style={v.sectionLabel}>Visit Notes</span>
        <div style={v.notesBox}>
          <p style={v.notes}>{request.notes || 'No notes recorded.'}</p>
        </div>

        <div style={v.actions}>
          <button onClick={onClose} style={v.closeBtn}>Close</button>
        </div>
      </div>
    </div>
  )
}

// This modal's header is a slightly richer variant (title+badge, then a
// farm-identity subtitle) than the shared plain header — built from the
// shared primitives (title/badge/close) plus a couple of local-only rows.
const styles = {
  header: { marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #e7e8e0' },
  headerTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' },
  headerSub: { fontSize: '13.5px', fontWeight: 600, color: '#33413a', marginTop: '10px' },
  headerSubMuted: { fontSize: '12.5px', color: '#8a968d', marginTop: '2px' },
}
