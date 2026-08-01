import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import FarmerLayout from '../../components/FarmerLayout'
import { useCachedFetch } from '../../hooks/useCachedFetch'

function timeAgo(dateString) {
  const seconds = Math.floor((new Date() - new Date(dateString)) / 1000)

  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

const responsiveCss = `
  .fd-hero {
    display: flex;
    align-items: center;
    gap: 28px;
  }
  @media (max-width: 640px) {
    .fd-hero { flex-direction: column; text-align: center; }
  }

  .fd-conditions-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
  }
  @media (max-width: 900px) {
    .fd-conditions-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 520px) {
    .fd-conditions-grid { grid-template-columns: 1fr; }
  }
`

export default function FarmerDashboard() {
  const { data, loading, error, refetch } = useCachedFetch('/farmer/dashboard')
  const { data: insight, loading: insightLoading, refetch: refetchInsight } = useCachedFetch('/farmer/insights')
  const { data: maintenance } = useCachedFetch('/farmer/maintenance')
  const navigate = useNavigate()

  useEffect(() => {
    const interval = setInterval(() => {
      refetch()
      refetchInsight()
    }, 60000)

    return () => clearInterval(interval)
  }, [])

  if (loading) return <FarmerLayout><p style={styles.stateText}>Loading...</p></FarmerLayout>
  if (error) return <FarmerLayout><p style={{ ...styles.stateText, color: '#b91c1c' }}>{error}</p></FarmerLayout>

  const hero = heroConfig[data.health_status] || heroConfig.Healthy

  const goToServiceRequest = (serviceType) => {
    navigate('/farmowner/service-requests', { state: { prefillService: serviceType } })
  }

  return (
    <FarmerLayout>
      <style>{responsiveCss}</style>

      <h1 style={styles.title}>
        Welcome back, {data.farm_name ? data.farm_name.split(' ')[0] : ''}
      </h1>
      <p style={styles.subtitle}>
        Here's how your farm is doing today. We'll tell you if anything needs your attention.
      </p>

      {/* ---------------------------------------------------- Big status hero */}
      <div style={styles.heroCard}>
        <div className="fd-hero">
          <div style={{ ...styles.heroRing, backgroundColor: hero.ring, borderColor: hero.border }}>
            <HeroIcon name={hero.iconName} color={hero.icon} />
            <span style={{ ...styles.heroBadge, color: hero.icon }}>{hero.badge}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={styles.heroTitle}>{hero.title}</div>
            <p style={styles.heroText}>{insight?.explanation || hero.text}</p>
            <div style={styles.heroMeta}>
              <span style={styles.heroMetaItem}>
                <ClockIcon />
                {data.last_reading_at ? `Last checked ${timeAgo(data.last_reading_at)}` : 'No readings yet'}
              </span>
              {data.health_score != null && (
                <span style={styles.heroScore}>Farm health score: {data.health_score}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------- AI Insight */}
      {!insightLoading && insight?.available && (
        <div style={styles.insightCard}>
          <div style={styles.insightHeader}>
            <span style={styles.insightIcon}><SparkleIcon /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={styles.insightTitleRow}>
                <span style={styles.insightTitle}>Recommendations</span>
                <span style={styles.aiBadge}><SparkleMini /> AI-generated</span>
              </div>
              <div style={styles.insightSubtitle}>Personalised for your farm, based on your latest sensor readings</div>
            </div>
          </div>

          {(insight.explanation || insight.main_action) && (
            <div style={styles.insightExplanationBlock}>
              <InfoIcon />
              <p style={styles.insightExplanation}>{insight.main_action || insight.explanation}</p>
            </div>
          )}

          {/* Primary actions */}
          <div style={styles.insightActions}>
            <button style={styles.primaryBtn} onClick={() => navigate('/farmowner/manure-records')}>Log a clean-out</button>
            <button style={styles.secondaryBtn} onClick={() => navigate('/farmowner/service-requests')}>
              <MsgIcon /> Ask the vet for help
            </button>
          </div>

          {insight.tips?.length > 0 && (
            <div style={styles.insightSection}>
              <div style={styles.insightSectionLabel}>What you can do</div>
              <div style={styles.insightTipsList}>
                {insight.tips.slice(0, 3).map((tip, i) => (
                  <div key={i} style={styles.insightTipRow}>
                    <span style={styles.insightTipCheck}><CheckIcon /></span>
                    <span style={styles.insightTipText}>{tip}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {insight.service_suggestions?.length > 0 && (
            <div style={styles.insightSection}>
              <div style={styles.insightSectionLabel}>Municipal services you can request</div>
              <div style={styles.serviceSuggestions}>
                {insight.service_suggestions.map((s, i) => (
                  <div key={i} style={styles.serviceSuggestionCard}>
                    <span style={styles.serviceSuggestionReason}>{s.reason}</span>
                    <button style={styles.serviceSuggestionBtn} onClick={() => goToServiceRequest(s.type)}>
                      Request {s.type.replace(' Request', '')} →
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------- How things feel (plain words) */}
      <div style={styles.sectionTitle}>How things feel inside the farm</div>
      <div style={styles.sectionSub}>Simple check of your chickens' living conditions right now</div>

      <div className="fd-conditions-grid">
        <SensorFeel type="ammonia" value={data.ammonia} status={data.ammonia_status} unit="ppm" />
        <SensorFeel type="temperature" value={data.temperature} status={data.temperature_status} unit="°C" />
        <SensorFeel type="humidity" value={data.humidity} status={data.humidity_status} unit="%" />
        <SensorFeel type="moisture" value={data.moisture} status={data.moisture_status} unit="%" />
      </div>

      {/* ------------------------------------------------ Manure records — link out */}
      {maintenance?.status && (
        <div style={styles.manureLinkCard} onClick={() => navigate('/farmowner/manure-records')}>
          <div style={styles.manureLinkLeft}>
            <span style={styles.manureLinkIcon}><CleanIcon /></span>
            <div>
              <div style={styles.manureLinkTitle}>Manure Records</div>
              <div style={styles.manureLinkSub}>
                {maintenance.status.days_since} days since your last clean-out
                {' · '}
                <span style={{ color: maintBadgeStyle(maintenance.status.status).color, fontWeight: 700 }}>
                  {maintenance.status.status}
                </span>
              </div>
            </div>
          </div>
          <span style={styles.manureLinkArrow}>→</span>
        </div>
      )}

      {/* ------------------------------------------------------- Reassurance */}
      <div style={styles.reassure}>
        <ShieldIcon />
        <div style={styles.reassureText}>
          Relax — we're watching your farm around the clock. If anything becomes urgent, we'll let you know right away.
        </div>
      </div>
    </FarmerLayout>
  )
}

function maintBadgeStyle(status) {
  if (status === 'Overdue') return { backgroundColor: '#fbe3e3', color: '#b91c1c' }
  if (status === 'Due') return { backgroundColor: '#fdf3e6', color: '#b45309' }
  return { backgroundColor: '#eaf3ec', color: '#256b3d' }
}

const heroConfig = {
  Healthy: {
    badge: 'All good', iconName: 'check', icon: '#2c8047', ring: '#eaf3ec', border: '#cfe6d6',
    title: 'Your farm is doing well',
    text: 'Everything looks comfortable for your chickens right now. Keep up the good work.',
  },
  Warning: {
    badge: 'Attention', iconName: 'alert', icon: '#c07d16', ring: '#fbf1e2', border: '#f4e2c4',
    title: 'Your farm needs a little attention',
    text: 'A few things could be better for your chickens. Nothing serious — small steps now will keep them healthy.',
  },
  Critical: {
    badge: 'Urgent', iconName: 'alert', icon: '#b91c1c', ring: '#fbe3e3', border: '#f3c9c9',
    title: 'Your farm needs attention now',
    text: 'Some conditions need your attention today to keep your chickens safe and comfortable.',
  },
}

const SENSOR_CONFIG = {
  ammonia: {
    title: 'Fresh air', sub: 'Ammonia & smell', icon: 'wind',
    words: { Normal: 'Fresh & clean', Warning: 'A little stuffy', Critical: 'Very stuffy' },
    action: { Normal: 'All good', Warning: 'Needs airing out', Critical: 'Air it out now' },
  },
  temperature: {
    title: 'Warmth', sub: 'Temperature', icon: 'thermometer',
    words: { Normal: 'Just right', Warning: 'Warm', Critical: 'Too hot' },
    action: { Normal: 'All good', Warning: 'Add shade or fans', Critical: 'Cool it down now' },
  },
  humidity: {
    title: 'Air moisture', sub: 'Humidity', icon: 'droplet',
    words: { Normal: 'Comfortable', Warning: 'A bit humid', Critical: 'Very humid' },
    action: { Normal: 'All good', Warning: 'Improve airflow', Critical: 'Improve airflow now' },
  },
  moisture: {
    title: 'Bedding', sub: 'Ground moisture', icon: 'leaf',
    words: { Normal: 'Just right', Warning: 'A bit off', Critical: 'Needs attention' },
    action: { Normal: 'All good', Warning: 'Check the bedding', Critical: 'Check it now' },
  },
}

function feelStyle(status) {
  if (status === 'Critical') return { color: '#b91c1c', tint: '#fbe3e3', dot: '#b91c1c' }
  if (status === 'Warning') return { color: '#b45309', tint: '#fbf1e2', dot: '#c07d16' }
  if (status === 'Normal') return { color: '#2c8047', tint: '#eaf3ec', dot: '#2c8047' }
  return { color: '#6b7770', tint: '#eef0ea', dot: '#9aa79d' }
}

function formatReading(value, unit) {
  if (value == null) return null
  if (unit === 'ppm') return `${value} ppm`
  return `${value}${unit}`
}

function SensorFeel({ type, value, status, unit }) {
  const cfg = SENSOR_CONFIG[type]
  const s = feelStyle(status)
  const word = status ? (cfg.words[status] || status) : 'No reading'
  const action = status ? (cfg.action[status] || '') : 'Offline'
  const reading = formatReading(value, unit)
  return (
    <div style={styles.feelCard}>
      <div style={styles.feelHead}>
        <div style={{ ...styles.feelIcon, backgroundColor: s.tint }}>
          <SensorIcon name={cfg.icon} color={s.color} />
        </div>
        <div>
          <div style={styles.feelTitle}>{cfg.title}</div>
          <div style={styles.feelSub}>{cfg.sub}</div>
        </div>
      </div>
      <div style={styles.feelValueRow}>
        <span style={{ ...styles.feelWord, color: s.color }}>{word}</span>
        {reading && <span style={styles.feelNumber}>{reading}</span>}
      </div>
      <span style={{ ...styles.feelPill, backgroundColor: s.tint }}>
        <span style={{ ...styles.feelDot, backgroundColor: s.dot }}></span>
        <span style={{ ...styles.feelPillText, color: s.color }}>{action}</span>
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------------ icons */

const iconBase = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }

function CheckIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" {...iconBase} strokeWidth="2.6"><path d="M20 6L9 17l-5-5" /></svg>
}
function ClockIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" {...iconBase}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
}
function InfoIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" {...iconBase} style={{ flexShrink: 0, marginTop: '1px', color: '#2c8047' }}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
}
function MsgIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" {...iconBase} strokeWidth="1.9"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
}
function ShieldIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" {...iconBase} style={{ flexShrink: 0, color: '#2c8047' }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
}
function SparkleIcon() {
  return <svg width="19" height="19" viewBox="0 0 24 24" {...iconBase} strokeWidth="1.9" style={{ color: '#2c8047' }}><path d="M12 3 13.9 8.6 19.5 10.5 13.9 12.4 12 18 10.1 12.4 4.5 10.5 10.1 8.6 12 3Z" /><path d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z" /></svg>
}
function SparkleMini() {
  return <svg width="11" height="11" viewBox="0 0 24 24" {...iconBase} strokeWidth="2.4" style={{ color: '#3a6bc7' }}><path d="M12 3 13.9 8.6 19.5 10.5 13.9 12.4 12 18 10.1 12.4 4.5 10.5 10.1 8.6 12 3Z" /></svg>
}
function CleanIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" {...iconBase} strokeWidth="1.8" style={{ color: '#2c8047' }}><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
}
function HeroIcon({ name, color }) {
  if (name === 'check') {
    return <svg width="42" height="42" viewBox="0 0 24 24" {...iconBase} style={{ color }}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="M22 4 12 14.01l-3-3" /></svg>
  }
  return <svg width="42" height="42" viewBox="0 0 24 24" {...iconBase} style={{ color }}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
}
function SensorIcon({ name, color }) {
  const p = { width: 23, height: 23, viewBox: '0 0 24 24', ...iconBase, strokeWidth: 1.9, style: { color } }
  if (name === 'wind') return <svg {...p}><path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2" /><path d="M9.6 4.6A2 2 0 1 1 11 8H2" /><path d="M12.6 19.4A2 2 0 1 0 14 16H2" /></svg>
  if (name === 'thermometer') return <svg {...p}><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" /></svg>
  if (name === 'droplet') return <svg {...p}><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5S5 13 5 15a7 7 0 0 0 7 7z" /></svg>
  return <svg {...p}><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" /><path d="M2 21c0-3 1.85-5.36 5.08-6" /></svg>
}

/* ----------------------------------------------------------------------- styles */

const SANS = "'Public Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

const styles = {
  stateText: { fontFamily: SANS, fontSize: '14px', color: '#4b5a50' },

  title: { fontSize: '26px', fontWeight: 800, letterSpacing: '-0.015em', color: '#16311d', margin: 0, fontFamily: SANS },
  subtitle: { fontSize: '14.5px', color: '#6b7770', marginTop: '5px', marginBottom: '24px', fontFamily: SANS, lineHeight: 1.5 },

  sectionTitle: { fontSize: '16px', fontWeight: 800, color: '#16311d', margin: '34px 0 4px', fontFamily: SANS },
  sectionSub: { fontSize: '13.5px', color: '#8a968d', marginBottom: '16px', fontFamily: SANS },

  heroCard: {
    background: '#fff', border: '1px solid #e7e8e0', borderRadius: '20px', padding: '28px 30px',
    boxShadow: '0 1px 2px rgba(20,48,28,0.04)', fontFamily: SANS,
  },
  heroRing: {
    width: '118px', height: '118px', borderRadius: '50%', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, borderWidth: '6px', borderStyle: 'solid',
  },
  heroBadge: { fontSize: '12px', fontWeight: 800, marginTop: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' },
  heroTitle: { fontSize: '23px', fontWeight: 800, color: '#16311d', letterSpacing: '-0.01em' },
  heroText: { fontSize: '15px', color: '#5c6b60', lineHeight: 1.6, margin: '10px 0 0', maxWidth: '640px' },
  heroMeta: { display: 'flex', alignItems: 'center', gap: '18px', marginTop: '16px', flexWrap: 'wrap' },
  heroMetaItem: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#8a968d' },
  heroScore: { fontSize: '13px', color: '#8a968d', fontWeight: 600 },

  insightCard: { backgroundColor: 'white', borderRadius: '18px', padding: '24px 26px', marginTop: '26px', border: '1px solid #e7e8e0', fontFamily: SANS },
  insightHeader: { display: 'flex', alignItems: 'center', gap: '12px' },
  insightIcon: { width: '34px', height: '34px', borderRadius: '10px', backgroundColor: '#eaf3ec', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  insightTitleRow: { display: 'flex', alignItems: 'center', gap: '9px', flexWrap: 'wrap' },
  insightTitle: { fontSize: '17px', fontWeight: 800, color: '#16311d', letterSpacing: '-0.01em' },
  aiBadge: {
    display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 10px', borderRadius: '999px',
    background: '#eef3ff', border: '1px solid #dbe6fb', fontSize: '10.5px', fontWeight: 800, color: '#3a6bc7',
    textTransform: 'uppercase', letterSpacing: '0.05em',
  },
  insightSubtitle: { fontSize: '13px', color: '#8a968d', marginTop: '3px' },
  insightExplanationBlock: {
    marginTop: '18px', display: 'flex', gap: '14px', alignItems: 'flex-start',
    backgroundColor: '#f5faf6', border: '1px solid #dcebe0', borderLeft: '4px solid #2c8047',
    borderRadius: '12px', padding: '16px 18px',
  },
  insightExplanation: { fontSize: '15px', fontWeight: 600, color: '#1e4a2e', lineHeight: 1.55, margin: 0 },
  insightActions: { marginTop: '14px', display: 'flex', gap: '12px', flexWrap: 'wrap' },
  primaryBtn: {
    padding: '14px 24px', borderRadius: '12px', border: 'none', background: '#2c8047', color: '#fff',
    fontFamily: SANS, fontSize: '14.5px', fontWeight: 700, cursor: 'pointer',
  },
  secondaryBtn: {
    padding: '14px 22px', borderRadius: '12px', border: '1px solid #cfe0d5', background: '#fff', color: '#2c8047',
    fontFamily: SANS, fontSize: '14.5px', fontWeight: 700, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: '9px',
  },
  insightSection: { marginTop: '22px' },
  insightSectionLabel: { fontSize: '11.5px', fontWeight: 800, color: '#2c8047', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' },
  insightTipsList: { display: 'flex', flexDirection: 'column', gap: '13px' },
  insightTipRow: { display: 'flex', alignItems: 'flex-start', gap: '12px' },
  insightTipCheck: { width: '22px', height: '22px', borderRadius: '50%', backgroundColor: '#eaf3ec', color: '#2c8047', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' },
  insightTipText: { fontSize: '14px', color: '#33413a', lineHeight: 1.5 },
  serviceSuggestions: { display: 'flex', flexDirection: 'column', gap: '12px' },
  serviceSuggestionCard: {
    backgroundColor: '#fafbf8', border: '1px solid #eceee7', borderRadius: '12px', padding: '15px 18px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap',
  },
  serviceSuggestionReason: { fontSize: '13.5px', color: '#5c6b60', flex: 1, minWidth: '180px', lineHeight: 1.5 },
  serviceSuggestionBtn: {
    backgroundColor: '#2c8047', color: 'white', border: 'none', borderRadius: '10px', padding: '11px 18px',
    fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, fontFamily: SANS,
  },

  feelCard: { background: '#fff', border: '1px solid #e7e8e0', borderRadius: '16px', padding: '20px 22px', fontFamily: SANS },
  feelHead: { display: 'flex', alignItems: 'center', gap: '12px' },
  feelIcon: { width: '46px', height: '46px', borderRadius: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  feelTitle: { fontSize: '14.5px', fontWeight: 700, color: '#16311d' },
  feelSub: { fontSize: '12.5px', color: '#8a968d' },
  feelValueRow: { display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '16px', flexWrap: 'wrap' },
  feelWord: { fontSize: '19px', fontWeight: 800 },
  feelNumber: { fontSize: '12px', fontWeight: 600, color: '#a3aea6' },
  feelPill: { display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '8px', padding: '4px 11px', borderRadius: '999px' },
  feelDot: { width: '7px', height: '7px', borderRadius: '50%' },
  feelPillText: { fontSize: '12px', fontWeight: 700 },

  manureLinkCard: {
    marginTop: '34px', background: '#fff', border: '1px solid #e7e8e0', borderRadius: '16px',
    padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    cursor: 'pointer', fontFamily: SANS,
  },
  manureLinkLeft: { display: 'flex', alignItems: 'center', gap: '14px' },
  manureLinkIcon: { width: '40px', height: '40px', borderRadius: '11px', background: '#eaf3ec', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  manureLinkTitle: { fontSize: '14.5px', fontWeight: 800, color: '#16311d' },
  manureLinkSub: { fontSize: '12.5px', color: '#8a968d', marginTop: '2px' },
  manureLinkArrow: { fontSize: '18px', color: '#2c8047', fontWeight: 700 },

  reassure: { marginTop: '18px', display: 'flex', alignItems: 'center', gap: '12px', padding: '15px 20px', background: '#eaf3ec', borderRadius: '14px', fontFamily: SANS },
  reassureText: { fontSize: '13.5px', color: '#2c6b3f', fontWeight: 600 },
}