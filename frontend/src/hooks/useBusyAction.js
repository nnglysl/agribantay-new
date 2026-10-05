import { useState } from 'react'

/**
 * Guard for one-off async actions (confirm dialogs, row buttons): `busy`
 * while the promise is pending, and a second click during that time is
 * ignored, so a double tap can never send the request twice.
 *
 *   const [busy, run] = useBusyAction()
 *   <button disabled={busy} onClick={() => run(handleDecline)}>
 */
export function useBusyAction() {
  const [busy, setBusy] = useState(false)
  const run = async (fn) => {
    if (busy) return undefined
    setBusy(true)
    try { return await fn() } finally { setBusy(false) }
  }
  return [busy, run]
}
