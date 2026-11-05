// Presentation guards only. Classifications and assignment boundaries belong
// to the existing backend; absent values must never manufacture a Safe state.
export function isReadingValue(value) {
  return (typeof value === 'number' || typeof value === 'string') && String(value).trim() !== '' && Number.isFinite(Number(value))
}

export { hasCurrentPrimary as hasCurrentPrimaryReading } from '../../utils/primaryMonitoring.js'
import { assessFarmDevices } from '../../utils/primaryMonitoring.js'

export function monitoringCondition(farm, devices) {
  return farm.monitoring_assessment?.condition || assessFarmDevices(devices).condition
}
