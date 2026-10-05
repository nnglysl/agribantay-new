/**
 * The one loading kit for AgriBantay: a green spinner, page/section loaders,
 * skeleton placeholders shaped like the real content, and a busy label for
 * buttons (the useBusyAction hook lives in hooks/). Animations live in index.css (.agb-spin, .agb-skeleton,
 * .agb-delayed). Everything is inline-styled like the rest of the app.
 *
 * Skeletons and loaders carry the `agb-delayed` class: invisible for the
 * first ~150 ms so a fast response never flashes a placeholder.
 */

export function Spinner({ size = 20, stroke = 2.5, color = '#2c8047', style }) {
  const s = `${size}px`
  return (
    <span
      className="agb-spin"
      role="status"
      aria-label="Loading"
      style={{
        display: 'inline-block', width: s, height: s, borderRadius: '50%', boxSizing: 'border-box',
        borderWidth: `${stroke}px`, borderStyle: 'solid', borderColor: `${color}33`, borderTopColor: color, flexShrink: 0, ...style,
      }}
    />
  )
}

/** Full-content-area loader (route transitions, first load of a page). */
export function PageLoader({ label = 'Loading…', minHeight = '50vh' }) {
  return (
    <div className="agb-delayed" style={{ minHeight, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', color: '#6b7770', fontSize: '13.5px' }}>
      <Spinner size={30} stroke={3} />
      <span>{label}</span>
    </div>
  )
}

/** Small centred spinner for a section/card that fetches on its own. */
export function SectionLoader({ label = 'Loading…', padding = '28px 16px' }) {
  return (
    <div className="agb-delayed" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding, color: '#8a968d', fontSize: '13px' }}>
      <Spinner size={18} />
      <span>{label}</span>
    </div>
  )
}

/**
 * Spinner + text inside a button. Buttons keep their own colours; the
 * spinner uses the button's text colour.
 */
export function BtnBusy({ label = 'Saving…', size = 14 }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
      <Spinner size={size} stroke={2} color="currentColor" style={{ borderColor: 'rgba(255,255,255,0.35)', borderTopColor: 'currentColor' }} />
      {label}
    </span>
  )
}

// ------------------------------------------------------------- skeletons

const bone = { backgroundColor: '#e7e8e0', borderRadius: '6px' }

export function SkeletonLine({ width = '100%', height = 12, style }) {
  return <div className="agb-skeleton" style={{ ...bone, width, height: `${height}px`, ...style }} />
}

/** Stat cards row — same grid as the dashboards' summary cards. */
export function SkeletonStatCards({ count = 4, columns, minWidth = 200 }) {
  return (
    <div className="agb-delayed" style={{ display: 'grid', gridTemplateColumns: columns || `repeat(auto-fit, minmax(${minWidth}px, 1fr))`, gap: '16px', marginBottom: '24px' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ backgroundColor: '#fff', borderRadius: '14px', border: '1px solid #e7e8e0', padding: '18px 20px' }}>
          <SkeletonLine width="55%" height={11} style={{ marginBottom: '14px' }} />
          <SkeletonLine width="40%" height={26} style={{ marginBottom: '10px' }} />
          <SkeletonLine width="70%" height={10} />
        </div>
      ))}
    </div>
  )
}

/**
 * Table body placeholder: `rows` × `columns` cells, first column wider like
 * an id/name. Drop it where the real <table> normally renders.
 */
export function SkeletonTable({ rows = 6, columns = 6, style }) {
  const widths = Array.from({ length: columns }).map((_, c) => (c === 1 ? '75%' : c === columns - 1 ? '45%' : '60%'))
  return (
    <div className="agb-delayed" role="status" aria-label="Loading table" style={{ backgroundColor: '#fff', borderRadius: '14px', border: '1px solid #e7e8e0', overflow: 'hidden', ...style }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: '16px', padding: '14px 18px', backgroundColor: '#fafbf8', borderBottom: '1px solid #e7e8e0' }}>
        {widths.map((w, c) => <SkeletonLine key={c} width="50%" height={10} />)}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: '16px', alignItems: 'center', padding: '16px 18px', borderBottom: r === rows - 1 ? 'none' : '1px solid #f0f1ec' }}>
          {widths.map((w, c) => (
            c === 1
              ? <div key={c}><SkeletonLine width={w} height={13} style={{ marginBottom: '6px' }} /><SkeletonLine width="55%" height={10} /></div>
              : <SkeletonLine key={c} width={w} height={c === columns - 1 ? 26 : 12} style={c === columns - 1 ? { borderRadius: '999px' } : undefined} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** A few text rows — for cards, lists and detail sections. */
export function SkeletonRows({ rows = 4, style }) {
  return (
    <div className="agb-delayed" style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px 0', ...style }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <SkeletonLine width="36px" height={36} style={{ borderRadius: '50%', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <SkeletonLine width={`${70 - (i % 3) * 12}%`} height={12} style={{ marginBottom: '6px' }} />
            <SkeletonLine width="40%" height={10} />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Large block (chart / map / report section). */
export function SkeletonBlock({ height = 220, style }) {
  return <div className="agb-skeleton agb-delayed" style={{ ...bone, borderRadius: '14px', height: `${height}px`, width: '100%', ...style }} />
}
