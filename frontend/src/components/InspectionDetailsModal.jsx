import { useEffect, useId, useRef } from 'react'
import { SANS, viewModalStyles as v } from '../styles/viewModalStyles'
import './inspection-details-modal.css'

// Callers retain their role-specific fields, date formatting and status rules.
export default function InspectionDetailsModal({ inspectionNumber, status, badgeStyle, fields, notes, findings, onClose }) {
  const dialog = useRef(null)
  const titleId = useId()
  const recordId = useId()
  const informationId = useId()
  const findingsId = useId()
  const notesId = useId()

  useEffect(() => {
    const element = dialog.current
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    // A native modal makes the rest of the page inert, including to screen readers.
    element.showModal()
    document.body.style.overflow = 'hidden'
    element.querySelector('button').focus()
    return () => {
      element.close()
      document.body.style.overflow = overflow
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [])

  const handleKeyDown = event => {
    if (event.key !== 'Tab') return
    const controls = [...dialog.current.querySelectorAll('button, [tabindex="0"]')]
    const first = controls[0], last = controls.at(-1)
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <dialog
      ref={dialog}
      className="inspection-details-dialog"
      style={{ fontFamily: SANS }}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={recordId}
      onCancel={event => { event.preventDefault(); onClose() }}
      onClick={event => { if (event.target === event.currentTarget) onClose() }}
      onKeyDown={handleKeyDown}
    >
      <div className="inspection-details-content">
        <header className="inspection-details-header">
          <div className="inspection-details-heading">
            <h2 id={titleId}>Inspection Details</h2>
            <div id={recordId} className="inspection-details-record">
              <span className="inspection-details-number">{inspectionNumber || 'Inspection'}</span>
              <span style={{ ...v.badge, ...badgeStyle }}>{status}</span>
            </div>
          </div>
          <button type="button" className="inspection-details-close" aria-label="Close Inspection Details" onClick={onClose}>
            <span aria-hidden="true">&times;</span>
          </button>
        </header>

        <div className="inspection-details-body" tabIndex={0} role="region" aria-label="Inspection details content">
          <section aria-labelledby={informationId}>
            <h3 id={informationId}>Inspection Information</h3>
            <dl className="inspection-details-grid">
              {fields.map(field => (
                <div key={field.label} className="inspection-details-field">
                  <dt>{field.label}</dt>
                  <dd>{field.value ?? '—'}</dd>
                </div>
              ))}
            </dl>
          </section>

          {notes && (
            <section aria-labelledby={notesId}>
              <h3 id={notesId}>Notes</h3>
              <p className="inspection-details-text">{notes}</p>
            </section>
          )}

          <section aria-labelledby={findingsId}>
            <h3 id={findingsId}>Findings</h3>
            <p className="inspection-details-text">{findings?.trim() ? findings : 'No findings recorded.'}</p>
          </section>
        </div>
      </div>
    </dialog>
  )
}
