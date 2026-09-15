import DashboardLayout from './DashboardLayout'
import FarmSelector from './FarmSelector'
import { useSelectedFarm } from '../hooks/useSelectedFarm'

const navItems = [
  { label: 'Dashboard', path: '/farmowner/dashboard', icon: 'dashboard', section: 'Overview' },
  { label: 'Inspections', path: '/farmowner/inspections', icon: 'inspections', section: 'Management' },
  { label: 'Manure Records', path: '/farmowner/manure-records', icon: 'requests', section: 'Management' },
  { label: 'Service requests', path: '/farmowner/service-requests', icon: 'requests', section: 'Management' },
  { label: 'Settings', path: '/farmowner/settings', icon: 'settings', section: 'System' },
]

function FarmerContent({ children }) {
  const { farms, farmsLoading } = useSelectedFarm()

  // A farm_owner account with zero farms shouldn't be possible in normal
  // use (Admin always creates at least one farm when provisioning the
  // account), but every page below assumes a selected farm exists —
  // this is the one place that assumption is guarded, instead of every
  // page needing its own "no farm" fallback.
  if (!farmsLoading && farms.length === 0) {
    return (
      <div style={styles.emptyState}>
        No farms are registered to your account yet. Please contact the LGU Administrator.
      </div>
    )
  }

  return (
    <>
      <FarmSelector />
      {children}
    </>
  )
}

// FarmProvider itself lives one level up, wrapping each /farmowner/* route
// in AppRouter — it has to wrap the whole page component, not just the
// content here, since pages call useSelectedFarm() at their own top level
// (before rendering FarmerLayout) to know which farm to fetch data for.
// Context only reaches descendants, so a provider placed here would be
// invisible to the very pages that need it.
export default function FarmerLayout({ children }) {
  return (
    <DashboardLayout navItems={navItems} roleLabel="Farm Owner" logoutRedirect="/" hideSidebarUserInfo>
      <FarmerContent>{children}</FarmerContent>
    </DashboardLayout>
  )
}

const styles = {
  emptyState: {
    fontFamily: "'Inter', sans-serif", fontSize: '14px', color: '#6b7770',
    background: '#fff', border: '1px solid #e7e8e0', borderRadius: '14px', padding: '28px',
  },
}
