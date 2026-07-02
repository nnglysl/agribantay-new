import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from '../pages/Login'
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

        {/* Admin routes — placeholder for now */}
        <Route path="/admin/dashboard" element={
          <ProtectedRoute role="admin">
            <div style={{ padding: 40 }}>
              <h1>Admin Dashboard</h1>
              <p>Coming soon...</p>
            </div>
          </ProtectedRoute>
        } />

        {/* Farm Owner routes — placeholder */}
        <Route path="/farmowner/dashboard" element={
          <ProtectedRoute role="farm_owner">
            <div style={{ padding: 40 }}>
              <h1>Farm Owner Dashboard</h1>
              <p>Coming soon...</p>
            </div>
          </ProtectedRoute>
        } />

        {/* Vet routes — placeholder */}
        <Route path="/vet/dashboard" element={
          <ProtectedRoute role="vet">
            <div style={{ padding: 40 }}>
              <h1>Veterinarian Dashboard</h1>
              <p>Coming soon...</p>
            </div>
          </ProtectedRoute>
        } />

        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
  )
}