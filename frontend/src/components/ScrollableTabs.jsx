import { useEffect, useId, useRef, useState } from 'react'
import '../styles/scrollableTabs.css'

/** Keep the existing tabs intact and expose their horizontal scroll position. */
export default function ScrollableTabs({ children, style, containerStyle, className = '', role: viewportRole, label = 'Inspection tabs', isMobile = false }) {
  const viewport = useRef(null)
  const id = useId()
  const [scroll, setScroll] = useState({ left: 0, max: 0, ratio: 1 })
  const overflows = scroll.max > 1

  useEffect(() => {
    const el = viewport.current
    let frame
    const measure = () => {
      const max = Math.max(0, el.scrollWidth - el.clientWidth)
      const left = Math.max(0, Math.min(el.scrollLeft, max))
      const ratio = el.clientWidth / Math.max(1, el.scrollWidth)
      setScroll(previous => previous.left === left && previous.max === max && previous.ratio === ratio
        ? previous : { left, max, ratio })
    }
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    const resize = new ResizeObserver(schedule)
    resize.observe(el)
    for (const tab of el.children) resize.observe(tab)
    el.addEventListener('scroll', schedule, { passive: true })
    schedule()
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      el.removeEventListener('scroll', schedule)
    }
  }, [])

  return (
    <div className="agb-scrollable-tabs" style={containerStyle}>
      <div
        ref={viewport}
        id={id}
        className={`agb-scrollable-tabs-viewport ${className}`.trim()}
        style={style}
        tabIndex={overflows ? 0 : undefined}
        role={viewportRole || (overflows ? 'region' : undefined)}
        aria-label={viewportRole || overflows ? label : undefined}
      >
        {children}
      </div>
      {isMobile && overflows && (
        <div className="agb-tabs-scroll-control">
          <input
            type="range"
            min="0"
            max={scroll.max}
            step="1"
            value={scroll.left}
            aria-label={`Scroll ${label.toLowerCase()} horizontally`}
            aria-controls={id}
            aria-valuetext={`${Math.round(scroll.left / scroll.max * 100)}% scrolled`}
            style={{ '--tabs-thumb-width': `${scroll.ratio * 100}%` }}
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
