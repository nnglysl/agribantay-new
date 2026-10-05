import { useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { getUser, clearAuth } from '../utils/auth'
import { DISPLAY_TIME_ZONE } from '../utils/formatDate'
import { NOTIFICATION_CATEGORIES, notificationCategory, notificationDestination } from '../utils/notifications'
import { useIsMobile, LAYOUT_BREAKPOINT } from '../hooks/useIsMobile'
import api from '../api/axios'
import agribantayLogo from '../assets/agribantay_logo.png'
import agribantayName from '../assets/agribantay_name.png'
import agriLogoName from '../assets/agri_logo_name.png'
import { SectionLoader } from '../components/Loading'

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
function IconDevices({ color }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round"><rect x="7" y="3" width="10" height="14" rx="2" /><path d="M12 17v4" /><path d="M8 21h8" /><path d="M10.5 7.5h3" /></svg>
}
const iconMap = {
  dashboard: IconGrid, farms: IconFarm, inspections: IconInspections,
  serviceRequests: IconServiceRequests, requests: IconRequests, vaccination: IconVaccination,
  accounts: IconAccounts, activity: IconActivity, overdue: IconOverdue,
  reports: IconReports, settings: IconSettings, devices: IconDevices,
}

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  // Past a week the relative wording stops helping and a date is shown —
  // in Manila time, so it names the same day the rest of the system does.
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: DISPLAY_TIME_ZONE })
}

// How many the bell shows before "See More", and how many each press adds.
const NOTIFICATION_PAGE_SIZE = 10

/**
 * Splits a list into Today / This Week / This Month / Earlier, keeping each
 * group newest-first.
 *
 * These are dividers, not filters — nothing here is clickable and no row is
 * ever hidden by its group. The boundaries are calendar boundaries in Manila
 * (the timezone the whole system displays in), not "24 hours ago": something
 * sent at 11pm last night belongs under THIS WEEK this morning, which is how
 * a reader thinks about it.
 *
 * Sorting uses the raw timestamp, never the "3m ago" label.
 */
