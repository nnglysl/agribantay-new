import { GREEN } from '../theme/green'
import { AMMONIA_UNIT } from '../utils/ammonia'
import { formatDateTime } from '../utils/formatDate'

const CONDITION = {
  Safe: { color: GREEN.hover, bg: GREEN.soft },
  Warning: { color: '#b45309', bg: '#fbf1e2' },
  Critical: { color: '#b91c1c', bg: '#fbeaea' },
}
const OFFLINE = { color: '#b45309', bg: '#fbf1e2' }
const UNKNOWN = { color: '#6b7280', bg: '#eef1ea' }

export default function MonitoringDeviceRow({ device, alerting, cellStyle, pillStyle }) {
  const hasReading = device.has_reading
  const online = device.connectivity === 'Online'
  const condition = device.last_recorded_condition
  const status = !hasReading ? 'No readings yet' : online ? condition : 'Offline'
  const tone = !hasReading ? UNKNOWN : online ? (CONDITION[condition] || UNKNOWN) : OFFLINE

  return (
    <tr>
      <td style={cellStyle}>
        <div style={styles.name}>{device.device_name}</div>
        <div style={styles.note}>{device.connectivity}</div>
        {hasReading && (
          <div style={styles.note}>
            {online ? 'Latest reading: ' : 'Last recorded: '}
            {formatDateTime(device.last_reading_at)}
          </div>
        )}
      </td>
      {[
        ['ammonia', AMMONIA_UNIT], ['temperature', '°C'],
        ['humidity', '%'], ['moisture', '%'],
      ].map(([metric, unit]) => {
        const value = device[metric]
        const metricStatus = device[`${metric}_status`]
        return (
          <td key={metric} style={cellStyle}>
            <div style={styles.value}>
              {!hasReading || value == null ? '—' : `${value}${unit ? ` ${unit}` : ''}`}
            </div>
            {hasReading && !online && <div style={styles.note}>Last recorded</div>}
            {hasReading && online && value != null && alerting.includes(metric) && metricStatus && (
              <div style={{ ...styles.metricStatus, color: CONDITION[metricStatus]?.color || UNKNOWN.color }}>
                {metricStatus}
              </div>
            )}
          </td>
        )
      })}
      <td style={cellStyle}>
        <span style={{ ...pillStyle, color: tone.color, backgroundColor: tone.bg }}>
          {status || 'No readings yet'}
        </span>
        {hasReading && !online && condition && (
          <div style={styles.note}>Last condition: {condition}</div>
        )}
      </td>
    </tr>
  )
}

const styles = {
  name: { fontSize: '13.5px', fontWeight: 800, color: '#16311d', lineHeight: 1.3 },
  note: { fontSize: '11.5px', color: '#9aa79d', marginTop: '4px', lineHeight: 1.3 },
  value: { fontSize: '13px', fontWeight: 700, color: '#16311d', lineHeight: 1.3 },
  metricStatus: { fontSize: '11px', fontWeight: 600, marginTop: '5px', lineHeight: 1.3, letterSpacing: '0.01em' },
}
