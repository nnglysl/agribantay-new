import { useId, useRef, useState } from 'react'
import api from '../api/axios'
import InspectionActionModal from './InspectionActionModal'
import { BtnBusy } from './Loading'

export default function CancelInspectionModal({ inspection, onClose, onSuccess }) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [loading, setLoading] = useState(false)
  const pending = useRef(false)
  const textarea = useRef(null)
  const reasonId = useId()
  const errorId = useId()
  const owner = inspection.owner_name?.trim() || inspection.farm_name

  const requestClose = () => { if (!pending.current) onClose() }
  const handleSubmit = async event => {
    event.preventDefault()
    if (pending.current) return
    const trimmedReason = reason.trim()
    if (!trimmedReason) {
      setError('A cancellation reason is required.')
      setInvalid(true)
      textarea.current.focus()
      return
    }

    setError('')
    setInvalid(false)
    // Guard the request and every dismissal before the disabled state paints.
    pending.current = true
    setLoading(true)
    try {
      await api.patch(`/admin/inspections/${inspection.id}/cancel`, { reason: trimmedReason })
      onSuccess()
    } catch (failure) {
      const messages = failure.response?.data?.errors?.reason
      const fieldError = Array.isArray(messages) ? messages[0] : messages
      setError(fieldError || failure.response?.data?.message || 'Could not cancel this inspection. Please try again.')
      setInvalid(!!fieldError)
    } finally {
      pending.current = false
      setLoading(false)
    }
  }

  return (
    <InspectionActionModal
      title="Cancel Inspection"
      subtitle={`Cancel ${inspection.inspection_number} for ${owner}? The reason below is included in the farm owner's AgriBantay cancellation notification.`}
      busy={loading}
      onClose={requestClose}
      onSubmit={handleSubmit}
      actions={<>
        <button type="button" className="inspection-action-secondary" disabled={loading} onClick={requestClose}>Keep Inspection</button>
        <button type="submit" className="inspection-action-destructive" disabled={loading || !reason.trim()}>
          {loading ? <BtnBusy label="Cancelling…" /> : 'Cancel Inspection'}
        </button>
      </>}
    >
      <label className="inspection-action-label" htmlFor={reasonId}>Cancellation Reason *</label>
      <textarea
        ref={textarea}
        id={reasonId}
        className="inspection-action-input"
        data-initial-focus
        required
        rows={4}
        value={reason}
        readOnly={loading}
        aria-invalid={invalid}
        aria-describedby={error ? errorId : undefined}
        onChange={event => { setReason(event.target.value); if (error) { setError(''); setInvalid(false) } }}
        placeholder="Why is this inspection being cancelled?"
      />
      {error && <p id={errorId} className="inspection-action-field-error" role="alert">{error}</p>}
    </InspectionActionModal>
  )
}
