import { useNavigate, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { getUser, clearAuth } from '../utils/auth'
import { useIsMobile } from '../hooks/useIsMobile'
import agribantayLogo from '../assets/agribantay_logo.png'
import agribantayName from '../assets/agribantay_name.png'
import agriLogoName from '../assets/agri_logo_name.png'

function IconDashboard({ color }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={color}>
      <path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z" />
    </svg>
  )
}
function IconRequests({ color }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6">
      <rect x="5" y="4" width="14" height="17" rx="1.5" />
      <path d="M9 9h6M9 13h6M9 17h3" />
    </svg>
  )
}
function IconSettings({ color }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13a7.7 7.7 0 0 0 0-2l1.9-1.5-2-3.4-2.3.9a7.6 7.6 0 0 0-1.7-1l-.4-2.4h-4l-.4 2.4a7.6 7.6 0 0 0-1.7 1l-2.3-.9-2 3.4L6.6 11a7.7 7.7 0 0 0 0 2l-1.9 1.5 2 3.4 2.3-.9a7.6 7.6 0 0 0 1.7 1l.4 2.4h4l.4-2.4a7.6 7.6 0 0 0 1.7-1l2.3.9 2-3.4z" />
    </svg>
  )
}
function IconLogout({ color }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  )
}
function IconMenu({ color }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
      <path d="M3 6h18" />
      <path d="M3 12h18" />
      <path d="M3 18h18" />
    </svg>
  )
}
function IconClose({ color }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  )
}

const iconMap = {
  dashboard: IconDashboard,
  requests: IconRequests,
  settings: IconSettings,
}

