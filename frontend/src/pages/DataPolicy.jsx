import { useNavigate } from 'react-router-dom'
import agribantayLogo from '../assets/agribantay_logo.png'
import agribantayName from '../assets/agribantay_name.png'

const SECTIONS = [
  {
    title: 'Information We Collect',
    body: `AgriBantay may collect information necessary for the operation of the poultry
      manure monitoring and environmental service management system. This may include farm
      profile details, sensor readings, inspection records, service request information, and
      basic account details such as your name, email address, or mobile number.

      The information collected is used solely to support the operations and services of the
      Municipal Agriculture Office of San Jose, Batangas and the functions provided through
      AgriBantay.`,
  },
  {
    title: 'How We Use Your Information',
    body: `Information collected through AgriBantay is used to operate and maintain the
      system, manage user accounts, monitor farm conditions, generate alerts and reports, and
      provide relevant recommendations. Your contact information may also be used for
      account-related purposes, including login assistance, password recovery, and the
      delivery of SMS or email notifications regarding farm status, inspections, service
      requests, and other relevant system activities.`,
  },
  {
    title: 'Data Access and Sharing',
    body: `AgriBantay does not sell personal, farm, or sensor information to third parties.
      Access to information within the system is limited to authorized users based on their
      assigned roles and responsibilities. Depending on the information required to perform
      their duties, access may be provided to authorized Super Admins, Admins, Veterinarians,
      and registered Farm Owners.`,
  },
  {
    title: 'Sensor and Inspection Data',
    body: `Sensor readings, farm monitoring records, and inspection-related information
      collected through AgriBantay remain associated with the registered farm to which they
      belong. These records may be retained for the purposes of continuous monitoring,
      historical reporting, environmental compliance assessment, inspection management, and
      other functions necessary for the operation of the system and the Municipal Agriculture
      Office.`,
  },
]

export default function PrivacyPolicy() {
  const navigate = useNavigate()

  return (
    <div style={styles.page}>
      <main style={styles.main}>
        <button type="button" style={styles.backLink} onClick={() => navigate(-1)}>
          <BackIcon /> Back
        </button>

        <span style={styles.eyebrow}>Legal</span>
        <h1 style={styles.title}>Privacy Policy</h1>


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
              {s.body.split('\n\n').map((para, j, arr) => (
                <p
                  key={j}
                  style={{ ...styles.sectionBody, marginBottom: j === arr.length - 1 ? 0 : '10px' }}
                >
                  {para.trim()}
                </p>
              ))}
            </section>
          ))}
        </div>

        <div style={styles.footer}>
          <p style={styles.footerNote}>
            Questions or concerns regarding the collection, use, or handling of your
            information, please contact the Municipal Agriculture Office of San Jose,
            Batangas.
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