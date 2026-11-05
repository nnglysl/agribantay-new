<?php

namespace App\Services;

use App\Models\{Farm, FarmControlDocument, Inspection, MaintenanceLog, ManureDisposalRecord, SensorReading, ServiceRequest, AlertHistory, User};
use App\Support\{LocalTime, ServiceTypes};
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\{Crypt, DB, Gate, Schema};
use Illuminate\Validation\ValidationException;

/** Read-only DTOs for one farm. Never serialize a model or a private file URL. */
class FarmPrintService
{
    public const SECTIONS = [
        'farm' => 'Farm Information', 'owner' => 'Farm Owner Information',
        'monitoring' => 'Monitoring Summary', 'readings' => 'Sensor Reading History',
        'assignments' => 'Device Assignment History', 'inspections' => 'Inspection Records',
        'cleanouts' => 'Manure Clean-out Records', 'compliance' => 'Current Clean-out Compliance',
        'disposal' => 'Manure Disposal Records', 'services' => 'Service Request Records',
        'documents' => 'Control Document Records', 'alerts' => 'Alert History',
    ];
    private const STREAMS = ['readings', 'inspections', 'cleanouts', 'disposal', 'services', 'documents', 'alerts'];

    public function identity(Farm $farm): array
    {
        return ['id' => $farm->id, 'farm_name' => $farm->farm_name, 'owner_name' => $farm->user?->full_name ?: $farm->owner_name,
            'barangay' => $farm->barangay];
    }

    public function options(Farm $farm): array
    {
        return ['farm' => $this->identity($farm), 'sections' => collect(self::SECTIONS)->map(fn ($label, $key) => [
            'key' => $key, 'label' => $label, 'available' => $key !== 'documents' || Schema::hasTable('farm_control_documents'),
            'reason' => $key === 'documents' && !Schema::hasTable('farm_control_documents') ? 'Control Documents setup is pending; this source cannot be printed yet.' : null,
        ])->values(), 'batch_size' => config('farm_print.batch_size'), 'max_preview_rows' => config('farm_print.max_preview_rows')];
    }

    public function prepare(Farm $farm, User $actor, array $input): array
    {
        return DB::transaction(function () use ($farm, $actor, $input) {
            if (in_array('documents', $input['sections'], true)) $this->documentsAvailable($farm);
            $now = now();
            $context = ['farm_id' => $farm->id, 'actor_id' => $actor->id, 'role' => $actor->role,
                'cutoff' => $now->format('Y-m-d H:i:s.u'), 'expires' => $now->copy()->addMinutes(config('farm_print.ticket_minutes'))->timestamp,
                'range' => ['mode' => $input['date_mode'], 'from' => $input['from'] ?? null, 'to' => $input['to'] ?? null],
                'sections' => $input['sections'], 'streams' => []];
            $snapshots = [];
            if (in_array('farm', $input['sections'], true)) $snapshots['farm'] = $this->identity($farm) + [
                'address' => $farm->address, 'farm_size' => $farm->farm_size, 'num_birds' => $farm->num_birds,
                'registration_date' => LocalTime::date($farm->created_at), 'registration_status' => $farm->status,
            ];
            if (in_array('owner', $input['sections'], true)) $snapshots['owner'] = [
                'name' => $farm->user?->full_name ?: $farm->owner_name,
                'mobile_number' => $farm->user?->mobile_number ?? $farm->mobile_number, 'email' => $farm->user?->email,
            ];
            if (in_array('compliance', $input['sections'], true)) $snapshots['compliance'] = app(MaintenanceStatusService::class)->getStatus($farm);
            if (in_array('monitoring', $input['sections'], true)) {
                $snapshots['monitoring'] = $this->monitoring($farm);
                $snapshots['monitoring_assessment'] = app(MonitoringAssessmentService::class)->farm($farm);
            }
            if (in_array('assignments', $input['sections'], true)) {
                $snapshots['assignments'] = collect(app(MonitoringDeploymentService::class)->forFarm($farm->id))
                    ->filter(fn ($period) => $this->assignmentInRange($period, $context['range'], $now))
                    ->map(fn ($p) => ['device_name' => $p['device_name'], 'assigned_at' => LocalTime::dateTime($p['assigned_at']),
                        'unassigned_at' => LocalTime::dateTime($p['unassigned_at']), 'status' => $p['is_current'] ? 'Currently assigned' : 'Previous assignment',
                        'dates_verified' => $p['assignment_dates_verified'], 'note' => $p['period_note'],
                        'first_reading_at' => LocalTime::dateTime($p['first_reading_at']), 'last_reading_at' => LocalTime::dateTime($p['last_reading_at'])])->values()->all();
            }
            if (in_array('documents', $input['sections'], true)) $context['latest_documents'] = FarmControlDocument::where('farm_id', $farm->id)
                ->selectRaw('MAX(id) AS id')->groupBy('category')->pluck('id')->all();
            foreach (array_intersect(self::STREAMS, $input['sections']) as $section) {
                $query = $this->query($section, $context);
                $context['streams'][$section] = ['total' => (clone $query)->count(), 'max_id' => (int) ((clone $query)->max('id') ?? 0)];
            }
            $total = array_sum(array_column($context['streams'], 'total')) + count($snapshots['assignments'] ?? []);
            if ($total > config('farm_print.max_preview_rows')) throw ValidationException::withMessages([
                'sections' => 'This selection contains '.$total.' rows. Browser preview supports up to '.config('farm_print.max_preview_rows').
                    ' rows per document to protect browser memory. Narrow the date range or select fewer sections; no records were truncated.',
            ]);
            return ['farm' => $this->identity($farm), 'generated_at' => $now->toIso8601String(),
                'generated_at_display' => LocalTime::dateTime($now).' Asia/Manila', 'generated_by' => $actor->full_name,
                'range' => $context['range'], 'sections' => $input['sections'], 'snapshots' => $snapshots,
                'streams' => $context['streams'], 'total_rows' => $total, 'batch_size' => config('farm_print.batch_size'),
                // The ticket exists only in API memory, never the document. It
                // fixes filters/high-watermarks and is bound to actor + role.
                'ticket' => Crypt::encryptString(json_encode($context, JSON_THROW_ON_ERROR))];
        });
    }

