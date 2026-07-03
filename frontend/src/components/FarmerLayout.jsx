import { useNavigate, useLocation } from 'react-router-dom'
import { getUser, clearAuth } from '../utils/auth'
import logo from '../assets/agribantay_logo.png'

export default function FarmerLayout({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const user = getUser()

  const handleLogout = () => {
    clearAuth()
    navigate('/login')
  }

  const navItems = [
    { label: 'Dashboard', path: '/farmowner/dashboard' },
    { label: 'Service Requests', path: '/farmowner/service-requests' },
    { label: 'Recommendations', path: '/farmowner/recommendations' },
    { label: 'Settings', path: '/farmowner/settings' },
  ]

  return (
    <div style={styles.wrapper}>
      <aside style={styles.sidebar}>
        <div style={styles.logo}>
          <img src={logo} alt="AgriBantay" style={styles.logoIcon} />
          <div>
            <div style={styles.logoText}>AgriBantay</div>
            <div style={styles.logoSub}>San Jose, Batangas</div>
          </div>
        </div>

        <div style={styles.sectionLabel}>FARM OWNER</div>
        <nav style={styles.nav}>
          {navItems.map(item => (
            <div
              key={item.path}
              onClick={() => navigate(item.path)}
              style={{
                ...styles.navItem,
                ...(location.pathname === item.path ? styles.navItemActive : {}),
              }}
            >
              {item.label}
            </div>
          ))}
        </nav>

        <div style={styles.logout} onClick={handleLogout}>
          ⎋ Log Out
        </div>
      </aside>

      <main style={styles.main}>
        <div style={styles.topbar}>
          <div>
            <div style={styles.userName}>{user.first_name} {user.last_name}</div>
            <div style={styles.userRole}>Farm Owner</div>
          </div>
        </div>
        <div style={styles.content}>{children}</div>
      </main>
    </div>
  )
}

const styles = {
  wrapper: { display: 'flex', minHeight: '100vh', backgroundColor: '#f3f4f6' },
  sidebar: {
    width: '240px',
    backgroundColor: 'white',
    borderRight: '1px solid #e5e7eb',
    display: 'flex',
    flexDirection: 'column',
    padding: '24px 16px',
  },
  logo: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '32px', padding: '0 8px' },
  logoIcon: { width: '32px', height: '32px', objectFit: 'contain' },
  logoText: { fontSize: '16px', fontWeight: '700', color: '#1a3c1a' },
  logoSub: { fontSize: '11px', color: '#9ca3af' },
  sectionLabel: { fontSize: '11px', fontWeight: '600', color: '#9ca3af', padding: '0 12px', marginBottom: '8px', letterSpacing: '0.5px' },
  nav: { display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 },
  navItem: {
    padding: '10px 12px',
    borderRadius: '8px',
    fontSize: '14px',
    color: '#374151',
    cursor: 'pointer',
  },
  navItemActive: {
    backgroundColor: '#e8f5e9',
    color: '#2E7D32',
    fontWeight: '600',
  },
  logout: {
    padding: '10px 12px',
    fontSize: '14px',
    color: '#dc2626',
    cursor: 'pointer',
  },
  main: { flex: 1, display: 'flex', flexDirection: 'column' },
  topbar: {
    backgroundColor: 'white',
    borderBottom: '1px solid #e5e7eb',
    padding: '16px 32px',
    display: 'flex',
    justifyContent: 'flex-end',
  },
  userName: { fontSize: '14px', fontWeight: '600', color: '#111827', textAlign: 'right' },
  userRole: { fontSize: '12px', color: '#9ca3af', textAlign: 'right' },
  content: { padding: '32px', flex: 1 },
}