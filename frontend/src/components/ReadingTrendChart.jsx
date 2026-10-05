import { useMemo, useState } from 'react'
import { DISPLAY_TIME_ZONE } from '../utils/formatDate'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler,
} from 'chart.js'
import { AMMONIA_UNIT } from '../utils/ammonia'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

const SANS = "'Inter', sans-serif"

/**
 * Readings over time for one farm, one metric at a time, one line per
 * poultry house.
 *
 * Every other screen shows only the latest reading, which answers "is
 * something wrong now" but never "is it getting better or worse". That
 * second question is the one that decides whether a farmer's fix worked and
 * whether staff need to dispatch, so it gets its own chart.
 *
 * One metric at a time on purpose: ammonia, °C and % share no scale, and
 * plotting them together makes whichever has the largest numbers look like
 * the only thing moving.
 */

// Units carry their own spacing, the same way SENSOR_CONDITIONS does: "3.8 ppm"
// takes a space, "61%" and "34.1°C" do not. Appending one unconditionally gave
// "61 %".
const METRICS = [
  { key: 'ammonia', label: 'Ammonia', unit: AMMONIA_UNIT ? ` ${AMMONIA_UNIT}` : '', decimals: 1 },
  { key: 'temperature', label: 'Temperature', unit: '°C', decimals: 1 },
  { key: 'humidity', label: 'Humidity', unit: '%', decimals: 0 },
  { key: 'moisture', label: 'Manure moisture', unit: '%', decimals: 0 },
]

const RANGES = [
  { hours: 24, label: '24 hours' },
  { hours: 72, label: '3 days' },
  { hours: 168, label: '7 days' },
]

// Distinct enough to tell apart, and none of them reuse the red/amber that
// mean Critical/Warning elsewhere — a line's colour here identifies a house,
// not a severity.
const SERIES_COLORS = ['#2c8047', '#2563eb', '#7c3aed', '#0891b2', '#b45309', '#be185d']

function formatClock(iso) {
  const d = new Date(iso)
  // Pinned to Manila: these labels sit under a readings chart, so the hour has
  // to be the hour at the farm, not the hour on whatever machine is looking.
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: DISPLAY_TIME_ZONE })
}

/**
 * The chart in one sentence, in words rather than axes.
 *
 * A line between 50 and 62 with no reference on it tells a vet nothing: the
 * question is "is this farm getting better or worse", and the answer should
 * not have to be read off a grid. Built only from the values already plotted
 * — no thresholds are judged here, so this can never disagree with the
 * statuses the server computed.
 */
function describe(series, active) {
  if (series.length === 0) return null

  const values = series.map(p => p.v)
  const fmt = v => `${v.toFixed(active.decimals)}${active.unit}`

  const min = Math.min(...values)
  const max = Math.max(...values)
  const now = values[values.length - 1]

  // First third against last third. Comparing only the two end points would
  // let a single noisy reading decide the verdict.
  const third = Math.max(1, Math.floor(series.length / 3))
  const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length
  const shift = mean(values.slice(-third)) - mean(values.slice(0, third))

  // Measured against the spread actually observed: a 2 ppm move means
  // something very different on a flat day than on a volatile one. With no
  // spread at all there is nothing to call a trend.
  const spread = max - min
  const direction = spread === 0 || Math.abs(shift) < spread * 0.2
    ? 'held steady'
    : shift > 0 ? 'been rising' : 'been falling'

  return { now: fmt(now), min: fmt(min), max: fmt(max), direction }
}

