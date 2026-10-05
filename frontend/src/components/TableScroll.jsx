import { useOverflowX } from '../hooks/useOverflowX'
import { useIsMobile } from '../hooks/useIsMobile'

/**
 * A table that scrolls sideways when it does not fit, and says so.
 *
 * The list pages each grew their own copy of this: a `useOverflowX` ref, a
 * scrolling div, and a hint rendered above it only when the table really
 * overflows. The detail pages never got one, so their tables had an
 * `overflow-x: auto` wrapper around a table with no minimum width — which
 * never overflows, because the table simply shrinks to whatever it is given.
 * On a phone that turned six columns into six slivers and broke the words
 * inside them, which reads as damage rather than as a table waiting to be
 * scrolled.
 *
 * Giving the table a minimum width is what makes the wrapper mean anything.
 * This component pairs the two so they cannot drift apart again, and carries
 * the hint along with them.
 *
 * `style` and `className` are passed through to the scrolling element, so a
 * page keeps whatever border, radius and margin it already had.
 */
export default function TableScroll({ children, style, className, hint = true }) {
  const [ref, overflows] = useOverflowX()
  const isMobile = useIsMobile()

  return (
    <>
      {hint && overflows && (
        <p style={hintStyle}>{isMobile ? 'Swipe' : 'Scroll'} left/right to see all columns →</p>
      )}
      <div ref={ref} className={className} style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', ...style }}>
        {children}
      </div>
    </>
  )
}

const hintStyle = {
  fontFamily: "'Inter', sans-serif",
  fontSize: '11px',
  color: '#9aa79d',
  margin: '12px 0 0',
}
