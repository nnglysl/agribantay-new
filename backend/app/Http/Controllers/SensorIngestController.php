<?php

namespace App\Http\Controllers;

use App\Models\Farm;
use App\Models\SensorReading;
use App\Services\FarmStatusService;
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

        $farm = Farm::where('device_key', $request->device_key)->first();

        if (!$farm) {
            return response()->json(['success' => false, 'message' => 'Unknown device.'], 401);
        }

        // NOTE: these conversions are placeholders. Calibrate against a real
        // reference (ammonia meter, known-wet/dry soil) before trusting the values.
        $ammonia = round(($request->ammonia_raw / 4095) * 100, 2);
        $moisture = round(100 - ($request->soil_raw / 4095) * 100, 2);

        $reading = SensorReading::create([
            'farm_id'            => $farm->id,
            'ammonia'            => $ammonia,
            'ammonia_status'     => $this->status($ammonia, 25, 35),
            'temperature'        => $request->temperature,
            'temperature_status' => $this->status($request->temperature, 32, 35, true),
            'humidity'           => $request->humidity,
            'humidity_status'    => $this->status($request->humidity, 70, 80),
            'moisture'           => $moisture,
            'moisture_status'    => $this->status($moisture, 60, 70),
            'is_mock'            => false,
        ]);

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