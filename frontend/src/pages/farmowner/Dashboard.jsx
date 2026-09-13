import { useEffect, useState } from 'react'
import FarmerLayout from '../../components/FarmerLayout'
import { useCachedFetch } from '../../hooks/useCachedFetch'

function bilingual(en, fil) {
  if (!en) return null
  if (!fil) return en
  return `${en} (${fil})`
}

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
  .fd-sensor-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }
  @media (max-width: 820px) {
    .fd-sensor-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 420px) {
    .fd-sensor-grid { grid-template-columns: 1fr; }
  }

  .fd-banner {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }
  @media (max-width: 560px) {
    .fd-banner { align-items: flex-start; }
  }

  .material-symbols-outlined {
    font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
  }

  .fd-reco-row:last-child { border-bottom: none; }
`

const STATUS_COLOR = { Safe: '#2c8047', Warning: '#b45309', Critical: '#b91c1c' }
const BRAND_GREEN = '#1B4332'
const TEXT_DARK = '#16311d'
const TEXT_GRAY = '#6b7770'
const BORDER_GRAY = '#e7e8e0'

// The farmer-friendly words/actions below are the EXISTING condition text
// already shown elsewhere in the app — keyed by the same Safe/Warning/
// Critical status the backend already computes per sensor. `unit`/`decimals`
// are only added here to format the raw reading value; they don't affect
// which word/action is chosen — that's still driven entirely by `status`.
const SENSOR_CONFIG = {
  ammonia: {
    label: 'Ammonia', unit: ' ppm', decimals: 1,
    words: { Safe: ['Fresh & clean', 'Sariwa'], Warning: ['A little stuffy', 'Medyo mabaho'], Critical: ['Very stuffy', 'Napakabaho'] },
    action: { Safe: ['All good', 'Ayos naman'], Warning: ['Needs airing out', 'Linisin nang mas madalas'], Critical: ['Air it out now', 'Linisin agad'] },
  },
  temperature: {
    label: 'Temperature', unit: '°C', decimals: 1,
    words: { Safe: ['Just right', 'Tamang-tama'], Warning: ['Warm', 'Mainit'], Critical: ['Too hot', 'Sobrang init'] },
    action: { Safe: ['All good', 'Ayos naman'], Warning: ['Add shade or fans', 'Magbigay ng lilim o bentilador'], Critical: ['Cool it down now', 'Palamigin agad'] },
  },
  humidity: {
    label: 'Humidity', unit: '%', decimals: 0,
    words: { Safe: ['Comfortable', 'Normal'], Warning: ['A bit humid', 'Medyo mataas'], Critical: ['Very humid', 'Sobrang halumigmig'] },
    action: { Safe: ['All good', 'Ayos naman'], Warning: ['Improve airflow', 'Palakasin ang bentilasyon'], Critical: ['Improve airflow now', 'Bentilasyon agad'] },
  },
  moisture: {
    label: 'Moisture', unit: '%', decimals: 0,
    words: { Safe: ['Just right', 'Normal'], Warning: ['A bit off', 'Medyo may problema'], Critical: ['Needs attention', 'Kailangan ng atensyon'] },
    action: { Safe: ['All good', 'Wala pang dapat alalahanin'], Warning: ['Check the bedding', 'Tingnan ang lupa'], Critical: ['Check it now', 'Tingnan agad ang lupa'] },
  },
}

const heroConfig = {
  Safe: {
    iconName: 'health_and_safety', color: STATUS_COLOR.Safe,
    title: 'Your farm is doing well',
    text: 'Everything looks comfortable for your chickens right now. Keep up the good work.',
  },
  Warning: {
    iconName: 'warning', color: STATUS_COLOR.Warning,
    title: 'Your farm needs attention',
    text: 'A few conditions need improvement to keep your chickens healthy.',
  },
  Critical: {
    iconName: 'e911_emergency', color: STATUS_COLOR.Critical,
    title: 'Your farm needs attention now',
    text: 'Some conditions need your attention today to keep your chickens safe.',
  },
}

const RECOMMENDATIONS_ANCHOR = 'fd-recommendations'

export default function FarmerDashboard() {
  useMaterialSymbolsFont()
  const [showAllRecos, setShowAllRecos] = useState(false)

  const { data, loading, error, refetch } = useCachedFetch('/farmer/dashboard')
  const { data: insight, refetch: refetchInsight } = useCachedFetch('/farmer/insights')

  useEffect(() => {
    const interval = setInterval(() => {
      refetch()
      refetchInsight()
    }, 60000)

    return () => clearInterval(interval)
  }, [])

  if (loading) return <FarmerLayout><p style={styles.stateText}>Loading...</p></FarmerLayout>
  if (error) return <FarmerLayout><p style={{ ...styles.stateText, color: '#b91c1c' }}>{error}</p></FarmerLayout>

  const hero = heroConfig[data.health_status] || heroConfig.Safe

  const recoMainEn = insight?.main_action || insight?.explanation || null
  const recoMainFil = insight?.main_action_fil || insight?.explanation_fil || null
  const recoMain = bilingual(recoMainEn, recoMainFil)

  const recoItems = []
  if (recoMain) recoItems.push(recoMain)
  if (insight?.tips?.length) {
    insight.tips.forEach((tip, i) => {
      const text = bilingual(tip, insight.tips_fil?.[i])
      if (text) recoItems.push(text)
    })
  }

  const VISIBLE_LIMIT = 3
  const visibleRecoItems = showAllRecos ? recoItems : recoItems.slice(0, VISIBLE_LIMIT)
  const hasMoreRecos = recoItems.length > VISIBLE_LIMIT

  return (
    <FarmerLayout>
      <style>{responsiveCss}</style>

      <h1 style={styles.title}>Welcome back, {data.farm_name ? data.farm_name.split(' ')[0] : ''}</h1>

      {/* --------------------------------------------------- Main alert banner */}
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

      {/* --------------------------------------------------------- Farm Conditions */}
      <h2 style={styles.sectionTitle}>Farm Conditions</h2>
      <div className="fd-sensor-grid">
        <SensorCard type="ammonia" value={data.ammonia} status={data.ammonia_status} />
        <SensorCard type="temperature" value={data.temperature} status={data.temperature_status} />
        <SensorCard type="humidity" value={data.humidity} status={data.humidity_status} />
        <SensorCard type="moisture" value={data.moisture} status={data.moisture_status} />
      </div>

      {/* ------------------------------------------------------- What You Should Do */}
      <div id={RECOMMENDATIONS_ANCHOR} style={styles.card}>
        <div style={styles.cardTitle}>What You Should Do</div>

        {visibleRecoItems.length > 0 ? (
          <div style={styles.recoList}>
            {visibleRecoItems.map((item, i) => (
              <div key={i} className="fd-reco-row" style={styles.recoRow}>
                <span style={styles.recoBullet} />
                <span style={styles.recoRowText}>{item}</span>
              </div>
            ))}
          </div>
        ) : (
          <p style={styles.emptyText}>No recommendations right now — your farm looks good.</p>
        )}

        {hasMoreRecos && !showAllRecos && (
          <button style={styles.viewAllBtn} onClick={() => setShowAllRecos(true)}>
            View All Recommendations
          </button>
        )}
      </div>
    </FarmerLayout>
  )
}

function formatReading(value, decimals) {
  const n = Number(value)
  if (Number.isNaN(n)) return null
  return n.toFixed(decimals)
}

function SensorCard({ type, value, status }) {
  const cfg = SENSOR_CONFIG[type]
  const dotColor = STATUS_COLOR[status] || '#9aa79d'
  const wordPair = status ? cfg.words[status] : ['No reading', 'Walang datos']
  const actionPair = status ? cfg.action[status] : ['Offline', 'Offline']
  const word = bilingual(wordPair?.[0], wordPair?.[1])
  const action = bilingual(actionPair?.[0], actionPair?.[1])
  const formatted = formatReading(value, cfg.decimals)
  const badgeLabel = status || null

  return (
    <div style={styles.sensorCard}>
      <div style={styles.sensorHead}>
        <div style={styles.sensorLabel}>{cfg.label}</div>
        <div style={styles.sensorHeadRight}>
          {badgeLabel && (
            <span style={{ ...styles.statusBadge, color: dotColor, backgroundColor: `${dotColor}18` }}>
              {badgeLabel}
            </span>
          )}
          <div style={styles.sensorReading}>{formatted !== null ? `${formatted}${cfg.unit}` : '—'}</div>
        </div>
      </div>
      <div style={styles.sensorValueRow}>
        <span style={{ ...styles.sensorStatusDot, backgroundColor: dotColor }} />
        <span style={styles.sensorWord}>{word}</span>
      </div>
      <p style={styles.sensorActionText}>{action}</p>
    </div>
  )
}

const SANS = "'Public Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

const styles = {
  stateText: { fontFamily: SANS, fontSize: '14px', color: '#4b5a50' },
  title: { fontSize: '25px', fontWeight: 800, letterSpacing: '-0.01em', color: TEXT_DARK, margin: '0 0 20px', fontFamily: SANS },

  banner: {
    borderRadius: '14px', padding: '20px 22px', fontFamily: SANS, marginBottom: '28px', boxSizing: 'border-box',
  },
  bannerTitle: { fontSize: '17px', fontWeight: 800, color: '#fff' },
  bannerText: { fontSize: '13px', color: 'rgba(255,255,255,0.92)', lineHeight: 1.5, margin: '4px 0 0', fontWeight: 400 },

  sectionTitle: { fontSize: '16px', fontWeight: 800, color: TEXT_DARK, margin: '0 0 12px', fontFamily: SANS },

  sensorCard: {
    background: '#fff', border: `1px solid ${BORDER_GRAY}`, borderRadius: '14px', padding: '18px', fontFamily: SANS, boxSizing: 'border-box',
  },
  sensorHead: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' },
  sensorLabel: { fontSize: '13.5px', fontWeight: 700, color: BRAND_GREEN },
  sensorHeadRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '5px' },
  statusBadge: {
    fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', whiteSpace: 'nowrap',
  },
  sensorReading: { fontSize: '14px', fontWeight: 500, color: TEXT_GRAY, flexShrink: 0, whiteSpace: 'nowrap' },
  sensorValueRow: { marginTop: '14px', display: 'flex', alignItems: 'center', gap: '7px' },
  sensorStatusDot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  sensorWord: { fontSize: '15px', fontWeight: 600, color: TEXT_DARK, lineHeight: 1.3 },
  sensorActionText: { fontSize: '12px', color: TEXT_DARK, margin: '6px 0 0', lineHeight: 1.4, fontWeight: 400 },

  card: {
    background: '#fff', border: `1px solid ${BORDER_GRAY}`, borderRadius: '14px', padding: '22px', fontFamily: SANS,
    marginTop: '24px', boxSizing: 'border-box',
  },
  cardTitle: { fontSize: '16px', fontWeight: 800, color: TEXT_DARK },
  emptyText: { fontSize: '13px', color: '#9aa79d', fontStyle: 'italic', marginTop: '12px', fontWeight: 400 },

  recoList: { display: 'flex', flexDirection: 'column', marginTop: '12px' },
  recoRow: {
    display: 'flex', alignItems: 'flex-start', gap: '12px',
    padding: '13px 0', borderBottom: `1px solid ${BORDER_GRAY}`,
  },
  recoBullet: {
    width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#2c8047',
    flexShrink: 0, marginTop: '6px',
  },
  recoRowText: { fontSize: '14px', color: TEXT_DARK, lineHeight: 1.5, fontWeight: 500 },

  viewAllBtn: {
    marginTop: '18px', padding: '10px 18px', borderRadius: '10px', border: `1px solid ${BORDER_GRAY}`,
    background: '#fff', color: TEXT_DARK, fontFamily: SANS, fontSize: '13px', fontWeight: 700, cursor: 'pointer',
  },
}
