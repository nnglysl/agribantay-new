// The MQ-137 is calibrated: each device has its own clean-air baseline, and
// SensorIngestController converts the raw 12-bit ADC value into real ppm
// through App\Services\SensorCalibrationService.
//
//   ppm = 10 ^ ((log10(Rs/Ro) - intercept) / slope)
//
// The load resistor cancels out of the Rs/Ro ratio, so only the clean-air
// baseline had to be measured. Both devices were powered continuously from
// 25 Sep and read outdoors in shade on 27 Sep 2026, two readings five minutes
// apart agreeing to within 24 counts:
//
//   AGB-D01  raw 283
//   AGB-D02  raw 332
//
// The remaining constants (clean-air ratio 3.6, slope -0.263, intercept 0.42)
// come from the Hanwei MQ-137 datasheet curve — see config/sensors.php, which
// records the source of every number.
//
// A device with no baseline in .env still falls back to the old placeholder
// scale and is classified against the placeholder cut points, so adding a
// third device does not silently mislabel its readings as ppm. This flag
// describes the fleet as shipped; it is not read per device.

export const AMMONIA_CALIBRATED = true

export const AMMONIA_UNIT = AMMONIA_CALIBRATED ? 'ppm' : ''

// Shown next to the value where there is room for it.
export const AMMONIA_NOTE = AMMONIA_CALIBRATED
  ? null
  : 'Uncalibrated reading'
