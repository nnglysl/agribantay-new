import DashboardLayout from './DashboardLayout'

const navItems = [
  { label: 'Dashboard', path: '/vet/dashboard', icon: 'dashboard' },
  { label: 'Service Requests', path: '/vet/vaccination-requests', icon: 'vaccination' },
  { label: 'Reports', path: '/vet/reports', icon: 'reports' },
  { label: 'Settings', path: '/vet/settings', icon: 'settings' },
]

export default function VetLayout({ children }) {
  return (
    <DashboardLayout navItems={navItems} roleLabel="Municipal Veterinarian" logoutRedirect="/login" hideSidebarUserInfo>
      {children}
    </DashboardLayout>
  )
}