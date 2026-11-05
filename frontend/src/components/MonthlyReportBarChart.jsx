import { Bar } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip } from 'chart.js'
import { C, styles, chartOptions, ChartFrame } from './ReportsLayout'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip)

/** Present the page's existing monthly buckets without recalculating them. */
export default function MonthlyReportBarChart({ buckets, label, emptyText, options = chartOptions, height = 240, describeValues = false }) {
  if (!buckets.some(bucket => bucket.count > 0)) return <div style={styles.empty}>{emptyText}</div>
  return (
    <ChartFrame height={height}>
      <Bar
        role="img"
        aria-label={`${label} by month${describeValues ? `. ${buckets.map(bucket => `${bucket.label}: ${bucket.count}`).join('; ')}` : ''}`}
        options={options}
        data={{
          labels: buckets.map(bucket => bucket.label),
          datasets: [{ label, data: buckets.map(bucket => bucket.count), backgroundColor: C.green, borderRadius: 4, maxBarThickness: 42 }],
        }}
      />
    </ChartFrame>
  )
}
