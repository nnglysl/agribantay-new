import { Bar } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip } from 'chart.js'
import { C, SANS, styles, chartOptions, ChartFrame } from './ReportsLayout'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip)

const SENSORS = [
  { key: 'ammonia', label: 'Ammonia Alerts', color: C.green },
  { key: 'moisture', label: 'Moisture Alerts', color: C.amber },
]
const incidentLabels = {
  id: 'alertSensorIncidentCounts',
  afterDatasetsDraw(chart) {
    const { ctx, chartArea } = chart
    ctx.save()
    ctx.font = `600 11px ${SANS}`
    ctx.fillStyle = C.dark
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    chart.data.datasets.forEach((dataset, datasetIndex) => {
      chart.getDatasetMeta(datasetIndex).data.forEach((bar, index) => {
        const { x, y } = bar.tooltipPosition()
        ctx.fillText(String(dataset.data[index]), x, Math.max(chartArea.top + 14, y - 6))
      })
    })
    ctx.restore()
  },
}

export default function AlertSensorMonthlyChart({ series, ammoniaTotal, moistureTotal }) {
  // Do not plot a partial/unreconciled response as if it represented the totals.
  if (series.totals.ammonia !== ammoniaTotal || series.totals.moisture !== moistureTotal) {
    return <p role="alert" style={{ ...styles.empty, color: C.red }}>Monthly sensor counts do not match the reporting totals. Refresh the report to view this chart.</p>
  }
  if (series.totals.ammonia + series.totals.moisture === 0) {
    return <p style={{ ...styles.empty, color: C.mute }}>No ammonia or moisture incidents in this reporting period.</p>
  }
  const { buckets } = series
  const peak = buckets.reduce((max, bucket) => Math.max(max, bucket.ammonia, bucket.moisture), 0)
  const barThickness = Math.max(36, Math.min(56, String(peak).length * 7 + 12))
  const monthWidth = Math.max(88, barThickness * 2 + 16)
  const options = {
    ...chartOptions,
    layout: { padding: { top: 8 } },
    plugins: {
      ...chartOptions.plugins,
      tooltip: { ...chartOptions.plugins.tooltip, callbacks: {
        title: items => buckets[items[0]?.dataIndex]?.label || '',
        label: item => `${item.dataset.label}: ${item.parsed.y} incident${item.parsed.y === 1 ? '' : 's'}`,
      } },
    },
    scales: {
      x: { ...chartOptions.scales.x, stacked: false, ticks: { ...chartOptions.scales.x.ticks, autoSkip: false, color: C.mute } },
      y: {
        ...chartOptions.scales.y,
        stacked: false,
        suggestedMax: Math.max(1, Math.ceil(peak * 1.15)),
        ticks: { ...chartOptions.scales.y.ticks, maxTicksLimit: 6, color: C.mute },
        title: { display: true, text: 'Alert incidents', color: C.mute, font: { family: SANS, size: 11 } },
      },
    },
  }
  return (
    <>
      <div className="staff-alert-chart-scroll" role="region" aria-label="Monthly alert sensor chart" tabIndex={0}>
        <div style={{ minWidth: Math.max(280, buckets.length * monthWidth + 56) }}>
          <ChartFrame height="clamp(220px, 22vw, 260px)">
            <Bar
              role="img"
              aria-label={`Alert incidents by sensor. ${buckets.map(bucket => `${bucket.label}: Ammonia ${bucket.ammonia}, Moisture ${bucket.moisture}`).join('; ')}`}
              plugins={[incidentLabels]}
              options={options}
              data={{
                labels: buckets.map(bucket => bucket.label),
                datasets: SENSORS.map(sensor => ({
                  label: sensor.label, data: buckets.map(bucket => bucket[sensor.key]),
                  backgroundColor: sensor.color, borderRadius: 4, barThickness,
                  categoryPercentage: 0.7, barPercentage: 0.9, grouped: true,
                })),
              }}
            />
          </ChartFrame>
        </div>
      </div>
      <div className="staff-alert-chart-legend" role="list" aria-label="Alert sensor legend">
        {SENSORS.map(sensor => <span key={sensor.key} role="listitem"><span aria-hidden="true" style={{ backgroundColor: sensor.color }} />{sensor.label}</span>)}
      </div>
    </>
  )
}