export default function FarmerLayout({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const user = getUser()
  const isMobile = useIsMobile()
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleLogout = () => {
    clearAuth()
    navigate('/') // Landing page, not straight to login — lets the user browse before signing in again
  }

  const handleNavigate = (path) => {
    navigate(path)
    if (isMobile) setSidebarOpen(false)
  }

  const navItems = [
    { label: 'Dashboard', path: '/farmowner/dashboard', icon: 'dashboard' },
    { label: 'Service requests', path: '/farmowner/service-requests', icon: 'requests' },
    { label: 'Settings', path: '/farmowner/settings', icon: 'settings' },
  ]

  const sidebarStyle = isMobile
    ? {
        ...styles.sidebar,
        ...styles.sidebarMobile,
        transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
      }
    : styles.sidebar

  return (
    <div style={styles.wrapper}>
      {isMobile && sidebarOpen && (
        <div style={styles.sidebarOverlay} onClick={() => setSidebarOpen(false)} />
      )}
 <aside style={sidebarStyle}>
        <div style={styles.logo}>
          <img src={agribantayLogo} alt="AgriBantay logo" style={styles.logoImg} />
          <div style={styles.logoTextBlock}>
            <img src={agribantayName} alt="AgriBantay" style={styles.logoNameImg} />
            <div style={styles.logoSub}>San Jose, Batangas</div>
          </div>
          {isMobile && (
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              style={styles.sidebarCloseBtn}
            >
              <IconClose color="#C9DDCE" />
            </button>
          )}
        </div>

        <nav style={styles.nav}>
          {navItems.map(item => {
            const active = location.pathname === item.path
            const Icon = iconMap[item.icon]
            return (
              <div
                key={item.path}
                onClick={() => handleNavigate(item.path)}
                style={{ ...styles.navItem, ...(active ? styles.navItemActive : {}) }}
              >
                <Icon color={active ? '#1B4332' : '#7FA98C'} />
                {item.label}
              </div>
            )
          })}
        </nav>

        <div style={styles.logout} onClick={() => setShowLogoutConfirm(true)}>
          <IconLogout color="#F2B84B" />
          Log out
        </div>
      </aside>

      <main style={styles.main}>
        <div style={{ ...styles.topbar, ...(isMobile ? styles.topbarMobile : {}) }}>
          {isMobile ? (
            <>
              <img src={agriLogoName} alt="AgriBantay" style={styles.mobileTopbarLogoImg} />
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                style={styles.menuBtn}
              >
                <IconMenu color="#1B4332" />
              </button>
            </>
          ) : (
            <div>
              <div style={styles.userName}>{user.first_name} {user.last_name}</div>
              <div style={styles.userRole}>Farm Owner</div>
            </div>
          )}
        </div>
        <div style={{ ...styles.content, ...(isMobile ? styles.contentMobile : {}) }}>{children}</div>
      </main>

      {showLogoutConfirm && (
        <div style={confirmStyles.overlay} onClick={() => setShowLogoutConfirm(false)}>
          <div style={confirmStyles.modal} onClick={e => e.stopPropagation()}>
            <h3 style={confirmStyles.title}>Log out</h3>
            <p style={confirmStyles.message}>Are you sure you want to log out?</p>
            <div style={confirmStyles.actions}>
              <button onClick={() => setShowLogoutConfirm(false)} style={confirmStyles.cancelBtn}>
                Cancel
              </button>
              <button onClick={handleLogout} style={confirmStyles.confirmBtn}>
                Log out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  wrapper: { display: 'flex', minHeight: '100vh', backgroundColor: '#F0EBDD' },
  sidebar: {
    width: '240px',
    backgroundColor: '#1B4332',
    display: 'flex',
    flexDirection: 'column',
    padding: '24px 16px',
    position: 'sticky',
    top: 0,
    height: '100vh',
    overflowY: 'auto',
  },
sidebarMobile: {
    position: 'fixed',
    top: 0,
    left: 0,
    height: '100vh',
    zIndex: 60,
    boxShadow: '4px 0 24px rgba(0,0,0,0.3)',
    transition: 'transform 0.25s ease',
  },
  sidebarOverlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 55,
  },
  sidebarCloseBtn: {
    marginLeft: 'auto',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px',
  },
  logo: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px', padding: '0 8px' },
  logoImg: { width: '52px', height: '52px', objectFit: 'contain', flexShrink: 0 },
  logoTextBlock: { minWidth: 0, maxWidth: '100%' },
  logoNameImg: { maxHeight: '20px', maxWidth: '100%', width: 'auto', height: 'auto', display: 'block', objectFit: 'contain' },
  logoSub: { fontSize: '11px', color: '#9CC6A8', marginTop: '5px' },
  nav: { display: 'flex', flexDirection: 'column', gap: '3px', flex: 1 },
  navItem: {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '10px 12px', borderRadius: '8px', fontSize: '14px',
    color: '#C9DDCE', cursor: 'pointer',
  },
  navItemActive: {
    backgroundColor: '#F2B84B',
    color: '#1B4332',
    fontWeight: '600',
  },
  logout: {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '10px 12px', fontSize: '14px', color: '#F2B84B', cursor: 'pointer',
    borderTop: '0.5px solid rgba(255,255,255,0.12)', marginTop: '8px', paddingTop: '16px',
  },
  main: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 },
  topbar: {
    backgroundColor: '#F0EBDD',
    borderBottom: '1px solid #DDD5C4',
    padding: '16px 32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '12px',
  },
  topbarMobile: {
    padding: '14px 16px',
    justifyContent: 'space-between',
  },
  mobileTopbarLogoImg: {
    height: '32px',
    width: 'auto',
    objectFit: 'contain',
  },
  menuBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px',
  },
  userName: { fontSize: '14px', fontWeight: '600', color: '#111827', textAlign: 'right' },
  userRole: { fontSize: '12px', color: '#6B6B5F', textAlign: 'right' },
  content: { padding: '32px', flex: 1 },
  contentMobile: { padding: '16px' },
}

const confirmStyles = {
  overlay: {
    position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 70,
  },
  modal: { backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '360px', maxWidth: '90%' },
  title: { fontSize: '17px', fontWeight: '700', color: '#111827', marginTop: 0, marginBottom: '10px' },
  message: { fontSize: '14px', color: '#6b7280', lineHeight: '1.5', marginBottom: '20px' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '10px' },
  cancelBtn: {
    padding: '10px 18px', borderRadius: '8px', border: '1px solid #d1d5db',
    backgroundColor: 'white', fontSize: '14px', cursor: 'pointer',
  },
  confirmBtn: {
    padding: '10px 18px', borderRadius: '8px', border: 'none',
    backgroundColor: '#1B4332', color: 'white', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
  },
}