    public function batch(Farm $farm, User $actor, string $ticket, string $section, int $after): array
    {
        try { $context = json_decode(Crypt::decryptString($ticket), true, 512, JSON_THROW_ON_ERROR); }
        catch (\Throwable) { abort(422, 'Invalid print preview. Generate a new preview.'); }
        abort_unless(($context['farm_id'] ?? null) === $farm->id && ($context['actor_id'] ?? null) === $actor->id
            && ($context['role'] ?? null) === $actor->role, 403, 'This preview belongs to another farm or session.');
        abort_unless(($context['expires'] ?? 0) >= now()->timestamp, 409, 'Print preview expired. Generate a new preview.');
        abort_unless(in_array($section, self::STREAMS, true) && isset($context['streams'][$section]), 422, 'Section not selected for this preview.');
        if ($section === 'documents') $this->documentsAvailable($farm);
        $max = $context['streams'][$section]['max_id'];
        $rows = $this->query($section, $context)->where('id', '>', $after)->where('id', '<=', $max)
            ->orderBy('id')->limit(config('farm_print.batch_size') + 1)->get();
        $more = $rows->count() > config('farm_print.batch_size');
        $rows = $rows->take(config('farm_print.batch_size'));
        return ['farm_id' => $farm->id, 'section' => $section, 'items' => $rows->map(fn ($row) => $this->row($section, $row, $context))->values(),
            'next_after_id' => (int) ($rows->last()?->id ?? $after), 'has_more' => $more, 'expected_total' => $context['streams'][$section]['total']];
    }

    private function documentsAvailable(Farm $farm): void
    {
        Gate::authorize('viewAny', [FarmControlDocument::class, $farm]);
        abort_unless(Schema::hasTable('farm_control_documents'), 503, 'Control Documents setup is pending. Exclude that section or contact system support.');
    }

    private function query(string $section, array $context): Builder
    {
        [$model, $column, $dateOnly] = match ($section) {
            'readings' => [SensorReading::class, 'created_at', false], 'inspections' => [Inspection::class, 'scheduled_at', false],
            'cleanouts' => [MaintenanceLog::class, 'performed_at', true], 'disposal' => [ManureDisposalRecord::class, 'disposal_date', true],
            'services' => [ServiceRequest::class, 'created_at', false], 'documents' => [FarmControlDocument::class, 'created_at', false],
            'alerts' => [AlertHistory::class, 'triggered_at', false],
        };
        // Existence is frozen by ID high-watermarks, not a guessed creation
        // date. All Dates must retain legacy rows with missing timestamps.
        $query = $model::where('farm_id', $context['farm_id']);
        if (in_array($section, ['readings', 'alerts'], true)) $query->with('sensor:id,label,sensor_code');
        if ($section === 'inspections') $query->with(['assignedTo:id,first_name,last_name', 'scheduledBy:id,first_name,last_name']);
        if ($section === 'services') {
            $query->whereIn('service_type', $context['role'] === 'super_admin' ? array_merge(ServiceTypes::VET, ServiceTypes::RETIRED) : ServiceTypes::RETIRED);
            $query->with('acceptedBy:id,first_name,last_name');
        }
        if ($context['range']['mode'] === 'custom') {
            $from = $context['range']['from']; $to = $context['range']['to'];
            if (!$dateOnly) {
                $from = Carbon::parse($from, 'Asia/Manila')->startOfDay()->utc()->format('Y-m-d H:i:s');
                $to = Carbon::parse($to, 'Asia/Manila')->addDay()->startOfDay()->utc()->format('Y-m-d H:i:s');
                $query->where($column, '>=', $from)->where($column, '<', $to);
            } else {
                $query->whereBetween($column, [$from, $to]);
            }
        }
        return $query;
    }

