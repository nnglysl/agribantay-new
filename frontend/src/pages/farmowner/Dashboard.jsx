import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import FarmerLayout from '../../components/FarmerLayout'
import { useCachedFetch } from '../../hooks/useCachedFetch'
import { BACKGROUND_POLL_MS } from '../../constants/polling'
import { useSelectedFarm } from '../../hooks/useSelectedFarm'
import { SkeletonStatCards, SkeletonBlock } from '../../components/Loading'
import {
  SENSOR_CONDITIONS, STATUS_TONE,
  overallStatus, breachesOf, formatValue, plainFor, todoFor,
  DEFAULT_ALERTING_METRICS,
} from '../../constants/sensorConditions'
import { timeAgo } from '../../utils/formatDate'

/**
 * Farm owner dashboard — SUMMARY, ALERTS, and WHAT TO DO.
 *
 * Farm owners told us in interviews that they do not read raw sensor data,
 * historical logs or graphs. So this page carries none of those. It answers
 * three questions and stops:
 *
 *   1. Is anything wrong?              the banner
 *   2. Where, and how bad?             Conditions Requiring Attention
 *   3. What do I do about it?          What You Should Do
 *
 * Every reading, including the healthy ones, lives on Farm Readings. A house
 * with nothing wrong produces no card here at all — the page grows with the
 * size of the PROBLEM, not with the size of the farm, so it reads the same
 * whether the owner runs two houses or twenty.
 */

function useMaterialSymbolsFont() {
  useEffect(() => {
    const id = 'material-symbols-outlined-font'
    if (document.getElementById(id)) return
    const link = document.createElement('link')
    link.id = id
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200'
    document.head.appendChild(link)
  }, [])
}

const responsiveCss = `
  .fd-banner { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  @media (max-width: 560px) { .fd-banner { align-items: flex-start; } }

  /* The readings column carries several metrics across, so it gets roughly
     twice the width of the instructions beside it. Both go full-width once
     there is no longer room for two. */
  .fd-alert-row { display: flex; gap: 20px; flex-wrap: wrap; align-items: stretch; }
  .fd-alert-main { flex: 2 1 380px; min-width: 0; }
  .fd-alert-todo { flex: 1 1 250px; min-width: 0; }

  .material-symbols-outlined {
    font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
  }
`

// Enough to see the worst of a bad day without the page becoming a scroll.
const ALERT_LIMIT = 3

const SANS = "'Inter', sans-serif"
const TEXT_DARK = '#16311d'
const BORDER_GRAY = '#e7e8e0'

const heroConfig = {
  Safe: {
    iconName: 'health_and_safety', color: '#2c8047',
    title: 'Your farm is doing well',
    text: 'Everything looks comfortable for your chickens right now. Keep up the good work.',
  },
  Warning: {
    iconName: 'warning', color: '#b45309',
    title: 'Your farm needs attention',
    text: 'A few conditions need improvement to keep your chickens healthy.',
  },
  Critical: {
    iconName: 'e911_emergency', color: '#b91c1c',
    title: 'Your farm needs attention now',
    text: 'Some conditions need your attention today to keep your chickens safe.',
  },
  'Pending Setup': {
    iconName: 'settings', color: '#6b7280',
    title: 'Farm setup pending',
    text: 'A monitoring device has not been registered for your farm yet. Once it is installed, you will start seeing your farm conditions here.',
  },
}
/**
 * One alert card: a house, and ONLY the readings on it that are out of range.
 *
 * A Critical temperature does not become easier to act on by being shown
 * next to three metrics that are fine, so the healthy ones are left off.
 */
