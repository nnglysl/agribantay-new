import { useParams } from 'react-router-dom'
import FarmDetailsPage from '../../components/farm-details/FarmDetailsPage'

export default function SuperAdminFarmDetails() {
  const { farmId } = useParams()
  return <FarmDetailsPage key={farmId} isSuperAdmin />
}
