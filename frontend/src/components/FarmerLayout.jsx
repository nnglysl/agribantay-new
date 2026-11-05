import DashboardLayout from './DashboardLayout'
import FarmSelector from './FarmSelector'
import { useSelectedFarm } from '../hooks/useSelectedFarm'

const navItems = [
  { label: 'Dashboard', path: '/farmowner/dashboard', icon: 'dashboard', section: 'Overview' },
  { label: 'Farm Readings', path: '/farmowner/readings', icon: 'dashboard', section: 'Overview' },
  { label: 'Inspections', path: '/farmowner/inspections', icon: 'inspections', section: 'Management' },
  { label: 'Manure Management', path: '/farmowner/manure-records', icon: 'requests', section: 'Management' },
  { label: 'Service requests', path: '/farmowner/service-requests', icon: 'requests', section: 'Management' },
  { label: 'Settings', path: '/farmowner/settings', icon: 'settings', section: 'System' },
]

function FarmerContent({ children, title, description }) {
  const { farms, farmsLoading } = useSelectedFarm()

  // A farm_owner account with zero farms shouldn't be possible in normal
  // use (Admin always creates at least one farm when provisioning the
  // account), but every page below assumes a selected farm exists —
  // this is the one place that assumption is guarded, instead of every
  // page needing its own "no farm" fallback.
  if (!farmsLoading && farms.length === 0) {
    return (
      <div style={styles.emptyState}>
        No farms are registered to your account yet. Please contact LGU Staff.
      </div>
    )
  }

  // Pages with a title share the existing farm selector in their header.
  return (
    <>
      {title && (
        <div style={styles.headerRow}>
          <div style={styles.headerCopy}>
            <h1 style={styles.title}>{title}</h1>
            {description && <p style={styles.description}>{description}</p>}
          </div>
          <FarmSelector inline align="right" />
        </div>
      )}
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
export default function FarmerLayout({ children, title, description }) {
  return (
    <DashboardLayout navItems={navItems} roleLabel="Farm Owner" logoutRedirect="/" hideSidebarUserInfo>
      <FarmerContent title={title} description={description}>{children}</FarmerContent>
    </DashboardLayout>
  )
}

const styles = {
  headerRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px 16px',
    flexWrap: 'wrap', marginBottom: '18px',
  },
  headerCopy: { minWidth: 0, flex: '1 1 250px' },
  description: { margin: '5px 0 0', fontSize: '14px', lineHeight: 1.6, color: '#616a63' },
  title: {
    fontSize: '24px', fontWeight: 700, letterSpacing: '-0.01em', color: '#16311d', margin: 0,
    fontFamily: "'Inter', sans-serif",
  },
  emptyState: {
    fontFamily: "'Inter', sans-serif", fontSize: '14px', color: '#6b7770',
    background: '#fff', border: '1px solid #e7e8e0', borderRadius: '14px', padding: '28px',
  },
}
