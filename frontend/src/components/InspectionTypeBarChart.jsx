import { Bar } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip } from 'chart.js'
import { C, SANS, styles, chartOptions, ChartFrame } from './ReportsLayout'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip)

const countLabels = {
  id: 'inspectionTypeCounts',
  afterDatasetsDraw(chart) {
    const { ctx, chartArea } = chart
    ctx.save()
    ctx.font = `600 12px ${SANS}`
    ctx.fillStyle = C.dark
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    chart.getDatasetMeta(0).data.forEach((bar, index) => {
      const { x, y } = bar.tooltipPosition()
      ctx.fillText(String(chart.data.datasets[0].data[index]), x, Math.max(chartArea.top + 14, y - 6))
    })
    ctx.restore()
  },
}

// These are the API's type counts across statuses, not counts from the completed table.
export default function InspectionTypeBarChart({ general, followUp }) {
  const values = [general ?? 0, followUp ?? 0]
  if (!values.some(value => value > 0)) {
    return <div style={{ ...styles.empty, padding: 20, color: C.mute }}>No General or Follow-up inspections in this reporting period.</div>
  }
  const options = {
    ...chartOptions,
    layout: { padding: { top: 8 } },
    plugins: {
      ...chartOptions.plugins,
      tooltip: { ...chartOptions.plugins.tooltip, callbacks: {
        label: context => `${context.parsed.y} inspection${context.parsed.y === 1 ? '' : 's'}`,
      } },
    },
    scales: {
      ...chartOptions.scales,
      y: {
        ...chartOptions.scales.y,
        suggestedMax: Math.max(1, Math.ceil(Math.max(...values) * 1.15)),
        ticks: { ...chartOptions.scales.y.ticks, maxTicksLimit: 6, color: C.mute },
        title: { display: true, text: 'Number of inspections', color: C.mute, font: { family: SANS, size: 11 } },
      },
      x: { ...chartOptions.scales.x, ticks: { ...chartOptions.scales.x.ticks, color: C.mute } },
    },
  }
  return (
    <ChartFrame height="clamp(200px, 22vw, 240px)">
      <Bar
        role="img"
        aria-label={`Inspections by type. General: ${values[0]}; Follow-up: ${values[1]}.`}
        plugins={[countLabels]}
        options={options}
        data={{
          labels: ['General', 'Follow-up'],
          datasets: [{ label: 'Inspections', data: values, backgroundColor: C.green, borderRadius: 4, maxBarThickness: 130 }],
        }}
      />
    </ChartFrame>
  )
}
