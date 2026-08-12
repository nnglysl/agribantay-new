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

// Renders "English text (Filipino text)" — falls back to English-only
// when no translation is available, so nothing ever looks broken.
function bilingual(en, fil) {
  if (!en) return null
  if (!fil) return en
  return `${en} (${fil})`
}

const responsiveCss = `
  .fd-hero {
    display: flex;
    align-items: center;
    gap: 24px;
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

  .fd-second-row {
    display: grid;
    grid-template-columns: 1.3fr 1fr 1fr;
    gap: 16px;
    align-items: start;
  }
  @media (max-width: 1100px) {
    .fd-second-row { grid-template-columns: 1fr; }
  }

  .fd-service-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 0;
    border-bottom: 1px solid #f2f3ed;
  }
  .fd-service-row:last-child { border-bottom: none; }
`

export default function FarmerDashboard() {
  const { data, loading, error, refetch } = useCachedFetch('/farmer/dashboard')
  const { data: insight, loading: insightLoading, refetch: refetchInsight } = useCachedFetch('/farmer/insights')
  const { data: maintenance } = useCachedFetch('/farmer/maintenance')
  const { data: disposalRecords } = useCachedFetch('/farmer/disposal-records')
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
  const latestDisposal = (disposalRecords || [])[0]

  const goToServiceRequest = (serviceType) => {
    navigate('/farmowner/service-requests', { state: { prefillService: serviceType } })
  }

  // AI recommendation shown as "English (Filipino)" — Filipino comes from
  // the backend/Gemini translation; falls back to English-only if missing.
  const recoMainEn = insight?.main_action || insight?.explanation || null
  const recoMainFil = insight?.main_action_fil || insight?.explanation_fil || null
  const recoText = bilingual(recoMainEn, recoMainFil)

  return (
    <FarmerLayout>
      <style>{responsiveCss}</style>

      <h1 style={styles.title}>Welcome back, {data.farm_name ? data.farm_name.split(' ')[0] : ''}</h1>
      <p style={styles.subtitle}>
        Here's how your farm is doing today. We'll tell you if anything needs your attention.
      </p>

      {/* ---------------------------------------------------- Overall farm status */}
      <div style={{ ...styles.heroCard, backgroundColor: hero.ring, borderColor: hero.border }}>
        <div className="fd-hero">
          <div style={styles.heroIconWrap}>
            <HeroIcon name={hero.iconName} color={hero.icon} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...styles.heroTitle, color: hero.icon }}>{hero.title}</div>
            <p style={styles.heroText}>{hero.text}</p>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------- Farm conditions (bilingual, no raw numbers) */}
      <div style={styles.sectionTitle}>Conditions Inside the Coop</div>
      <div style={styles.sectionSub}>A simple check of your chickens' living conditions right now, based on your farm sensors.</div>

      <div className="fd-conditions-grid">
        <SensorFeel type="ammonia" status={data.ammonia_status} />
        <SensorFeel type="temperature" status={data.temperature_status} />
        <SensorFeel type="humidity" status={data.humidity_status} />
        <SensorFeel type="moisture" status={data.moisture_status} />
      </div>

      {/* ------------------------------------------------------------- Second row */}
      <div className="fd-second-row" style={{ marginTop: '20px' }}>
        {/* Recommendations */}
        <div style={styles.card}>
          <div style={styles.cardHeadRow}>
            <div style={styles.cardTitle}>Recommendations</div>
            {insight?.available && recoText && (
              <span style={styles.aiBadge}><SparkleMini /> AI</span>
            )}
          </div>

          {!insightLoading && insight?.available && recoText ? (
            <div style={styles.recoBox}>
              <span style={styles.recoIcon}><BulbIcon /></span>
              <p style={styles.recoText}>{recoText}</p>
            </div>
          ) : (
            <p style={styles.emptyText}>No recommendations right now — your farm looks good.</p>
          )}

          <button style={styles.fullPrimaryBtn} onClick={() => navigate('/farmowner/manure-records')}>
            + Log a Clean-out
          </button>

          {insight?.tips?.length > 0 && (
            <div style={styles.tipsBlock}>
              <div style={styles.tipsLabel}>Things to keep in mind</div>
              <div style={styles.insightTipsList}>
                {insight.tips.slice(0, 3).map((tip, i) => (
                  <div key={i} style={styles.insightTipRow}>
                    <span style={styles.insightTipCheck}><CheckIcon /></span>
                    <span style={styles.insightTipText}>{bilingual(tip, insight.tips_fil?.[i])}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Manure Records */}
        <div style={styles.card}>
          <div style={styles.cardTitle}>Manure Records</div>

          {maintenance?.status && (
            <div style={styles.manureBlock}>
              <div style={styles.manureRow}>
                <CalendarIcon />
                <div>
                  <div style={styles.manureRowLabel}>Last Clean-out</div>
                  <div style={styles.manureRowValue}>{maintenance.status.last_performed_at || '—'}</div>
                  <div style={styles.manureRowSub}>{maintenance.status.days_since ?? '—'} days ago</div>
                </div>
              </div>

              {latestDisposal && (
                <div style={styles.manureRow}>
                  <CalendarIcon />
                  <div>
                    <div style={styles.manureRowLabel}>Last Disposal</div>
                    <div style={styles.manureRowValue}>{latestDisposal.disposal_date}</div>
                  </div>
                </div>
              )}

              <div style={styles.manureRow}>
                <div style={styles.manureRowLabel}>Status</div>
              </div>
              <span style={{ ...styles.badge, ...maintBadgeStyle(maintenance.status.status) }}>
                <span style={{ ...styles.badgeDot, backgroundColor: maintBadgeStyle(maintenance.status.status).color }} />
                {maintenance.status.status}
              </span>
            </div>
          )}

          <div style={styles.manureActions}>
            <button style={styles.outlineBtn} onClick={() => navigate('/farmowner/manure-records')}>
              Log Clean-out
            </button>
            <button style={styles.fullPrimaryBtnSm} onClick={() => navigate('/farmowner/manure-records')}>
              View Records
            </button>
          </div>
        </div>

        {/* Municipal Services */}
        <div style={styles.card}>
          <div style={styles.cardTitle}>Municipal Services</div>

          {insight?.service_suggestions?.length > 0 ? (
            <div style={{ marginTop: '14px' }}>
              {insight.service_suggestions.map((s, i) => (
                <div key={i} className="fd-service-row">
                  <div style={styles.serviceLeft}>
                    <span style={styles.serviceIcon}><ServiceIcon type={s.type} /></span>
                    <div>
                      <div style={styles.serviceName}>{s.type.replace(' Request', '')}</div>
                      <div style={styles.serviceReason}>{s.reason}</div>
                    </div>
                  </div>
                  <button style={styles.serviceBtn} onClick={() => goToServiceRequest(s.type)}>
                    Request
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p style={styles.emptyText}>—</p>
          )}
        </div>
      </div>

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
    iconName: 'check', icon: '#1B4332', ring: '#eaf3ec', border: '#cfe6d6',
    title: 'Your farm is safe',
    text: 'Everything looks comfortable for your chickens right now. Keep up the good work.',
  },
  Warning: {
    iconName: 'alert', icon: '#b45309', ring: '#fdf3e6', border: '#f4e2c4',
    title: 'Your farm needs attention',
    text: 'A few things could be better for your chickens. Nothing serious — small steps now will keep them healthy.',
  },
  Critical: {
    iconName: 'alert', icon: '#b91c1c', ring: '#fbe3e3', border: '#f3c9c9',
    title: 'Your farm needs attention now',
    text: 'Some conditions need your attention today to keep your chickens safe and comfortable.',
  },
}

// Word/action pairs shown as "English (Filipino)" via bilingual()
const SENSOR_CONFIG = {
  ammonia: {
    title: 'Fresh Air', sub: 'Ammonia & smell', icon: 'wind',
    words: { Normal: ['Fresh & clean', 'Sariwa'], Warning: ['A little stuffy', 'Medyo mabaho'], Critical: ['Very stuffy', 'Napakabaho'] },
    action: { Normal: ['All good', 'Ayos naman'], Warning: ['Needs airing out', 'Linisin nang mas madalas'], Critical: ['Air it out now', 'Linisin agad'] },
  },
  temperature: {
    title: 'Warmth', sub: 'Temperature', icon: 'thermometer',
    words: { Normal: ['Just right', 'Tamang-tama'], Warning: ['Warm', 'Mainit'], Critical: ['Too hot', 'Sobrang init'] },
    action: { Normal: ['All good', 'Ayos naman'], Warning: ['Add shade or fans', 'Magbigay ng lilim o bentilador'], Critical: ['Cool it down now', 'Palamigin agad'] },
  },
  humidity: {
    title: 'Air Moisture', sub: 'Humidity', icon: 'droplet',
    words: { Normal: ['Comfortable', 'Normal'], Warning: ['A bit humid', 'Medyo mataas'], Critical: ['Very humid', 'Sobrang halumigmig'] },
    action: { Normal: ['All good', 'Ayos naman'], Warning: ['Improve airflow', 'Palakasin ang bentilasyon'], Critical: ['Improve airflow now', 'Bentilasyon agad'] },
  },
  moisture: {
    title: 'Bedding', sub: 'Ground moisture', icon: 'leaf',
    words: { Normal: ['Just right', 'Normal'], Warning: ['A bit off', 'Medyo may problema'], Critical: ['Needs attention', 'Kailangan ng atensyon'] },
    action: { Normal: ['All good', 'Wala pang dapat alalahanin'], Warning: ['Check the bedding', 'Tingnan ang lupa'], Critical: ['Check it now', 'Tingnan agad ang lupa'] },
  },
}

function feelStyle(status) {
  if (status === 'Critical') return { color: '#b91c1c', tint: '#fbe3e3', dot: '#b91c1c' }
  if (status === 'Warning') return { color: '#b45309', tint: '#fdf3e6', dot: '#b45309' }
  if (status === 'Normal') return { color: '#256b3d', tint: '#eaf3ec', dot: '#256b3d' }
  return { color: '#6b7770', tint: '#eef0ea', dot: '#9aa79d' }
}

function SensorFeel({ type, status }) {
  const cfg = SENSOR_CONFIG[type]
  const s = feelStyle(status)
  const wordPair = status ? cfg.words[status] : ['No reading', 'Walang datos']
  const actionPair = status ? cfg.action[status] : ['Offline', 'Offline']
  const word = bilingual(wordPair?.[0], wordPair?.[1])
  const action = bilingual(actionPair?.[0], actionPair?.[1])
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
      </div>
      <p style={styles.feelActionText}>{action}</p>
    </div>
  )
}

/* ------------------------------------------------------------------------ icons */

const iconBase = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }

function CheckIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" {...iconBase} strokeWidth="2.6"><path d="M20 6L9 17l-5-5" /></svg>
}
function CalendarIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" {...iconBase} strokeWidth="2" style={{ color: '#1B4332', flexShrink: 0, marginTop: '2px' }}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
}
function BulbIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" {...iconBase} strokeWidth="1.9" style={{ color: '#b45309', flexShrink: 0 }}><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.5.4.8 1 .8 1.6v.2h6.4v-.2c0-.6.3-1.2.8-1.6A7 7 0 0 0 12 2Z" /></svg>
}
function ShieldIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" {...iconBase} style={{ flexShrink: 0, color: '#256b3d' }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
}
function SparkleMini() {
  return <svg width="10" height="10" viewBox="0 0 24 24" {...iconBase} strokeWidth="2.4" style={{ color: '#3a6bc7' }}><path d="M12 3 13.9 8.6 19.5 10.5 13.9 12.4 12 18 10.1 12.4 4.5 10.5 10.1 8.6 12 3Z" /></svg>
}
function HeroIcon({ name, color }) {
  if (name === 'check') {
    return <svg width="40" height="40" viewBox="0 0 24 24" {...iconBase} style={{ color }}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="M22 4 12 14.01l-3-3" /></svg>
  }
  return <svg width="40" height="40" viewBox="0 0 24 24" {...iconBase} style={{ color }}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
}
function SensorIcon({ name, color }) {
  const p = { width: 21, height: 21, viewBox: '0 0 24 24', ...iconBase, strokeWidth: 1.9, style: { color } }
  if (name === 'wind') return <svg {...p}><path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2" /><path d="M9.6 4.6A2 2 0 1 1 11 8H2" /><path d="M12.6 19.4A2 2 0 1 0 14 16H2" /></svg>
  if (name === 'thermometer') return <svg {...p}><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" /></svg>
  if (name === 'droplet') return <svg {...p}><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5S5 13 5 15a7 7 0 0 0 7 7z" /></svg>
  return <svg {...p}><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" /><path d="M2 21c0-3 1.85-5.36 5.08-6" /></svg>
}
function ServiceIcon({ type }) {
  const t = (type || '').toLowerCase()
  const p = { width: 18, height: 18, viewBox: '0 0 24 24', ...iconBase, strokeWidth: 1.8, style: { color: '#1B4332' } }
  if (t.includes('odor')) return <svg {...p}><path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2" /><path d="M9.6 4.6A2 2 0 1 1 11 8H2" /><path d="M12.6 19.4A2 2 0 1 0 14 16H2" /></svg>
  if (t.includes('fly')) return <svg {...p}><circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" /></svg>
  if (t.includes('vaccin') || t.includes('bakuna')) return <svg {...p}><path d="M18 2 22 6" /><path d="M17 7 20 4l-3-3-3 3" /><path d="M8 12l8-8 4 4-8 8" /><path d="M8 12 3 17v4h4l5-5" /></svg>
  if (t.includes('blood')) return <svg {...p}><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5S5 13 5 15a7 7 0 0 0 7 7z" /></svg>
  return <svg {...p}><circle cx="12" cy="12" r="9" /></svg>
}