function groupNotificationsByDate(items) {
  const dayKey = value =>
    new Date(value).toLocaleDateString('en-CA', { timeZone: DISPLAY_TIME_ZONE })

  const now = new Date()
  const todayKey = dayKey(now)

  // Start of the current week (Monday) and of the current month, as Manila
  // calendar days, compared as plain YYYY-MM-DD strings so no timezone maths
  // has to be repeated per row.
  const manilaNow = new Date(now.toLocaleString('en-US', { timeZone: DISPLAY_TIME_ZONE }))
  const weekStart = new Date(manilaNow)
  weekStart.setDate(manilaNow.getDate() - ((manilaNow.getDay() + 6) % 7))
  const weekStartKey = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`
  const monthStartKey = `${manilaNow.getFullYear()}-${String(manilaNow.getMonth() + 1).padStart(2, '0')}-01`

  const buckets = { today: [], week: [], month: [], earlier: [] }

  for (const n of items) {
    const key = dayKey(n.created_at)
    if (Number.isNaN(new Date(n.created_at).getTime())) buckets.earlier.push(n)
    else if (key === todayKey) buckets.today.push(n)
    else if (key >= weekStartKey) buckets.week.push(n)
    else if (key >= monthStartKey) buckets.month.push(n)
    else buckets.earlier.push(n)
  }

  const byNewest = (a, b) => new Date(b.created_at) - new Date(a.created_at)

  return [
    { key: 'today', label: 'TODAY', items: buckets.today.sort(byNewest) },
    { key: 'week', label: 'THIS WEEK', items: buckets.week.sort(byNewest) },
    { key: 'month', label: 'THIS MONTH', items: buckets.month.sort(byNewest) },
    { key: 'earlier', label: 'EARLIER', items: buckets.earlier.sort(byNewest) },
  ].filter(group => group.items.length > 0)
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
    case 'Inspection Scheduled':
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
  const [activeTab, setActiveTab] = useState('all')
  // "See More" asks the server for a LONGER list rather than for the next
  // page. The rows already on screen come back in the same order with the
  // same read state, so nothing can appear twice and nothing jumps.
  const [limit, setLimit] = useState(NOTIFICATION_PAGE_SIZE)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const wrapRef = useRef(null)
  const isMobile = useIsMobile(LAYOUT_BREAKPOINT)
  const navigate = useNavigate()

  // One request at a time: mount + poll + bell-open can overlap (and
  // StrictMode double-mounts effects in dev), so overlapping calls share
  // the in-flight request instead of firing again. Keyed by the size being
  // asked for, so a "See More" is never answered by a shorter list that was
  // already on its way.
  const inflightRef = useRef(null)
  const inflightSizeRef = useRef(null)
  const fetchNotifications = async ({ silent = false, size } = {}) => {
    const wanted = size ?? limit
    if (!silent) setLoading(true)
    try {
      if (!inflightRef.current || inflightSizeRef.current !== wanted) {
        inflightSizeRef.current = wanted
        inflightRef.current = api.get('/notifications', { params: { limit: wanted } })
          .finally(() => { inflightRef.current = null })
      }
      const res = await inflightRef.current
      setNotifications(res.data.data || [])
      setUnreadCount(res.data.unread_count || 0)
      setHasMore(Boolean(res.data.has_more))
    } catch {
      // Silent — notification bell shouldn't visibly break the whole layout
      // if this one call fails.
    } finally {
      setLoading(false)
    }
  }

  const handleSeeMore = async () => {
    const next = limit + NOTIFICATION_PAGE_SIZE
    setLoadingMore(true)
    setLimit(next)
    try {
      await fetchNotifications({ silent: true, size: next })
    } finally {
      setLoadingMore(false)
    }
  }

  // Initial load, then a quiet 60s background refresh (paused while the tab
  // is hidden) so new notifications and the unread badge appear without a
  // page reload. fetchNotifications() only swaps the list in place.
  useEffect(() => {
    fetchNotifications()
    const tick = () => { if (!document.hidden) fetchNotifications({ silent: true }) }
    const id = setInterval(tick, 60000)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const handleNotificationClick = (n) => {
    if (!n.is_read) handleMarkRead(n.id)
    setOpen(false)
    // Super Admin rows resolve to module + tab + farm context; every other
    // role keeps the link stored on the notification.
    const to = notificationDestination(n, getUser()?.role)
    if (to) navigate(to)
  }

  // Super Admin's bell groups by category (All / Inspections / Service
  // Requests / Farm Alerts); every other role keeps All / Unread.
  const isSuperAdmin = getUser()?.role === 'super_admin'
  const visibleItems = isSuperAdmin
    ? notifications.filter(n => activeTab === 'all' || notificationCategory(n) === activeTab)
    : activeTab === 'unread' ? notifications.filter(n => !n.is_read) : notifications
  const unreadIn = (key) => notifications.filter(n => !n.is_read && (key === 'all' || notificationCategory(n) === key)).length
  const emptyMessage = isSuperAdmin
    ? NOTIFICATION_CATEGORIES.find(c => c.key === activeTab)?.empty
    : notifications.length === 0 ? 'No notifications yet' : 'No unread notifications'

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

          <div style={isMobile ? bellStyles.dropdownMobile : { ...bellStyles.dropdown, ...(isSuperAdmin ? bellStyles.dropdownWide : {}) }}>
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

            <div style={{ ...bellStyles.tabsRow, ...(isSuperAdmin ? bellStyles.tabsRowCompact : {}) }}>
              {isSuperAdmin ? (
                NOTIFICATION_CATEGORIES.map(c => {
                  const unread = unreadIn(c.key)
                  return (
                    <span
                      key={c.key}
                      onClick={() => setActiveTab(c.key)}
                      style={{ ...bellStyles.tab, ...(activeTab === c.key ? bellStyles.tabActive : {}) }}
                    >
                      {c.label}{unread > 0 ? ` (${unread})` : ''}
                    </span>
                  )
                })
              ) : (
                <>
                  <span
                    onClick={() => setActiveTab('all')}
                    style={{ ...bellStyles.tab, ...(activeTab === 'all' ? bellStyles.tabActive : {}) }}
                  >
                    All Notifications
                  </span>
                  <span
                    onClick={() => setActiveTab('unread')}
                    style={{ ...bellStyles.tab, ...(activeTab === 'unread' ? bellStyles.tabActive : {}) }}
                  >
                    Unread ({unreadCount})
                  </span>
                </>
              )}
            </div>

            <div style={{ ...bellStyles.dropdownList, ...(isMobile ? bellStyles.dropdownListMobile : {}) }}>
              {loading && <SectionLoader label="Loading notifications…" padding="18px 12px" />}
              {!loading && visibleItems.length === 0 && (
                <div style={bellStyles.empty}>{emptyMessage}</div>
              )}
              {!loading && groupNotificationsByDate(visibleItems).map(group => (
                <div key={group.key}>
                  {/* A divider, not a control: no handler, not focusable. */}
                  <div style={bellStyles.groupDivider} aria-hidden="true">
                    <span style={bellStyles.groupLabel}>{group.label}</span>
                    <span style={bellStyles.groupRule} />
                  </div>

                  {group.items.map(n => (
                    <div
                      key={n.id}
                      style={{ ...bellStyles.item, ...(n.is_read ? {} : bellStyles.itemUnread) }}
                      onClick={() => handleNotificationClick(n)}
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
              ))}

              {/* Hidden once the server says there is nothing further, so the
                  action is never offered when it would return the same rows. */}
              {!loading && hasMore && (
                <button
                  type="button"
                  onClick={handleSeeMore}
                  disabled={loadingMore}
                  style={bellStyles.seeMoreBtn}
                >
                  {loadingMore ? 'Loading…' : 'See More'}
                </button>
              )}
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
  const isMobile = useIsMobile(LAYOUT_BREAKPOINT)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // The drawer sits over the page, so the page must not scroll underneath
  // it — on a phone that scroll was being stolen from the nav list, which
  // made the lower menu items and "Log out" feel unreachable.
  useEffect(() => {
    if (!isMobile) return
    document.body.style.overflow = sidebarOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [sidebarOpen, isMobile])

  // A drawer left open from a narrow window would stay stuck half-open after
  // the sidebar becomes permanent again.
  useEffect(() => {
    if (!isMobile) setSidebarOpen(false)
  }, [isMobile])

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
          @page { margin: 1.5cm; }
          .no-print { display: none !important; }
          body, .print-reset { background: #fff !important; margin: 0 !important; padding: 0 !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
        .agb-nav-item { transition: background-color .14s ease, color .14s ease; }
        .agb-nav-item:hover { background-color: rgba(255,255,255,0.06); }
        .agb-logout:hover { background-color: rgba(230,180,85,0.12); }

        /* 100dvh tracks the area actually visible on a phone browser; the
           100vh line before it is the fallback for anything without it.
           The bottom padding keeps "Log out" clear of the home indicator. */
        .agb-sidebar { height: 100vh; height: 100dvh; padding-bottom: calc(20px + env(safe-area-inset-bottom, 0px)); }

        /* A page that laid out wider than the phone used to drag the whole
           document sideways, so the heading, the tabs and the topbar scrolled
           off to the left. Wide tables keep their own horizontal scrollbar
           inside this box; nothing can push past it. 'clip' is preferred
           where supported because, unlike 'hidden', it does not turn this
           into a scroll container (which would break sticky cells inside). */
        .agb-page-content { max-width: 100%; overflow-x: hidden; }
        @supports (overflow: clip) {
          .agb-page-content { overflow-x: clip; overflow-y: visible; }
        }
                * { scrollbar-width: none; }
        ::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
      `}</style>

      {isMobile && sidebarOpen && (
        <div style={styles.sidebarOverlay} className="no-print" onClick={() => setSidebarOpen(false)} />
      )}

      <aside style={sidebarStyle} className="agb-sidebar no-print">
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
        <div className="agb-page-content" style={{ ...styles.content, ...(isMobile ? styles.contentMobile : {}) }}>{children}</div>
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

