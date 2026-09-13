import { useState } from 'react'
import { createPortal } from 'react-dom'

const SANS = "'Public Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

const SECTIONS = [
  // =========================
  // TERMS OF SERVICE
  // =========================
  {
    group: 'Terms of Service',
    title: 'Purpose of AgriBantay',
    body: `AgriBantay is a poultry manure monitoring and environmental service management system developed to support the operations of the Municipal Agriculture Office of San Jose, Batangas. The system is intended to assist in monitoring farm conditions, supporting environmental compliance, managing related services, and facilitating coordination between the Municipal Agriculture Office and registered poultry farms.`,
  },
  {
    group: 'Terms of Service',
    title: 'Acceptable Use',
    body: `By using AgriBantay, you agree to use the system only for its intended purpose, including monitoring farm conditions, submitting or managing service requests, and coordinating environmental compliance. Sensor data, service records, and account information are provided to support these functions and should not be misrepresented or tampered with.`,
  },
  {
    group: 'Terms of Service',
    title: 'User Accounts and Roles',
    body: `Accounts are issued to authorized users and must not be shared. Users are responsible for maintaining the confidentiality of their login credentials and for using the system only according to their assigned access and responsibilities.`,
  },
  {
    group: 'Terms of Service',
    title: 'Account Security and Responsibility',
    body: `You are responsible for keeping your login credentials confidential. If you believe your account has been accessed without authorization, contact the Municipal Agriculture Office of San Jose, Batangas immediately so access can be reviewed.`,
  },

  // =========================
  // PRIVACY POLICY
  // =========================
  {
    group: 'Privacy Policy',
    title: 'Information We Collect',
    body: `AgriBantay may collect information necessary for the operation and delivery of its services. This may include farm profile details, sensor readings, inspection records, service request information, and basic account information such as your name, email address, or mobile number. The information collected is used to support the operations of the Municipal Agriculture Office of San Jose, Batangas and the services provided through AgriBantay.`,
  },
  {
    group: 'Privacy Policy',
    title: 'How We Use Your Information',
    body: `Information collected through AgriBantay is used to operate and maintain the system, manage user accounts, monitor farm conditions, generate alerts and reports, and provide relevant recommendations. Contact information may be used for account-related purposes, including login assistance, password recovery, and sending SMS or email notifications related to farm status, inspections, service requests, and other system-related activities.`,
  },
  {
    group: 'Privacy Policy',
    title: 'Data Access and Sharing',
    body: `AgriBantay does not sell personal, farm, or sensor information to third parties. Access to information within the system is limited to authorized users based on their assigned roles and responsibilities. Information is accessed only when necessary to perform authorized functions within the system.`,
  },
  {
    group: 'Privacy Policy',
    title: 'Sensor and Inspection Data',
    body: `Sensor readings, farm monitoring records, and inspection-related information collected through AgriBantay remain associated with the registered farm from which they were collected. These records may be retained for continuous monitoring, historical reporting, environmental compliance assessment, inspection management, and other functions necessary for the operation of the system and the Municipal Agriculture Office.`,
  },
]

const TABS = ['Terms of Service', 'Privacy Policy']

