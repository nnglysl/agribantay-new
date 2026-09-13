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

// Example readings shown in the hero band — illustrative values that show what
// the AgriBantay dashboard displays, not live sensor data. Swap for live values
// when the public snapshot endpoint is available.
const SNAPSHOT_READINGS = [
  { key: 'ammonia', label: 'Ammonia', value: '11', unit: 'ppm', status: 'Within range', warn: false },
  { key: 'temp', label: 'Temperature', value: '28.6', unit: '°C', status: 'Within range', warn: false },
  { key: 'humidity', label: 'Humidity', value: '64', unit: '%', status: 'Within range', warn: false },
  { key: 'moisture', label: 'Moisture', value: '58', unit: '%', status: 'Above range', warn: true },
]

const FEATURES = [
  {
    icon: 'gauge',
    title: 'Continuous Sensor Monitoring',
    body: 'Ammonia, temperature, humidity, and moisture are read from each farm around the clock. A reading that crosses a safe threshold gets flagged immediately instead of waiting until the next scheduled visit.',
  },
  {
    icon: 'waste',
    title: 'Manure & Waste Oversight',
    body: 'Manure output and disposal are recorded per farm, giving the office an environmental record useful for compliance and for catching runoff risks before they reach nearby waterways.',
  },
  {
    icon: 'inspection',
    title: 'Inspection Scheduling',
    body: 'General and follow-up inspections are placed on a shared calendar. Every visit, whether completed or missed, stays on record for that farm.',
  },
  {
    icon: 'vet',
    title: 'Veterinary Coordination',
    body: "Vaccination requests and farm history are visible to the assigned veterinarian as soon as they are submitted instead of waiting for a phone call.",
  },
]

const FEATURE_SHADES = ['#1f5a34', '#256b3d', '#2c8047', '#1b4332']

const QUICK_LINKS = [
  { label: 'Home', href: '#home' },
  { label: 'About', href: '#about' },
  { label: 'Features', href: '#features' },
  { label: 'Contact', href: '#contact' },
]

const UTILITY_LINKS = [
  { label: 'Privacy Policy', to: '/privacy' },
  { label: 'Terms of Service', to: '/terms' },
]

const OFFICE_LINES = [
  'Municipal Agriculture Office',
  'Dagatan, San Jose, Batangas',
  'Mon–Fri, 8AM–5PM',
]

const CONTACT_ITEMS = [
  { icon: 'mail', label: 'Email', value: 'agriculture@sanjosebatangas.gov.ph' },
  { icon: 'phone', label: 'Phone', value: '779-8550 to 779-8554 loc. 1005 / 2005' },
]

// Combined offset for the floating pill nav (top margin + pill height +
// breathing room) — used both to offset in-page scroll targets and to
// pad the top of the hero section so nothing sits hidden underneath it.
const HEADER_HEIGHT = 92

