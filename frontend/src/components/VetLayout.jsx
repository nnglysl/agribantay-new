import DashboardLayout from './DashboardLayout'

const navItems = [
  { label: 'Dashboard', path: '/vet/dashboard', icon: 'dashboard', section: 'Overview' },
  { label: 'Farms', path: '/vet/farms', icon: 'farms', section: 'Management' },
  { label: 'Service requests', path: '/vet/vaccination-requests', icon: 'vaccination', section: 'Management' },
  { label: 'Reports', path: '/vet/reports', icon: 'reports', section: 'System' },
  { label: 'Settings', path: '/vet/settings', icon: 'settings', section: 'System' },
]

export default function VetLayout({ children }) {
  return (
    <DashboardLayout navItems={navItems} roleLabel="Municipal Veterinarian" logoutRedirect="/login" hideSidebarUserInfo>
      {children}
    </DashboardLayout>
  )
}