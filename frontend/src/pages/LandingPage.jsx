import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useIsMobile } from '../hooks/useIsMobile'
import agribantayLogo from '../assets/agribantay_logo.png'
import agribantayName from '../assets/agribantay_name.png'
import heroImage from '../assets/poultry_bg.jpg'

const NAV_LINKS = [
  { label: 'Home', href: '#home' },
  { label: 'About', href: '#about' },
  { label: 'Features', href: '#features' },
  { label: 'Contact', href: '#contact' },
]

const SNAPSHOT_READINGS = [
  { key: 'ammonia', label: 'Ammonia', value: '11', unit: 'ppm', status: 'Normal', icon: 'ammonia' },
  { key: 'temp', label: 'Temperature', value: '28.6', unit: '°C', status: 'Normal', icon: 'temp' },
  { key: 'humidity', label: 'Humidity', value: '64', unit: '%', status: 'Normal', icon: 'humidity' },
  { key: 'moisture', label: 'Moisture', value: '58', unit: '%', status: 'Warning', icon: 'moisture' },
]

const FEATURES = [
  {
    icon: 'gauge',
    title: 'Continuous Sensor Monitoring',
    body: 'Ammonia, temperature, humidity, and moisture are read from each farm around the clock. A reading that crosses a safe threshold gets flagged immediately, not at the next scheduled visit.',
  },
  {
    icon: 'waste',
    title: 'Manure & Waste Oversight',
    body: 'Manure output and disposal are recorded per farm, giving the office an environmental record — useful for compliance, and for catching runoff risks before they reach nearby waterways.',
  },
  {
    icon: 'inspection',
    title: 'Inspection Scheduling',
    body: 'General and follow-up inspections go on a shared calendar. Every visit — completed or missed — stays on record for that farm.',
  },
  {
    icon: 'vet',
    title: 'Veterinary Coordination',
    body: "Vaccination requests and farm history are visible to the assigned veterinarian the moment they're submitted, not after a phone call or a paper referral.",
  },
]

const ABOUT_STATS = [
  { value: '4', label: 'Conditions tracked per farm, continuously' },
  { value: '3', label: 'Roles sharing one inspection record' },
  { value: '33', label: 'Barangays under one monitoring network' },
]

const CONTACT_CARDS = [
  { icon: 'pin', label: 'Office Address', value: 'Dagatan, San Jose, Batangas' },
  { icon: 'phone', label: 'Contact Number', value: '779-8550 to 779-8554 loc. 1005 / 2005' },
  { icon: 'mail', label: 'Email', value: 'agriculture@sanjosebatangas.gov.ph' },
  { icon: 'clock', label: 'Office Hours', value: 'Mon–Fri, 8AM–5PM' },
]

// Height of the fixed nav bar. Used to offset in-page scroll targets so
// section headings don't land hidden underneath the bar.
const HEADER_HEIGHT = 68

const statusColor = { Normal: '#256b3d', Warning: '#b45309', Critical: '#b91c1c' }

