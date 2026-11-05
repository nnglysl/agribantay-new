import { Doughnut } from 'react-chartjs-2'
import { ArcElement, Chart as ChartJS, Legend, Tooltip } from 'chart.js'
import { C, ChartFrame, styles } from './ReportsLayout'
import { useIsMobile } from '../hooks/useIsMobile'

ChartJS.register(ArcElement, Tooltip, Legend)

/** Renders the annual-status aggregate supplied by MaintenanceStatusService. */
export default function AnnualMaintenanceComplianceChart({ compliant, nonCompliant, undetermined = 0 }) {
  const isMobile = useIsMobile()
  const safeCompliant = Number(compliant) || 0
  const safeNonCompliant = Number(nonCompliant) || 0
  const safeUndetermined = Number(undetermined) || 0
  const assessed = safeCompliant + safeNonCompliant
  const total = assessed + safeUndetermined
  if (!assessed) return <p style={styles.empty}>No determined annual compliance status is available for this reporting cutoff.</p>
  const percentage = value => `${Math.round((value / assessed) * 100)}%`
  return <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(180px, 1fr) minmax(170px, .9fr)', alignItems: 'center', gap: 16 }}>
    <div style={{ position: 'relative', minWidth: 0 }}>
      <ChartFrame height={220}><Doughnut role="img" aria-label={`Annual maintenance compliance: ${safeCompliant} Compliant farms and ${safeNonCompliant} Non-Compliant farms${safeUndetermined ? `; ${safeUndetermined} Undetermined farms` : ''}`} data={{ labels: ['Compliant farms', 'Non-Compliant farms'], datasets: [{ data: [safeCompliant, safeNonCompliant], backgroundColor: [C.green, '#d97706'], borderWidth: 0, hoverOffset: 3 }] }} options={{ responsive: true, maintainAspectRatio: false, cutout: '67%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: context => `${context.label}: ${context.parsed} (${percentage(context.parsed)})` } } } }} /></ChartFrame>
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', textAlign: 'center' }}><div><strong style={{ display: 'block', color: C.dark, fontSize: 28, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{total}</strong><span style={{ color: C.mute, fontSize: 12 }}>Active farms</span></div></div>
    </div>
    <div style={{ display: 'grid', gap: 10, fontSize: 13, color: C.body }}>
      <LegendRow color={C.green} label="Compliant farms" value={`${safeCompliant} (${percentage(safeCompliant)})`} />
      <LegendRow color="#d97706" label="Non-Compliant farms" value={`${safeNonCompliant} (${percentage(safeNonCompliant)})`} />
      {safeUndetermined > 0 && <p style={{ margin: '2px 0 0', color: C.mute, fontSize: 12, lineHeight: 1.45 }}>Undetermined: {safeUndetermined}. Excluded from the percentage until their annual status can be calculated.</p>}
    </div>
  </div>
}

function LegendRow({ color, label, value }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: color, flexShrink: 0 }} /><span style={{ flex: 1 }}>{label}</span><strong style={{ color: C.dark, fontVariantNumeric: 'tabular-nums' }}>{value}</strong></div>
}