    private function row(string $section, $row, array $context): array
    {
        return ['id' => $row->id] + match ($section) {
            'readings' => ['recorded_at' => LocalTime::dateTime($row->created_at), 'device_name' => $row->sensor?->device_name,
                'ammonia' => $row->ammonia, 'moisture' => $row->moisture, 'temperature' => $row->temperature, 'humidity' => $row->humidity,
                'conditions' => ['ammonia' => $row->ammonia_status, 'moisture' => $row->moisture_status, 'temperature' => $row->temperature_status, 'humidity' => $row->humidity_status],
                'primary_assessment' => app(MonitoringAssessmentService::class)->reading($row), 'is_mock' => (bool) $row->is_mock],
            'inspections' => ['scheduled_at' => LocalTime::dateTime($row->scheduled_at), 'completed_at' => LocalTime::dateTime($row->completed_at),
                'inspection_type' => $row->inspection_type, 'status' => $row->status, 'assigned_staff' => $row->assignedTo?->full_name,
                'scheduled_by' => $row->scheduledBy?->full_name, 'findings' => $row->findings, 'notes' => $row->notes],
            'cleanouts' => ['performed_at' => $row->performed_at?->format('M d, Y'), 'maintenance_type' => $row->maintenance_type, 'notes' => $row->notes],
            'disposal' => ['disposal_date' => $row->disposal_date?->format('M d, Y'), 'method' => $row->disposal_method, 'quantity' => $row->quantity, 'buyer_name' => $row->buyer_name, 'notes' => $row->notes],
            'services' => ['request_number' => $row->request_number, 'service_type' => $row->service_type, 'is_retired' => ServiceTypes::isRetired($row->service_type),
                'requested_at' => LocalTime::dateTime($row->created_at), 'scheduled_at' => LocalTime::dateTime($row->scheduled_at),
                'completed_at' => LocalTime::dateTime($row->completed_at), 'status' => $row->status, 'handled_by' => $row->acceptedBy?->full_name, 'notes' => $row->notes, 'completion_notes' => $row->completion_notes],
            'documents' => ['document_type' => FarmControlDocument::CATEGORIES[$row->category] ?? $row->category,
                'file_name' => $row->original_name, 'uploaded_at' => LocalTime::dateTime($row->created_at), 'uploaded_by' => $row->uploader_name,
                'status' => in_array($row->id, $context['latest_documents'], false) ? 'On File' : 'Previous Submission'],
            'alerts' => ['triggered_at' => LocalTime::dateTime($row->triggered_at), 'resolved_at' => LocalTime::dateTime($row->resolved_at),
                'device_name' => $row->sensor?->device_name, 'metric' => $row->sensor_type, 'value' => $row->value, 'status' => $row->status],
        };
    }

    private function monitoring(Farm $farm): array
    {
        return $farm->sensors()->orderBy('id')->get()->map(function ($sensor) use ($farm) {
            $reading = app(CurrentMonitoringService::class)->latest($sensor, $farm->id);
            $online = $sensor->isActive() && $sensor->isOnline();
            $recent = $reading && $reading->created_at->gt(now()->subMinutes(config('sensors.offline_after_minutes', 3)));
            $assessment = app(MonitoringAssessmentService::class)->device($sensor, $reading);
            return ['device_name' => $sensor->device_name, 'connectivity' => $online ? 'Online' : 'Offline',
                'reading_context' => !$reading ? 'No readings in this assignment' : ($online && $recent ? 'Current assignment, recent reading' : 'Historical last reading; not current conditions'),
                'current_condition' => $assessment['condition'],
                'primary_assessment' => $assessment,
                'last_reading_at' => LocalTime::dateTime($reading?->created_at), 'ammonia' => $reading?->ammonia, 'moisture' => $reading?->moisture,
                'temperature' => $reading?->temperature, 'humidity' => $reading?->humidity];
        })->all();
    }

    private function assignmentInRange(array $period, array $range, Carbon $now): bool
    {
        if ($range['mode'] === 'all') return true;
        $start = $period['assigned_at'] ?? $period['first_reading_at'];
        $end = $period['unassigned_at'] ?? ($period['is_current'] ? $now : $period['last_reading_at']);
        if (!$start || !$end) return false;
        return Carbon::parse($start)->lte(Carbon::parse($range['to'], 'Asia/Manila')->endOfDay())
            && Carbon::parse($end)->gte(Carbon::parse($range['from'], 'Asia/Manila')->startOfDay());
    }
}
