import { useId, useRef, useState } from 'react'
import api from '../api/axios'
import InspectionActionModal from './InspectionActionModal'
import { BtnBusy } from './Loading'

export default function CompleteInspectionModal({ inspection, onClose, onSuccess }) {
  const [findings, setFindings] = useState('')
  const [error, setError] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [loading, setLoading] = useState(false)
  const pending = useRef(false)
  const textarea = useRef(null)
  const findingsId = useId()
  const errorId = useId()

  const requestClose = () => { if (!pending.current) onClose() }
  const handleSubmit = async event => {
    event.preventDefault()
    if (pending.current) return
    setError('')
    setFieldError('')
    if (!findings.trim()) {
      setFieldError('Please enter your findings for this inspection.')
      textarea.current.focus()
      return
    }

    // The ref also guards submissions before React paints the disabled state.
    pending.current = true
    setLoading(true)
    try {
      await api.patch(`/admin/inspections/${inspection.id}/complete`, { findings })
      onSuccess()
    } catch (failure) {
      setError(failure.response?.data?.message || 'Failed to complete inspection.')
      const messages = failure.response?.data?.errors?.findings
      setFieldError(Array.isArray(messages) ? messages[0] || '' : messages || '')
    } finally {
      pending.current = false
      setLoading(false)
    }
  }

  return (
    <InspectionActionModal
      title="Complete Inspection"
      subtitle={`${inspection.inspection_number} — ${inspection.farm_name}`}
      busy={loading}
      onClose={requestClose}
      onSubmit={handleSubmit}
      actions={<>
        <button type="button" className="inspection-action-secondary" disabled={loading} onClick={requestClose}>Cancel</button>
        <button type="submit" className="inspection-action-primary" disabled={loading}>
          {loading ? <BtnBusy label="Saving…" /> : 'Mark as Completed'}
        </button>
      </>}
    >
      {error && error !== fieldError && <p className="inspection-action-error" role="alert">{error}</p>}
      <label className="inspection-action-label" htmlFor={findingsId}>Findings *</label>
      <textarea
        ref={textarea}
        id={findingsId}
        className="inspection-action-input"
        data-initial-focus
        required
        rows={4}
        value={findings}
        readOnly={loading}
        aria-invalid={!!fieldError}
        aria-describedby={fieldError ? errorId : undefined}
        onChange={event => setFindings(event.target.value)}
        placeholder="e.g. All systems normal. No violations observed."
      />
      {fieldError && <p id={errorId} className="inspection-action-field-error" role="alert">{fieldError}</p>}
    </InspectionActionModal>
  )
}
