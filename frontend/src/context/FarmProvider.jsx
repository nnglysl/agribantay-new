import { useState, useCallback } from 'react'
import { useCachedFetch } from '../hooks/useCachedFetch'
import FarmContext from './FarmContext'

const STORAGE_KEY = 'agribantay_selected_farm_id'

/**
 * Shared "which of my farms am I looking at" state for every Farmer page.
 * Wraps the whole Farmer section (see FarmerLayout) so the selector in the
 * layout and the data-fetching in each page read/write the exact same
 * selection — switching farms here is what makes every farm-scoped
 * endpoint (dashboard, service requests, inspections, ...) re-fetch for
 * the newly selected farm instead of silently keeping the old one.
 *
 * Persisted to localStorage (not the URL, unlike useMonthFilter) so the
 * choice survives navigating between Farmer pages and reloading, without
 * needing every page to carry a query param.
 */
export default function FarmProvider({ children }) {
  const { data: farms, loading, error, refetch } = useCachedFetch('/farmer/farms')

  const [selectedFarmId, setSelectedFarmIdState] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored ? Number(stored) : null
    } catch {
      return null
    }
  })

  // If the stored id doesn't belong to this account (switched accounts,
  // farm removed, or nothing stored yet), fall back to the first farm —
  // never leave the selection pointing at a farm this user can't see.
  // Adjusted during render (React's documented pattern for reacting to a
  // changed value — a plain state variable tracking the previous farms,
  // not a ref, since refs can't be read during render) rather than in an
  // effect, so the fallback lands before the first paint instead of one
  // render behind.
  const [prevFarms, setPrevFarms] = useState(null)
  if (farms && farms.length > 0 && farms !== prevFarms) {
    setPrevFarms(farms)
    if (!farms.some(f => f.id === selectedFarmId)) {
      setSelectedFarmIdState(farms[0].id)
    }
  }

  const setSelectedFarmId = useCallback((id) => {
    setSelectedFarmIdState(id)
    try {
      localStorage.setItem(STORAGE_KEY, String(id))
    } catch {
      // Selection just won't survive a reload — not worth failing over.
    }
  }, [])

  const selectedFarm = (farms || []).find(f => f.id === selectedFarmId) || null

  return (
    <FarmContext.Provider value={{
      farms: farms || [],
      farmsLoading: loading,
      farmsError: error,
      selectedFarmId,
      selectedFarm,
      setSelectedFarmId,
      refetchFarms: refetch,
    }}>
      {children}
    </FarmContext.Provider>
  )
}