/* ----------------------------------------------------------------------- styles */

const SANS = "'Public Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

const styles = {
  stateText: { fontFamily: SANS, fontSize: '14px', color: '#4b5a50' },

  title: { fontSize: '24px', fontWeight: 800, letterSpacing: '-0.01em', color: '#16311d', margin: 0, fontFamily: SANS },
  subtitle: { fontSize: '13.5px', color: '#6b7770', marginTop: '5px', marginBottom: '22px', fontFamily: SANS, lineHeight: 1.5 },

  sectionTitle: { fontSize: '16px', fontWeight: 800, color: '#16311d', margin: '28px 0 4px', fontFamily: SANS },
  sectionSub: { fontSize: '13px', color: '#8a968d', marginBottom: '14px', fontFamily: SANS },

  heroCard: {
    border: '1px solid', borderRadius: '14px', padding: '20px 24px', fontFamily: SANS,
  },
  heroIconWrap: { width: '56px', height: '56px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontSize: '17px', fontWeight: 800, letterSpacing: '-0.01em' },
  heroText: { fontSize: '13.5px', color: '#5c6b60', lineHeight: 1.55, margin: '4px 0 0', maxWidth: '640px' },

  card: {
    background: '#fff', border: '1px solid #e7e8e0', borderRadius: '14px', padding: '20px', fontFamily: SANS,
    display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box',
  },
  cardHeadRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' },
  cardTitle: { fontSize: '15px', fontWeight: 800, color: '#16311d' },
  aiBadge: {
    display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 9px', borderRadius: '999px',
    background: '#eef3ff', border: '1px solid #dbe6fb', fontSize: '10px', fontWeight: 800, color: '#3a6bc7',
    textTransform: 'uppercase', letterSpacing: '0.04em',
  },

  recoBox: {
    marginTop: '14px', display: 'flex', gap: '10px', alignItems: 'flex-start',
    backgroundColor: '#fdf3e6', border: '1px solid #f4e2c4', borderRadius: '10px', padding: '13px 14px',
  },
  recoIcon: { flexShrink: 0, marginTop: '1px' },
  recoText: { fontSize: '13px', fontWeight: 600, color: '#5c4419', lineHeight: 1.55, margin: 0 },
  emptyText: { fontSize: '13px', color: '#9aa79d', fontStyle: 'italic', marginTop: '14px' },

  fullPrimaryBtn: { marginTop: '14px', width: '100%', padding: '12px', borderRadius: '10px', border: 'none', background: '#1B4332', color: '#fff', fontFamily: SANS, fontSize: '13.5px', fontWeight: 700, cursor: 'pointer' },
  fullPrimaryBtnSm: { flex: 1, padding: '11px', borderRadius: '10px', border: 'none', background: '#1B4332', color: '#fff', fontFamily: SANS, fontSize: '13px', fontWeight: 700, cursor: 'pointer' },
  outlineBtn: { flex: 1, padding: '11px', borderRadius: '10px', border: '1px solid #cfd6cf', background: '#fff', color: '#33413a', fontFamily: SANS, fontSize: '13px', fontWeight: 700, cursor: 'pointer' },

  tipsBlock: { marginTop: '18px', paddingTop: '16px', borderTop: '1px solid #f2f3ed' },
  tipsLabel: { fontSize: '11px', fontWeight: 800, color: '#8a968d', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' },
  insightTipsList: { display: 'flex', flexDirection: 'column', gap: '10px' },
  insightTipRow: { display: 'flex', alignItems: 'flex-start', gap: '9px' },
  insightTipCheck: { width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#eaf3ec', color: '#256b3d', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' },
  insightTipText: { fontSize: '13px', color: '#33413a', lineHeight: 1.5 },

  manureBlock: { marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '12px' },
  manureRow: { display: 'flex', gap: '10px', alignItems: 'flex-start' },
  manureRowLabel: { fontSize: '12px', fontWeight: 700, color: '#5c6b60' },
  manureRowValue: { fontSize: '14px', fontWeight: 800, color: '#16311d', marginTop: '1px' },
  manureRowSub: { fontSize: '11.5px', color: '#8a968d', marginTop: '1px' },
  badge: { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: '999px', fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap', width: 'fit-content' },
  badgeDot: { width: '6px', height: '6px', borderRadius: '50%' },
  manureActions: { display: 'flex', gap: '10px', marginTop: '18px' },

  serviceLeft: { display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 },
  serviceIcon: { width: '34px', height: '34px', borderRadius: '9px', background: '#eaf3ec', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  serviceName: { fontSize: '13px', fontWeight: 700, color: '#16311d' },
  serviceReason: { fontSize: '11.5px', color: '#8a968d', marginTop: '1px', lineHeight: 1.4 },
  serviceBtn: { flexShrink: 0, padding: '8px 14px', borderRadius: '8px', border: '1px solid #cfe0d5', background: '#fff', color: '#1B4332', fontFamily: SANS, fontSize: '12px', fontWeight: 700, cursor: 'pointer' },

  feelCard: { background: '#fff', border: '1px solid #e7e8e0', borderRadius: '14px', padding: '18px 20px', fontFamily: SANS },
  feelHead: { display: 'flex', alignItems: 'center', gap: '11px' },
  feelIcon: { width: '42px', height: '42px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  feelTitle: { fontSize: '13.5px', fontWeight: 700, color: '#16311d' },
  feelSub: { fontSize: '11.5px', color: '#8a968d' },
  feelValueRow: { marginTop: '14px' },
  feelWord: { fontSize: '15.5px', fontWeight: 800, lineHeight: 1.3 },
  feelActionText: { fontSize: '12px', color: '#5c6b60', margin: '6px 0 0', lineHeight: 1.4 },

  reassure: { marginTop: '20px', display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 18px', background: '#eaf3ec', borderRadius: '12px', fontFamily: SANS },
  reassureText: { fontSize: '13px', color: '#256b3d', fontWeight: 600 },
}