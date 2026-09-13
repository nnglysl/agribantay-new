// Standardized role badge colors — used everywhere a role is shown as a
// badge across the system: Veterinarian → blue, Admin → orange,
// Farmer/Farm Owner → green, Super Admin → yellow (dark text for contrast).
// "System" isn't a real account role (it's the fallback used for activity
// log entries with no associated user), so it keeps its own neutral grey.
const ROLE_BADGE_STYLE = {
  vet: { color: '#2f5fa0', backgroundColor: '#e9eef6' },
  admin: { color: '#b45309', backgroundColor: '#fdf3e6' },
  farm_owner: { color: '#256b3d', backgroundColor: '#eaf3ec' },
  super_admin: { color: '#854d0e', backgroundColor: '#fef9c3' },
  System: { color: '#6b7280', backgroundColor: '#eef1ea' },
}

export function roleBadgeStyle(role) {
  return ROLE_BADGE_STYLE[role] || { color: '#6b7280', backgroundColor: '#eef1ea' }
}
