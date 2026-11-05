<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Farm;
use App\Services\FarmPrintService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class FarmPrintController extends Controller
{
    private function farm(Request $request, string $id): Farm
    {
        abort_unless(in_array($request->user()?->role, ['admin', 'super_admin'], true), 403);
        $farmId = filter_var($id, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        abort_if($farmId === false, 404);
        return Farm::with('user')->findOrFail($farmId);
    }

    public function options(Request $request, string $id, FarmPrintService $service)
    {
        return response()->json(['data' => $service->options($this->farm($request, $id))])->header('Cache-Control', 'private, no-store');
    }

    public function preview(Request $request, string $id, FarmPrintService $service)
    {
        $farm = $this->farm($request, $id);
        $input = $request->validate(['farm_id' => 'prohibited', 'sections' => 'required|array|min:1|max:12',
            'sections.*' => ['required', 'distinct', Rule::in(array_keys(FarmPrintService::SECTIONS))],
            'date_mode' => ['required', Rule::in(['all', 'custom'])],
            'from' => 'required_if:date_mode,custom|nullable|date_format:Y-m-d',
            'to' => 'required_if:date_mode,custom|nullable|date_format:Y-m-d|after_or_equal:from']);
        if ($input['date_mode'] === 'all') { $input['from'] = null; $input['to'] = null; }
        return response()->json(['data' => $service->prepare($farm, $request->user(), $input)])->header('Cache-Control', 'private, no-store');
    }

    public function batch(Request $request, string $id, FarmPrintService $service)
    {
        $farm = $this->farm($request, $id);
        $input = $request->validate(['ticket' => 'required|string|max:30000', 'section' => 'required|string', 'after_id' => 'required|integer|min:0']);
        return response()->json(['data' => $service->batch($farm, $request->user(), $input['ticket'], $input['section'], $input['after_id'])])->header('Cache-Control', 'private, no-store');
    }
}
