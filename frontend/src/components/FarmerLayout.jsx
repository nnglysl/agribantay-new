import DashboardLayout from './DashboardLayout'

const navItems = [
  { label: 'Dashboard', path: '/farmowner/dashboard', icon: 'dashboard' },
  { label: 'Service requests', path: '/farmowner/service-requests', icon: 'requests' },
  { label: 'Settings', path: '/farmowner/settings', icon: 'settings' },
]

export default function FarmerLayout({ children }) {
  return (
    <DashboardLayout navItems={navItems} roleLabel="Farm Owner" logoutRedirect="/">
      {children}
    </DashboardLayout>
  )
}