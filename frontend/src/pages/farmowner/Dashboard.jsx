import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FarmerLayout from '../../components/FarmerLayout'
import FarmIcon from '../../components/farm-details/FarmIcon'
import CleanoutCompliance from '../../components/CleanoutCompliance'
import { SkeletonBlock } from '../../components/Loading'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { useSelectedFarm } from '../../hooks/useSelectedFarm'
import { BACKGROUND_POLL_MS } from '../../constants/polling'
import { dashboardSummary, houseDisplayCondition, houseMainIssue } from '../../utils/farmDashboardSummary'
import './farmer-dashboard.css'

const LABELS = { 'Incomplete Data': 'Incomplete Monitoring' }
const conditionTone = condition => ({ Safe: 'safe', Warning: 'warning', Critical: 'critical', Offline: 'offline' })[condition] || 'neutral'
function Badge({ condition }) {
  const tone = conditionTone(condition)
  return <span className={`fdb-badge fdb-badge--${tone}`}>{LABELS[condition] || condition}</span>
}
function explanation(condition) {
  return ({ Safe: 'Current ammonia and manure moisture readings are within the safe range.', Warning: 'Current ammonia or manure moisture readings need attention.', Critical: 'Current ammonia or manure moisture readings need immediate attention.',
    Offline: 'Devices are offline. Current conditions are unknown.', 'No Readings Yet': 'Waiting for valid current readings.',
    'Incomplete Data': 'Some readings are missing. A safe condition cannot be confirmed.', 'Pending Setup': 'No active monitoring device is assigned to this farm.' })[condition] || 'Current farm condition is unavailable.'
}
function conditionMessage(summary) {
  if (summary.active.length === 0) return 'No active poultry houses are currently registered.'
  if (summary.counts.unmonitored === summary.active.length) return 'No poultry houses are currently being monitored.'
  const attention = (summary.counts.Critical || 0) + (summary.counts.Warning || 0)
  const parts = []
  if (summary.condition === 'Safe' && (summary.counts.unmonitored || summary.offline.length || summary.gaps.length)) parts.push('Monitored poultry houses are within safe conditions.')
  if (['Incomplete Data', 'No Readings Yet', 'Unavailable'].includes(summary.condition)) parts.push(explanation(summary.condition))
  if (attention) parts.push(`${attention} poultry ${attention === 1 ? 'house needs' : 'houses need'} attention.`)
  if (summary.counts.unmonitored) parts.push(`Monitoring is incomplete for ${summary.counts.unmonitored} ${summary.counts.unmonitored === 1 ? 'house' : 'houses'}.`)
  if (summary.offline.length) parts.push(`${summary.offline.length} ${summary.offline.length === 1 ? 'house is' : 'houses are'} offline.`)
  if (summary.gaps.length && !summary.counts.unmonitored && !summary.offline.length) parts.push('Some houses do not have complete current readings.')
  return parts.join(' ') || explanation(summary.condition)
}
export default function FarmerDashboard() {
  const { selectedFarmId } = useSelectedFarm()
  return <DashboardForFarm key={selectedFarmId} />
}
function DashboardForFarm() {
  const { selectedFarmId, farmsLoading } = useSelectedFarm()
  const navigate = useNavigate()
  const [showAllTips, setShowAllTips] = useState(false)
  const dashboard = useCachedFetch(selectedFarmId ? '/farmer/dashboard' : null, { farm_id: selectedFarmId }, { pollMs: BACKGROUND_POLL_MS })
  const insights = useCachedFetch(selectedFarmId ? '/farmer/insights' : null, { farm_id: selectedFarmId }, { pollMs: BACKGROUND_POLL_MS })
  const data = String(dashboard.data?.farm_id) === String(selectedFarmId) ? dashboard.data : null
  if (farmsLoading || dashboard.loading || (!data && !dashboard.error)) return <FarmerLayout><SkeletonBlock height={380} /></FarmerLayout>
  if (dashboard.error) return <FarmerLayout><div className="fdb-state fdb-card" role="alert"><h2>Dashboard unavailable</h2><p>{dashboard.error}</p><button onClick={dashboard.refetch}>Retry Dashboard</button></div></FarmerLayout>
  const summary = dashboardSummary(data)
  // An unavailable inventory is never presented as a list of registered houses.
  const houses = summary.counts.total === null ? [] : summary.houses
  const affected = summary.counts.total === null ? [] : summary.affected
  const monitoringHelp = houses.filter(row => row.house_status === 'Active' && (houseDisplayCondition(row) === 'Offline' || row.device_status !== 'Active' || row.assignment_verified !== true))
  const insight = insights.error || insights.loading ? null : insights.data
  const hasCurrent = summary.active.some(row => row.connectivity === 'Online' && row.current_reading && ['Safe', 'Warning', 'Critical', 'Incomplete Data'].includes(houseDisplayCondition(row)))
  const tips = insight?.available !== false && hasCurrent ? [...new Set((insight?.tips || []).filter(tip => typeof tip === 'string' && tip.trim()))] : []
  const translations = Array.isArray(insight?.tips_fil) && insight.tips_fil.length === insight.tips?.length ? insight.tips_fil : null
  const cards = [
    ['Poultry Houses', summary.counts.total, summary.inactive ? `Total registered · ${summary.inactive} Inactive` : 'Total registered', 'farm', 'safe'],
    ['Critical', summary.counts.Critical, 'Need immediate attention', 'alert', 'critical'], ['Warning', summary.counts.Warning, 'Require attention', 'warning', 'warning'],
    ['Not Monitored', summary.counts.unmonitored, 'No eligible active device', 'monitor', 'neutral'],
  ]
  return <FarmerLayout title="Dashboard" description="Here’s a quick overview of your farm’s current condition.">
    <main className="fdb" aria-label="Farm dashboard summary">
      <div className="fdb-top">
      <section className="fdb-condition fdb-card" data-tone={conditionTone(summary.condition)} aria-label="Overall Farm Condition">
        <div className="fdb-condition-main"><div className="fdb-condition-copy"><div className="fdb-condition-heading"><h2>Farm Condition</h2><Badge condition={summary.condition} /></div><p>{conditionMessage(summary)}</p>
        </div></div>
      </section>
      {data.cleanout_compliance ? <CleanoutCompliance status={data.cleanout_compliance} compact variant="dashboard" /> : <section className="fdb-card"><h2>Manure Clean-out Compliance</h2><p>Compliance information unavailable.</p></section>}
      </div>
      <section className="fdb-summary" aria-label="House summary counts" aria-describedby={summary.counts.total === null ? 'fdb-inventory-message' : undefined}>{cards.map(([label, value, note, icon, tone]) => <article className="fdb-card fdb-stat" data-tone={tone} key={label}><span className="fdb-stat-icon"><FarmIcon name={icon} size={28} /></span><div><h2>{label}</h2><strong aria-label={value == null ? `${label}: unavailable` : undefined}>{value ?? '—'}</strong>{value != null && <p>{note}</p>}</div></article>)}</section>
      <div className="fdb-columns">
        <section className="fdb-card fdb-overview" aria-label="Poultry House Overview"><div className="fdb-section-heading"><h2>Poultry House Overview <small>{summary.counts.total ?? 0} registered</small></h2><button type="button" className="fdb-link" onClick={() => navigate('/farmowner/readings')}>View All</button></div>
          {houses.length ? <div className="fdb-table-wrap"><table><thead><tr><th scope="col">Poultry House</th><th scope="col">Current Condition</th><th scope="col">Main Issue</th></tr></thead><tbody>{houses.map(row => <tr key={row.poultry_house_id}><th scope="row">{row.house_name}{row.house_status === 'Inactive' && <small>Inactive</small>}</th><td><Badge condition={houseDisplayCondition(row)} /></td><td>{houseMainIssue(row)}</td></tr>)}</tbody></table></div>
            : <div className="fdb-empty" id="fdb-inventory-message"><h3>{summary.counts.total === null ? 'Poultry house inventory unavailable' : 'No poultry houses registered'}</h3><p>House counts and conditions will appear when registered house records are available. Historical farm-level readings remain in Farm Readings in the sidebar.</p></div>}
          {summary.legacy.length > 0 && houses.length > 0 && <p className="fdb-footnote">{summary.legacy.length} farm-only {summary.legacy.length === 1 ? 'device has' : 'devices have'} no recorded house. Their readings remain available in Farm Readings.</p>}
          {summary.active.length === 0 && houses.length > 0 && <p>No Active poultry houses are registered.</p>}
        </section>
        <section className="fdb-card fdb-recommendations" aria-label="Farm Care Tips"><h2>Farm Care Tips</h2>
          {affected.length > 0 && <div className="fdb-priorities"><p className="fdb-priority">Check first: {affected.map(row => row.house_name).join(', ')}.</p>{affected.map(row => <div className="fdb-house-priority" key={row.poultry_house_id}><div><strong>{row.house_name}</strong><Badge condition={houseDisplayCondition(row)} /></div><p>{houseMainIssue(row)}</p></div>)}</div>}
          {monitoringHelp.length > 0 && <div className="fdb-device-help"><span className="fdb-action-icon"><FarmIcon name="records" size={34} /></span><div><h3>What You Should Do</h3><span className="fdb-help-label">Monitoring help</span>{monitoringHelp.map(row => <div className="fdb-house-help" key={row.poultry_house_id}><p><strong>{row.house_name}:</strong> {houseDisplayCondition(row) === 'Offline' ? 'Contact LGU Staff to check device power and connection.' : 'Contact LGU Staff to review the monitoring setup.'}</p></div>)}</div></div>}
          {insights.error ? <p role="alert">Recommendations could not be loaded. <button onClick={insights.refetch}>Retry Recommendations</button></p> : insights.loading ? <p role="status">Loading recommendations…</p>
            : tips.length ? <div className="fdb-farm-advice"><h3>Farm advice</h3><p className="fdb-footnote">Farm-level advice. No specific poultry house is identified.</p><ul>{(showAllTips ? tips : tips.slice(0, 4)).map(tip => { const index = insight.tips.indexOf(tip); return <li key={tip}>{tip}{translations?.[index] && <span className="fdb-translation" lang="fil">{translations[index]}</span>}</li> })}</ul>{tips.length > 4 && <button aria-expanded={showAllTips} onClick={() => setShowAllTips(value => !value)}>{showAllTips ? 'Show fewer' : 'Show all recommendations'}</button>}</div>
            : <p className="fdb-advice-empty">{!hasCurrent ? 'Current environmental advice is unavailable until valid readings arrive.' : insight?.message || 'No recommendations are available yet.'}</p>}
        </section>
      </div>
    </main>
  </FarmerLayout>
}
