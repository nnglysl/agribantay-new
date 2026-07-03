import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from '../pages/Login'
import ChangePassword from '../pages/ChangePassword'
import FarmerDashboard from '../pages/farmowner/Dashboard'
import ServiceRequests from '../pages/farmowner/ServiceRequests'
import Recommendations from '../pages/farmowner/Recommendations'
import Settings from '../pages/farmowner/Settings'
import AdminDashboard from '../pages/admin/Dashboard'
import Farms from '../pages/admin/Farms'
import Inspections from '../pages/admin/Inspections'
import ActivityLogs from '../pages/admin/ActivityLogs'
import Reports from '../pages/admin/Reports'
import AdminSettings from '../pages/admin/Settings'
import VetDashboard from '../pages/vet/Dashboard'
import VaccinationRequests from '../pages/vet/VaccinationRequests'
import VetReports from '../pages/vet/Reports'
import VetSettings from '../pages/vet/Settings'
import { isAuthenticated, getRole } from '../utils/auth'

function ProtectedRoute({ children, role }) {
  if (!isAuthenticated()) return <Navigate to="/login" />
  if (role && getRole() !== role) return <Navigate to="/login" />
  return children
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" />} />
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
        <Route path="/farmowner/recommendations" element={
          <ProtectedRoute role="farm_owner">
            <Recommendations />
          </ProtectedRoute>
        } />
        <Route path="/farmowner/settings" element={
          <ProtectedRoute role="farm_owner">
            <Settings />
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
    </BrowserRouter>
  )
}