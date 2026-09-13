import { useNavigate } from 'react-router-dom'
import agribantayLogo from '../assets/agribantay_logo.png'
import agribantayName from '../assets/agribantay_name.png'

const SECTIONS = [
  {
    title: 'Purpose of AgriBantay',
    body: `AgriBantay is a poultry manure monitoring and environmental service management system
      developed for use by the Municipal Agriculture Office of San Jose, Batangas, and its
      registered farm owners, veterinarians, and administrators. The system exists to support
      farm condition monitoring, environmental compliance, and coordination between farm
      owners, the local government office, and veterinary services.`,
  },
  {
    title: 'Acceptable Use',
    body: `By using AgriBantay, you agree to use the system only for its intended purpose —
      monitoring farm conditions, submitting or managing service requests, and coordinating
      environmental compliance. Sensor data, service records, and account information are
      provided to support these functions and should not be misrepresented or tampered with.`,
  },
  {
    title: 'User Accounts and Roles',
    body: `Accounts are issued per user role (Super Admin, Admin, Farm Owner, or Veterinarian)
      and must not be shared. Each role is granted access appropriate to its function within
      the system — a Super Admin manages all reports and settings, an Admin handles farm
      registration and inspections, a Veterinarian coordinates health-related requests, and a
      Farm Owner manages their own farm's records and requests.`,
  },
  {
    title: 'Account Responsibility',
    body: `You are responsible for keeping your login credentials confidential. If you believe
      your account has been accessed without authorization, contact the Municipal Agriculture
      Office of San Jose, Batangas immediately so access can be reviewed.`,
  },
]

export default function TermsOfService() {
  const navigate = useNavigate()

  return (
    <div style={styles.page}>
      <main style={styles.main}>
        <button type="button" style={styles.backLink} onClick={() => navigate(-1)}>
          <BackIcon /> Back
        </button>

        <span style={styles.eyebrow}>Legal</span>
        <h1 style={styles.title}>Terms of Service</h1>


        <div style={styles.sections}>
          {SECTIONS.map((s, i) => (
            <section
              key={s.title}
              style={{
                ...styles.section,
                borderTop: i === 0 ? 'none' : '1px solid #ececec',
                paddingTop: i === 0 ? 0 : '28px',
              }}
            >
              <h2 style={styles.sectionTitle}>{s.title}</h2>
              <p style={styles.sectionBody}>{s.body}</p>
            </section>
          ))}
        </div>

        <div style={styles.footer}>
          <p style={styles.footerNote}>
            Questions or concerns regarding these Terms of Service, please contact the
            Municipal Agriculture Office of San Jose, Batangas.
          </p>
          <div style={styles.footerBar}>
            <span style={styles.footerCopy}>© 2026 AgriBantay. All rights reserved.</span>
            <span style={styles.footerLinks}>
              <span
                role="link"
                tabIndex={0}
                onClick={() => navigate('/privacy-policy')}
                style={styles.footerLink}
              >
                Privacy Policy
              </span>
              <span style={styles.footerDot}>|</span>
              <span
                role="link"
                tabIndex={0}
                onClick={() => navigate('/terms-of-service')}
                style={styles.footerLink}
              >
                Terms of Service
              </span>
            </span>
          </div>
        </div>
      </main>
    </div>
  )
}

function BackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
    </svg>
  )
}

const SANS = "'Public Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

const styles = {
  page: { fontFamily: SANS, backgroundColor: '#fff', minHeight: '100vh' },
  main: { maxWidth: '720px', margin: '0 auto', padding: '48px 24px 72px' },

  backLink: {
    display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none',
    color: '#5b6b62', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: SANS,
    padding: 0, marginBottom: '28px',
  },

  eyebrow: {
    display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: '#8a968d', marginBottom: '10px',
  },
  title: { fontSize: 'clamp(26px, 4vw, 34px)', fontWeight: 800, color: '#16311d', margin: '0 0 6px', letterSpacing: '-0.01em' },
  updated: { fontSize: '13px', color: '#9aa79d', margin: '0 0 28px' },

  intro: {
    fontSize: '14.5px', lineHeight: 1.7, color: '#525f56', padding: '16px 20px',
    backgroundColor: '#f4f4ef', borderRadius: '10px', marginBottom: '40px',
  },

  sections: { display: 'flex', flexDirection: 'column', gap: '28px' },
  section: {},
  sectionTitle: { fontSize: '16.5px', fontWeight: 700, color: '#16311d', margin: '0 0 8px', letterSpacing: '-0.005em' },
  sectionBody: { fontSize: '14.5px', lineHeight: 1.75, color: '#525f56', margin: 0 },

  footer: { marginTop: '48px', paddingTop: '24px', borderTop: '1px solid #ececec' },
  footerNote: { fontSize: '13px', color: '#8a968d', lineHeight: 1.6, margin: '0 0 20px' },
  footerBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' },
  footerCopy: { fontSize: '12.5px', color: '#9aa79d' },
  footerLinks: { display: 'flex', alignItems: 'center', gap: '8px' },
  footerLink: { fontSize: '12.5px', color: '#5b6b62', textDecoration: 'none', fontWeight: 600, cursor: 'pointer' },
  footerDot: { fontSize: '12.5px', color: '#c9cfc7' },
}