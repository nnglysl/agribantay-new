import { useState, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

const STORAGE_KEY = 'agribantay_selected_month'

function parseMonthParam(param) {
  if (!param) return null
  const [y, m] = param.split('-').map(Number)
  if (!y || !m || m < 1 || m > 12) return null
  return new Date(y, m - 1, 1)
}

export function formatMonthParam(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Shared "which month are we looking at" state for the Dashboard and
 * Inspections pages. Backed by a `?month=YYYY-MM` URL param (so links
 * between pages can carry the month along) and localStorage (so the
 * month persists even when navigating without a param, e.g. clicking
 * the sidebar link instead of a "view in Inspections" button).
 */
export function useMonthFilter() {
  const [searchParams, setSearchParams] = useSearchParams()

  const resolveInitial = () => {
    const fromUrl = parseMonthParam(searchParams.get('month'))
    if (fromUrl) return fromUrl
    const fromStorage = parseMonthParam(localStorage.getItem(STORAGE_KEY))
    if (fromStorage) return fromStorage
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  }

  const [month, setMonthState] = useState(resolveInitial)

  const setMonth = useCallback((date) => {
    const normalized = new Date(date.getFullYear(), date.getMonth(), 1)
    setMonthState(normalized)
    localStorage.setItem(STORAGE_KEY, formatMonthParam(normalized))
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('month', formatMonthParam(normalized))
      return next
    }, { replace: true })
  }, [setSearchParams])

  const prevMonth = useCallback(() => {
    setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
  }, [month, setMonth])

  const nextMonth = useCallback(() => {
    setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
  }, [month, setMonth])

  // If the page was opened without a ?month= param, stamp the URL with
  // whichever month we resolved (from storage or "now") so it's shareable.
  useEffect(() => {
    if (!searchParams.get('month')) {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev)
        next.set('month', formatMonthParam(month))
        return next
      }, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    month,
    setMonth,
    prevMonth,
    nextMonth,
    label: month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    param: formatMonthParam(month),
  }
}

// Filters any array of records with a `scheduled_at` (or other date-ish
// field) down to just the ones in the given month.
export function filterByMonth(records, month, dateField = 'scheduled_at') {
  return records.filter(r => {
    const d = new Date(r[dateField])
    return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth()
  })
}