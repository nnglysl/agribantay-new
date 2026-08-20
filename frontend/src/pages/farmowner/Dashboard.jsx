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

// The AI/root-cause engine only suggests services relevant to whatever
// it diagnosed from the current sensor readings (e.g. manure buildup ->
// Odor Control + Fly Control). Vaccine and Blood Test aren't tied to
// any sensor value, so they never get suggested that way. This merges
// in a generic fallback entry for any of the four standard services
// the AI list didn't already include, so the farmer always sees the
// full set to choose from.
//
// These type strings match the exact <option value="..."> values in
// ServiceRequests.jsx's RequestModal — keep them in sync if that form
// ever changes.
const STANDARD_SERVICES = [
  { type: 'Odor Control Request', reason: 'Request help managing odor around your poultry area.' },
  { type: 'Fly Control Request', reason: 'Request help controlling flies around your farm.' },
  { type: 'Vaccine Request', reason: 'Request a vaccine visit for your chickens.' },
  { type: 'Blood Test Request', reason: 'Request a blood test for your chickens.' },
]

function allServices(aiSuggestions) {
  const suggested = aiSuggestions || []
  const suggestedTypes = new Set(suggested.map(s => s.type))
  const fallback = STANDARD_SERVICES.filter(s => !suggestedTypes.has(s.type))
  return [...suggested, ...fallback]
}

// Injects the Material Symbols stylesheet once, globally, the first time
// this component mounts — so the hero icon (health_and_safety / warning /
// e911_emergency) always has its font available without needing to touch
// index.html by hand. Safe to call multiple times; it checks first.
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
  .fd-conditions-row {
    display: grid;
    grid-template-columns: 260px 1fr;
    gap: 12px;
    align-items: stretch;
  }
  @media (max-width: 900px) {
    .fd-conditions-row { grid-template-columns: 1fr; }
  }

  .fd-mini-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  @media (max-width: 520px) {
    .fd-mini-grid { grid-template-columns: 1fr; }
  }

  .fd-second-row {
    display: grid;
    grid-template-columns: 1.3fr 1fr 1fr;
    gap: 12px;
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
    padding: 11px 0;
    border-bottom: 1px solid #eceee7;
  }
  .fd-service-row:last-child { border-bottom: none; }

  .material-symbols-outlined {
    font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
  }
