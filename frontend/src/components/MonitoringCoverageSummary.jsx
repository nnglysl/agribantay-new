export default function MonitoringCoverageSummary({ counts, readings, snapshot = false }) {
  if (!counts || counts.incomplete_data === undefined) return null
  const rows = [['Fully assessed Safe', 'normal'], ['Warning', 'warning'], ['Critical', 'critical'], ['Incomplete Data', 'incomplete_data'], ['No Readings Yet', 'no_readings_yet'], ['Offline', 'offline'], ['Pending Setup', 'pending_setup']]
  return <section aria-label="Monitoring data coverage" style={{margin:'12px 0',padding:14,border:'1px solid #dde5df',borderRadius:10,breakInside:'avoid'}}>
    <strong>{snapshot ? 'Monitoring coverage at generation' : 'Current monitoring coverage'}</strong>
    <div style={{display:'flex',flexWrap:'wrap',gap:'8px 20px',marginTop:8}}>{rows.map(([label,key])=><span key={key}>{label}: <strong>{counts[key] ?? 0}</strong></span>)}</div>
    <p style={{fontSize:12,marginBottom:0}}>Incomplete primary coverage: {counts.incomplete_coverage ?? 0} farms. This overlaps Warning/Critical counts; it is not an additional severity category.</p>
    {readings && <p style={{fontSize:12,marginBottom:0}}>Historical readings: {readings.complete_readings} complete, {readings.incomplete_readings} incomplete ({readings.no_primary_readings} with both primary measurements unavailable). Stored historical classifications have not been rewritten.</p>}
  </section>
}
