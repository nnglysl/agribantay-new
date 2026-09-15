<?php

namespace App\Http\Controllers\Farmer;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Farmer\Concerns\ResolvesFarm;
use App\Models\ManureDisposalRecord;
use Illuminate\Http\Request;

class DisposalController extends Controller
{
    use ResolvesFarm;

    public function index(Request $request)
    {
        $farm = $this->resolveFarm($request);

        if (!$farm) {
            return response()->json(['success' => false, 'message' => 'No farm found for this account.'], 404);
        }

        $records = ManureDisposalRecord::where('farm_id', $farm->id)
            ->latest('disposal_date')
            ->limit(10)
            ->get()
            ->map(fn($r) => [
                'id'                   => $r->id,
                'disposal_method'      => $r->disposal_method,
                'other_method_detail'  => $r->other_method_detail,
                'quantity'             => $r->quantity,
                'buyer_name'           => $r->buyer_name,
                'disposal_date'        => $r->disposal_date->format('M d, Y'),
                'notes'                => $r->notes,
            ]);

        return response()->json(['success' => true, 'data' => $records]);
    }

    public function store(Request $request)
    {
        $farm = $this->resolveFarm($request);

        if (!$farm) {
            return response()->json(['success' => false, 'message' => 'No farm found for this account.'], 404);
        }

        $request->validate([
            'disposal_method'      => 'required|in:Sold,Composted on-site,Other',
            'other_method_detail'  => 'required_if:disposal_method,Other|nullable|string|max:255',
            'quantity'             => 'required|numeric|min:0',
            'buyer_name'           => 'nullable|string|max:255',
            'disposal_date'        => 'required|date|before_or_equal:today',
            'notes'                => 'nullable|string|max:1000',
        ]);

        $record = ManureDisposalRecord::create([
            'farm_id'              => $farm->id,
            'disposal_method'      => $request->disposal_method,
            'other_method_detail'  => $request->disposal_method === 'Other' ? $request->other_method_detail : null,
            'quantity'             => $request->quantity,
            'buyer_name'           => $request->buyer_name,
            'disposal_date'        => $request->disposal_date,
            'notes'                => $request->notes,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Disposal record logged successfully.',
            'data'    => $record,
        ]);
    }
}