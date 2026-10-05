<?php

namespace App\Http\Controllers;

use App\Models\Sensor;
use App\Models\SensorReading;
use App\Services\FarmStatusService;
use App\Services\AlertHistoryService;
use App\Services\MoistureThresholdService;
use App\Services\SensorCalibrationService;
use Illuminate\Http\Request;

class SensorIngestController extends Controller
{
    public function store(Request $request)
    {
        $request->validate([
            'device_key'    => 'required|string',
            'ammonia_raw'   => 'required|numeric',
            'temperature'   => 'required|numeric',
            'humidity'      => 'required|numeric',
            'soil_raw'      => 'required|numeric',
        ]);

        $sensor = Sensor::where('device_key', $request->device_key)->first();

        if (!$sensor) {
            return response()->json(['success' => false, 'message' => 'Unknown device.'], 401);
        }

        // Devices are rotated between farms, so the same device_key must be
        // gated on its CURRENT state — an Admin-deactivated unit or one that
        // has been unassigned (in transit between farms) is known but must
        // not create readings. Neither case bumps last_seen_at.
        if (!$sensor->isActive()) {
            return response()->json(['success' => false, 'message' => 'Device is inactive.'], 403);
        }

        $farm = $sensor->farm;

        if (!$farm) {
            return response()->json(['success' => false, 'message' => 'Device is not assigned to a farm.'], 409);
        }

        $calibration = app(SensorCalibrationService::class);

        // Real ppm once a clean-air baseline exists in config; otherwise the
        // documented placeholder scale, which the UI labels as uncalibrated.
        $ammoniaPpm = $calibration->ammoniaPpm((int) $request->ammonia_raw, $sensor->device_name);
        $ammonia = $ammoniaPpm ?? round(($request->ammonia_raw / 4095) * 100, 2);

        // The cut points must follow the SCALE, not the metric. A calibrated
        // device reports ppm and is judged against the RRL (15/25); an
        // uncalibrated one reports the placeholder scale, where those numbers
        // mean nothing, and keeps its original cuts. Classifying ppm against
        // the placeholder pair would have called 30 ppm - a level the RRL
        // calls Critical - merely Warning.
        $ammoniaCuts = config($ammoniaPpm === null ? 'sensors.ammonia_placeholder' : 'sensors.ammonia_ppm');

        // A raw ADC value of exactly 0 means the pin is reading no signal at
        // all — the probe is unplugged, unpowered, or wired to the wrong GPIO.
        // A working soil probe in dry air reads HIGH (dry soil = high
        // resistance), and even a floating, unconnected pin produces drifting
        // noise rather than a stable 0. So a hard 0 is a hardware fault, not a
        // measurement.
        //
        // This matters because the moisture conversion is inverted (low raw =
        // wet). Treating a faulty 0 as real would compute 100% moisture and
        // flag the farm Critical, which then cascades into false drainage
        // recommendations and unnecessary fly-control service suggestions on
        // the farmer dashboard. Storing a null moisture keeps a broken sensor
        // from generating fabricated alerts.
        //
        // moisture_status is a strict ENUM('Safe','Warning','Critical') — there
        // is no fourth "unknown" value and inserting one aborts the whole
        // request under MySQL strict mode. So while the probe is faulty the
        // status is carried forward from the farm's previous reading (Safe if
        // there is none): a fault is neither an alert nor a recovery, which is
        // exactly how the alert-history call below already treats it (the
        // running moisture incident, if any, is left open until real data
        // returns). The stored moisture value itself stays null.
        $soilRaw    = (int) $request->soil_raw;
        $soilFaulty = $soilRaw <= 0;

        // Classify on the RAW computed percentage; the 2-decimal rounding
        // below is only for the decimal(8,2) column / display and must
        // never be what decides Safe/Warning/Critical (thresholds live in
        // config/sensors.php via MoistureThresholdService).
        //
        // Calibrated two-point conversion when the probe's own air/water
        // readings are configured; otherwise the placeholder below, which
        // assumes raw 4095 is bone dry. That assumption is wrong for every
        // capacitive probe — they read roughly 2500-3200 in open air — so it
        // reports ~35-40% for a probe sitting on a table and has been
        // tripping Critical on a farm with no wet manure at all.
        $moistureRaw = $soilFaulty
            ? null
            : ($calibration->moisturePercent($soilRaw, $sensor->device_name) ?? 100 - ($soilRaw / 4095) * 100);
        $moisture    = $soilFaulty ? null : round($moistureRaw, 2);

        if ($soilFaulty) {
            $previous = SensorReading::where('farm_id', $farm->id)->latest()->value('moisture_status');
            $moistureStatus = $previous ?: 'Safe';
        } else {
            $moistureStatus = app(MoistureThresholdService::class)->classify($moistureRaw);
        }

        // farm_id is copied from the device's CURRENT assignment at this
        // moment and never rewritten — when the device is later moved to
        // another farm, this reading stays with the farm it was collected at.
        $reading = SensorReading::create([
            'farm_id'            => $farm->id,
            'sensor_id'          => $sensor->id,
            'ammonia'            => $ammonia,
            'ammonia_status'     => $this->status($ammonia, $ammoniaCuts['warning'], $ammoniaCuts['critical']),
            'temperature'        => $request->temperature,
            'temperature_status' => $this->twoSidedStatus($request->temperature, 'temperature'),
            'humidity'           => $request->humidity,
            'humidity_status'    => $this->twoSidedStatus($request->humidity, 'humidity'),
            'moisture'           => $moisture,
            'moisture_status'    => $moistureStatus,
            'is_mock'            => false,
        ]);

        // Only an accepted reading counts as communication — rejected
        // requests above never reach this line. Drives Online / Offline.
        $sensor->forceFill(['last_seen_at' => now()])->save();

        // Objective 5.2 — one call per sensor type, opens/updates/closes
        // the running incident history. Separate from the SMS alert
        // pipeline below (or wherever that already lives) — this never
        // notifies anyone, it only ever records.
        // $sensor->id is passed through so each poultry house keeps its own
        // running incident — without it, two houses on the same farm shared a
        // single "Temperature Critical" row and one recovering closed both.
        $alertHistory = app(AlertHistoryService::class);
        $alerting = config('sensors.alerting_metrics', ['ammonia']);

        $values = [
            'ammonia'     => [$reading->ammonia_status, $reading->ammonia],
            'temperature' => [$reading->temperature_status, $reading->temperature],
            'humidity'    => [$reading->humidity_status, $reading->humidity],
            // A faulty probe shouldn't open or close moisture incidents — an
            // unknown reading is neither an alert nor a recovery, so the
            // running incident is left untouched until real data returns.
            'moisture'    => $soilFaulty ? null : [$moistureStatus, $moisture],
        ];

        foreach ($values as $metric => $pair) {
            if ($pair === null) {
                continue;
            }

            if (in_array($metric, $alerting, true)) {
                $alertHistory->recordReading($farm->id, $metric, $pair[0], $pair[1], null, $sensor->id);
                continue;
            }

            // Demoted to advisory. Any incident this metric opened while it
            // still raised alerts would otherwise sit "ongoing" forever,
            // because nothing is left to record its recovery. Closing it on
            // the next reading retires it honestly instead of deleting it.
            $alertHistory->closeOpenIncidents($farm->id, $metric, $sensor->id);
        }

        app(FarmStatusService::class)->syncStatus($farm);

        return response()->json(['success' => true, 'data' => $reading]);
    }

    /**
     * Temperature and humidity are harmful at both extremes, so each is
     * classified against four cut points from config/sensors.php rather than
     * a single warning/critical pair. See that file for the RRL sources.
     *
     * The bands are contiguous — every value lands in exactly one — and a
     * value sitting on a critical cut reads Critical, matching the >=
     * convention MoistureThresholdService already uses.
     */
    private function twoSidedStatus(float $value, string $metric): string
    {
        $t = config("sensors.$metric");

        if ($value < $t['low_critical'] || $value >= $t['high_critical']) {
            return 'Critical';
        }

        if ($value < $t['low_safe'] || $value > $t['high_safe']) {
            return 'Warning';
        }

        return 'Safe';
    }

    /**
     * Single-sided classification: higher is worse, no low-end risk.
     * Still used for the placeholder ammonia scale — see the ammonia note in
     * config/sensors.php for why that one is not on research thresholds yet.
     */
    private function status(float $value, float $warningAt, float $criticalAt): string
    {
        if ($value >= $criticalAt) return 'Critical';
        if ($value >= $warningAt) return 'Warning';
        return 'Safe';
    }
}