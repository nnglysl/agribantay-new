<?php

namespace App\Http\Controllers\Farmer\Concerns;

use App\Models\Farm;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * Every Farmer-facing controller resolves "the farm this request is
 * about" the same way: scoped to farms owned by the authenticated user,
 * narrowed to a specific farm_id when the request supplies one. The
 * where('user_id', Auth::id()) clause always applies, whether or not
 * farm_id is present — a farmer cannot reach another owner's farm by
 * passing a different farm_id, since a mismatched id simply resolves
 * to no farm at all rather than someone else's.
 *
 * Falls back to the account's first farm (ordered by id, for a stable
 * choice) when no farm_id is given, so a single-farm account — still
 * the common case — behaves exactly as before.
 */
trait ResolvesFarm
{
    private function farmQuery(Request $request)
    {
        $query = Farm::where('user_id', Auth::id());

        if ($farmId = $request->input('farm_id')) {
            $query->where('id', $farmId);
        }

        return $query->orderBy('id');
    }

    private function resolveFarm(Request $request): ?Farm
    {
        return $this->farmQuery($request)->first();
    }

    private function resolveFarmOrFail(Request $request): Farm
    {
        return $this->farmQuery($request)->firstOrFail();
    }
}
