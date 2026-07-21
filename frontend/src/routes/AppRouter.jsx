import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { isAuthenticated, getRole } from '../utils/auth'

const LandingPage = lazy(() => import('../pages/LandingPage'))
const Login = lazy(() => import('../pages/Login'))
const ChangePassword = lazy(() => import('../pages/ChangePassword'))

const FarmerDashboard = lazy(() => import('../pages/farmowner/Dashboard'))
const ServiceRequests = lazy(() => import('../pages/farmowner/ServiceRequests'))
const FarmerSettings = lazy(() => import('../pages/farmowner/Settings'))

const AdminDashboard = lazy(() => import('../pages/admin/Dashboard'))
const Farms = lazy(() => import('../pages/admin/Farms'))
const Inspections = lazy(() => import('../pages/admin/Inspections'))
const AdminServiceRequests = lazy(() => import('../pages/admin/ServiceRequests'))
const ActivityLogs = lazy(() => import('../pages/admin/ActivityLogs'))
const Reports = lazy(() => import('../pages/admin/Reports'))
const AdminSettings = lazy(() => import('../pages/admin/Settings'))
const AlertHistory = lazy(() => import('../pages/admin/AlertHistory'))
const MaintenanceOverdue = lazy(() => import('../pages/admin/MaintenanceOverdue'))

// Manage Accounts (Admin + Vet) is now exclusive to Super Admin — the old
// /admin/veterinarians route + regular Admin's access to it is gone.
// Same underlying component/file, just re-gated and re-routed.
const ManageAccounts = lazy(() => import('../pages/superadmin/ManageAccounts'))
const SuperAdminReports = lazy(() => import('../pages/superadmin/Reports'))
const SuperAdminDashboard = lazy(() => import('../pages/superadmin/Dashboard'))

const VetDashboard = lazy(() => import('../pages/vet/Dashboard'))
const VaccinationRequests = lazy(() => import('../pages/vet/VaccinationRequests'))
const VetReports = lazy(() => import('../pages/vet/Reports'))
const VetSettings = lazy(() => import('../pages/vet/Settings'))

// Super Admin inherits every "admin"-gated route automatically (Farms,
// Inspections, Service Requests, Reports, Settings) — matches "Access all
// reports and analytics" / "View all system data across every module"
// from the spec, without duplicating any of those pages. Only genuinely
// Super-Admin-exclusive pages use role="super_admin" directly.
function ProtectedRoute({ children, role }) {
  if (!isAuthenticated()) return <Navigate to="/login" />

  const userRole = getRole()
  if (role === 'admin' && userRole === 'super_admin') return children

  if (role && userRole !== role) return <Navigate to="/login" />
  return children
}

function PageLoader() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#6b7280', fontSize: '14px',
    }}>
      Loading...
    </div>
  )
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<Login />} />

          <Route path="/change-password" element={
            <ProtectedRoute>
              <ChangePassword />
            </ProtectedRoute>
          } />

          {/* Admin routes — Super Admin passes these too, automatically */}
          <Route path="/admin/dashboard" element={
            <ProtectedRoute role="admin">
              <AdminDashboard />
            </ProtectedRoute>
          } />
          <Route path="/admin/farms" element={
            <ProtectedRoute role="admin">
              <Farms />
            </ProtectedRoute>
          } />
          <Route path="/admin/inspections" element={
            <ProtectedRoute role="admin">
              <Inspections />
            </ProtectedRoute>
          } />
          <Route path="/admin/service-requests" element={
            <ProtectedRoute role="admin">
              <AdminServiceRequests />
            </ProtectedRoute>
          } />
          <Route path="/admin/reports" element={
            <ProtectedRoute role="admin">
              <Reports />
            </ProtectedRoute>
          } />
          <Route path="/admin/alert-history" element={
            <ProtectedRoute role="admin">
              <AlertHistory />
            </ProtectedRoute>
          } />
          <Route path="/admin/maintenance/overdue" element={
            <ProtectedRoute role="admin">
              <MaintenanceOverdue />
            </ProtectedRoute>
          } />
          <Route path="/admin/settings" element={
            <ProtectedRoute role="admin">
              <AdminSettings />
            </ProtectedRoute>
          } />

          {/* Super Admin — exclusive, not inherited by regular Admin */}
          <Route path="/superadmin/dashboard" element={
            <ProtectedRoute role="super_admin">
              <SuperAdminDashboard />
            </ProtectedRoute>
          } />
          <Route path="/superadmin/accounts" element={
            <ProtectedRoute role="super_admin">
              <ManageAccounts />
            </ProtectedRoute>
          } />
          <Route path="/superadmin/reports" element={
            <ProtectedRoute role="super_admin">
              <SuperAdminReports />
            </ProtectedRoute>
          } />
          <Route path="/superadmin/activity-logs" element={
            <ProtectedRoute role="super_admin">
              <ActivityLogs />
            </ProtectedRoute>
          } />

          {/* Farm Owner routes */}
          <Route path="/farmowner/dashboard" element={
            <ProtectedRoute role="farm_owner">
              <FarmerDashboard />
            </ProtectedRoute>
          } />
          <Route path="/farmowner/service-requests" element={
            <ProtectedRoute role="farm_owner">
              <ServiceRequests />
            </ProtectedRoute>
          } />
          <Route path="/farmowner/settings" element={
            <ProtectedRoute role="farm_owner">
              <FarmerSettings />
            </ProtectedRoute>
          } />

          {/* Vet routes */}
          <Route path="/vet/dashboard" element={
            <ProtectedRoute role="vet">
              <VetDashboard />
            </ProtectedRoute>
          } />
          <Route path="/vet/vaccination-requests" element={
            <ProtectedRoute role="vet">
              <VaccinationRequests />
            </ProtectedRoute>
          } />
          <Route path="/vet/reports" element={
            <ProtectedRoute role="vet">
              <VetReports />
            </ProtectedRoute>
          } />
          <Route path="/vet/settings" element={
            <ProtectedRoute role="vet">
              <VetSettings />
            </ProtectedRoute>
          } />

          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}