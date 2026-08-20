import { useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { getUser, clearAuth } from '../utils/auth'
import { useIsMobile } from '../hooks/useIsMobile'
import api from '../api/axios'
import agribantayLogo from '../assets/agribantay_logo.png'
import agribantayName from '../assets/agribantay_name.png'
import agriLogoName from '../assets/agri_logo_name.png'

function IconGrid({ color }) { return <svg width="16" height="16" viewBox="0 0 24 24" fill={color}><path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z" /></svg> }
function IconFarm({ color }) { return <svg width="16" height="16" viewBox="0 0 24 24" fill={color}><path d="M3 21V9l9-6 9 6v12h-6v-7H9v7H3z" /></svg> }
function IconInspections({ color }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6"><rect x="5" y="4" width="14" height="17" rx="1.5" /><path d="M9 9l1.7 1.7L14 7.5" /></svg>
}
function IconServiceRequests({ color }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.1-3.1a5 5 0 0 1-6.6 6.6l-6.5 6.5a2 2 0 0 1-2.8-2.8l6.5-6.5a5 5 0 0 1 6.6-6.6l-3.1 3.1z" /></svg>
}
function IconRequests({ color }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6"><rect x="5" y="4" width="14" height="17" rx="1.5" /><path d="M9 9h6M9 13h6M9 17h3" /></svg>
}
function IconVaccination({ color }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6"><path d="M18.5 8.5l-3 3M14 6l4 4M8 12l4 4M5 15l-1.5 4.5L8 18l7-7-3-3-7 7z" /></svg>
}
function IconActivity({ color }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
}
function IconReports({ color }) { return <svg width="16" height="16" viewBox="0 0 24 24" fill={color}><path d="M4 20V10h4v10H4zm7 0V4h4v16h-4zm7 0v-7h4v7h-4z" /></svg> }
function IconSettings({ color }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6"><circle cx="12" cy="12" r="3" /><path d="M19.4 13a7.7 7.7 0 0 0 0-2l1.9-1.5-2-3.4-2.3.9a7.6 7.6 0 0 0-1.7-1l-.4-2.4h-4l-.4 2.4a7.6 7.6 0 0 0-1.7 1l-2.3-.9-2 3.4L6.6 11a7.7 7.7 0 0 0 0 2l-1.9 1.5 2 3.4 2.3-.9a7.6 7.6 0 0 0 1.7 1l.4 2.4h4l.4-2.4a7.6 7.6 0 0 0 1.7-1l2.3.9 2-3.4z" /></svg>
}
function IconAccounts({ color }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6"><circle cx="8" cy="8" r="3" /><path d="M2 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17" cy="7" r="2.5" /><path d="M14.5 12.5c2.6.3 4.5 2.4 4.5 5.5" /></svg>
}
function IconOverdue({ color }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6"><path d="M12 3 2 20h20L12 3z" /><path d="M12 10v4" /><circle cx="12" cy="17" r="0.6" fill={color} stroke="none" /></svg>
}
function IconLogout({ color }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
}
function IconMenu({ color }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><path d="M3 6h18" /><path d="M3 12h18" /><path d="M3 18h18" /></svg>
}
function IconClose({ color }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg>
}

const iconMap = {
  dashboard: IconGrid, farms: IconFarm, inspections: IconInspections,
  serviceRequests: IconServiceRequests, requests: IconRequests, vaccination: IconVaccination,
  accounts: IconAccounts, activity: IconActivity, overdue: IconOverdue,
  reports: IconReports, settings: IconSettings,
}

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function groupByRecency(notifications) {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfWeek = new Date(startOfToday)
  startOfWeek.setDate(startOfWeek.getDate() - 7)

  const groups = { Today: [], 'This Week': [], Earlier: [] }

  notifications.forEach(n => {
    const created = new Date(n.created_at)
    if (created >= startOfToday) groups.Today.push(n)
    else if (created >= startOfWeek) groups['This Week'].push(n)
    else groups.Earlier.push(n)
  })

  return groups
}

function NotificationIcon({ type }) {
  const common = { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: '#2c8047', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' }
  switch (type) {
    case 'Sensor Alert':
      return <svg {...common}><path d="M12 3s6 7 6 11a6 6 0 1 1-12 0c0-4 6-11 6-11z" /></svg>
    case 'Request Update':
      return <svg {...common}><rect x="5" y="4" width="14" height="17" rx="1.5" /><path d="M9 9h6M9 13h6M9 17h3" /></svg>
    case 'Vet Assigned':
      return <svg {...common}><path d="M18.5 8.5l-3 3M14 6l4 4M8 12l4 4M5 15l-1.5 4.5L8 18l7-7-3-3-7 7z" /></svg>
    case 'Inspection Completed':
      return <svg {...common}><rect x="5" y="4" width="14" height="17" rx="1.5" /><path d="M9 9l1.7 1.7L14 7.5" /></svg>
    case 'maintenance_overdue':
      return <svg {...common}><path d="M12 3 2 20h20L12 3z" /><path d="M12 10v4" /><circle cx="12" cy="17" r="0.6" fill="#2c8047" stroke="none" /></svg>
    default:
      return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 13a7.7 7.7 0 0 0 0-2l1.9-1.5-2-3.4-2.3.9a7.6 7.6 0 0 0-1.7-1l-.4-2.4h-4l-.4 2.4a7.6 7.6 0 0 0-1.7 1l-2.3-.9-2 3.4L6.6 11a7.7 7.7 0 0 0 0 2l-1.9 1.5 2 3.4 2.3-.9a7.6 7.6 0 0 0 1.7 1l.4 2.4h4l.4-2.4a7.6 7.6 0 0 0 1.7-1l2.3.9 2-3.4z" /></svg>
  }
}

function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('Today')
  const wrapRef = useRef(null)
  const isMobile = useIsMobile()

  const fetchNotifications = async () => {
    setLoading(true)
    try {
      const res = await api.get('/notifications')
      setNotifications(res.data.data || [])
      setUnreadCount(res.data.unread_count || 0)
    } catch {
      // Silent — notification bell shouldn't visibly break the whole layout
      // if this one call fails.
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchNotifications()
  }, [])

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  // Prevent the page from scrolling behind the full-width mobile panel
  // while it's open — otherwise a background scroll can drag the sheet
  // out of sync with the topbar on some mobile browsers.
  useEffect(() => {
    if (!isMobile) return
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open, isMobile])

  const toggleOpen = () => {
    if (!open) fetchNotifications()
    setOpen(v => !v)
  }

  const handleMarkRead = async (id) => {
    try {
      await api.patch(`/notifications/${id}/read`)
      setNotifications(list => list.map(n => (n.id === id ? { ...n, is_read: true } : n)))
      setUnreadCount(c => Math.max(0, c - 1))
    } catch {
      // no-op
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await api.patch('/notifications/read-all')
      setNotifications(list => list.map(n => ({ ...n, is_read: true })))
      setUnreadCount(0)
    } catch {
      // no-op
    }
  }

  const grouped = groupByRecency(notifications)
  const tabs = ['Today', 'This Week', 'Earlier']
  const visibleItems = grouped[activeTab] || []

  return (
    <div ref={wrapRef} style={bellStyles.wrap}>
      <button type="button" onClick={toggleOpen} style={bellStyles.btn} aria-label="Notifications">
        <span
          className="material-symbols-outlined"
          style={{
            ...bellStyles.icon,
            fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24",
          }}
        >
          notifications
        </span>
        {unreadCount > 0 && (
          <span style={bellStyles.badge}>{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <>
          {/* Mobile-only backdrop — makes it obvious this is a modal panel
              and gives an easy tap-to-dismiss target, since the panel no
              longer sits directly under a thumb-reachable bell icon. */}
          {isMobile && (
            <div style={bellStyles.mobileBackdrop} onClick={() => setOpen(false)} />
          )}

          <div style={isMobile ? bellStyles.dropdownMobile : bellStyles.dropdown}>
            <div style={bellStyles.dropdownHeader}>
              <span style={bellStyles.dropdownTitle}>Notifications</span>
              <div style={bellStyles.dropdownHeaderRight}>
                {unreadCount > 0 && (
                  <span style={bellStyles.markAllBtn} onClick={handleMarkAllRead}>Mark all as read</span>
                )}
                {isMobile && (
                  <button type="button" onClick={() => setOpen(false)} style={bellStyles.mobileCloseBtn} aria-label="Close notifications">
                    <IconClose color="#6b7770" />
                  </button>
                )}
              </div>
            </div>

            <div style={bellStyles.tabsRow}>
              {tabs.map(tab => (
                <span
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{ ...bellStyles.tab, ...(activeTab === tab ? bellStyles.tabActive : {}) }}
                >
                  {tab}
                </span>
              ))}
            </div>

            <div style={{ ...bellStyles.dropdownList, ...(isMobile ? bellStyles.dropdownListMobile : {}) }}>
              {loading && <div style={bellStyles.empty}>Loading...</div>}
              {!loading && visibleItems.length === 0 && (
                <div style={bellStyles.empty}>Nothing here yet.</div>
              )}
              {!loading && visibleItems.map(n => (
                <div
                  key={n.id}
                  style={{ ...bellStyles.item, ...(n.is_read ? {} : bellStyles.itemUnread) }}
                  onClick={() => !n.is_read && handleMarkRead(n.id)}
                >
                  <span style={bellStyles.itemIconWrap}>
                    <NotificationIcon type={n.type} />
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={bellStyles.itemTitleRow}>
                      <span style={bellStyles.itemTitle}>{n.title}</span>
                      {!n.is_read && <span style={bellStyles.itemDot} />}
                    </div>
                    <div style={bellStyles.itemMessage}>{n.message}</div>
                    <div style={bellStyles.itemTime}>{timeAgo(n.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Unified sidebar/layout for every role.
 * Props:
 *   navItems             — [{ label, path, icon, section? }]  (role-specific menu)
 *   roleLabel            — string shown under the user's name
 *   logoutRedirect       — path to navigate to after logging out (default '/')
 *   hideSidebarUserInfo  — when true, hides just the avatar/name/role block
 *                           at the bottom of the sidebar (used by FarmerLayout,
 *                           since that info is redundant with the topbar).
 *                           "Log out" stays in the sidebar either way.
 */
export default function DashboardLayout({ children, navItems = [], roleLabel = '', logoutRedirect = '/', hideSidebarUserInfo = false }) {
  const navigate = useNavigate()
  const location = useLocation()
  const user = getUser()
  const isMobile = useIsMobile()
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleLogout = () => {
    clearAuth()
    navigate(logoutRedirect)
  }

  const handleNavigate = (path) => {
    navigate(path)
    if (isMobile) setSidebarOpen(false)
  }

  const sidebarStyle = isMobile
    ? { ...styles.sidebar, ...styles.sidebarMobile, transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)' }
    : styles.sidebar

  return (
    <div style={styles.wrapper}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body, .print-reset { background: #fff !important; margin: 0 !important; padding: 0 !important; }
        }
        .agb-nav-item { transition: background-color .14s ease, color .14s ease; }
        .agb-nav-item:hover { background-color: rgba(255,255,255,0.06); }
        .agb-logout:hover { background-color: rgba(230,180,85,0.12); }
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
            <button type="button" onClick={() => setSidebarOpen(false)} style={styles.sidebarCloseBtn}>
              <IconClose color="#b8ccbd" />
            </button>
          )}
        </div>

        <nav style={styles.nav}>
          {navItems.map((item, idx) => {
            const active = location.pathname === item.path
            const Icon = iconMap[item.icon]
            const showHeader = item.section && item.section !== navItems[idx - 1]?.section
            return (
              <div key={item.path}>
                {showHeader && <div style={styles.navSection}>{item.section}</div>}
                <div
                  onClick={() => handleNavigate(item.path)}
                  className="agb-nav-item"
                  style={{ ...styles.navItem, ...(active ? styles.navItemActive : {}) }}
                >
                  {Icon && <Icon color={active ? '#14301c' : '#8fae98'} />}
                  {item.label}
                </div>
              </div>
            )
          })}
        </nav>

        <div style={styles.sidebarFooter}>
          {!hideSidebarUserInfo && (
            <div style={styles.userMini}>
              <span style={styles.userAvatar}>
                {(user.first_name?.[0] || '') + (user.last_name?.[0] || '')}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={styles.userMiniName}>{user.first_name} {user.last_name}</div>
                <div style={styles.userMiniRole}>{roleLabel}</div>
              </div>
            </div>
          )}
          <div style={styles.logout} className="agb-logout" onClick={() => setShowLogoutConfirm(true)}>
            <IconLogout color="#e6b455" />
            Log out
          </div>
        </div>
      </aside>

      <main style={{ ...styles.main, ...(isMobile ? styles.mainMobile : {}) }} className="print-reset">
        <div style={{ ...styles.topbar, ...(isMobile ? styles.topbarMobile : {}) }} className="no-print">
          {isMobile ? (
            <>
              <img src={agriLogoName} alt="AgriBantay" style={styles.mobileTopbarLogoImg} />
              <div style={styles.mobileTopbarRight}>
                <NotificationBell />
                <button type="button" onClick={() => setSidebarOpen(true)} style={styles.menuBtn}>
                  <IconMenu color="#14301c" />
                </button>
              </div>
            </>
          ) : (
            <>
              <NotificationBell />
              <div>
                <div style={styles.userName}>{user.first_name} {user.last_name}</div>
                <div style={styles.userRole}>{roleLabel}</div>
              </div>
            </>
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
              <button onClick={() => setShowLogoutConfirm(false)} style={confirmStyles.cancelBtn}>Cancel</button>
              <button onClick={handleLogout} style={confirmStyles.confirmBtn}>Log out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const SANS = "'Public Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

const styles = {
  wrapper: { display: 'flex', minHeight: '100vh', backgroundColor: '#f3f4ef', fontFamily: SANS },

  sidebar: {
    width: '250px', backgroundColor: '#14301c', display: 'flex', flexDirection: 'column',
    padding: '20px 14px', position: 'fixed', top: 0, left: 0, height: '100vh', overflowY: 'auto', zIndex: 20,
  },
  sidebarMobile: { boxShadow: '4px 0 24px rgba(0,0,0,0.3)', transition: 'transform 0.25s ease', zIndex: 100 },
  sidebarOverlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 90 },
  sidebarCloseBtn: { marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px' },

  logo: { display: 'flex', alignItems: 'center', gap: '11px', marginBottom: '10px', padding: '4px 8px 0' },
  logoImg: { width: '44px', height: '44px', objectFit: 'contain', flexShrink: 0 },
  logoTextBlock: { minWidth: 0, maxWidth: '100%' },
  logoNameImg: { maxHeight: '19px', maxWidth: '100%', width: 'auto', height: 'auto', display: 'block', objectFit: 'contain' },
  logoSub: { fontSize: '11px', color: '#7d9585', marginTop: '5px' },

  nav: { display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, marginTop: '18px', overflowY: 'auto' },
  navSection: { fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#5f7867', padding: '0 12px', margin: '14px 0 7px' },
  navItem: { display: 'flex', alignItems: 'center', gap: '11px', padding: '10px 12px', borderRadius: '9px', fontSize: '13.5px', color: '#b8ccbd', cursor: 'pointer' },
  navItemActive: { backgroundColor: '#7cc795', color: '#14301c', fontWeight: 600 },

  sidebarFooter: { borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '12px', marginTop: '10px' },
  userMini: { display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 8px 12px' },
  userAvatar: { width: '34px', height: '34px', borderRadius: '50%', background: '#2c8047', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, color: '#fff', flexShrink: 0, textTransform: 'uppercase' },
  userMiniName: { fontSize: '13px', fontWeight: 700, color: '#eef4ef', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  userMiniRole: { fontSize: '11px', color: '#7d9585' },
  logout: { display: 'flex', alignItems: 'center', gap: '11px', padding: '10px 12px', borderRadius: '9px', fontSize: '13.5px', fontWeight: 600, color: '#e6b455', cursor: 'pointer' },

  main: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, marginLeft: '250px' },
  mainMobile: { marginLeft: 0 },

  topbar: { backgroundColor: '#ffffff', borderBottom: '1px solid #e7e8e0', padding: '15px 32px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '16px' },
  topbarMobile: { padding: '13px 16px', justifyContent: 'space-between' },
  mobileTopbarLogoImg: { height: '38px', width: 'auto', objectFit: 'contain' },
  mobileTopbarRight: { display: 'flex', alignItems: 'center', gap: '10px' },
  menuBtn: { background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px' },
  userName: { fontSize: '14px', fontWeight: 700, color: '#16311d', textAlign: 'right' },
  userRole: { fontSize: '12px', color: '#6b7770', textAlign: 'right' },
  content: { padding: '30px 32px', flex: 1 },
  contentMobile: { padding: '16px' },
}

const bellStyles = {
  wrap: { position: 'relative' },
  btn: {
    background: 'none', border: 'none', cursor: 'pointer', padding: '6px',
    display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
  },
  icon: { fontSize: '24px', color: '#2c8047' },
  badge: {
    position: 'absolute', top: '2px', right: '2px', minWidth: '16px', height: '16px',
    borderRadius: '999px', backgroundColor: '#dc2626', color: '#fff', fontSize: '9.5px',
    fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '0 3px', fontFamily: SANS, lineHeight: 1,
  },

  // Desktop: small anchored popover near the bell, unchanged from before.
  dropdown: {
    position: 'absolute', top: 'calc(100% + 10px)', right: 0, width: '360px', maxWidth: '90vw',
    backgroundColor: '#fff', border: '1px solid #e7e8e0', borderRadius: '14px',
    boxShadow: '0 12px 32px rgba(20,48,28,0.16)', zIndex: 300, overflow: 'hidden',
  },

  // Mobile: a fixed, viewport-anchored panel instead of being positioned
  // relative to the bell — the bell sits left of the hamburger button, not
  // at the screen edge, so anchoring to the bell's own wrapper caused the
  // panel to be off-position. Fixed positioning with left/right insets
  // keeps it centered and fully on-screen regardless of where the bell
  // icon happens to sit in the topbar.
  mobileBackdrop: {
    position: 'fixed', inset: 0, backgroundColor: 'rgba(15,38,22,0.35)', zIndex: 290,
  },
  dropdownMobile: {
    position: 'fixed', top: '64px', left: '10px', right: '10px', width: 'auto', maxWidth: 'none',
    backgroundColor: '#fff', border: '1px solid #e7e8e0', borderRadius: '14px',
    boxShadow: '0 16px 40px rgba(20,48,28,0.28)', zIndex: 300, overflow: 'hidden',
    maxHeight: 'calc(100vh - 84px)', display: 'flex', flexDirection: 'column',
  },

  dropdownHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 16px 10px', flexShrink: 0,
  },
  dropdownHeaderRight: { display: 'flex', alignItems: 'center', gap: '10px' },
  dropdownTitle: { fontSize: '14px', fontWeight: 800, color: '#16311d', fontFamily: SANS },
  markAllBtn: { fontSize: '11.5px', fontWeight: 700, color: '#2c8047', cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap' },
  mobileCloseBtn: {
    background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },

  tabsRow: { display: 'flex', gap: '4px', padding: '0 12px 12px', borderBottom: '1px solid #eceee7', flexShrink: 0, overflowX: 'auto' },
  tab: {
    fontSize: '12px', fontWeight: 700, color: '#9aa79d', cursor: 'pointer',
    padding: '6px 10px', borderRadius: '999px', fontFamily: SANS, whiteSpace: 'nowrap',
  },
  tabActive: { color: '#14301c', backgroundColor: '#eaf3ec' },

  dropdownList: { maxHeight: '360px', overflowY: 'auto' },
  dropdownListMobile: { maxHeight: 'none', flex: 1 },
  empty: { padding: '28px 16px', textAlign: 'center', fontSize: '12.5px', color: '#9aa79d', fontFamily: SANS },
  item: {
    display: 'flex', gap: '11px', padding: '13px 16px', borderBottom: '1px solid #f2f3ed',
    cursor: 'pointer', alignItems: 'flex-start',
  },
  itemUnread: { backgroundColor: '#f4faf6' },
  itemIconWrap: {
    width: '30px', height: '30px', borderRadius: '9px', backgroundColor: '#eaf3ec',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px',
  },
  itemTitleRow: { display: 'flex', alignItems: 'center', gap: '6px' },
  itemDot: { width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#2c8047', flexShrink: 0 },
  itemTitle: { fontSize: '12.5px', fontWeight: 700, color: '#16311d', fontFamily: SANS },
  itemMessage: { fontSize: '11.5px', color: '#4b5a50', marginTop: '3px', lineHeight: 1.4, fontFamily: SANS },
  itemTime: { fontSize: '10.5px', color: '#9aa79d', marginTop: '5px', fontFamily: SANS },
}

const confirmStyles = {
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(15,38,22,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  modal: { backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '360px', maxWidth: '90%', fontFamily: SANS },
  title: { fontSize: '18px', fontWeight: 800, color: '#16311d', marginTop: 0, marginBottom: '10px' },
  message: { fontSize: '14px', color: '#647065', lineHeight: '1.5', marginBottom: '20px' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '10px' },
  cancelBtn: { padding: '10px 18px', borderRadius: '10px', border: '1px solid #d9dcd4', backgroundColor: 'white', fontSize: '14px', fontWeight: 600, color: '#33413a', cursor: 'pointer' },
  confirmBtn: { padding: '10px 18px', borderRadius: '10px', border: 'none', backgroundColor: '#2c8047', color: 'white', fontSize: '14px', fontWeight: 700, cursor: 'pointer' },
}