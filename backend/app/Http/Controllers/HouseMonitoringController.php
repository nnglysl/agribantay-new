<?php

namespace App\Http\Controllers;

use App\Services\HouseMonitoringService;
use Illuminate\Http\Request;

class HouseMonitoringController extends Controller
{
    public function index(Request $request, int $farmId)
    {
        return response()->json(['success' => true, 'data' => app(HouseMonitoringService::class)->snapshot($request->user(), $farmId)]);
    }

    public function history(Request $request, int $farmId)
    {
        $filters = $request->validate(['poultry_house_id' => ['nullable', 'regex:/^(unknown|[1-9][0-9]*)$/'],
            'sensor_id' => ['nullable', 'regex:/^(unknown|[1-9][0-9]*)$/'],
            'condition' => 'nullable|in:Safe,Warning,Critical,Incomplete Data,No Readings Yet',
            'query_key' => 'nullable|string|max:2048',
            'assignment_event_id' => ['nullable', 'regex:/^(unknown|[1-9][0-9]*)$/'],
            'view' => 'nullable|in:daily,hourly,individual',
            'page' => 'nullable|integer|min:1', 'per_page' => 'nullable|integer|in:10,25,50',
            'from' => 'nullable|date_format:Y-m-d', 'to' => 'nullable|date_format:Y-m-d'.($request->filled('from') ? '|after_or_equal:from' : '')]);

        return response()->json(['success' => true, 'data' => app(HouseMonitoringService::class)->history($request->user(), $farmId, $filters)]);
    }
}
