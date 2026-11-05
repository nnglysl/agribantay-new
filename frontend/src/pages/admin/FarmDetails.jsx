import { useParams } from 'react-router-dom'
import FarmDetailsPage from '../../components/farm-details/FarmDetailsPage'

export default function FarmDetails() {
  const { farmId } = useParams()
  return <FarmDetailsPage key={farmId} />
}
