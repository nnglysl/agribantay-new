import { styles, MONTH_NAMES } from './ReportsLayout'

export default function ReportPeriodFields({ value, onChange, error }) {
  const set = (key, next) => onChange({ ...value, [key]: next })
  return (
    <>
      <label style={styles.filterPopLabel}>Filter By</label>
      <select aria-label="Filter By" value={value.mode} onChange={e => set('mode', e.target.value)} style={styles.filterPopSelect}>
        <option value="all">All Records</option>
        <option value="month">Month and Year</option>
        <option value="year">Year Only</option>
        <option value="custom">Custom Date Range</option>
      </select>
      {(value.mode === 'month' || value.mode === 'year') && (
        <div style={styles.filterPopRow}>
          {value.mode === 'month' && <div>
            <label style={styles.filterPopLabel}>Month</label>
            <select aria-label="Reporting month" value={Number(value.month)} onChange={e => set('month', e.target.value)} style={styles.filterPopSelect}>
              {MONTH_NAMES.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}
            </select>
          </div>}
          <div>
            <label style={styles.filterPopLabel}>Year</label>
            <input aria-label="Reporting year" type="number" min="1900" max="9999" value={value.year} onChange={e => set('year', e.target.value)} style={styles.filterPopSelect} />
          </div>
        </div>
      )}
      {value.mode === 'custom' && <div style={styles.filterPopRow}>
        <div>
          <label style={styles.filterPopLabel}>From</label>
          <input aria-label="Reporting start date" type="date" value={value.from} onChange={e => set('from', e.target.value)} style={styles.filterPopSelect} />
        </div>
        <div>
          <label style={styles.filterPopLabel}>To</label>
          <input aria-label="Reporting end date" type="date" value={value.to} min={value.from || undefined} onChange={e => set('to', e.target.value)} style={styles.filterPopSelect} />
        </div>
      </div>}
      {error && <p role="alert" style={{ color: '#b91c1c', fontSize: '12px' }}>{error}</p>}
    </>
  )
}
