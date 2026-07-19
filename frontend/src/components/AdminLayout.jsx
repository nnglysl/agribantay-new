import { useNavigate, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { getUser, clearAuth } from '../utils/auth'
import { useIsMobile } from '../hooks/useIsMobile'
import agribantayLogo from '../assets/agribantay_logo.png'
import agribantayName from '../assets/agribantay_name.png'
import agriLogoName from '../assets/agri_logo_name.png'

const iconPaths = {
  dashboard: <path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z" />,
  farms: <path d="M3 21V9l9-6 9 6v12h-6v-7H9v7H3z" />,
  reports: <path d="M4 20V10h4v10H4zm7 0V4h4v16h-4zm7 0v-7h4v7h-4z" />,
}

function IconGrid({ color }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill={color}>{iconPaths.dashboard}</svg>
}
function IconFarm({ color }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill={color}>{iconPaths.farms}</svg>
}
function IconInspections({ color }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6">
      <rect x="5" y="4" width="14" height="17" rx="1.5" />
      <path d="M9 9l1.7 1.7L14 7.5" />
    </svg>
  )
}
function IconServiceRequests({ color }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.1-3.1a5 5 0 0 1-6.6 6.6l-6.5 6.5a2 2 0 0 1-2.8-2.8l6.5-6.5a5 5 0 0 1 6.6-6.6l-3.1 3.1z" />
    </svg>
  )
}
function IconActivity({ color }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  )
}
function IconReports({ color }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill={color}>{iconPaths.reports}</svg>
}
function IconSettings({ color }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13a7.7 7.7 0 0 0 0-2l1.9-1.5-2-3.4-2.3.9a7.6 7.6 0 0 0-1.7-1l-.4-2.4h-4l-.4 2.4a7.6 7.6 0 0 0-1.7 1l-2.3-.9-2 3.4L6.6 11a7.7 7.7 0 0 0 0 2l-1.9 1.5 2 3.4 2.3-.9a7.6 7.6 0 0 0 1.7 1l.4 2.4h4l.4-2.4a7.6 7.6 0 0 0 1.7-1l2.3.9 2-3.4z" />
    </svg>
  )
}
function IconVet({ color }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6">
      <circle cx="9" cy="8" r="3" />
      <path d="M4 20c0-3.3 2.5-6 5-6s5 2.7 5 6" />
      <path d="M17 4v6" />
      <path d="M14 7h6" />
    </svg>
  )
}
function IconAccounts({ color }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6">
      <circle cx="8" cy="8" r="3" />
      <path d="M2 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="7" r="2.5" />
      <path d="M14.5 12.5c2.6.3 4.5 2.4 4.5 5.5" />
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
  dashboard: IconGrid,
  farms: IconFarm,
  inspections: IconInspections,
  serviceRequests: IconServiceRequests,
  accounts: IconAccounts,
  activity: IconActivity,
  reports: IconReports,
  settings: IconSettings,
}

export default function AdminLayout({ children }) {
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
    { label: 'Dashboard', path: '/admin/dashboard', icon: 'dashboard' },
    { label: 'Farms', path: '/admin/farms', icon: 'farms' },
    { label: 'Inspections', path: '/admin/inspections', icon: 'inspections' },
    { label: 'Service Requests', path: '/admin/service-requests', icon: 'serviceRequests' },
    { label: 'Reports', path: user.role === 'super_admin' ? '/superadmin/reports' : '/admin/reports', icon: 'reports' },
    { label: 'Settings', path: '/admin/settings', icon: 'settings' },
  ]

  // Super Admin sees everything above (they pass the same role="admin"
  // route checks), plus this one exclusive item — no separate layout
  // needed just for one extra page.
  if (user.role === 'super_admin') {
    navItems.splice(1, 0, { label: 'Manage Accounts', path: '/superadmin/accounts', icon: 'accounts' })
    navItems.splice(2, 0, { label: 'Activity logs', path: '/superadmin/activity-logs', icon: 'activity' })
  }

  const sidebarStyle = isMobile
    ? {
        ...styles.sidebar,
        ...styles.sidebarMobile,
        transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
      }
    : styles.sidebar

  return (
    <div style={styles.wrapper}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body, .print-reset {
            background: #fff !important;
            margin: 0 !important;
            padding: 0 !important;
          }
        }
      `}</style>

      {isMobile && sidebarOpen && (
        <div style={styles.sidebarOverlay} className="no-print" onClick={() => setSidebarOpen(false)} />
      )}

      <aside style={sidebarStyle} className="no-print">
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

      <main style={{ ...styles.main, ...(isMobile ? styles.mainMobile : {}) }} className="print-reset">
        <div style={{ ...styles.topbar, ...(isMobile ? styles.topbarMobile : {}) }} className="no-print">
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
              <div style={styles.userRole}>{user.role === 'super_admin' ? 'Super Administrator' : 'Administrator'}</div>
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

  // Desktop sidebar: `position: fixed` instead of `sticky` — sticky combined
  // with height:100vh + overflowY:auto is fragile (it can fail to stay
  // pinned as the page grows taller, e.g. from a tall map), which was
  // pushing the Logout button out of view. `fixed` always stays pinned to
  // the viewport regardless of page height, guaranteeing Logout is always
  // reachable. Since fixed elements are removed from normal flow, `main`
  // below is given a matching marginLeft to make room for it.
  sidebar: {
    width: '240px',
    backgroundColor: '#1B4332',
    display: 'flex',
    flexDirection: 'column',
    padding: '24px 16px',
    position: 'fixed',
    top: 0,
    left: 0,
    height: '100vh',
    overflowY: 'auto',
    zIndex: 20,
  },
  sidebarMobile: {
    boxShadow: '4px 0 24px rgba(0,0,0,0.3)',
    transition: 'transform 0.25s ease',
    zIndex: 100,
  },
  sidebarOverlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 90,
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
  logoImg: { width: '64px', height: '64px', objectFit: 'contain', flexShrink: 0 },
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

  // `main` now needs to account for the sidebar being fixed (out of flow).
  // Desktop: marginLeft equal to the sidebar's width. Mobile: 0, since the
  // mobile sidebar is an off-canvas drawer that overlays rather than pushes.
  main: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, marginLeft: '240px' },
  mainMobile: { marginLeft: 0 },

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
    height: '38px',
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
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
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