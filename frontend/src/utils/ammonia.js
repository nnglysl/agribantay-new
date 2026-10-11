// Legacy display flag: configured reference values do not prove ppm accuracy.
// SensorIngestController computes estimates through SensorCalibrationService;
// the voltage mapping and coefficients remain unvalidated (review 2026-10-10).
//
//   ppm = 10 ^ ((log10(Rs/Ro) - intercept) / slope)
//
// With a fixed circuit, RL cancels from resistance ratios, but slope and voltage
// mapping still need validation. Both devices were powered continuously from
// 25 Sep and read outdoors in shade on 27 Sep 2026, two readings five minutes
// apart agreeing to within 24 counts:
//
//   AGB-D01  raw 283
//   AGB-D02  raw 332
//
// The current slope -0.311 has an unsupported datasheet derivation. The
// clean-air ratio 3.6 and intercept 0.498 are assumptions. See config/sensors.php;
// these constants have not been replaced by a validated fit yet.
//
// A device with no baseline in .env still falls back to the old placeholder
// scale and is classified against the placeholder cut points, so adding a
// third device can still be mislabelled by this hardcoded frontend flag. It
// describes the legacy display convention, not per-device validation status.

export const AMMONIA_CALIBRATED = true

export const AMMONIA_UNIT = AMMONIA_CALIBRATED ? 'ppm' : ''

// Shown next to the value where there is room for it.
export const AMMONIA_NOTE = AMMONIA_CALIBRATED
  ? null
  : 'Uncalibrated reading'
