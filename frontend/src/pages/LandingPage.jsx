import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useIsMobile } from '../hooks/useIsMobile'
import agribantayLogo from '../assets/agribantay_logo.png'
import agribantayName from '../assets/agribantay_name.png'
// Save the uploaded poultry farm photo into src/assets/ under this exact
// filename (or update this path to match whatever you name it).
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

// Height of the fixed nav bar. Used to keep the hero content clear of it
// (position: fixed removes the nav from document flow, so the section
// beneath it needs matching top padding or its content starts hidden
// underneath the bar).
const HEADER_HEIGHT = 68

// Same trio used throughout the dashboard (sensor status, alert badges).
const statusColor = { Normal: '#2E7D32', Warning: '#B45309', Critical: '#B91C1C' }

export default function LandingPage() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [navOpen, setNavOpen] = useState(false)

  const scrollTo = (id) => (e) => {
    e.preventDefault()
    setNavOpen(false)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
          0%, 100% { box-shadow: 0 0 0 0 rgba(212,175,55,0.4); }
          50% { box-shadow: 0 0 0 6px rgba(212,175,55,0); }
        }
        .agb-pulse { animation: agbPulse 2.4s ease-in-out infinite; }
        .agb-feature-card:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(0,0,0,0.12); }
        .agb-nav-link:hover { opacity: 0.7; }
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
                <a key={l.href} href={l.href} onClick={scrollTo(l.href.slice(1))} className="agb-nav-link" style={styles.navLink}>
                  {l.label}
                </a>
              ))}
              <button style={styles.navLoginBtn} onClick={() => navigate('/login')}>Login</button>
            </nav>
          )}

          {isMobile && (
            <button
              aria-label="Toggle navigation menu"
              style={styles.navMenuBtn}
              onClick={() => setNavOpen(v => !v)}
            >
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
            <button style={{ ...styles.navLoginBtn, ...styles.navLoginBtnMobile }} onClick={() => navigate('/login')}>
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
          backgroundImage: `linear-gradient(rgba(15,33,24,0.82), rgba(15,33,24,0.88)), url(${heroImage})`,
        }}
      >
        <div style={styles.heroInner}>
          <span style={styles.heroEyebrow}>Municipality of San Jose, Batangas · Municipal Agriculture Office</span>
          <h1 style={styles.heroTitle}>
            Track the flock. Manage the waste.<br />Protect the watershed.
          </h1>
          <p style={styles.heroSubtitle}>
            AgriBantay gives the Municipal Agriculture Office a live read on ammonia, manure
            buildup, and flock conditions across San Jose — plus the inspection and veterinary
            records to act on what the sensors find.
          </p>

          <div style={{ ...styles.heroActions, ...(isMobile ? styles.heroActionsMobile : {}) }}>
            <button style={{ ...styles.ctaPrimary, ...(isMobile ? styles.btnFullMobile : {}) }} onClick={scrollTo('contact')}>
              Register Your Farm
            </button>
            <button style={{ ...styles.ctaSecondary, ...(isMobile ? styles.btnFullMobile : {}) }} onClick={() => navigate('/login')}>
              Login
            </button>
          </div>

          <div style={styles.snapshotStrip}>
            <div style={styles.snapshotLabel}>
              <span className="agb-pulse" style={styles.snapshotDot} />
              Live farm snapshot — sample reading
            </div>
            <div style={{ ...styles.snapshotRow, ...(isMobile ? styles.snapshotRowMobile : {}) }}>
              {SNAPSHOT_READINGS.map((r, i) => (
                <div
                  key={r.key}
                  style={{
                    ...styles.snapshotItem,
                    ...(i > 0 ? (isMobile ? styles.snapshotItemDividerMobile : styles.snapshotItemDivider) : {}),
                  }}
                >
                  <div style={styles.snapshotItemTop}>
                    <span style={{ color: statusColor[r.status] }}><SensorIcon name={r.icon} /></span>
                    <span style={styles.snapshotItemLabel}>{r.label}</span>
                  </div>
                  <div style={styles.snapshotItemValue}>
                    {r.value}<span style={styles.snapshotItemUnit}>{r.unit}</span>
                  </div>
                  <div style={styles.snapshotItemStatus}>
                    <span style={{ ...styles.snapshotItemDot, backgroundColor: statusColor[r.status] }} />
                    <span style={{ color: statusColor[r.status] }}>{r.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------- About */}
      <section id="about" style={styles.about}>
        <div style={styles.sectionInner}>
          <div style={{ ...styles.aboutGrid, ...(isMobile ? styles.aboutGridMobile : {}) }}>
            <div>
              <span style={styles.sectionEyebrow}>About AgriBantay</span>
              <h2 style={styles.sectionTitle}>Built around how San Jose already inspects, treats, and tracks poultry farms</h2>
              <p style={styles.bodyText}>
                AgriBantay replaces paper inspection logs and phone-tag scheduling with one shared
                system. The Municipal Agriculture Office, registered veterinarians, and farm owners
                work from the same records — sensor readings, vaccination requests, and inspection
                history — instead of three separate ones.
              </p>
              <p style={styles.bodyText}>
                Ammonia buildup and poor manure management are leading causes of respiratory illness
                in layer flocks, and a source of runoff that can affect nearby waterways. Sensors
                installed at each farm report conditions continuously, so a problem gets flagged the
                day it starts — not the day of the next scheduled visit.
              </p>
            </div>
            <div style={styles.aboutStatsCol}>
              <AboutStat value="4" label="Conditions tracked per farm, continuously" />
              <AboutStat value="3" label="Roles sharing one inspection record" />
              <AboutStat value="33" label="Barangays under one monitoring network" />
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- Features */}
      <section id="features" style={styles.features}>
        <div style={styles.sectionInner}>
          <span style={styles.sectionEyebrow}>What it does</span>
          <h2 style={styles.sectionTitle}>Four systems, one dashboard</h2>
          <div style={{ ...styles.featuresGrid, ...(isMobile ? styles.featuresGridMobile : {}) }}>
            {FEATURES.map(f => (
              <div key={f.title} className="agb-feature-card" style={styles.featureCard}>
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
          <span style={{ ...styles.sectionEyebrow, color: 'rgba(247,242,231,0.65)' }}>Get in touch</span>
          <h2 style={{ ...styles.sectionTitle, color: '#fff' }}>Getting your farm on AgriBantay starts at the Agriculture Office</h2>
          <p style={{ ...styles.bodyText, color: 'rgba(247,242,231,0.8)', maxWidth: '560px' }}>
            Accounts aren't self-service — the office sets each one up directly, so a farm's sensor
            and inspection history starts accurate from day one. Reach out using the details below.
          </p>

          <div style={{ ...styles.contactGrid, ...(isMobile ? styles.contactGridMobile : {}) }}>
            <ContactCard icon="pin" label="Office Address" value="Dagatan, San Jose, Batangas" />
            <ContactCard icon="phone" label="Contact Number" value="779-8550 to 779-8554 loc. 1005 / 2005" />
            <ContactCard icon="mail" label="Email" value="agriculture@sanjosebatangas.gov.ph" />
            <ContactCard icon="clock" label="Office Hours" value="Mon–Fri, 8AM–5PM" />
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

function AboutStat({ value, label }) {
  return (
    <div style={styles.aboutStat}>
      <div style={styles.aboutStatValue}>{value}</div>
      <div style={styles.aboutStatLabel}>{label}</div>
    </div>
  )
}

function ContactCard({ icon, label, value }) {
  return (
    <div style={styles.contactCard}>
      <div style={styles.contactCardIcon}><ContactIcon name={icon} /></div>
      <div>
        <div style={styles.contactCardLabel}>{label}</div>
        <div style={styles.contactCardValue}>{value}</div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- Icons */
const iconBase = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }

function IconMenu({ open }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#122A1E" strokeWidth="2" strokeLinecap="round">
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
  return <svg width="13" height="13" viewBox="0 0 24 24" {...iconBase}>{paths[name]}</svg>
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
  return <svg width="18" height="18" viewBox="0 0 24 24" {...iconBase}>{paths[name]}</svg>
}

/* ---------------------------------------------------------------- Styles */
// One font family throughout, matching the rest of the app.
const SYSTEM_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

const styles = {
  page: { fontFamily: SYSTEM_FONT, color: '#1F2937', backgroundColor: '#F7F2E7', overflowX: 'hidden' },

  // Nav — fixed, not sticky, so it can't silently break due to an
  // ancestor's overflow/transform. HEADER_HEIGHT compensates the hero
  // section below so its content doesn't start hidden underneath.
  nav: {
    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
    backgroundColor: 'rgba(247,242,231,0.96)',
    backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
    borderBottom: '1px solid #E8E2D3',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  navInner: {
    maxWidth: '1180px', margin: '0 auto', padding: '12px 28px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    minHeight: `${HEADER_HEIGHT}px`, boxSizing: 'border-box',
  },
  navBrand: { display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' },
  navLogoImg: { width: '36px', height: '36px', objectFit: 'contain', flexShrink: 0 },
  navNameImg: { height: '18px', width: 'auto', maxWidth: '140px', objectFit: 'contain', display: 'block' },
  navLinksDesktop: { display: 'flex', alignItems: 'center', gap: '30px' },
  navLink: { fontSize: '14.5px', fontWeight: 600, color: '#234A35', textDecoration: 'none', transition: 'opacity 0.15s' },
  navLoginBtn: {
    padding: '10px 20px', borderRadius: '8px', border: 'none', backgroundColor: '#2E7D32',
    color: '#fff', fontSize: '14px', fontWeight: 700, cursor: 'pointer', fontFamily: SYSTEM_FONT,
  },
  navMenuBtn: { display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' },
  navMobileMenu: {
    display: 'flex', flexDirection: 'column', padding: '8px 28px 20px', gap: '4px',
    borderTop: '1px solid #E8E2D3', backgroundColor: 'rgba(247,242,231,0.98)',
  },
  navMobileLink: {
    padding: '12px 4px', fontSize: '15.5px', fontWeight: 600, color: '#234A35',
    textDecoration: 'none', borderBottom: '1px solid #EFE9DA',
  },
  navLoginBtnMobile: { marginTop: '12px', textAlign: 'center', width: '100%', boxSizing: 'border-box' },

  // Hero — real photo background with a brand-tinted dark overlay
  // (linear-gradient set inline per-render since it composites with the
  // imported image URL). paddingTop clears the fixed nav.
  hero: {
    backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat',
    paddingTop: `${HEADER_HEIGHT + 56}px`, paddingBottom: '72px', paddingLeft: '28px', paddingRight: '28px',
    textAlign: 'center',
  },
  heroMobile: { paddingTop: `${HEADER_HEIGHT + 36}px`, paddingBottom: '48px', paddingLeft: '20px', paddingRight: '20px' },
  heroInner: { maxWidth: '780px', margin: '0 auto' },
  heroActionsMobile: { flexDirection: 'column', alignItems: 'stretch' },
  btnFullMobile: { width: '100%', boxSizing: 'border-box' },
  heroEyebrow: {
    display: 'inline-block', fontSize: '12px', fontWeight: 700,
    letterSpacing: '0.04em', textTransform: 'uppercase', color: '#E8C766',
    backgroundColor: 'rgba(232,199,102,0.14)', border: '1px solid rgba(232,199,102,0.3)',
    padding: '6px 14px', borderRadius: '999px', marginBottom: '24px',
  },
  heroTitle: {
    fontWeight: 800, fontSize: 'clamp(28px, 4.6vw, 44px)',
    lineHeight: 1.22, color: '#fff', margin: '0 0 20px', letterSpacing: '-0.01em',
  },
  heroSubtitle: {
    fontSize: '16px', lineHeight: 1.65, color: 'rgba(247,242,231,0.88)', maxWidth: '580px',
    margin: '0 auto 32px',
  },
  heroActions: { display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '48px' },
  ctaPrimary: {
    padding: '12px 26px', borderRadius: '8px', border: 'none', backgroundColor: '#D4AF37',
    color: '#122A1E', fontSize: '14.5px', fontWeight: 700, cursor: 'pointer', fontFamily: SYSTEM_FONT,
  },
  ctaSecondary: {
    padding: '12px 26px', borderRadius: '8px', border: '1.5px solid rgba(255,255,255,0.6)', backgroundColor: 'transparent',
    color: '#fff', fontSize: '14.5px', fontWeight: 700, cursor: 'pointer', fontFamily: SYSTEM_FONT,
  },

  snapshotStrip: {
    backgroundColor: '#fff', border: '1px solid #E8E2D3', borderRadius: '14px',
    padding: '18px 20px 20px', textAlign: 'left', boxShadow: '0 12px 32px rgba(0,0,0,0.28)',
  },
  snapshotLabel: {
    display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11.5px',
    color: '#9ca3af', marginBottom: '14px', fontWeight: 600,
  },
  snapshotDot: { width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#D4AF37', flexShrink: 0 },
  snapshotRow: { display: 'flex', alignItems: 'stretch' },
  snapshotRowMobile: { flexDirection: 'column', gap: '14px' },
  snapshotItem: { flex: 1, padding: '0 16px', textAlign: 'left' },
  snapshotItemDivider: { borderLeft: '1px solid #E8E2D3' },
  snapshotItemDividerMobile: { borderLeft: 'none', borderTop: '1px solid #E8E2D3', paddingTop: '14px' },
  snapshotItemTop: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' },
  snapshotItemLabel: {
    fontSize: '10.5px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.4px',
  },
  snapshotItemValue: {
    fontSize: '19px', fontWeight: 800, color: '#122A1E',
    fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
  },
  snapshotItemUnit: { fontSize: '11px', color: '#9ca3af', marginLeft: '3px', fontWeight: 400 },
  snapshotItemStatus: { display: 'flex', alignItems: 'center', gap: '5px', marginTop: '5px', fontSize: '11px', fontWeight: 700 },
  snapshotItemDot: { width: '5px', height: '5px', borderRadius: '50%', flexShrink: 0 },

  // Shared section
  sectionInner: { maxWidth: '1100px', margin: '0 auto', padding: '0 28px' },
  sectionEyebrow: {
    display: 'block', fontSize: '12px', fontWeight: 700, letterSpacing: '0.04em',
    textTransform: 'uppercase', color: '#B5651D', marginBottom: '12px',
  },
  sectionTitle: {
    fontWeight: 800, fontSize: 'clamp(22px, 3vw, 30px)',
    color: '#122A1E', lineHeight: 1.25, margin: '0 0 18px', maxWidth: '640px',
  },
  bodyText: { fontSize: '14.5px', lineHeight: 1.7, color: '#4B5563', marginBottom: '14px' },

  // About
  about: { padding: '64px 0' },
  aboutGrid: { display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '48px', alignItems: 'start' },
  aboutGridMobile: { gridTemplateColumns: '1fr', gap: '28px' },
  aboutStatsCol: { display: 'flex', flexDirection: 'column', gap: '14px', paddingTop: '4px' },
  aboutStat: {
    backgroundColor: '#fff', border: '1px solid #E8E2D3', borderRadius: '12px',
    padding: '16px 18px', display: 'flex', alignItems: 'center', gap: '14px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  aboutStatValue: { fontSize: '28px', fontWeight: 800, color: '#B5651D', flexShrink: 0 },
  aboutStatLabel: { fontSize: '12.5px', color: '#4B5563', lineHeight: 1.4 },

  // Features
  features: { padding: '64px 0', backgroundColor: '#FDFBF6', borderTop: '1px solid #E8E2D3', borderBottom: '1px solid #E8E2D3' },
  featuresGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginTop: '30px' },
  featuresGridMobile: { gridTemplateColumns: '1fr' },
  featureCard: {
    backgroundColor: '#fff', border: '1px solid #E8E2D3', borderRadius: '12px',
    padding: '22px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
  },
  featureIconWrap: {
    width: '42px', height: '42px', borderRadius: '10px', backgroundColor: 'rgba(35,74,53,0.08)',
    color: '#234A35', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px',
  },
  featureTitle: { fontSize: '16.5px', fontWeight: 700, color: '#122A1E', margin: '0 0 8px' },
  featureBody: { fontSize: '13.5px', lineHeight: 1.6, color: '#6b7280', margin: 0 },

  // Contact — same gradient used on the Farm Profile modal header
  contact: { padding: '64px 0', backgroundImage: 'linear-gradient(135deg, #234A35 0%, #122A1E 100%)' },
  contactGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px', marginTop: '32px' },
  contactGridMobile: { gridTemplateColumns: '1fr' },
  contactCard: {
    display: 'flex', gap: '14px', alignItems: 'flex-start', backgroundColor: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.14)', borderRadius: '12px', padding: '16px 18px',
  },
  contactCardIcon: {
    width: '34px', height: '34px', borderRadius: '8px', backgroundColor: 'rgba(212,175,55,0.16)',
    color: '#E8C766', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  contactCardLabel: {
    fontSize: '10.5px', fontWeight: 700, color: 'rgba(247,242,231,0.55)',
    textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '4px',
  },
  contactCardValue: { fontSize: '14px', color: '#fff', fontWeight: 600, lineHeight: 1.4 },

  // Footer
  footer: {
    padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
    backgroundColor: '#122A1E',
  },
  footerNameImg: { height: '18px', width: 'auto', maxWidth: '150px', objectFit: 'contain' },
  footerNote: { fontSize: '11.5px', color: 'rgba(247,242,231,0.5)' },
}