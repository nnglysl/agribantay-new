import { useEffect, useId, useRef, useState } from 'react'
import '../styles/tables.css'

/** One touch-scrolling surface, with a persistent, synchronized scroll control. */
export default function TableScroll({ children, style, className = '' }) {
  const viewport = useRef(null)
  const id = useId()
  const [scroll, setScroll] = useState({ left: 0, max: 0, ratio: 1, hasRecords: false })
  const overflows = scroll.hasRecords && scroll.max > 1

  useEffect(() => {
    const el = viewport.current
    let frame
    let table
    const measure = () => {
      const max = Math.max(0, el.scrollWidth - el.clientWidth)
      const left = Math.max(0, Math.min(el.scrollLeft, max))
      const ratio = el.clientWidth / Math.max(1, el.scrollWidth)
      // Read the existing rendered rows solely to decide whether the indicator is useful.
      const hasRecords = [...(table?.tBodies || [])].some(body => body.rows.length > 0)
      setScroll(previous => previous.left === left && previous.max === max && previous.ratio === ratio && previous.hasRecords === hasRecords
        ? previous : { left, max, ratio, hasRecords })
    }
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    const resize = new ResizeObserver(schedule)
    const observeTable = () => {
      if (table !== el.firstElementChild) {
        if (table) resize.unobserve(table)
        table = el.firstElementChild
        if (table) resize.observe(table)
      }
      schedule()
    }
    // Recheck after loading, filtering, paging, or replacing a table's rows.
    const content = new MutationObserver(observeTable)
    resize.observe(el)
    observeTable()
    content.observe(el, { childList: true, subtree: true, characterData: true })
    el.addEventListener('scroll', schedule, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      content.disconnect()
      el.removeEventListener('scroll', schedule)
    }
  }, [])

  return (
    <div className="agb-table-scroll-shell">
      <div
        ref={viewport}
        id={id}
        className={`agb-table-scroll ${className}`}
        style={style}
        tabIndex={overflows ? 0 : undefined}
        role={overflows ? 'region' : undefined}
        aria-label={overflows ? 'Scrollable table' : undefined}
      >
        {children}
      </div>
      {overflows && (
        <div className="agb-table-scroll-control">
          <input
            type="range"
            min="0"
            max={scroll.max}
            step="1"
            value={scroll.left}
            aria-label="Scroll table horizontally"
            aria-controls={id}
            aria-valuetext={`${Math.round(scroll.left / scroll.max * 100)}% scrolled`}
            style={{ '--table-thumb-width': `${scroll.ratio * 100}%` }}
            onChange={event => {
              const left = Number(event.target.value)
              viewport.current.scrollLeft = left
              setScroll(previous => ({ ...previous, left }))
            }}
          />
        </div>
      )}
    </div>
  )
}