export default function ReadingTrendChart({ data, loading, hours, onHoursChange }) {
  // Ammonia, not temperature: it is the metric the system actually alerts on
  // and the one a vet assesses a flock against. Opening on temperature meant
  // the first thing shown was an advisory reading that raises no alert, which
  // is a large part of why the chart read as noise.
  const [metric, setMetric] = useState('ammonia')

  const devices = useMemo(() => data?.devices ?? [], [data])
  const active = METRICS.find(m => m.key === metric) || METRICS[0]

  // Houses report independently, so their timestamps rarely line up exactly.
  // The union of every timestamp becomes the x-axis and each series is mapped
  // onto it, leaving a gap (null) wherever that house has no reading rather
  // than inventing one.
  const labels = useMemo(() => {
    const all = new Set()
    devices.forEach(d => d.points.forEach(p => all.add(p.t)))
    return [...all].sort()
  }, [devices])

  const chartData = useMemo(() => ({
    labels: labels.map(formatClock),
    datasets: devices.map((d, i) => {
      const color = SERIES_COLORS[i % SERIES_COLORS.length]
      const byTime = new Map(d.points.map(p => [p.t, p[metric]]))
      return {
        label: d.device_name,
        data: labels.map(t => (byTime.has(t) ? byTime.get(t) : null)),
        borderColor: color,
        backgroundColor: color,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.3,
        spanGaps: true,
      }
    }),
  }), [labels, devices, metric])

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: devices.length > 1,
        position: 'bottom',
        labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, font: { family: SANS, size: 12 } },
      },
      tooltip: {
        callbacks: {
          label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y}${active.unit}`,
        },
      },
    },
    scales: {
      x: {
        ticks: { maxTicksLimit: 8, font: { family: SANS, size: 11 }, color: '#9aa79d' },
        grid: { display: false },
      },
      y: {
        ticks: { font: { family: SANS, size: 11 }, color: '#9aa79d' },
        grid: { color: '#f0f1ec' },
      },
    },
  }), [devices.length, active.unit])

  const hasPoints = devices.some(d => d.points.length > 0)

  // Every house's readings for the selected metric, oldest first. Houses
  // report independently, so this is sorted rather than concatenated.
  const summary = useMemo(() => {
    const series = []
    devices.forEach(d => d.points.forEach(p => {
      if (p[metric] != null) series.push({ t: p.t, v: p[metric] })
    }))
    series.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0))
    return describe(series, active)
  }, [devices, metric, active])

  const rangeLabel = (RANGES.find(r => r.hours === Number(hours)) || RANGES[0]).label

  return (
    <div>
      <div style={styles.controls}>
        {/* A select rather than four pills: the pills took a full row on
            narrow layouts and pushed the chart down, and only one can be
            active at a time anyway — which is exactly what a select says. */}
        <select
          value={metric}
          onChange={e => setMetric(e.target.value)}
          style={styles.rangeSelect}
          aria-label="Sensor"
        >
          {METRICS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>

        <select
          value={hours}
          onChange={e => onHoursChange(Number(e.target.value))}
          style={styles.rangeSelect}
          aria-label="Time range"
        >
          {RANGES.map(r => <option key={r.hours} value={r.hours}>Last {r.label}</option>)}
        </select>
      </div>

      {/* The chart in words, before the chart. Someone who never reads the
          axes still leaves knowing whether this farm is improving. */}
      {!loading && summary && (
        <p style={styles.summary}>
          {active.label} is <strong style={styles.summaryStrong}>{summary.now}</strong> now.
          {' '}Over the last {rangeLabel} it ranged from {summary.min} to {summary.max},
          {' '}and has <strong style={styles.summaryStrong}>{summary.direction}</strong>.
        </p>
      )}

      {loading ? (
        <div style={styles.state}>Loading readings…</div>
      ) : !hasPoints ? (
        <div style={styles.state}>
          No readings recorded in this period. The chart fills in as devices report.
        </div>
      ) : (
        <div style={styles.canvasWrap}>
          <Line data={chartData} options={options} />
        </div>
      )}
    </div>
  )
}

const styles = {
  // Grouped, not spread apart: the two selects are one control — "which
  // reading, over what period". Pushed to opposite ends of a wide card they
  // read as two unrelated settings.
  controls: {
    display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
    gap: '10px', flexWrap: 'wrap', marginBottom: '12px',
  },
  summary: {
    fontFamily: SANS, fontSize: '13px', lineHeight: 1.6, color: '#5c6b61',
    margin: '0 0 14px', maxWidth: '68ch',
  },
  summaryStrong: { color: '#16311d', fontWeight: 700 },
  rangeSelect: {
    padding: '7px 11px', borderRadius: '9px', border: '1px solid #dcdfd6',
    backgroundColor: '#fff', color: '#33413a', fontSize: '12.5px', fontWeight: 600,
    fontFamily: SANS, cursor: 'pointer',
  },
  canvasWrap: { height: '260px' },
  state: {
    height: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center',
    textAlign: 'center', color: '#9aa79d', fontSize: '13px', fontFamily: SANS, lineHeight: 1.55,
  },
}
