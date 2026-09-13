// Shared visual language for every "View" detail modal in AgriBantay —
// simple white card, thin neutral borders, small radius, subtle individual
// bordered field boxes instead of colorful cards. Modeled on the finalized
// Service Request details modal (components/ServiceRequestDetailsModal.jsx).
//
// This file only supplies STYLE — each modal keeps its own fields, section
// labels, conditional logic, and status color mapping exactly as before.
// Import what you need; nothing here assumes a particular content shape.

export const SANS = "'Public Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

export const viewModalStyles = {
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(15,38,22,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' },
  modal: { fontFamily: SANS, backgroundColor: '#fff', borderRadius: '14px', padding: '28px', width: '580px', maxWidth: '100%', maxHeight: '88vh', overflowY: 'auto', border: '1px solid #e7e8e0' },
  modalWide: { fontFamily: SANS, backgroundColor: '#fff', borderRadius: '14px', padding: '28px', width: '720px', maxWidth: '100%', maxHeight: '88vh', overflowY: 'auto', border: '1px solid #e7e8e0' },
  modalMobile: { width: '100%', borderRadius: '14px 14px 0 0', padding: '20px', maxHeight: '88vh' },

  // Simple header: title (+ optional badge) on the left, × close on the right.
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #e7e8e0', gap: '12px' },
  headerTitleRow: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
  title: { fontSize: '17px', fontWeight: 700, color: '#16311d', margin: 0 },
  close: { fontSize: '20px', cursor: 'pointer', color: '#9aa79d', lineHeight: 1, flexShrink: 0 },

  sectionLabel: { display: 'block', fontSize: '11px', fontWeight: 700, color: '#8a968d', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px', marginTop: '4px' },

  // 2-column grid of individually bordered field boxes — the core
  // "organized administrative fields" look, used for every fixed
  // label/value pair across every modal.
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 12px', paddingBottom: '18px', borderBottom: '1px solid #eceee7', marginBottom: '18px' },
  gridLast: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 12px' },
  fieldBox: {
    border: '1px solid #e7e8e0', borderRadius: '8px', backgroundColor: '#fafbf8',
    padding: '10px 13px', minHeight: '56px', boxSizing: 'border-box',
  },
  fieldLabel: { fontSize: '11.5px', color: '#8a968d', fontWeight: 500, marginBottom: '4px' },
  fieldValue: { fontSize: '13.5px', color: '#16311d', fontWeight: 600 },

  // Free-text sections (notes, findings, descriptions) — one larger
  // bordered box rather than a grid of small fields.
  notesBox: { border: '1px solid #e7e8e0', borderRadius: '8px', backgroundColor: '#fafbf8', padding: '12px 14px' },
  notes: { fontSize: '13px', color: '#4b5a50', lineHeight: '1.55', margin: 0 },

  // Small colored status pill — the one deliberate spot of color allowed
  // in an otherwise neutral modal. Each caller supplies its own
  // color/backgroundColor per its own status semantics.
  badge: { display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap' },

  actions: { display: 'flex', justifyContent: 'flex-end', marginTop: '22px' },
  closeBtn: { padding: '9px 20px', borderRadius: '8px', border: '1px solid #dcdfd6', backgroundColor: '#fff', color: '#33413a', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: SANS },
}