export default function LegalAcknowledgmentModal({ onAgree, onCancel, loading }) {
  const [checked, setChecked] = useState(false)
  const [activeTab, setActiveTab] = useState(TABS[0])

  const sections = SECTIONS.filter(s => s.group === activeTab)

  const modal = (
    <div style={styles.overlay}>
      <div style={styles.card} role="dialog" aria-modal="true" aria-labelledby="legal-modal-title">
        <div style={styles.header}>
          <h2 id="legal-modal-title" style={styles.title}>Terms and Conditions</h2>
          <p style={styles.intro}>
            Please review the terms below before continuing. You must agree to proceed to your
            dashboard.
          </p>
        </div>

        <div style={styles.tabs}>
          {TABS.map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              style={{
                ...styles.tab,
                ...(activeTab === tab ? styles.tabActive : {}),
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        <div style={styles.docArea}>
          {sections.map((s, i) => (
            <div
              key={s.title}
              style={{
                ...styles.docSection,
                borderTop: i === 0 ? 'none' : '1px solid #e5e5e5',
                paddingTop: i === 0 ? 0 : '18px',
              }}
            >
              <h3 style={styles.docSectionTitle}>{s.title}</h3>
              <p style={styles.docSectionBody}>{s.body}</p>
            </div>
          ))}
        </div>

        <div style={styles.footer}>
          <button
            type="button"
            style={styles.checkRow}
            onClick={() => setChecked(v => !v)}
            disabled={loading}
          >
            <span
              style={{
                ...styles.checkbox,
                background: checked ? '#1f5a34' : '#fff',
                borderColor: checked ? '#1f5a34' : '#c4cabd',
              }}
            >
              {checked && <CheckIcon />}
            </span>
            <span style={styles.checkLabel}>
              I have read and agree to the Terms of Service and acknowledge the Privacy Policy.
            </span>
          </button>

          <div style={styles.btnRow}>
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              style={styles.cancelBtn}
            >
              Decline
            </button>
            <button
              type="button"
              disabled={!checked || loading}
              onClick={onAgree}
              style={{
                ...styles.primaryBtn,
                ...(checked && !loading ? styles.primaryBtnActive : {}),
                cursor: !checked || loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? (
                <span style={styles.loadingRow}>
                  <Spinner /> Please wait...
                </span>
              ) : 'Agree and Continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}

function CheckIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
}
function Spinner() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" style={{ animation: 'agb-legal-spin 0.7s linear infinite' }}>
      <style>{`@keyframes agb-legal-spin { to { transform: rotate(360deg); } }`}</style>
      <circle cx="12" cy="12" r="9" fill="none" stroke="rgba(31,90,52,0.25)" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="#1f5a34" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, backgroundColor: 'rgba(22, 49, 29, 0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '20px', zIndex: 9999, fontFamily: SANS,
  },
  card: {
    width: '100%', maxWidth: '640px', maxHeight: '85vh', backgroundColor: '#fff',
    borderRadius: 0, boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },

  header: { padding: '24px 28px 18px', borderBottom: '1px solid #e5e5e5' },
  title: { fontSize: '18px', fontWeight: 800, color: '#16311d', margin: '0 0 6px', letterSpacing: '-0.01em' },
  intro: { fontSize: '13px', lineHeight: 1.6, color: '#6b7a70', margin: 0 },

  tabs: { display: 'flex', gap: '22px', padding: '14px 28px', borderBottom: '1px solid #e5e5e5' },
  tab: {
    background: 'none', border: 'none', padding: '0 0 4px', fontSize: '13.5px', fontWeight: 600,
    color: '#8a968d', cursor: 'pointer', fontFamily: SANS,
    textDecoration: 'none', borderBottom: '1px solid transparent',
  },
  tabActive: { color: '#1f5a34', textDecoration: 'underline', textUnderlineOffset: '4px', borderBottomColor: 'transparent' },

  docArea: {
    flex: 1, overflowY: 'auto', padding: '20px 28px', minHeight: '220px',
  },
  docSection: {},
  docSectionTitle: { fontSize: '14.5px', fontWeight: 700, color: '#16311d', margin: '0 0 6px' },
  docSectionBody: { fontSize: '13.5px', lineHeight: 1.7, color: '#525f56', margin: '0 0 18px', textAlign: 'justify' },

  footer: { padding: '18px 28px 24px', borderTop: '1px solid #e5e5e5' },
  checkRow: {
    display: 'flex', alignItems: 'flex-start', gap: '10px', background: 'none', border: 'none',
    padding: 0, cursor: 'pointer', marginBottom: '18px', textAlign: 'left', width: '100%',
  },
  checkbox: {
    flexShrink: 0, width: '18px', height: '18px', borderRadius: 0, border: '1.5px solid #c4cabd',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background-color .15s ease, border-color .15s ease', marginTop: '1px',
  },
  checkLabel: { fontSize: '13px', lineHeight: 1.55, color: '#33413a' },

  btnRow: { display: 'flex', gap: '10px' },
  cancelBtn: {
    flex: '0 0 auto', padding: '11px 18px', borderRadius: 0, border: '1.5px solid #c4cabd',
    backgroundColor: '#fff', color: '#525f56', fontSize: '13.5px', fontWeight: 600,
    cursor: 'pointer', fontFamily: SANS,
  },
  primaryBtn: {
    flex: 1, padding: '11px', borderRadius: 0, border: '1.5px solid #c4cabd',
    backgroundColor: '#fff', color: '#a3ada6', fontSize: '13.5px', fontWeight: 700,
    fontFamily: SANS, transition: 'border-color .15s ease, color .15s ease',
  },
  primaryBtnActive: {
    borderColor: '#1f5a34', color: '#1f5a34',
  },
  loadingRow: { display: 'inline-flex', alignItems: 'center', gap: '9px', justifyContent: 'center' },
}