`

// Status colors — used sparingly: the hero card fill, a small severity dot
// on each sensor card, and the Manure Records status dot/text. Never used
// to color entire cards or large blocks of text.
const STATUS_COLOR = { Normal: '#188a4c', Warning: '#e8720c', Critical: '#d92626' }
const BRAND_GREEN = '#1B4332'
const TEXT_DARK = '#1f2a22'
const TEXT_GRAY = '#6b7770'
const BORDER_GRAY = '#e3e6de'

export default function FarmerDashboard() {
  useMaterialSymbolsFont()

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
  if (error) return <FarmerLayout><p style={{ ...styles.stateText, color: '#d92626' }}>{error}</p></FarmerLayout>

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

      {/* -------------------------------- Farm status (left) + 4 sensor cards (right) */}
      <div className="fd-conditions-row">
        {/* Left: overall status — solid status-colored card */}
        <div style={{ ...styles.heroCard, backgroundColor: hero.color }}>
          <span
            className="material-symbols-outlined"
            style={{ fontSize: '84px', color: '#fff', lineHeight: 1 }}
          >
            {hero.iconName}
          </span>
          <div style={styles.heroTitle}>{hero.title}</div>
          <p style={styles.heroText}>{hero.text}</p>
        </div>

        {/* Right: 2x2 grid of sensor cards */}
        <div className="fd-mini-grid">
          <SensorFeel type="ammonia" status={data.ammonia_status} />
          <SensorFeel type="temperature" status={data.temperature_status} />
          <SensorFeel type="humidity" status={data.humidity_status} />
          <SensorFeel type="moisture" status={data.moisture_status} />
        </div>
      </div>

      {/* ------------------------------------------------------------- Second row */}
      <div className="fd-second-row" style={{ marginTop: '16px' }}>
        {/* Recommendations */}
        <div style={styles.card}>
          <div style={styles.cardTitle}>Recommendations</div>

          {!insightLoading && insight?.available && recoText ? (
            <p style={styles.recoText}>{recoText}</p>
          ) : (
            <p style={styles.emptyText}>No recommendations right now — your farm looks good.</p>
          )}

          {insight?.tips?.length > 0 && (
            <div style={styles.tipsBlock}>
              <div style={styles.tipsLabel}>Things to keep in mind</div>
              <div style={styles.insightTipsList}>
                {insight.tips.slice(0, 3).map((tip, i) => (
                  <div key={i} style={styles.insightTipRow}>
                    <span style={styles.insightTipCheck}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                    </span>
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
                <div>
                  <div style={styles.manureRowLabel}>Last Clean-out</div>
                  <div style={styles.manureRowValue}>{maintenance.status.last_performed_at || '—'}</div>
                  <div style={styles.manureRowSub}>{maintenance.status.days_since ?? '—'} days ago</div>
                </div>
              </div>

              {latestDisposal && (
                <div style={styles.manureRow}>
                  <div>
                    <div style={styles.manureRowLabel}>Last Disposal</div>
                    <div style={styles.manureRowValue}>{latestDisposal.disposal_date}</div>
                  </div>
                </div>
              )}

              <div style={styles.manureRow}>
                <div style={styles.manureRowLabel}>Status</div>
              </div>
              <span style={{ ...styles.badge, color: maintTextColor(maintenance.status.status) }}>
                <span style={{ ...styles.badgeDot, backgroundColor: maintTextColor(maintenance.status.status) }} />
                {maintenance.status.status}
              </span>
            </div>
          )}

          <div style={styles.manureActions}>
            <button
              style={styles.outlineBtn}
              onClick={() => navigate('/farmowner/manure-records', { state: { openCleanoutForm: true } })}
            >
              Log Clean-out
            </button>
            <button style={styles.fullPrimaryBtnSm} onClick={() => navigate('/farmowner/manure-records')}>
              View Records
            </button>
          </div>
        </div>

        {/* Municipal Services — plain, low-key rows; not urgent alerts */}
        <div style={styles.card}>
          <div style={styles.cardTitle}>Municipal Services</div>

          <div style={{ marginTop: '10px' }}>
            {allServices(insight?.service_suggestions).map((s, i) => (
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
        </div>
      </div>
    </FarmerLayout>
  )
}

function maintTextColor(status) {
  if (status === 'Overdue') return STATUS_COLOR.Critical
  if (status === 'Due') return STATUS_COLOR.Warning
  return STATUS_COLOR.Normal
}

// Solid status-colored hero card — background IS the status color (Normal
// green / Warning orange / Critical red), white icon + text on top, icon
// and heading centered.
const heroConfig = {
  Healthy: {
    iconName: 'health_and_safety', color: STATUS_COLOR.Normal,
    title: 'Your farm is safe',
    text: 'Everything looks comfortable for your chickens right now. Keep up the good work.',
  },
  Warning: {
    iconName: 'warning', color: STATUS_COLOR.Warning,
    title: 'Your farm needs attention',
    text: 'Your farm needs a little attention. A few conditions need improvement to keep your chickens healthy.',
  },
  Critical: {
    iconName: 'e911_emergency', color: STATUS_COLOR.Critical,
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

function SensorFeel({ type, status }) {
  const cfg = SENSOR_CONFIG[type]
  const dotColor = STATUS_COLOR[status] || '#9aa79d'
  const wordPair = status ? cfg.words[status] : ['No reading', 'Walang datos']
  const actionPair = status ? cfg.action[status] : ['Offline', 'Offline']
  const word = bilingual(wordPair?.[0], wordPair?.[1])
  const action = bilingual(actionPair?.[0], actionPair?.[1])
  return (
    <div style={styles.feelCard}>
      <div style={styles.feelHead}>
        <span style={styles.feelIconChip}>
          <SensorIcon name={cfg.icon} />
        </span>
        <div>
          <div style={styles.feelTitle}>{cfg.title}</div>
          <div style={styles.feelSub}>{cfg.sub}</div>
        </div>
      </div>
      <div style={styles.feelValueRow}>
        <span style={{ ...styles.feelStatusDot, backgroundColor: dotColor }} />
        <span style={styles.feelWord}>{word}</span>
      </div>
      <p style={styles.feelActionText}>{action}</p>
    </div>
  )
}

/* ------------------------------------------------------------------------ icons */

const iconBase = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' }

// Sensor icons now match the brand green used in the card titles, so the
// icon and title read as one consistent element.
function SensorIcon({ name }) {
  const p = { width: 20, height: 20, viewBox: '0 0 24 24', ...iconBase, style: { color: BRAND_GREEN } }
  if (name === 'wind') return <svg {...p}><path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2" /><path d="M9.6 4.6A2 2 0 1 1 11 8H2" /><path d="M12.6 19.4A2 2 0 1 0 14 16H2" /></svg>
  if (name === 'thermometer') return <svg {...p}><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" /></svg>
  if (name === 'droplet') return <svg {...p}><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5S5 13 5 15a7 7 0 0 0 7 7z" /></svg>
  return <svg {...p}><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" /><path d="M2 21c0-3 1.85-5.36 5.08-6" /></svg>
}

// Municipal Services icons are plain brand-green line icons — same
// treatment as the sensor icons, kept neutral (not status-colored) since
// these represent request types, not sensor readings.
function ServiceIcon({ type }) {
  const t = (type || '').toLowerCase()
  const p = { width: 15, height: 15, viewBox: '0 0 24 24', ...iconBase, strokeWidth: 1.7, style: { color: BRAND_GREEN } }
  if (t.includes('odor')) return <svg {...p}><path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2" /><path d="M9.6 4.6A2 2 0 1 1 11 8H2" /><path d="M12.6 19.4A2 2 0 1 0 14 16H2" /></svg>
  if (t.includes('fly')) return <svg {...p}><circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" /></svg>
  if (t.includes('vaccin')) return <svg {...p}><path d="M18 2 22 6" /><path d="M17 7 20 4l-3-3-3 3" /><path d="M8 12l8-8 4 4-8 8" /><path d="M8 12 3 17v4h4l5-5" /></svg>
  if (t.includes('blood')) return <svg {...p}><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5S5 13 5 15a7 7 0 0 0 7 7z" /></svg>
  return <svg {...p}><circle cx="12" cy="12" r="9" /></svg>
}

/* ----------------------------------------------------------------------- styles */

const SANS = "'Public Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

const styles = {
  stateText: { fontFamily: SANS, fontSize: '14px', color: '#4b5a50' },

  title: { fontSize: '20px', fontWeight: 700, color: TEXT_DARK, margin: 0, fontFamily: SANS },
  subtitle: { fontSize: '13px', color: TEXT_GRAY, marginTop: '4px', marginBottom: '18px', fontFamily: SANS, lineHeight: 1.5, fontWeight: 400 },

  // Solid status-colored hero card, white text, centered content, large icon.
  heroCard: {
    borderRadius: '8px', padding: '18px 20px', fontFamily: SANS,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    textAlign: 'center', boxSizing: 'border-box', height: '100%', color: '#fff',
  },
  heroTitle: { fontSize: '17px', fontWeight: 600, color: '#fff', marginTop: '10px' },
  heroText: { fontSize: '12.5px', color: 'rgba(255,255,255,0.9)', lineHeight: 1.55, margin: '8px 0 0', fontWeight: 400 },

  card: {
    background: '#fff', border: `1px solid ${BORDER_GRAY}`, borderRadius: '8px', padding: '16px', fontFamily: SANS,
    display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box',
  },
  cardTitle: { fontSize: '13px', fontWeight: 700, color: TEXT_DARK },

  recoText: { fontSize: '13px', color: TEXT_DARK, lineHeight: 1.6, margin: '10px 0 0', fontWeight: 400 },
  emptyText: { fontSize: '13px', color: '#9aa79d', fontStyle: 'italic', marginTop: '12px', fontWeight: 400 },

  fullPrimaryBtnSm: { flex: 1, padding: '9px', borderRadius: '6px', border: `1px solid ${BRAND_GREEN}`, background: BRAND_GREEN, color: '#fff', fontFamily: SANS, fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' },
  outlineBtn: { flex: 1, padding: '9px', borderRadius: '6px', border: `1px solid ${BORDER_GRAY}`, background: '#fff', color: TEXT_DARK, fontFamily: SANS, fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' },

  tipsBlock: { marginTop: '14px', paddingTop: '12px', borderTop: `1px solid ${BORDER_GRAY}` },
  tipsLabel: { fontSize: '10.5px', fontWeight: 600, color: '#9aa79d', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '8px' },
  insightTipsList: { display: 'flex', flexDirection: 'column', gap: '9px' },
  insightTipRow: { display: 'flex', alignItems: 'flex-start', gap: '9px' },
  insightTipCheck: {
    width: '16px', height: '16px', borderRadius: '50%', backgroundColor: STATUS_COLOR.Normal,
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px',
  },
  insightTipText: { fontSize: '12.5px', color: TEXT_DARK, lineHeight: 1.5, fontWeight: 400 },

  manureBlock: { marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' },
  manureRow: { display: 'flex', gap: '10px', alignItems: 'flex-start' },
  manureRowLabel: { fontSize: '11.5px', fontWeight: 500, color: TEXT_GRAY },
  manureRowValue: { fontSize: '13px', fontWeight: 600, color: TEXT_DARK, marginTop: '1px' },
  manureRowSub: { fontSize: '11px', color: '#9aa79d', marginTop: '1px', fontWeight: 400 },
  badge: { display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap', width: 'fit-content' },
  badgeDot: { width: '6px', height: '6px', borderRadius: '50%' },
  manureActions: { display: 'flex', gap: '8px', marginTop: '14px' },

  serviceLeft: { display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 },
  serviceIcon: { width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  serviceName: { fontSize: '12.5px', fontWeight: 600, color: TEXT_DARK },
  serviceReason: { fontSize: '11px', color: TEXT_GRAY, marginTop: '1px', lineHeight: 1.4, fontWeight: 400 },
  serviceBtn: { flexShrink: 0, padding: '6px 12px', borderRadius: '6px', border: `1px solid ${BORDER_GRAY}`, background: '#fff', color: TEXT_DARK, fontFamily: SANS, fontSize: '11.5px', fontWeight: 600, cursor: 'pointer' },

  // Sensor cards (right side, 2x2) — white card, green icon (matches
  // titles), black bold status word with a small status-colored dot next
  // to it as the only severity cue.
  feelCard: {
    background: '#fff', border: `1px solid ${BORDER_GRAY}`, borderRadius: '8px', padding: '16px', fontFamily: SANS,
  },
  feelHead: { display: 'flex', alignItems: 'center', gap: '10px' },
  feelIconChip: {
    width: '28px', height: '28px',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  feelTitle: { fontSize: '13.5px', fontWeight: 700, color: BRAND_GREEN },
  feelSub: { fontSize: '11.5px', color: TEXT_GRAY, fontWeight: 400 },
  feelValueRow: { marginTop: '14px', display: 'flex', alignItems: 'center', gap: '7px' },
  feelStatusDot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  feelWord: { fontSize: '15px', fontWeight: 700, color: TEXT_DARK, lineHeight: 1.3 },
  feelActionText: { fontSize: '12px', color: TEXT_DARK, margin: '6px 0 0', lineHeight: 1.4, fontWeight: 400 },
}