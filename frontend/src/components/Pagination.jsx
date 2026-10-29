import { useEffect, useMemo, useRef, useState } from 'react'
import '../styles/pagination.css'

/**
 * The single Previous / page-numbers / Next control used everywhere a table
 * or record list paginates — every role, every module. Callers keep their
 * own "Showing X–Y of Z" text and page-size selector exactly as before;
 * this renders only the button cluster itself, so that cluster's design
 * (shape, color, spacing, disabled state) stays centralized in one place
 * instead of being redefined per page.
 */
export default function Pagination({ currentPage, totalPages, onPageChange, isMobile = false, maxButtons }) {
  const navigation = useRef(null)
  const [availableWidth, setAvailableWidth] = useState(() => typeof window === 'undefined' ? 1024 : window.innerWidth)
  useEffect(() => {
    const container = navigation.current.closest('.agb-table-footer') || navigation.current.parentElement
    const observer = new ResizeObserver(([entry]) => setAvailableWidth(entry.contentRect.width || window.innerWidth))
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const pages = Math.max(1, totalPages || 1)
  const safe = Math.min(Math.max(1, currentPage || 1), pages)
  const requestedButtons = maxButtons ?? (isMobile ? 3 : 5)
  // Only the visible page-number window changes; every page stays reachable.
  const max = Math.min(requestedButtons, availableWidth < 250 ? 1 : availableWidth < 620 ? 3 : requestedButtons)

  const pageNumbers = useMemo(() => {
    let start = Math.max(1, safe - Math.floor(max / 2))
    let end = start + max - 1
    if (end > pages) { end = pages; start = Math.max(1, end - max + 1) }
    const out = []
    for (let p = start; p <= end; p++) out.push(p)
    return out
  }, [safe, pages, max])

  return (
    <nav ref={navigation} className="no-print agb-pagination" aria-label="Pagination">
      <button
        type="button"
        className="agb-pagination-nav"
        aria-label="Previous"
        onClick={() => onPageChange(safe - 1)}
        disabled={safe === 1}
      >
        <span className="agb-pagination-arrow" aria-hidden="true">‹</span>
        <span className="agb-pagination-label">Previous</span>
      </button>

      {pageNumbers[0] > 1 && <span className="agb-pagination-ellipsis" aria-hidden="true">…</span>}
      {pageNumbers.map(p => (
        <button
          key={p}
          type="button"
          className="agb-pagination-page"
          aria-current={p === safe ? 'page' : undefined}
          onClick={() => onPageChange(p)}
        >
          {p}
        </button>
      ))}
      {pageNumbers[pageNumbers.length - 1] < pages && <span className="agb-pagination-ellipsis" aria-hidden="true">…</span>}

      <button
        type="button"
        className="agb-pagination-nav"
        aria-label="Next"
        onClick={() => onPageChange(safe + 1)}
        disabled={safe === pages}
      >
        <span className="agb-pagination-label">Next</span>
        <span className="agb-pagination-arrow" aria-hidden="true">›</span>
      </button>
    </nav>
  )
}
