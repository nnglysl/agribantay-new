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
const ActivityLogs = lazy(() => import('../pages/admin/ActivityLogs'))
const Reports = lazy(() => import('../pages/admin/Reports'))
const AdminSettings = lazy(() => import('../pages/admin/Settings'))
const UserManagement = lazy(() => import('../pages/admin/UserManagement'))

const VetDashboard = lazy(() => import('../pages/vet/Dashboard'))
const VaccinationRequests = lazy(() => import('../pages/vet/VaccinationRequests'))
const VetReports = lazy(() => import('../pages/vet/Reports'))
const VetSettings = lazy(() => import('../pages/vet/Settings'))

function ProtectedRoute({ children, role }) {
  if (!isAuthenticated()) return <Navigate to="/login" />
  if (role && getRole() !== role) return <Navigate to="/login" />
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

          {/* Admin routes */}
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
          <Route path="/admin/activity-logs" element={
            <ProtectedRoute role="admin">
              <ActivityLogs />
            </ProtectedRoute>
          } />
          <Route path="/admin/reports" element={
            <ProtectedRoute role="admin">
              <Reports />
            </ProtectedRoute>
          } />
          <Route path="/admin/settings" element={
            <ProtectedRoute role="admin">
              <AdminSettings />
            </ProtectedRoute>
          } />
          <Route path="/admin/veterinarians" element={
            <ProtectedRoute role="admin">
              <UserManagement />
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