export default function LandingPage() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [navOpen, setNavOpen] = useState(false)

  const scrollTo = (id) => (e) => {
    e.preventDefault()
    setNavOpen(false)
    const el = document.getElementById(id)
    if (!el) return
    const top = el.getBoundingClientRect().top + window.scrollY - HEADER_HEIGHT
    window.scrollTo({ top, behavior: 'smooth' })
  }

  return (
    <div style={styles.page}>
      <style>{`
        html { scroll-behavior: smooth; }
        @media (prefers-reduced-motion: reduce) {
          html { scroll-behavior: auto; }
          .agb-pulse { animation: none !important; }
        }
        @keyframes agbPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(37,107,61,0.45); }
          70% { box-shadow: 0 0 0 7px rgba(37,107,61,0); }
        }
        .agb-pulse { animation: agbPulse 2.6s ease-in-out infinite; }
        .agb-navlink { position: relative; transition: color .15s ease; }
        .agb-navlink::after {
          content: ""; position: absolute; left: 0; right: 100%; bottom: -6px;
          height: 2px; background: #256b3d; transition: right .22s ease;
        }
        .agb-navlink:hover::after { right: 0; }
        .agb-card {
          transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
        }
        .agb-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 14px 30px -14px rgba(20,48,28,0.28);
          border-color: #cfe0d3;
        }
        .agb-btn { transition: transform .12s ease, background-color .15s ease, box-shadow .15s ease; }
        .agb-btn:active { transform: translateY(1px); }
        .agb-primary:hover { background-color: #1f5a34; box-shadow: 0 8px 20px -8px rgba(31,90,52,0.7); }
        .agb-ghost:hover { background-color: rgba(255,255,255,0.16); }
      `}</style>

      {/* ---------------------------------------------------------------- Nav */}
      <header style={styles.nav}>
        <div style={styles.navInner}>
          <a href="#home" onClick={scrollTo('home')} style={styles.navBrand}>
            <img src={agribantayLogo} alt="AgriBantay logo" style={styles.navLogoImg} />
            <img src={agribantayName} alt="AgriBantay" style={styles.navNameImg} />
          </a>

          {!isMobile && (
            <nav style={styles.navLinksDesktop}>
              {NAV_LINKS.map(l => (
                <a key={l.href} href={l.href} onClick={scrollTo(l.href.slice(1))} className="agb-navlink" style={styles.navLink}>
                  {l.label}
                </a>
              ))}
              <button className="agb-btn agb-primary" style={styles.navLoginBtn} onClick={() => navigate('/login')}>Login</button>
            </nav>
          )}

          {isMobile && (
            <button aria-label="Toggle navigation menu" style={styles.navMenuBtn} onClick={() => setNavOpen(v => !v)}>
              <IconMenu open={navOpen} />
            </button>
          )}
        </div>

        {isMobile && navOpen && (
          <div style={styles.navMobileMenu}>
            {NAV_LINKS.map(l => (
              <a key={l.href} href={l.href} onClick={scrollTo(l.href.slice(1))} style={styles.navMobileLink}>
                {l.label}
              </a>
            ))}
            <button className="agb-btn agb-primary" style={{ ...styles.navLoginBtn, ...styles.navLoginBtnMobile }} onClick={() => navigate('/login')}>
              Login
            </button>
          </div>
        )}
      </header>

      {/* --------------------------------------------------------------- Hero */}
      <section
        id="home"
        style={{
          ...styles.hero,
          ...(isMobile ? styles.heroMobile : {}),
          backgroundImage: `linear-gradient(100deg, rgba(15,38,22,0.9) 0%, rgba(15,38,22,0.72) 42%, rgba(15,38,22,0.28) 100%), linear-gradient(to top, rgba(15,38,22,0.55), rgba(15,38,22,0) 45%), url(${heroImage})`,
        }}
      >
        <div style={styles.heroInner}>
          <div style={styles.heroCol}>
            <span style={styles.heroEyebrow}>
              <span style={styles.heroEyebrowDot} />
              San Jose, Batangas · Municipal Agriculture Office
            </span>
            <h1 style={styles.heroTitle}>Smarter Farming. Healthier Flocks. Cleaner Environment.</h1>
            <p style={styles.heroSubtitle}>
              Real-time sensor monitoring, AI-powered guidance, and shared inspection and veterinary records — 
              helping San Jose's farm owners and Municipal Agriculture Office farm smarter, 
              keep flocks healthier, and protect the community's waterways.
            </p>
            <div style={{ ...styles.heroActions, ...(isMobile ? styles.heroActionsMobile : {}) }}>
              <button
                className="agb-btn agb-primary"
                style={{ ...styles.ctaPrimary, ...(isMobile ? styles.btnFullMobile : {}) }}
                onClick={scrollTo('contact')}
              >
                Register Your Farm
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" /><path d="M13 6l6 6-6 6" />
                </svg>
              </button>
              <button
                className="agb-btn agb-ghost"
                style={{ ...styles.ctaSecondary, ...(isMobile ? styles.btnFullMobile : {}) }}
                onClick={() => navigate('/login')}
              >
                Login
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------- Live snapshot (overlaps) */}
      <div style={styles.snapshotWrap}>
        <div style={styles.snapshotStrip}>
          <div style={styles.snapshotLabel}>
            <span className="agb-pulse" style={styles.snapshotDot} />
            <span style={styles.snapshotLabelStrong}>Live farm snapshot</span>
            <span style={styles.snapshotLabelMuted}>— sample reading</span>
          </div>
          <div style={styles.snapshotGrid}>
            {SNAPSHOT_READINGS.map(r => {
              const warn = r.status !== 'Normal'
              return (
                <div key={r.key} style={{ ...styles.snapshotItem, ...(warn ? styles.snapshotItemWarn : {}) }}>
                  <div style={styles.snapshotItemTop}>
                    <span style={{ color: warn ? '#b45309' : '#2c8047', display: 'flex' }}><SensorIcon name={r.icon} /></span>
                    <span style={styles.snapshotItemLabel}>{r.label}</span>
                  </div>
                  <div style={styles.snapshotItemValue}>
                    {r.value}<span style={styles.snapshotItemUnit}>{r.unit}</span>
                  </div>
                  <div style={{ ...styles.snapshotItemStatus, color: statusColor[r.status] }}>
                    <span style={{ ...styles.snapshotItemStatusDot, backgroundColor: statusColor[r.status] }} />
                    {r.status}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------- About */}
      <section id="about" style={styles.about}>
        <div style={styles.sectionInner}>
          <div style={styles.aboutGrid}>
            <div>
              <span style={styles.sectionEyebrow}>About AgriBantay</span>
              <h2 style={styles.sectionTitle}>Built around how San Jose already inspects, treats, and tracks poultry farms</h2>
              <p style={styles.bodyText}>
                AgriBantay replaces paper inspection logs and phone-tag scheduling with one shared
                system. The Municipal Agriculture Office, registered veterinarians, and farm owners
                work from the same records — sensor readings, vaccination requests, and inspection
                history — instead of three separate ones.
              </p>
              <p style={{ ...styles.bodyText, marginBottom: 0 }}>
                Ammonia buildup and poor manure management are leading causes of respiratory illness
                in layer flocks, and a source of runoff that can affect nearby waterways. Sensors
                installed at each farm report conditions continuously, so a problem gets flagged the
                day it starts — not the day of the next scheduled visit.
              </p>
            </div>
            <div style={styles.aboutStatsCol}>
              {ABOUT_STATS.map(s => (
                <div key={s.label} style={styles.aboutStat}>
                  <span style={styles.aboutStatValue}>{s.value}</span>
                  <span style={styles.aboutStatLabel}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- Features */}
      <section id="features" style={styles.features}>
        <div style={styles.sectionInner}>
          <div style={styles.featuresHead}>
            <span style={styles.sectionEyebrow}>What it does</span>
            <h2 style={{ ...styles.sectionTitle, margin: 0 }}>Four systems, one dashboard</h2>
          </div>
          <div style={styles.featuresGrid}>
            {FEATURES.map(f => (
              <div key={f.title} className="agb-card" style={styles.featureCard}>
                <div style={styles.featureIconWrap}><FeatureIcon name={f.icon} /></div>
                <h3 style={styles.featureTitle}>{f.title}</h3>
                <p style={styles.featureBody}>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ Contact */}
      <section id="contact" style={styles.contact}>
        <div style={styles.sectionInner}>
          <div style={styles.contactHead}>
            <span style={{ ...styles.sectionEyebrow, color: 'rgba(255,255,255,0.6)' }}>Get in touch</span>
            <h2 style={{ ...styles.sectionTitle, color: '#fff', margin: '0 0 18px' }}>Getting your farm on AgriBantay starts at the Agriculture Office</h2>
            <p style={{ ...styles.bodyText, color: 'rgba(255,255,255,0.78)', marginBottom: 0 }}>
              Accounts aren't self-service — the office sets each one up directly, so a farm's sensor
              and inspection history starts accurate from day one. Reach out using the details below.
            </p>
          </div>
          <div style={styles.contactGrid}>
            {CONTACT_CARDS.map(c => (
              <div key={c.label} style={styles.contactCard}>
                <div style={styles.contactCardIcon}><ContactIcon name={c.icon} /></div>
                <div>
                  <div style={styles.contactCardLabel}>{c.label}</div>
                  <div style={styles.contactCardValue}>{c.value}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- Footer */}
      <footer style={styles.footer}>
        <img src={agribantayName} alt="AgriBantay" style={styles.footerNameImg} />
        <span style={styles.footerNote}>A digital service of the San Jose Municipal Agriculture Office</span>
      </footer>
    </div>
  )
}

/* ---------------------------------------------------------------- Icons */
const iconBase = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }

function IconMenu({ open }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1c2a20" strokeWidth="2" strokeLinecap="round">
      {open ? (
        <><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>
      ) : (
        <><path d="M3 6h18" /><path d="M3 12h18" /><path d="M3 18h18" /></>
      )}
    </svg>
  )
}

function SensorIcon({ name }) {
  const paths = {
    ammonia: <path d="M12 3s6 7 6 11a6 6 0 1 1-12 0c0-4 6-11 6-11z" />,
    temp: <path d="M12 14V5a2 2 0 1 0-4 0v9a4 4 0 1 0 4 0z" />,
    humidity: <path d="M7 16a4 4 0 0 1 .5-8 5 5 0 0 1 9.5 2 3.5 3.5 0 0 1-.5 7H7z" />,
    moisture: <path d="M4 20c8 0 12-6 12-14 0 0-10 0-12 8-1 4 0 6 0 6z" />,
  }
  return <svg width="15" height="15" viewBox="0 0 24 24" {...iconBase}>{paths[name]}</svg>
}

function FeatureIcon({ name }) {
  const paths = {
    gauge: <><circle cx="12" cy="13" r="8" /><path d="M12 13l3-4" /><path d="M9 5.5 10 4" /></>,
    waste: <><path d="M12 3c4 5 6 8.5 6 11.5A6 6 0 0 1 6 14.5C6 11.5 8 8 12 3z" /><path d="M9.5 14.5c.5 1.5 2 2.5 3.5 2" /></>,
    inspection: <><rect x="5" y="4" width="14" height="17" rx="1.5" /><path d="M9 9l1.7 1.7L14 7.5" /></>,
    vet: <><circle cx="9" cy="8" r="3" /><path d="M4 20c0-3.3 2.5-6 5-6s5 2.7 5 6" /><path d="M17 4v6" /><path d="M14 7h6" /></>,
  }
  return <svg width="24" height="24" viewBox="0 0 24 24" {...iconBase}>{paths[name]}</svg>
}

function ContactIcon({ name }) {
  const paths = {
    pin: <><path d="M12 21s7-6.5 7-11a7 7 0 1 0-14 0c0 4.5 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
    phone: <path d="M6 3h4l1 5-2.5 1.5a11 11 0 0 0 5 5L15 12l5 1v4a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z" />,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>,
    clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  }
  return <svg width="19" height="19" viewBox="0 0 24 24" {...iconBase}>{paths[name]}</svg>
}

/* ---------------------------------------------------------------- Styles */
// Load these two families once (e.g. in index.html <head>):
//   Source Serif 4 (display headings) + Public Sans (UI / body)
//   https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600;8..60,700&family=Public+Sans:wght@400;500;600;700;800&display=swap
const SERIF = "'Source Serif 4', Georgia, 'Times New Roman', serif"
const SANS = "'Public Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

const styles = {
  page: { fontFamily: SANS, color: '#1c2a20', backgroundColor: '#ffffff', overflowX: 'hidden' },

  nav: {
    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
    backgroundColor: 'rgba(255,255,255,0.9)',
    backdropFilter: 'saturate(160%) blur(10px)', WebkitBackdropFilter: 'saturate(160%) blur(10px)',
    borderBottom: '1px solid #e9e8e0',
  },
  navInner: {
    maxWidth: '1200px', margin: '0 auto', padding: '13px 28px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    minHeight: `${HEADER_HEIGHT}px`, boxSizing: 'border-box',
  },
  navBrand: { display: 'flex', alignItems: 'center', gap: '11px', textDecoration: 'none' },
  navLogoImg: { width: '40px', height: '40px', objectFit: 'contain', flexShrink: 0 },
  navNameImg: { height: '20px', width: 'auto', maxWidth: '150px', objectFit: 'contain', display: 'block' },
  navLinksDesktop: { display: 'flex', alignItems: 'center', gap: '34px' },
  navLink: { fontSize: '14.5px', fontWeight: 600, color: '#33413a', textDecoration: 'none' },
  navLoginBtn: {
    padding: '10px 22px', borderRadius: '9px', border: 'none', backgroundColor: '#256b3d',
    color: '#fff', fontSize: '14px', fontWeight: 700, cursor: 'pointer', fontFamily: SANS, letterSpacing: '0.01em',
  },
  navMenuBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', width: '42px', height: '42px',
    background: 'none', border: '1px solid #e0dfd6', borderRadius: '10px', cursor: 'pointer',
  },
  navMobileMenu: {
    display: 'flex', flexDirection: 'column', padding: '6px 22px 20px', gap: '2px',
    borderTop: '1px solid #e9e8e0', backgroundColor: 'rgba(255,255,255,0.98)',
  },
  navMobileLink: {
    padding: '13px 6px', fontSize: '15.5px', fontWeight: 600, color: '#33413a',
    textDecoration: 'none', borderBottom: '1px solid #f0efe8',
  },
  navLoginBtnMobile: { marginTop: '12px', textAlign: 'center', width: '100%', boxSizing: 'border-box' },

  hero: {
    position: 'relative',
    backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat',
    minHeight: '660px', display: 'flex', alignItems: 'center',
    padding: `${HEADER_HEIGHT + 72}px 28px 150px`,
  },
  heroMobile: { minHeight: '560px', padding: `${HEADER_HEIGHT + 40}px 20px 130px` },
  heroInner: { maxWidth: '1200px', margin: '0 auto', width: '100%' },
  heroCol: { maxWidth: '640px' },
  heroEyebrow: {
    display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '11.5px', fontWeight: 700,
    letterSpacing: '0.06em', textTransform: 'uppercase', color: '#dbeadf',
    backgroundColor: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.22)',
    padding: '7px 14px', borderRadius: '999px',
  },
  heroEyebrowDot: { width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#7cc795' },
  heroTitle: {
    fontFamily: SERIF, fontWeight: 600, fontSize: 'clamp(34px, 5vw, 56px)',
    lineHeight: 1.08, letterSpacing: '-0.02em', color: '#fff', margin: '22px 0 20px',
  },
  heroSubtitle: {
    fontSize: '17px', lineHeight: 1.62, color: 'rgba(255,255,255,0.85)', maxWidth: '540px', margin: '0 0 32px',
  },
  heroActions: { display: 'flex', gap: '13px', flexWrap: 'wrap' },
  heroActionsMobile: { flexDirection: 'column', alignItems: 'stretch' },
  btnFullMobile: { width: '100%', boxSizing: 'border-box', justifyContent: 'center' },
  ctaPrimary: {
    display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '14px 28px', borderRadius: '10px',
    border: 'none', backgroundColor: '#2c8047', color: '#fff', fontSize: '15px', fontWeight: 700,
    cursor: 'pointer', fontFamily: SANS,
  },
  ctaSecondary: {
    display: 'inline-flex', alignItems: 'center', padding: '14px 28px', borderRadius: '10px',
    border: '1.5px solid rgba(255,255,255,0.45)', backgroundColor: 'rgba(255,255,255,0.08)',
    color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer', fontFamily: SANS,
  },

  snapshotWrap: { maxWidth: '1120px', margin: '-84px auto 0', padding: '0 28px', position: 'relative', zIndex: 20 },
  snapshotStrip: {
    backgroundColor: '#fff', border: '1px solid #e9e8e0', borderRadius: '18px',
    padding: '20px 22px 22px', boxShadow: '0 30px 60px -30px rgba(15,38,22,0.5)',
  },
  snapshotLabel: { display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '16px' },
  snapshotDot: { width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#2c8047', flexShrink: 0 },
  snapshotLabelStrong: { fontSize: '12px', fontWeight: 700, letterSpacing: '0.02em', color: '#6a7a6f' },
  snapshotLabelMuted: { fontSize: '12px', color: '#9aa79d' },
  snapshotGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' },
  snapshotItem: { border: '1px solid #ecebe3', borderRadius: '12px', padding: '15px 16px', backgroundColor: '#fbfbf8' },
  snapshotItemWarn: { border: '1px solid #f0e2cf', backgroundColor: '#fdf8f0' },
  snapshotItemTop: { display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '11px' },
  snapshotItemLabel: {
    fontSize: '11px', fontWeight: 700, color: '#6a7a6f', textTransform: 'uppercase', letterSpacing: '0.05em',
  },
  snapshotItemValue: {
    fontSize: '26px', fontWeight: 800, color: '#14301c', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
  },
  snapshotItemUnit: { fontSize: '13px', fontWeight: 500, color: '#9aa79d', marginLeft: '3px' },
  snapshotItemStatus: { display: 'flex', alignItems: 'center', gap: '6px', marginTop: '7px', fontSize: '11.5px', fontWeight: 700 },
  snapshotItemStatusDot: { width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0 },

  sectionInner: { maxWidth: '1120px', margin: '0 auto', padding: '0 28px' },
  sectionEyebrow: {
    display: 'block', fontSize: '12px', fontWeight: 700, letterSpacing: '0.06em',
    textTransform: 'uppercase', color: '#2c8047', marginBottom: '14px',
  },
  sectionTitle: {
    fontFamily: SERIF, fontWeight: 600, fontSize: 'clamp(26px, 3.2vw, 37px)',
    lineHeight: 1.18, letterSpacing: '-0.015em', color: '#14301c', margin: '0 0 22px', maxWidth: '640px',
  },
  bodyText: { fontSize: '15.5px', lineHeight: 1.72, color: '#4b5a50', marginBottom: '16px' },

  about: { padding: '92px 0 84px' },
  aboutGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '56px', alignItems: 'start',
  },
  aboutStatsCol: { display: 'flex', flexDirection: 'column', gap: '14px' },
  aboutStat: {
    display: 'flex', alignItems: 'center', gap: '18px', padding: '20px 22px',
    backgroundColor: '#f6f5ef', border: '1px solid #ecebe3', borderRadius: '14px',
  },
  aboutStatValue: { fontFamily: SERIF, fontSize: '40px', fontWeight: 600, color: '#2c8047', lineHeight: 1, minWidth: '52px' },
  aboutStatLabel: { fontSize: '14px', lineHeight: 1.4, color: '#4b5a50', fontWeight: 500 },

  features: { padding: '84px 0', backgroundColor: '#f6f5ef', borderTop: '1px solid #ecebe3', borderBottom: '1px solid #ecebe3' },
  featuresHead: { maxWidth: '620px', marginBottom: '40px' },
  featuresGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(248px, 1fr))', gap: '18px' },
  featureCard: { backgroundColor: '#fff', border: '1px solid #e9e8e0', borderRadius: '14px', padding: '26px' },
  featureIconWrap: {
    width: '46px', height: '46px', borderRadius: '12px', backgroundColor: '#eaf3ec', color: '#2c8047',
    display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '18px',
  },
  featureTitle: { fontSize: '17px', fontWeight: 700, color: '#14301c', margin: '0 0 9px', letterSpacing: '-0.01em' },
  featureBody: { fontSize: '14px', lineHeight: 1.62, color: '#647065', margin: 0 },

  contact: { padding: '88px 0', backgroundImage: 'linear-gradient(160deg, #1f5a34 0%, #14301c 100%)' },
  contactHead: { maxWidth: '620px' },
  contactGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', marginTop: '38px' },
  contactCard: {
    display: 'flex', gap: '14px', alignItems: 'flex-start', backgroundColor: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.14)', borderRadius: '13px', padding: '18px 20px',
  },
  contactCardIcon: {
    width: '38px', height: '38px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.12)',
    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  contactCardLabel: {
    fontSize: '10.5px', fontWeight: 700, color: 'rgba(255,255,255,0.55)',
    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '5px',
  },
  contactCardValue: { fontSize: '14.5px', color: '#fff', fontWeight: 600, lineHeight: 1.4, wordBreak: 'break-word' },

  footer: {
    padding: '30px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
    backgroundColor: '#101f14',
  },
  footerNameImg: { height: '20px', width: 'auto', maxWidth: '160px', objectFit: 'contain' },
  footerNote: { fontSize: '12px', color: 'rgba(255,255,255,0.45)' },
}