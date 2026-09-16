// One-click "Clear Date" for From/To date-range filters — the pattern from
// Management → Inspections, shared so every page behaves the same:
//   - render only while From or To (draft or applied) has a value
//   - onClick clears BOTH dates in the draft AND the applied filter, so the
//     list returns to unfiltered results without pressing Apply
//   - never touches any other filter (type, farm, status, sort, search)
//
// Usage — wrap the date label in <DateRangeHeader> so the button sits on the
// same row, right-aligned:
//   <DateRangeHeader>
//     <label style={styles.filterLabel}>From</label>
//     <ClearDateButton visible={hasDate} onClick={clearDates} />
//   </DateRangeHeader>
const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '10px',
}

const clearDateBtnStyle = {
  background: 'none',
  border: 'none',
  padding: 0,
  fontSize: '12px',
  fontWeight: 700,
  color: '#b91c1c',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

export function DateRangeHeader({ children }) {
  return <div style={headerStyle}>{children}</div>
}

export default function ClearDateButton({ visible, onClick }) {
  if (!visible) return null
  return (
    <button type="button" onClick={onClick} style={clearDateBtnStyle}>Clear Date</button>
  )
}