function AlertCard({ device, alerting }) {
  const breaches = breachesOf(device, alerting)
  const offline = device.connectivity !== 'Online'
  const noReading = !device.has_reading
  const lastHeard = timeAgo(device.last_reading_at)

  return (
    <div style={styles.alertCard}>
      {/* Two columns: the readings on the left, what to do about them on the
          right. Within the left column the breached metrics run ACROSS
          rather than stacking — three of them in a column made one house as
          tall as a screen and pushed the next house out of sight. Both
          columns collapse to full width on a phone. */}
      <div className="fd-alert-row">
        <div className="fd-alert-main">
          <div style={styles.alertHouseRow}>
            <span className="material-symbols-outlined" style={styles.houseIcon}>home</span>
            <div style={{ minWidth: 0 }}>
              <div style={styles.alertHouse}>{device.device_name}</div>
              <div style={styles.alertConn}>
                <span style={{
                  ...styles.connDot,
                  backgroundColor: offline ? '#9ca3af' : '#2c8047',
                }} />
                {device.connectivity}
                {offline && lastHeard && (
                  <span style={styles.alertStale}>&middot; last heard {lastHeard}</span>
                )}
              </div>
            </div>
          </div>

          {noReading ? (
            <p style={styles.alertNote}>This device has not sent a reading yet.</p>
          ) : offline && breaches.length === 0 ? (
            <p style={styles.alertNote}>
              This device has stopped reporting. The readings below may be out of date.
            </p>
          ) : (
            <>
              {/* Offline WITH breaches still shows them — an alert that was real
                  when the device went quiet does not stop mattering — but it
                  is labelled, so a stale number is never read as current. */}
              {offline && (
                <p style={styles.alertNote}>
                  This device has stopped reporting. The readings below may be out of date.
                </p>
              )}
              <div style={styles.breachRow}>
              {breaches.map((b, i) => {
                const tone = STATUS_TONE[b.status] || STATUS_TONE.Offline
                return (
                  <div
                    key={b.metric}
                    style={{ ...styles.breachItem, ...(i === 0 ? styles.breachItemFirst : {}) }}
                  >
                    <div style={styles.breachHead}>
                      <span style={styles.breachLabel}>{SENSOR_CONDITIONS[b.metric].label}</span>
                      <span style={{ ...styles.breachPill, color: tone.fg, backgroundColor: tone.bg }}>
                        {b.status}
                      </span>
                    </div>
                    <div style={{ ...styles.breachValue, color: tone.fg }}>
                      {formatValue(b.metric, b.value)}
                    </div>
                    <div style={styles.breachPlain}>
                      {plainFor(b.metric, b.status, b.direction)}
                    </div>
                  </div>
                )
                })}
              </div>
            </>
          )}
        </div>

        {breaches.length > 0 && (
          <div className="fd-alert-todo" style={styles.todoBox}>
            <div style={styles.todoTitle}>What to do?</div>
            {/* Stacked here, unlike the readings: this column is narrow, and
                each instruction is a sentence rather than a number. */}
            <div style={styles.todoList}>
              {breaches.map(b => (
                <div key={b.metric} style={styles.todoItem}>
                  <span style={styles.todoBullet} />
                  <span>{todoFor(b.metric, b.status, b.direction)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function FarmerDashboard() {
  useMaterialSymbolsFont()
  const [showAllRecommendations, setShowAllRecommendations] = useState(false)
  const [showAllAlerts, setShowAllAlerts] = useState(false)
  const { selectedFarmId, farmsLoading } = useSelectedFarm()

  const params = { farm_id: selectedFarmId }
  const { data, loading, error, refetch } = useCachedFetch(
    selectedFarmId ? '/farmer/dashboard' : null, params, { pollMs: BACKGROUND_POLL_MS }
  )
  const { data: insight, refetch: refetchInsight } = useCachedFetch(
    // Same 60s beat as the readings above. These two describe the SAME
    // moment — the breach cards and the advice about them — so polling the
    // advice half as often meant a Warning could sit on screen for a minute
    // with no recommendation under it, and then have one appear out of
    // nowhere. The extra request is cheap: the fuzzy inference runs locally
    // and the Gemini call behind it is cached once per farm per day.
    selectedFarmId ? '/farmer/insights' : null, params, { pollMs: BACKGROUND_POLL_MS }
  )

  useEffect(() => {
    const interval = setInterval(() => {
      refetch()
      refetchInsight()
    }, 30 * 60 * 1000)

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFarmId])

  if (farmsLoading || loading) {
    return <FarmerLayout><SkeletonStatCards count={3} /><SkeletonBlock height={280} /></FarmerLayout>
  }
  if (error) {
    return <FarmerLayout><p style={{ ...styles.stateText, color: '#b91c1c' }}>{error}</p></FarmerLayout>
  }
  if (!data) {
    return <FarmerLayout><SkeletonStatCards count={3} /><SkeletonBlock height={280} /></FarmerLayout>
  }

  const hero = heroConfig[data.health_status] || heroConfig.Safe
  const devices = Array.isArray(data.devices) ? data.devices : []
  // Which metrics may be badged. The server owns this; the fallback only
  // covers a cached response from before the field existed.
  const alerting = Array.isArray(data.alerting_metrics) && data.alerting_metrics.length
    ? data.alerting_metrics
    : DEFAULT_ALERTING_METRICS

  // A house is listed here when there is something to act on: a reading out
  // of range, a unit that has gone quiet, or one that has never reported.
  const attention = devices
    .filter(d => {
      const worst = overallStatus(d, alerting)
      return worst === 'Warning' || worst === 'Critical'
        || !d.has_reading || d.connectivity !== 'Online'
    })
    // Critical before Warning, so the worst house is read first.
    .sort((a, b) => {
      const rank = s => (s === 'Critical' ? 2 : s === 'Warning' ? 1 : 0)
      return rank(overallStatus(b, alerting)) - rank(overallStatus(a, alerting))
    })

  // Farm-wide recommendations ONLY — the per-breach instructions already sit
  // alert card, next to the reading that caused them. Repeating them in a
  // list below was the same sentence twice on one screen, and the copy in
  // the card is the better one because it needs no "— House 1" suffix to say
  // which building it means.
  //
  // What is left here is what the cards cannot carry: the farm-wide advice from
  // the insight service. When there are none, the section does not render.
  // Capped so a bad day across many houses stays readable. `attention` is
  // already sorted Critical-first, so the cards that survive the cap are the
  // ones that matter most — never an arbitrary slice.
  const visibleAttention = showAllAlerts ? attention : attention.slice(0, ALERT_LIMIT)
  const hiddenCount = showAllAlerts ? 0 : Math.max(0, attention.length - ALERT_LIMIT)
  const criticalHidden = showAllAlerts
    ? 0
    : attention.slice(ALERT_LIMIT).filter(d => overallStatus(d, alerting) === 'Critical').length

  // Farm-wide tips, paired with the Tagalog the explanation service wrote
  // for them. Paired BY POSITION, so the Tagalog is only used when the two
  // lists are the same length — the English is recomputed on every request
  // while the Tagalog is cached for the day, and showing a mismatched pair
  // would put two different instructions on one line.
  const tipsEn = (insight?.tips ?? []).filter(Boolean)
  const tipsFil = Array.isArray(insight?.tips_fil) ? insight.tips_fil : null
  const paired = tipsFil && tipsFil.length === tipsEn.length
  const recommendations = tipsEn.map((en, i) => ({
    en,
    fil: paired ? (tipsFil[i] || null) : null,
  }))

  const VISIBLE_LIMIT = 4
  const visibleRecommendations = showAllRecommendations ? recommendations : recommendations.slice(0, VISIBLE_LIMIT)

  return (
    <FarmerLayout title={`Good day, ${data.farm_name ? data.farm_name.split(' ')[0] : ''}`}>
      <style>{responsiveCss}</style>

      <p style={styles.subtitle}>
        Here is a quick overview of your farm&rsquo;s current condition.
      </p>

      {/* ------------------------------------------------------- Main banner */}
      <div className="fd-banner" style={{ ...styles.banner, backgroundColor: hero.color }}>
        <span
          className="material-symbols-outlined"
          style={{ fontSize: '38px', color: '#fff', lineHeight: 1, flexShrink: 0 }}
        >
          {hero.iconName}
        </span>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <div style={styles.bannerTitle}>{hero.title}</div>
          <p style={styles.bannerText}>{hero.text}</p>
        </div>
      </div>

      {/* --------------------------------------- Conditions Requiring Attention */}
      <div style={styles.sectionHead}>
        <h2 style={styles.sectionTitle}>
          Conditions Requiring Attention
          {attention.length > 0 && (
            <span style={styles.issueBadge}>
              {attention.length} {attention.length === 1 ? 'issue' : 'issues'}
            </span>
          )}
        </h2>
        <Link to="/farmowner/readings" style={styles.viewAllLink}>
          View all readings &rarr;
        </Link>
      </div>

      {devices.length === 0 ? (
        <div style={styles.emptyCard}>
          No monitoring device has been installed for your farm yet.
        </div>
      ) : attention.length === 0 ? (
        <div style={styles.allClearCard}>
          <span style={styles.allClearDot} />
          <div>
            <div style={styles.allClearTitle}>
              All {devices.length === 1 ? 'your house is' : `${devices.length} houses are`} in good condition
            </div>
            <div style={styles.allClearSub}>
              Nothing needs your attention right now. (Walang kailangang aksyon ngayon.)
            </div>
          </div>
        </div>
      ) : (
        <div style={styles.alertList}>
          {visibleAttention.map(device => (
            <AlertCard key={device.device_id} device={device} alerting={alerting} />
          ))}

          {/* A farm where ten houses go Critical at once would otherwise
              print ten full cards and bury the page. The list is capped and
              sorted worst-first, so what stays on screen is always the most
              urgent — and the rest are one tap away rather than hidden. */}
          {hiddenCount > 0 && (
            <button
              type="button"
              style={styles.showMoreBtn}
              onClick={() => setShowAllAlerts(true)}
            >
              Show {hiddenCount} more {hiddenCount === 1 ? 'house' : 'houses'} needing attention
              {criticalHidden > 0 && ` (${criticalHidden} Critical)`}
            </button>
          )}

          {showAllAlerts && attention.length > ALERT_LIMIT && (
            <button
              type="button"
              style={styles.showMoreBtn}
              onClick={() => setShowAllAlerts(false)}
            >
              Show fewer
            </button>
          )}
        </div>
      )}

      {/* ------------------------------------------------- Recommendations */}
      {/* Rendered only when the insight service returns farm-wide advice.
          Per-house instructions are NOT repeated here — they live in the
          alert card above, beside the reading that produced them. */}
      {recommendations.length > 0 && (
        <div style={styles.card}>
          <div style={styles.cardTitle}>Recommendations</div>
          <ol style={styles.todoOl}>
            {visibleRecommendations.map((item, i) => (
              <li key={i} style={styles.todoOlItem}>
                <span style={styles.todoNumber}>{i + 1}</span>
                <span style={styles.todoText}>
                  {item.en}
                  {item.fil && <span style={styles.todoTextFil}> ({item.fil})</span>}
                </span>
              </li>
            ))}
          </ol>

          {recommendations.length > VISIBLE_LIMIT && !showAllRecommendations && (
            <button type="button" style={styles.viewAllBtn} onClick={() => setShowAllRecommendations(true)}>
              Show all {recommendations.length} recommendations
            </button>
          )}
        </div>
      )}
    </FarmerLayout>
  )
}

const styles = {
  stateText: { fontFamily: SANS, fontSize: '14px', color: '#4b5a50' },
  subtitle: { fontSize: '13.5px', color: '#6b7770', margin: '0 0 18px', fontFamily: SANS },

  banner: {
    borderRadius: '14px', padding: '20px 22px', fontFamily: SANS,
    marginBottom: '26px', boxSizing: 'border-box',
  },
  bannerTitle: { fontSize: '17px', fontWeight: 800, color: '#fff' },
  bannerText: { fontSize: '13px', color: 'rgba(255,255,255,0.92)', lineHeight: 1.5, margin: '4px 0 0', fontWeight: 400 },

  sectionHead: {
    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
    gap: '12px', flexWrap: 'wrap', marginBottom: '12px',
  },
  sectionTitle: {
    fontSize: '16px', fontWeight: 800, color: TEXT_DARK, margin: 0,
    fontFamily: SANS, display: 'flex', alignItems: 'center', gap: '9px', flexWrap: 'wrap',
  },
  issueBadge: {
    padding: '2px 9px', borderRadius: '999px', backgroundColor: '#fbeaea',
    color: '#b91c1c', fontSize: '11.5px', fontWeight: 700,
  },
  viewAllLink: {
    fontSize: '12.5px', fontWeight: 700, color: '#2c8047',
    textDecoration: 'none', fontFamily: SANS, whiteSpace: 'nowrap',
  },

  alertList: { display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '26px' },
  alertCard: {
    background: '#fff', border: `1px solid ${BORDER_GRAY}`, borderRadius: '12px',
    padding: '16px 18px', fontFamily: SANS,
  },
  alertHouseRow: { display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '12px' },
  houseIcon: { fontSize: '20px', color: '#2c8047', lineHeight: 1, marginTop: '1px' },
  alertHouse: { fontSize: '14px', fontWeight: 800, color: TEXT_DARK },
  alertDevice: { fontSize: '11.5px', color: '#9aa79d', marginTop: '1px' },
  alertConn: { display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', color: '#6b7770', marginTop: '3px' },
  connDot: { width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0 },
  alertStale: { color: '#9a6a12', fontWeight: 600 },
  alertNote: { fontSize: '12.5px', color: '#6b7770', margin: 0, lineHeight: 1.5 },

  // Four fixed columns rather than flex, so a house with two breached
  // metrics lines up with one that has three — free-flowing widths made the
  // cards look uneven and unrelated when stacked. A house never has more
  // than four metrics, so four columns always fit.
  breachRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    alignItems: 'stretch',
  },
  // Separated by a rule instead of whitespace: readings sat close enough to
  // read as one run-on block, and padding alone did not make the boundary
  // obvious. The first column drops the rule so the row does not open with
  // a stray line.
  breachItem: {
    minWidth: 0,
    padding: '0 18px',
    borderLeft: '1px solid #eceee7',
  },
  breachItemFirst: { paddingLeft: 0, borderLeft: 'none' },
  breachHead: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
  breachLabel: { fontSize: '12.5px', fontWeight: 700, color: '#4b5a50' },
  breachPill: { padding: '2px 8px', borderRadius: '999px', fontSize: '10.5px', fontWeight: 700 },
  breachValue: { fontSize: '24px', fontWeight: 800, lineHeight: 1.15, marginTop: '2px' },
  breachPlain: { fontSize: '12px', color: '#6b7770', marginTop: '2px', lineHeight: 1.45 },

  todoBox: { background: '#fbf7f7', border: '1px solid #f2e3e3', borderRadius: '10px', padding: '12px 14px', boxSizing: 'border-box' },
  todoTitle: { fontSize: '12px', fontWeight: 800, color: '#b91c1c', marginBottom: '7px' },
  todoList: { display: 'flex', flexDirection: 'column', gap: '6px' },
  todoBullet: { width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#b91c1c', flexShrink: 0, marginTop: '7px' },
  todoItem: { display: 'flex', alignItems: 'flex-start', gap: '7px', fontSize: '12.5px', color: '#4b5a50', lineHeight: 1.55 },

  allClearCard: {
    display: 'flex', alignItems: 'flex-start', gap: '11px',
    background: '#fff', border: `1px solid ${BORDER_GRAY}`, borderRadius: '12px',
    padding: '16px 18px', marginBottom: '26px', fontFamily: SANS,
  },
  allClearDot: { width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#2c8047', marginTop: '5px', flexShrink: 0 },
  allClearTitle: { fontSize: '14px', fontWeight: 700, color: TEXT_DARK },
  allClearSub: { fontSize: '12.5px', color: '#6b7770', marginTop: '2px' },

  emptyCard: {
    background: '#fff', border: `1px solid ${BORDER_GRAY}`, borderRadius: '12px',
    padding: '28px', textAlign: 'center', color: '#8a968d', fontSize: '13.5px',
    marginBottom: '26px', fontFamily: SANS,
  },

  card: {
    background: '#fff', border: `1px solid ${BORDER_GRAY}`, borderRadius: '14px',
    padding: '18px 20px', fontFamily: SANS,
  },
  cardTitle: { fontSize: '16px', fontWeight: 800, color: TEXT_DARK, marginBottom: '12px' },

  todoOl: { listStyle: 'none', margin: 0, padding: 0 },
  todoOlItem: { display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '9px 0', borderBottom: '1px solid #f2f3ed' },
  todoNumber: {
    flexShrink: 0, width: '22px', height: '22px', borderRadius: '50%',
    backgroundColor: '#e7f2ea', color: '#1f7a3d', fontSize: '11.5px', fontWeight: 800,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  todoText: { fontSize: '13px', color: '#33413a', lineHeight: 1.55 },
  // Same weight as the English, one step lighter — a translation, not a
  // second instruction. Matches the alert cards, which read the same way.
  todoTextFil: { color: '#6b7770' },

  showMoreBtn: { width: '100%', padding: '11px 0', borderRadius: '10px', border: '1px solid #dcdfd6', backgroundColor: '#fff', color: '#2c8047', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: SANS },
  viewAllBtn: {
    marginTop: '12px', background: 'none', border: 'none', padding: 0,
    color: '#2c8047', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer',
    fontFamily: SANS, textDecoration: 'underline',
  },
}
