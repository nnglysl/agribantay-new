<?php

namespace App\Http\Controllers\Farmer;

use App\Http\Controllers\Controller;
use App\Models\Farm;
use App\Models\ManureDisposalRecord;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class DisposalController extends Controller
{
    /**
     * Same "one farm per owner" assumption used throughout the
     * Farmer-side controllers (InsightController, MaintenanceController).
     */
    private function resolveFarm(): ?Farm
    {
        return Farm::where('user_id', Auth::id())->first();
    }

    public function index()
    {
        $farm = $this->resolveFarm();

        if (!$farm) {
            return response()->json(['success' => false, 'message' => 'No farm found for this account.'], 404);
        }

        $records = ManureDisposalRecord::where('farm_id', $farm->id)
            ->latest('disposal_date')
            ->limit(10)
            ->get()
            ->map(fn($r) => [
                'id'              => $r->id,
                'disposal_method' => $r->disposal_method,
                'quantity'        => $r->quantity,
                'buyer_name'      => $r->buyer_name,
                'disposal_date'   => $r->disposal_date->format('M d, Y'),
                'notes'           => $r->notes,
            ]);

        return response()->json(['success' => true, 'data' => $records]);
    }

    public function store(Request $request)
    {
        $farm = $this->resolveFarm();

        if (!$farm) {
            return response()->json(['success' => false, 'message' => 'No farm found for this account.'], 404);
        }

        $request->validate([
            'disposal_method' => 'required|in:Sold,Composted on-site,Other',
            'quantity'        => 'required|numeric|min:0',
            'buyer_name'      => 'nullable|string|max:255',
            'disposal_date'   => 'required|date|before_or_equal:today',
            'notes'           => 'nullable|string|max:1000',
        ]);

        $record = ManureDisposalRecord::create([
            'farm_id'         => $farm->id,
            'disposal_method' => $request->disposal_method,
            'quantity'        => $request->quantity,
            'buyer_name'      => $request->buyer_name,
            'disposal_date'   => $request->disposal_date,
            'notes'           => $request->notes,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Disposal record logged successfully.',
            'data'    => $record,
        ]);
    }
}