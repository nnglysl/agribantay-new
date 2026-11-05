import AdminLayout from '../../components/AdminLayout'

// Keep old bookmarks safe without exposing retired queues or granting Vet access.
export default function StaffServiceRequests() {
  return <AdminLayout><h1>Service Requests</h1><p>No service requests are available for this role.</p></AdminLayout>
}
