<?php

namespace App\Http\Controllers;

use App\Models\Sensor;
use App\Models\SensorReading;
use App\Services\FarmStatusService;
use App\Services\AlertHistoryService;
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

        $farm = $sensor->farm;

        if (!$farm) {
            return response()->json(['success' => false, 'message' => 'Sensor is not linked to a farm.'], 422);
        }

        // NOTE: these conversions are placeholders. Calibrate against a real
        // reference (ammonia meter, known-wet/dry soil) before trusting the values.
        $ammonia = round(($request->ammonia_raw / 4095) * 100, 2);

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
        // the farmer dashboard. Recording it as unknown keeps a broken sensor
        // from generating fabricated alerts.
        $soilRaw    = (int) $request->soil_raw;
        $soilFaulty = $soilRaw <= 0;

        $moisture       = $soilFaulty ? null : round(100 - ($soilRaw / 4095) * 100, 2);
        $moistureStatus = $soilFaulty ? 'Unknown' : $this->status($moisture, 60, 70);

        $reading = SensorReading::create([
            'farm_id'            => $farm->id,
            'sensor_id'          => $sensor->id,
            'ammonia'            => $ammonia,
            'ammonia_status'     => $this->status($ammonia, 25, 35),
            'temperature'        => $request->temperature,
            'temperature_status' => $this->status($request->temperature, 32, 35, true),
            'humidity'           => $request->humidity,
            'humidity_status'    => $this->status($request->humidity, 70, 80),
            'moisture'           => $moisture,
            'moisture_status'    => $moistureStatus,
            'is_mock'            => false,
        ]);

        // Bumps the sensor's updated_at — doubles as a cheap "last seen"
        // timestamp without needing a dedicated column.
        $sensor->touch();

        // Objective 5.2 — one call per sensor type, opens/updates/closes
        // the running incident history. Separate from the SMS alert
        // pipeline below (or wherever that already lives) — this never
        // notifies anyone, it only ever records.
        $alertHistory = app(AlertHistoryService::class);
        $alertHistory->recordReading($farm->id, 'ammonia', $reading->ammonia_status, $reading->ammonia);
        $alertHistory->recordReading($farm->id, 'temperature', $reading->temperature_status, $reading->temperature);
        $alertHistory->recordReading($farm->id, 'humidity', $reading->humidity_status, $reading->humidity);

        // A faulty sensor shouldn't open or close moisture incidents — an
        // unknown reading is neither an alert nor a recovery, so the running
        // incident (if any) is left untouched until real data returns.
        if (!$soilFaulty) {
            $alertHistory->recordReading($farm->id, 'moisture', $moistureStatus, $moisture);
        }

        app(FarmStatusService::class)->syncStatus($farm);

        return response()->json(['success' => true, 'data' => $reading]);
    }

    private function status(float $value, float $warningAt, float $criticalAt, bool $isTemperature = false): string
    {
        if ($isTemperature) {
            if ($value > $criticalAt || $value < 18) return 'Critical';
            if ($value > $warningAt || $value < 22) return 'Warning';
            return 'Normal';
        }

        if ($value >= $criticalAt) return 'Critical';
        if ($value >= $warningAt) return 'Warning';
        return 'Normal';
    }
}