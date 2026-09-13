import { getUser } from '../utils/auth'
import DashboardLayout from './DashboardLayout'

export default function AdminLayout({ children }) {
  const user = getUser()
  const isSuper = user.role === 'super_admin'
  const dashPath = isSuper ? '/superadmin/dashboard' : '/admin/dashboard'

  const navItems = [
    { label: 'Dashboard', path: dashPath, icon: 'dashboard', section: 'Overview' },
    ...(isSuper ? [{ label: 'Manage Accounts', path: '/superadmin/accounts', icon: 'accounts', section: 'Management' }] : []),
    { label: 'Farms', path: isSuper ? '/superadmin/farms' : '/admin/farms', icon: 'farms', section: 'Management' },
    { label: 'Inspections', path: isSuper ? '/superadmin/inspections' : '/admin/inspections', icon: 'inspections', section: 'Management' },
    { label: 'Service Requests', path: isSuper ? '/superadmin/service-requests' : '/admin/service-requests', icon: 'serviceRequests', section: 'Management' },
    { label: 'Alert History', path: '/admin/alert-history', icon: 'activity', section: 'Monitoring' },
    ...(isSuper ? [{ label: 'Activity logs', path: '/superadmin/activity-logs', icon: 'activity', section: 'Monitoring' }] : []),
    { label: 'Overdue Maintenance', path: '/admin/maintenance/overdue', icon: 'overdue', section: 'Monitoring' },
    { label: 'Reports', path: isSuper ? '/superadmin/reports' : '/admin/reports', icon: 'reports', section: 'System' },
    { label: 'Settings', path: '/admin/settings', icon: 'settings', section: 'System' },
  ]

  return (
    <DashboardLayout navItems={navItems} roleLabel={isSuper ? 'Super Administrator' : 'Administrator'} logoutRedirect="/" hideSidebarUserInfo>
      {children}
    </DashboardLayout>
  )
}