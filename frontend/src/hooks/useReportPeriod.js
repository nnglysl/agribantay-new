import { useState } from 'react'
import { defaultReportPeriod, resolveReportPeriod } from '../utils/reportPeriod'

export function useReportPeriod() {
  const [period, setPeriod] = useState(defaultReportPeriod)
  const [draftPeriod, setDraftPeriod] = useState(defaultReportPeriod)
  const [periodError, setPeriodError] = useState('')
  const resolved = resolveReportPeriod(period)
  const openPeriod = () => { setDraftPeriod({ ...period }); setPeriodError('') }
  const applyPeriod = () => {
    const next = resolveReportPeriod(draftPeriod)
    setPeriodError(next.error)
    if (next.error) return false
    setPeriod({ ...draftPeriod })
    return true
  }
  const clearPeriod = () => {
    const next = defaultReportPeriod()
    setPeriod(next); setDraftPeriod(next); setPeriodError('')
  }
  return { fromDate: resolved.from, toDate: resolved.to, draftPeriod, setDraftPeriod, periodError, openPeriod, applyPeriod, clearPeriod }
}
