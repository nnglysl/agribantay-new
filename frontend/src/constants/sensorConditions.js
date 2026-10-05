import { AMMONIA_UNIT } from '../utils/ammonia'

/**
 * How a sensor reading is described to a FARM OWNER.
 *
 * Shared by the farmer Dashboard and the Farm Readings table so a house can
 * never read "Too Hot" on one screen and "High" on the other. The wording is
 * keyed by the status the backend already computes — nothing here decides
 * whether a reading is safe, it only decides what to call it.
 *
 * Two vocabularies on purpose:
 *   `word`  short, for a table cell where the column header supplies context
 *   `plain` bilingual sentence, for the dashboard where the farmer is being
 *           told what is happening rather than scanning rows
 *
 * `direction` ('high' | 'low' | null) comes from the API. Temperature and
 * humidity are harmful at BOTH extremes, so "Too Hot" would be wrong during
 * a cold snap; the side is decided server-side beside the thresholds.
 */

export const METRICS = ['temperature', 'humidity', 'ammonia', 'moisture']

export const SENSOR_CONDITIONS = {
  temperature: {
    label: 'Temperature',
    column: 'Temperature',
    unit: '°C',
    decimals: 1,
    word: {
      Safe: () => 'Normal',
      Warning: dir => (dir === 'low' ? 'Cool' : 'High'),
      Critical: dir => (dir === 'low' ? 'Too Cold' : 'Too Hot'),
    },
    plain: {
      Warning: dir => (dir === 'low'
        ? ['Getting cold', 'Lumalamig']
        : ['Getting hot', 'Umiinit']),
      Critical: dir => (dir === 'low'
        ? ['Too cold', 'Sobrang lamig']
        : ['Too hot', 'Sobrang init']),
    },
    todo: {
      Warning: dir => (dir === 'low'
        ? ['Close openings to keep warmth in.', 'Isara ang mga butas upang mapanatili ang init.']
        : ['Check ventilation and airflow.', 'Tingnan ang bentilasyon at daloy ng hangin.']),
      Critical: dir => (dir === 'low'
        ? ['Warm the house now.', 'Painitin ang kulungan agad.']
        : ['Cool the house down now.', 'Palamigin ang kulungan agad.']),
    },
  },

  humidity: {
    label: 'Humidity',
    column: 'Humidity',
    unit: '%',
    decimals: 0,
    word: {
      Safe: () => 'Normal',
      Warning: dir => (dir === 'low' ? 'Dry' : 'High'),
      Critical: dir => (dir === 'low' ? 'Too Dry' : 'Very High'),
    },
    plain: {
      Warning: dir => (dir === 'low'
        ? ['Air is dry', 'Tuyo ang hangin']
        : ['Air is damp', 'Mahalumigmig']),
      Critical: dir => (dir === 'low'
        ? ['Air is very dry', 'Sobrang tuyo ang hangin']
        : ['Air is very damp', 'Sobrang halumigmig']),
    },
    todo: {
      Warning: () => ['Improve airflow in the house.', 'Palakasin ang bentilasyon.'],
      Critical: () => ['Improve airflow now.', 'Ayusin agad ang bentilasyon.'],
    },
  },

  // Labelled "Air Quality" rather than "Ammonia": the farmer is being told
  // whether the air is breathable, not given a chemistry reading. The unit is
  // intentionally blank until calibration — see utils/ammonia.js.
  ammonia: {
    label: 'Air Quality',
    column: 'Air Quality',
    unit: AMMONIA_UNIT ? ` ${AMMONIA_UNIT}` : '',
    decimals: 1,
    word: {
      Safe: () => 'Good',
      Warning: () => 'Moderate',
      Critical: () => 'Poor',
    },
    plain: {
      Warning: () => ['Air is getting stuffy', 'Medyo mabaho na ang hangin'],
      Critical: () => ['Air is very stuffy', 'Napakabaho ng hangin'],
    },
    todo: {
      Warning: () => ['Air out the house more often.', 'Mas madalas na paalisin ang baho.'],
      Critical: () => ['Air out the house now and clean.', 'Bentilahan at linisin agad.'],
    },
  },

  moisture: {
    label: 'Manure Condition',
    column: 'Manure Condition',
    unit: '%',
    decimals: 0,
    word: {
      Safe: () => 'Normal',
      Warning: () => 'Damp',
      Critical: () => 'Too Wet',
    },
    plain: {
      Warning: () => ['Manure is getting damp', 'Medyo basa ang dumi'],
      Critical: () => ['Manure is too wet', 'Sobrang basa ang dumi'],
    },
    todo: {
      Warning: () => ['Check for leaks or spillage.', 'Tingnan kung may tagas o natapon.'],
      Critical: () => ['Replace wet litter and clean.', 'Palitan ang basang lupa at linisin.'],
    },
  },
}

