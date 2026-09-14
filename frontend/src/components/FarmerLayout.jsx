import DashboardLayout from './DashboardLayout'

const navItems = [
  { label: 'Dashboard', path: '/farmowner/dashboard', icon: 'dashboard', section: 'Overview' },
  { label: 'Inspections', path: '/farmowner/inspections', icon: 'inspections', section: 'Management' },
  { label: 'Manure Records', path: '/farmowner/manure-records', icon: 'requests', section: 'Management' },
  { label: 'Service requests', path: '/farmowner/service-requests', icon: 'requests', section: 'Management' },
  { label: 'Settings', path: '/farmowner/settings', icon: 'settings', section: 'System' },
]

export default function FarmerLayout({ children }) {
  return (
    <DashboardLayout navItems={navItems} roleLabel="Farm Owner" logoutRedirect="/" hideSidebarUserInfo>
      {children}
    </DashboardLayout>
  )
}