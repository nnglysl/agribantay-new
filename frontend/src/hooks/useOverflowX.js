import { useEffect, useRef, useState } from 'react'

/**
 * Reports whether a scroll container is actually overflowing horizontally.
 *
 * The data tables are laid out for ~800-1040px and are readable at that width
 * only, so they live in a horizontally scrolling box at every screen size.
 * Whether the "scroll for more columns" hint is warranted depends on the space
 * the table really has — sidebar, page padding and column count all feed into
 * it — not on whether the viewport is phone-sized. A tablet, a split-screen
 * window and a laptop at 125% zoom all overflow while being nothing like a
 * phone.
 *
 * Returns [ref, overflows]: put the ref on the scrolling element.
 */
export function useOverflowX() {
  const ref = useRef(null)
  const [overflows, setOverflows] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // ResizeObserver fires once on observe(), which doubles as the initial
    // measurement — so there is no setState directly in the effect body.
    const measure = () => setOverflows(el.scrollWidth > el.clientWidth + 1)
    const ro = new ResizeObserver(measure)

    ro.observe(el)
    // The table itself, so paging to rows with longer content re-measures.
    if (el.firstElementChild) ro.observe(el.firstElementChild)

    return () => ro.disconnect()
  }, [])

  return [ref, overflows]
}