const SANS = "'Inter', sans-serif"

const styles = {
  wrapper: { display: 'flex', minHeight: '100vh', backgroundColor: '#f3f4ef', fontFamily: SANS },

  // height lives in CSS (.agb-sidebar) so 100dvh can fall back to 100vh: on a
  // phone browser 100vh is TALLER than the area actually visible (the URL bar
  // is excluded from it), which pushed "Log out" below the fold with no way
  // to reach it. The aside itself no longer scrolls - only the nav list does -
  // so the footer stays pinned and visible at every screen height.
  sidebar: {
    width: '250px', backgroundColor: '#14301c', display: 'flex', flexDirection: 'column',
    padding: '20px 14px', position: 'fixed', top: 0, left: 0, overflow: 'hidden', zIndex: 20,
  },
  sidebarMobile: { width: 'min(84vw, 272px)', boxShadow: '4px 0 24px rgba(0,0,0,0.3)', transition: 'transform 0.25s ease', zIndex: 100 },
  sidebarOverlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 90 },
  sidebarCloseBtn: { marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px' },

  logo: { display: 'flex', alignItems: 'center', gap: '11px', marginBottom: '10px', padding: '4px 8px 0', flexShrink: 0 },
  logoImg: { width: '44px', height: '44px', objectFit: 'contain', flexShrink: 0 },
  logoTextBlock: { minWidth: 0, maxWidth: '100%' },
  logoNameImg: { maxHeight: '19px', maxWidth: '100%', width: 'auto', height: 'auto', display: 'block', objectFit: 'contain' },
  logoSub: { fontSize: '11px', color: '#7d9585', marginTop: '5px' },

  nav: { display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minHeight: 0, marginTop: '18px', overflowY: 'auto', WebkitOverflowScrolling: 'touch' },
  navSection: { fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#5f7867', padding: '0 12px', margin: '14px 0 7px' },
  navItem: { display: 'flex', alignItems: 'center', gap: '11px', padding: '10px 12px', borderRadius: '9px', fontSize: '13.5px', color: '#b8ccbd', cursor: 'pointer' },
  navItemActive: { backgroundColor: '#7cc795', color: '#14301c', fontWeight: 600 },

  sidebarFooter: { borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '12px', marginTop: '10px', flexShrink: 0 },
  userMini: { display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 8px 12px' },
  userAvatar: { width: '34px', height: '34px', borderRadius: '50%', background: '#2c8047', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, color: '#fff', flexShrink: 0, textTransform: 'uppercase' },
  userMiniName: { fontSize: '13px', fontWeight: 700, color: '#eef4ef', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  userMiniRole: { fontSize: '11px', color: '#7d9585' },
  logout: { display: 'flex', alignItems: 'center', gap: '11px', padding: '10px 12px', borderRadius: '9px', fontSize: '13.5px', fontWeight: 600, color: '#e6b455', cursor: 'pointer' },

  main: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, maxWidth: '100%', marginLeft: '250px' },
  mainMobile: { marginLeft: 0 },

  // Sticky so the bell and the account name stay reachable on a long table
  // instead of scrolling away with the page. z-index 30 sits above the page
  // content but below the mobile drawer (100) and any modal (200), so those
  // still cover it when they open.
  topbar: { backgroundColor: '#ffffff', borderBottom: '1px solid #e7e8e0', padding: '15px 32px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '16px', position: 'sticky', top: 0, zIndex: 30 },
  topbarMobile: { padding: '13px 16px', justifyContent: 'space-between' },
  mobileTopbarLogoImg: { height: '38px', width: 'auto', objectFit: 'contain' },
  mobileTopbarRight: { display: 'flex', alignItems: 'center', gap: '10px' },
  menuBtn: { background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px' },
  userName: { fontSize: '14px', fontWeight: 700, color: '#16311d', textAlign: 'right' },
  userRole: { fontSize: '12px', color: '#6b7770', textAlign: 'right' },
  content: { padding: '30px 32px', flex: 1, minWidth: 0, maxWidth: '100%' },
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
    position: 'absolute', top: 'calc(100% + 10px)', right: 0, width: '400px', maxWidth: '90vw',
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
  // Super Admin's four category tabs need a little more room than All / Unread.
  dropdownWide: { width: '480px' },
  tabsRowCompact: { gap: '12px' },

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

  tabsRow: {
    display: 'flex', alignItems: 'center', gap: '18px',
    padding: '0 16px 12px', borderBottom: '1px solid #eceee7', flexShrink: 0, flexWrap: 'wrap', rowGap: '6px',
  },
  tab: {
    fontSize: '13px', fontWeight: 700, color: '#9aa79d', cursor: 'pointer',
    padding: '0 0 4px', fontFamily: SANS, whiteSpace: 'nowrap', borderBottom: '2px solid transparent',
  },
  tabActive: { color: '#2c8047', borderBottom: '2px solid #2c8047' },

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

  // Date dividers. Deliberately not buttons and with no cursor change —
  // nothing here is pressable.
  groupDivider: { display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px 6px', userSelect: 'none' },
  groupLabel: { fontSize: '10.5px', fontWeight: 800, letterSpacing: '0.08em', color: '#9aa79d', fontFamily: SANS, whiteSpace: 'nowrap' },
  groupRule: { flex: 1, height: '1px', backgroundColor: '#eceee7' },

  seeMoreBtn: {
    display: 'block', width: '100%', padding: '11px 14px', border: 'none',
    borderTop: '1px solid #eceee7', backgroundColor: '#fff', color: '#2c8047',
    fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', fontFamily: SANS,
  },
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