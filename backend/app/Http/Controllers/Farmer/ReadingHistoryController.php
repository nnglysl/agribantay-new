<?php

namespace App\Http\Controllers\Farmer;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Farmer\Concerns\ResolvesFarm;
use App\Services\ReadingHistoryService;
use Illuminate\Http\Request;

class ReadingHistoryController extends Controller
{
    use ResolvesFarm;

    public function index(Request $request)
    {
        $farm = $this->resolveFarmOrFail($request);

        $hours = (int) $request->input('hours', ReadingHistoryService::DEFAULT_HOURS);
        $hours = max(1, min($hours, 24 * 7));

        return response()->json([
            'success' => true,
            'data'    => [
                'hours'   => $hours,
                'devices' => app(ReadingHistoryService::class)->forFarm($farm->id, $hours),
            ],
        ]);
    }
}