export default function LandingPage() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [navOpen, setNavOpen] = useState(false)
  const [videoPlaying, setVideoPlaying] = useState(false)

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
        }
        .agb-navlink { position: relative; transition: color .15s ease; }
        .agb-navlink::after {
          content: ""; position: absolute; left: 0; right: 100%; bottom: -6px;
          height: 2px; background: #256b3d; transition: right .22s ease;
        }
        .agb-navlink:hover::after { right: 0; }
        .agb-feature-card {
          transition: transform .18s ease, box-shadow .18s ease;
        }
        .agb-feature-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 18px 36px -16px rgba(15,38,22,0.45);
        }
        .agb-btn { transition: transform .12s ease, background-color .15s ease, box-shadow .15s ease; }
        .agb-btn:active { transform: translateY(1px); }
        .agb-primary:hover { background-color: #1f5a34; box-shadow: 0 8px 20px -8px rgba(31,90,52,0.7); }
        .agb-ghost:hover { background-color: rgba(255,255,255,0.16); }
        .agb-play-btn { transition: transform .18s ease, background-color .15s ease; }
        .agb-video-frame:hover .agb-play-btn { transform: scale(1.08); background-color: #fff; }
        .agb-footer-grid a { transition: color .15s ease; }
        .agb-footer-grid a:hover { color: #fff; }

        .agb-footer-grid {
          display: grid;
          grid-template-columns: 0.7fr 0.7fr 0.9fr 1.2fr;
          gap: 40px;
          margin-top: 64px;
          padding-top: 44px;
          border-top: 1px solid rgba(255,255,255,0.16);
        }
        @media (max-width: 860px) {
          .agb-footer-grid { grid-template-columns: 1fr 1fr; gap: 32px 28px; }
        }
        @media (max-width: 560px) {
          .agb-footer-grid { grid-template-columns: 1fr; gap: 32px; }
        }
      `}</style>

      {/* ---------------------------------------------------------------- Nav */}
      <header style={styles.navWrap}>
        <div style={styles.navPill}>
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
          backgroundImage: `linear-gradient(100deg, rgba(15,38,22,0.9) 0%, rgba(15,38,22,0.72) 42%, rgba(15,38,22,0.28) 100%), linear-gradient(to top, rgba(15,38,22,0.72), rgba(15,38,22,0) 55%), url(${heroImage})`,
        }}
      >
        <div style={styles.heroInner}>
          <div style={styles.heroCol}>
            <span style={styles.heroEyebrow}>
              <span style={styles.heroEyebrowRule} />
              San Jose, Batangas · Municipal Agriculture Office
            </span>
            <h1 style={styles.heroTitle}>Monitor Your Farm. Protect Your Poultry. Support a Cleaner Environment.</h1>
            <p style={styles.heroSubtitle}>
              Monitor farm conditions, receive timely alerts, and manage your farm information all in one system with AgriBantay.
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

          {/* Example readings panel — sits inside the hero band, clearly marked
              as illustrative rather than live telemetry. */}
          <div style={{ ...styles.readings, ...(isMobile ? styles.readingsMobile : {}) }}>
            <div style={styles.readingsHead}>
              <span style={styles.readingsHeadLabel}>What you'll see inside AgriBantay</span>
              <span style={styles.readingsHeadRule} />
              <span style={styles.readingsHeadNote}>Example values — not live sensor data</span>
            </div>
            <div style={{ ...styles.readingsRow, ...(isMobile ? styles.readingsRowMobile : {}) }}>
              {SNAPSHOT_READINGS.map(r => (
                <div key={r.key} style={styles.readingCell}>
                  <span style={styles.readingLabel}>{r.label}</span>
                  <span style={{ ...styles.readingValue, color: r.warn ? '#f0bd66' : '#fff' }}>
                    {r.value}<span style={styles.readingUnit}>{r.unit}</span>
                  </span>
                  <span style={{ ...styles.readingStatus, color: r.warn ? '#f0bd66' : 'rgba(255,255,255,0.88)' }}>
                    {r.warn && <span style={styles.readingMark} />}
                    {r.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------- About */}
      <section id="about" style={styles.about}>
        <div style={styles.sectionInner}>
          <div style={styles.aboutGrid}>
            <div>
              <span style={styles.sectionEyebrow}>About AgriBantay</span>
              <h2 style={styles.sectionTitle}>Built for Poultry Farm Monitoring in San Jose</h2>
              <p style={styles.bodyText}>
                AgriBantay brings farm owners, veterinarians, and the Municipal Agriculture Office
                together in one shared system for monitoring farm conditions, managing farm records,
                and responding to important concerns.
              </p>
              <p style={{ ...styles.bodyText, marginBottom: 0 }}>
                Ammonia buildup and poor manure management are leading causes of respiratory illness in
                layer flocks, and a source of runoff that can affect nearby waterways. Sensors report
                conditions continuously, so a problem gets flagged the day it starts.
              </p>
            </div>

            <div className="agb-video-frame" style={styles.videoFrame}>
              {!videoPlaying ? (
                <button
                  type="button"
                  style={{ ...styles.videoPoster, backgroundImage: `url(${heroImage})` }}
                  onClick={() => setVideoPlaying(true)}
                  aria-label="Play AgriBantay overview video"
                >
                  <span style={styles.videoOverlay} />
                  <span className="agb-play-btn" style={styles.playBtn}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="#1f5a34"><path d="M8 5v14l11-7z" /></svg>
                  </span>
                  <span style={styles.videoCaption}>See how AgriBantay works — 0:30</span>
                </button>
              ) : (
                // NOTE: replace this src with the actual overview video once
                // it's produced (e.g. /assets/agribantay-overview.mp4).
                <video
                  style={styles.videoEl}
                  controls
                  autoPlay
                  poster={heroImage}
                >
                  <source src="/assets/agribantay-overview.mp4" type="video/mp4" />
                </video>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- Features */}
      <section id="features" style={styles.features}>
        <div style={styles.sectionInner}>
          <div style={styles.featuresHead}>
            <span style={styles.sectionEyebrow}>What it does</span>
            <h2 style={{ ...styles.sectionTitle, margin: 0 }}>One System for Poultry Farm Monitoring and Management</h2>
          </div>
          <div style={styles.featuresGrid}>
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className="agb-feature-card"
                style={{ ...styles.featureCard, backgroundColor: FEATURE_SHADES[i % FEATURE_SHADES.length] }}
              >
                <div style={styles.featureIconWrap}><FeatureIcon name={f.icon} /></div>
                <h3 style={styles.featureTitle}>{f.title}</h3>
                <p style={styles.featureBody}>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------- Contact / site footer */}
      <section id="contact" style={styles.contact}>
        <div style={styles.sectionInner}>
          <div style={styles.contactHead}>
            <span style={{ ...styles.sectionEyebrow, color: 'rgba(255,255,255,0.6)' }}>Get in touch</span>
            <h2 style={{ ...styles.sectionTitle, color: '#fff', margin: '0 0 18px' }}>Register with AgriBantay</h2>
            <p style={{ ...styles.bodyText, color: 'rgba(255,255,255,0.78)', marginBottom: 0 }}>
              To register your farm with AgriBantay, visit the Municipal Agriculture Office of San Jose, Batangas.
              The office will assist you with the registration and account setup process.
            </p>
          </div>

          <div className="agb-footer-grid">
            <div style={styles.footerCol}>
              <h3 style={styles.footerColTitle}>Quick Links</h3>
              <div style={styles.footerLinkList}>
                {QUICK_LINKS.map(l => (
                  <a key={l.href} href={l.href} onClick={scrollTo(l.href.slice(1))} style={styles.footerLink}>
                    {l.label}
                  </a>
                ))}
              </div>
            </div>

            <div style={styles.footerCol}>
              <h3 style={styles.footerColTitle}>Utility Pages</h3>
              <div style={styles.footerLinkList}>
                {UTILITY_LINKS.map(l => (
                  <a key={l.to} href={l.to} onClick={e => { e.preventDefault(); navigate(l.to) }} style={styles.footerLink}>
                    {l.label}
                  </a>
                ))}
              </div>
            </div>

            <div style={styles.footerCol}>
              <h3 style={styles.footerColTitle}>Office</h3>
              <div style={styles.footerLinkList}>
                {OFFICE_LINES.map(line => (
                  <span key={line} style={styles.footerText}>{line}</span>
                ))}
              </div>
            </div>

            <div style={styles.footerColWide}>
              <h3 style={styles.footerColTitle}>Contact Us</h3>
              <div style={styles.footerContactList}>
                {CONTACT_ITEMS.map(c => (
                  <div key={c.label} style={styles.footerContactItem}>
                    <span style={styles.footerContactIcon}><ContactIcon name={c.icon} /></span>
                    <div style={{ minWidth: 0 }}>
                      <div style={styles.footerContactLabel}>{c.label}</div>
                      <div style={styles.footerContactValue}>{c.value}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={styles.footerBottom}>
            <span style={styles.footerNote}>
              © {new Date().getFullYear()} AgriBantay
            </span>
          </div>
        </div>
      </section>
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
// Load these families once (e.g. in index.html <head>):
//   https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700;800&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;0,6..72,700;1,6..72,500&family=IBM+Plex+Mono:wght@400;500;600&display=swap
const SERIF = "'Newsreader', Georgia, 'Times New Roman', serif"
const SANS = "'Public Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
const MONO = "'IBM Plex Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace"

const styles = {
  page: { fontFamily: SANS, color: '#1c2a20', backgroundColor: '#ffffff', overflowX: 'hidden' },

  // -------------------------------------------------------- Floating pill nav
  navWrap: {
    position: 'fixed', top: '16px', left: 0, right: 0, zIndex: 100,
    display: 'flex', flexDirection: 'column', alignItems: 'center',
  },
  navPill: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    width: 'calc(100% - 32px)', maxWidth: '1080px',
    backgroundColor: 'rgba(255,255,255,0.92)',
    backdropFilter: 'saturate(160%) blur(12px)', WebkitBackdropFilter: 'saturate(160%) blur(12px)',
    border: 'none', borderRadius: '999px',
    padding: '9px 12px 9px 18px', boxShadow: '0 12px 32px -14px rgba(15,38,22,0.28)',
  },
  navBrand: { display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', flexShrink: 0 },
  navLogoImg: { width: '34px', height: '34px', objectFit: 'contain', flexShrink: 0 },
  navNameImg: { height: '17px', width: 'auto', maxWidth: '130px', objectFit: 'contain', display: 'block' },
  navLinksDesktop: { display: 'flex', alignItems: 'center', gap: '28px' },
  navLink: { fontSize: '14px', fontWeight: 600, color: '#33413a', textDecoration: 'none' },
  navLoginBtn: {
    padding: '9px 20px', borderRadius: '999px', border: 'none', backgroundColor: '#256b3d',
    color: '#fff', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', fontFamily: SANS, letterSpacing: '0.01em',
  },
  navMenuBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', width: '38px', height: '38px',
    background: '#f3f4ef', border: '1px solid #e0dfd6', borderRadius: '50%', cursor: 'pointer', flexShrink: 0,
  },
  navMobileMenu: {
    display: 'flex', flexDirection: 'column', width: 'calc(100% - 32px)', maxWidth: '1080px',
    padding: '8px 20px 16px', gap: '2px', marginTop: '8px',
    backgroundColor: 'rgba(255,255,255,0.97)', border: '1px solid #e5e4d9', borderRadius: '20px',
    boxShadow: '0 12px 32px -14px rgba(15,38,22,0.28)',
  },
  navMobileLink: {
    padding: '13px 6px', fontSize: '15.5px', fontWeight: 600, color: '#33413a',
    textDecoration: 'none', borderBottom: '1px solid #f0efe8',
  },
  navLoginBtnMobile: { marginTop: '12px', textAlign: 'center', width: '100%', boxSizing: 'border-box' },

  // ------------------------------------------------------------------- Hero
  hero: {
    position: 'relative',
    backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat',
    minHeight: '700px', display: 'flex', alignItems: 'center',
    padding: `${HEADER_HEIGHT + 48}px 28px 64px`,
  },
  heroMobile: { minHeight: '640px', padding: `${HEADER_HEIGHT + 24}px 20px 56px` },
  heroInner: { maxWidth: '1200px', margin: '0 auto', width: '100%' },
  heroCol: { maxWidth: '640px' },
  heroEyebrow: {
    display: 'inline-flex', alignItems: 'center', gap: '13px', fontFamily: MONO,
    fontSize: '10.5px', fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.78)',
  },
  heroEyebrowRule: { width: '30px', height: '1px', backgroundColor: 'rgba(255,255,255,0.5)', flexShrink: 0 },
  heroTitle: {
    fontFamily: SERIF, fontWeight: 500, fontSize: 'clamp(34px, 5vw, 56px)',
    lineHeight: 1.1, letterSpacing: '-0.01em', color: '#fff', margin: '22px 0 20px', textWrap: 'pretty',
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

  // ------------------------------------- Example readings panel (hero band)
  readings: {
    marginTop: '56px', padding: '22px 24px 24px',
    backgroundColor: 'rgba(10,28,16,0.52)',
    border: '1px solid rgba(255,255,255,0.28)', borderRadius: '14px',
    backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
  },
  readingsMobile: { marginTop: '40px', padding: '18px 18px 20px' },
  readingsHead: {
    display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px 14px',
    paddingBottom: '18px', marginBottom: '24px',
    borderBottom: '1px solid rgba(255,255,255,0.22)',
  },
  readingsHeadLabel: {
    fontFamily: MONO, fontSize: '11px', fontWeight: 600, letterSpacing: '0.14em',
    textTransform: 'uppercase', color: 'rgba(255,255,255,0.92)', flexShrink: 0,
  },
  readingsHeadRule: { flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.22)', minWidth: '20px' },
  readingsHeadNote: {
    fontFamily: MONO, fontSize: '10px', fontWeight: 500, letterSpacing: '0.09em',
    textTransform: 'uppercase', color: 'rgba(255,255,255,0.82)', flexShrink: 0,
    padding: '5px 10px', borderRadius: '999px',
    border: '1px solid rgba(255,255,255,0.34)', backgroundColor: 'rgba(255,255,255,0.08)',
  },
  readingsRow: { display: 'flex', flexWrap: 'wrap', gap: '28px 0' },
  readingsRowMobile: { gap: '24px 0' },
  readingCell: {
    flex: '1 1 170px', minWidth: 0, paddingLeft: '22px',
    borderLeft: '2px solid rgba(255,255,255,0.3)',
  },
  readingLabel: {
    display: 'block', fontFamily: MONO, fontSize: '10.5px', fontWeight: 600, letterSpacing: '0.14em',
    textTransform: 'uppercase', color: 'rgba(255,255,255,0.82)', marginBottom: '12px',
  },
  readingValue: {
    display: 'block', fontFamily: MONO, fontSize: 'clamp(28px, 3vw, 34px)', fontWeight: 600,
    letterSpacing: '-0.035em', lineHeight: 1,
  },
  readingUnit: { fontSize: '14px', fontWeight: 400, color: 'rgba(255,255,255,0.78)', marginLeft: '4px' },
  readingStatus: {
    display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px', fontFamily: MONO,
    fontSize: '10.5px', fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase',
  },
  readingMark: { width: '3px', height: '14px', backgroundColor: '#f0bd66', flexShrink: 0, borderRadius: '2px' },

  sectionInner: { maxWidth: '1120px', margin: '0 auto', padding: '0 28px' },
  sectionEyebrow: {
    display: 'block', fontFamily: MONO, fontSize: '10.5px', fontWeight: 500, letterSpacing: '0.16em',
    textTransform: 'uppercase', color: '#2c8047', marginBottom: '16px',
  },
  sectionTitle: {
    fontFamily: SERIF, fontWeight: 500, fontSize: 'clamp(26px, 3.2vw, 37px)',
    lineHeight: 1.2, letterSpacing: '-0.005em', color: '#14301c', margin: '0 0 22px', maxWidth: '640px',
  },
  bodyText: { fontSize: '15.5px', lineHeight: 1.72, color: '#4b5a50', marginBottom: '16px' },

  // ------------------------------------------------------------------ About
  about: { padding: '84px 0' },
  aboutGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '48px', alignItems: 'center',
  },
  videoFrame: { width: '100%' },
  videoPoster: {
    position: 'relative', width: '100%', aspectRatio: '16 / 10', borderRadius: '18px',
    border: 'none', padding: 0, cursor: 'pointer', overflow: 'hidden',
    backgroundSize: 'cover', backgroundPosition: 'center',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 24px 50px -24px rgba(15,38,22,0.45)',
  },
  videoOverlay: {
    position: 'absolute', inset: 0,
    background: 'linear-gradient(180deg, rgba(15,38,22,0.25) 0%, rgba(15,38,22,0.55) 100%)',
  },
  playBtn: {
    position: 'relative', zIndex: 2, width: '64px', height: '64px', borderRadius: '50%',
    backgroundColor: 'rgba(255,255,255,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 10px 24px -6px rgba(15,38,22,0.5)',
  },
  videoCaption: {
    position: 'absolute', zIndex: 2, bottom: '16px', left: '18px',
    fontSize: '12.5px', fontWeight: 700, color: '#fff', letterSpacing: '0.01em',
    textShadow: '0 1px 6px rgba(0,0,0,0.4)',
  },
  videoEl: {
    width: '100%', aspectRatio: '16 / 10', borderRadius: '18px', display: 'block',
    boxShadow: '0 24px 50px -24px rgba(15,38,22,0.45)', backgroundColor: '#000',
  },

  // ---------------------------------------------------------------- Features
  features: { padding: '84px 0', backgroundColor: '#f6f5ef', borderTop: '1px solid #ecebe3', borderBottom: '1px solid #ecebe3' },
  featuresHead: { maxWidth: '620px', marginBottom: '40px' },
  featuresGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(248px, 1fr))', gap: '20px' },
  featureCard: {
    borderRadius: '16px', padding: '28px', border: '1px solid rgba(255,255,255,0.08)',
  },
  featureIconWrap: {
    width: '46px', height: '46px', borderRadius: '12px', backgroundColor: 'rgba(255,255,255,0.14)', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '18px',
  },
  featureTitle: { fontSize: '17px', fontWeight: 700, color: '#fff', margin: '0 0 9px', letterSpacing: '-0.01em' },
  featureBody: {
    fontSize: '14px', lineHeight: 1.68, color: 'rgba(255,255,255,0.82)', margin: 0,
    textAlign: 'justify', textJustify: 'inter-word', hyphens: 'auto', WebkitHyphens: 'auto',
  },

  // ------------------------------------------------------------------ Contact
  contact: { padding: '88px 0', backgroundImage: 'linear-gradient(160deg, #1f5a34 0%, #14301c 100%)' },
  contactHead: { maxWidth: '620px' },

  // ------------------------------------------ Footer-style contact columns
  footerCol: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  footerColWide: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  footerColTitle: {
    fontSize: '15px', fontWeight: 700, color: '#fff', margin: '0 0 20px', letterSpacing: '-0.005em',
  },
  footerLinkList: { display: 'flex', flexDirection: 'column', gap: '13px' },
  footerLink: { fontSize: '14px', color: 'rgba(255,255,255,0.72)', textDecoration: 'none', width: 'fit-content' },
  footerText: { fontSize: '14px', lineHeight: 1.5, color: 'rgba(255,255,255,0.72)' },
  footerContactList: { display: 'flex', flexDirection: 'column', gap: '18px' },
  footerContactItem: { display: 'flex', alignItems: 'flex-start', gap: '13px', minWidth: 0 },
  footerContactIcon: {
    width: '34px', height: '34px', borderRadius: '50%', backgroundColor: '#2c8047', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  footerContactLabel: {
    fontSize: '12.5px', color: 'rgba(255,255,255,0.6)', marginBottom: '3px',
  },
  footerContactValue: { fontSize: '14px', color: '#fff', fontWeight: 600, lineHeight: 1.45, overflowWrap: 'break-word' },
  footerBottom: {
    marginTop: '48px', paddingTop: '24px', paddingBottom: '4px',
    borderTop: '1px solid rgba(255,255,255,0.16)', textAlign: 'center',
  },
  footerNote: { fontSize: '12.5px', color: 'rgba(255,255,255,0.55)' },
}