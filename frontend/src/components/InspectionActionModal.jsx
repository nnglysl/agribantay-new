import { useEffect, useId, useRef } from 'react'
import { SANS } from '../styles/viewModalStyles'
import './inspection-details-modal.css'
import './inspection-action-modal.css'

// Inspection action forms reuse the Details modal's header and native dialog.
export default function InspectionActionModal({ title, subtitle, busy, onClose, onSubmit, actions, children }) {
  const dialog = useRef(null)
  const titleId = useId()
  const subtitleId = useId()

  useEffect(() => {
    const element = dialog.current
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    element.showModal()
    document.body.style.overflow = 'hidden'
    const initial = element.querySelector('[data-initial-focus]') || element.querySelector('textarea, input, button')
    initial?.focus()
    return () => {
      element.close()
      document.body.style.overflow = overflow
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [])

  useEffect(() => {
    // Keep focus in the form when its submitting button becomes disabled.
    if (busy) dialog.current.querySelector('[data-initial-focus]')?.focus()
  }, [busy])

  const dismiss = () => { if (!busy) onClose() }
  const handleKeyDown = event => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      dismiss()
      return
    }
    if (event.key !== 'Tab') return
    const controls = [...dialog.current.querySelectorAll('button:not(:disabled), textarea:not(:disabled), input:not(:disabled), select:not(:disabled)')]
      .filter(element => element.getClientRects().length)
    const first = controls[0], last = controls.at(-1)
    if (!first) { event.preventDefault(); return }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }

  return (
    <dialog
      ref={dialog}
      className="inspection-details-dialog inspection-action-dialog"
      style={{ fontFamily: SANS }}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={subtitleId}
      onCancel={event => { event.preventDefault(); dismiss() }}
      onClick={event => { if (event.target === event.currentTarget) dismiss() }}
      onKeyDown={handleKeyDown}
    >
      <form className="inspection-details-content inspection-action-form" noValidate onSubmit={onSubmit} aria-busy={busy}>
        <header className="inspection-details-header">
          <div className="inspection-details-heading">
            <h2 id={titleId}>{title}</h2>
            <p id={subtitleId} className="inspection-action-subtitle">{subtitle}</p>
          </div>
          <button type="button" className="inspection-details-close" aria-label={`Close ${title}`} onClick={dismiss} disabled={busy}>
            <span aria-hidden="true">&times;</span>
          </button>
        </header>
        <div className="inspection-action-body">{children}</div>
        <div className="inspection-action-actions">{actions}</div>
      </form>
    </dialog>
  )
}
