import { Bar } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip } from 'chart.js'
import { C, styles, chartOptions, ChartFrame } from './ReportsLayout'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip)

export default function AlertIncidentChart({ series }) {
  const buckets = series?.buckets || []
  if (!buckets.length) return <div style={styles.empty}>No alert incidents in this reporting period.</div>
  const options = {
    ...chartOptions,
    plugins: { ...chartOptions.plugins, tooltip: { ...chartOptions.plugins.tooltip, callbacks: {
      title: items => buckets[items[0]?.dataIndex]?.label || '',
      label: item => `${item.parsed.y} incident${item.parsed.y === 1 ? '' : 's'}`,
    } } },
    scales: { ...chartOptions.scales, y: { ...chartOptions.scales.y, title: { display: true, text: 'Alert incidents' } } },
  }
  return <ChartFrame height={220}><Bar options={options} data={{
    labels: buckets.map(bucket => bucket.label),
    datasets: [{ label: 'Alert incidents', data: buckets.map(bucket => bucket.count), backgroundColor: C.amber, borderRadius: 4, maxBarThickness: 38 }],
  }} /></ChartFrame>
}