export const STATUS_TONE = {
  Safe: { fg: '#1f7a3d', bg: '#e7f2ea', dot: '#2c8047' },
  Warning: { fg: '#b45309', bg: '#fdf4e7', dot: '#d97706' },
  Critical: { fg: '#b91c1c', bg: '#fbeaea', dot: '#dc2626' },
  Offline: { fg: '#6b7280', bg: '#f1f2ed', dot: '#9ca3af' },
}

const SEVERITY = { Safe: 0, Warning: 1, Critical: 2 }

/**
 * Metrics that may be labelled Safe / Warning / Critical.
 *
 * The server decides this (config('sensors.alerting_metrics')) and sends it
 * on the dashboard payload; this is only the fallback for a cached response
 * from before that field existed.
 *
 * Everything NOT in this list is advisory — measured, shown and fed to the
 * recommendations, but never badged and never counted towards a house's
 * overall status. Temperature, humidity and manure moisture are the
 * conditions that drive ammonia rather than hazards in their own right, and
 * their published bands come from temperate-climate studies that do not hold
 * in a San Jose layer house.
 */
export const DEFAULT_ALERTING_METRICS = ['ammonia']

export function isAdvisory(metric, alerting = DEFAULT_ALERTING_METRICS) {
  return !alerting.includes(metric)
}

/** Worst of a house's ALERTING metrics — the same rule used across the system. */
export function overallStatus(device, alerting = DEFAULT_ALERTING_METRICS) {
  if (!device?.has_reading) return null

  return METRICS.filter(m => alerting.includes(m)).reduce((acc, metric) => {
    const status = device[`${metric}_status`]
    if (!status || !(status in SEVERITY)) return acc
    return SEVERITY[status] > SEVERITY[acc] ? status : acc
  }, 'Safe')
}

/** Every ALERTING metric on this house that is not Safe, worst first. */
export function breachesOf(device, alerting = DEFAULT_ALERTING_METRICS) {
  return METRICS
    .filter(metric => alerting.includes(metric))
    .filter(metric => {
      const status = device[`${metric}_status`]
      return device[metric] !== null && (status === 'Warning' || status === 'Critical')
    })
    .map(metric => ({
      metric,
      status: device[`${metric}_status`],
      direction: device[`${metric}_direction`] ?? null,
      value: device[metric],
    }))
    .sort((a, b) => SEVERITY[b.status] - SEVERITY[a.status])
}

/** "35.0 °C" — null-safe, so a missing reading renders a dash, not "null". */
export function formatValue(metric, value) {
  if (value === null || value === undefined) return '—'
  const cfg = SENSOR_CONDITIONS[metric]
  return `${Number(value).toFixed(cfg.decimals)}${cfg.unit}`
}

/** The short table word for a metric's current state. */
export function wordFor(metric, status, direction) {
  const fn = SENSOR_CONDITIONS[metric]?.word?.[status]
  return fn ? fn(direction) : '—'
}

/** Bilingual "Too hot (Sobrang init)" for the dashboard alert cards. */
export function plainFor(metric, status, direction) {
  const fn = SENSOR_CONDITIONS[metric]?.plain?.[status]
  if (!fn) return null
  const [en, fil] = fn(direction)
  return `${en} — ${fil}`
}

/** Bilingual instruction for a breached metric. */
export function todoFor(metric, status, direction) {
  const fn = SENSOR_CONDITIONS[metric]?.todo?.[status]
  if (!fn) return null
  const [en, fil] = fn(direction)
  return `${en} (${fil})`
}
