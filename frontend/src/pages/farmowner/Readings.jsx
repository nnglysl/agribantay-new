import FarmerLayout from '../../components/FarmerLayout'
import FarmerReadingsPanel from '../../components/FarmerReadingsPanel'
import { useSelectedFarm } from '../../hooks/useSelectedFarm'

export default function FarmerReadings() {
  const { selectedFarmId, farmsLoading } = useSelectedFarm()
  return <FarmerLayout title="Farm Readings" description="View the monitoring status and recorded readings for your farm.">
    {farmsLoading ? <p role="status">Loading farms…</p> : selectedFarmId ? <FarmerReadingsPanel key={selectedFarmId} farmId={selectedFarmId} /> : <p>No authorized farm is selected.</p>}
  </FarmerLayout>
}
