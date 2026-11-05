<?php

namespace Tests\Feature;

use App\Models\AlertHistory;
use App\Models\SensorReading;
use App\Services\CurrentMonitoringService;
use App\Services\DeviceAssignmentService;
use Illuminate\Support\Facades\Http;
use Tests\Support\PhaseOneCorrectionTestCase;

class DelayedPayloadAttributionTest extends PhaseOneCorrectionTestCase
{
    public function test_inactive_and_unassigned_drain_stages_reject_old_payloads_without_creating_conditions(): void
    {
        $old = $this->ingest();
        $attributes = $old->getAttributes();
        $queued = $this->payload($this->device, true);
        $this->putJson('/api/admin/sensors/'.$this->device->id, ['status' => 'Inactive'])->assertOk();
        $this->postJson('/api/sensor-readings', $queued)->assertStatus(403);
        app(DeviceAssignmentService::class)->change($this->device->id, null);
        app(DeviceAssignmentService::class)->change($this->device->id, $this->b->id);
        $this->postJson('/api/sensor-readings', $queued)->assertStatus(403);
        $this->assertNull(app(CurrentMonitoringService::class)->latest($this->device->fresh()));
        $this->assertSame(1, SensorReading::count());
        $this->assertSame(0, AlertHistory::count());
        $this->assertEquals($attributes, $old->fresh()->getAttributes());
        Http::assertNothingSent();
    }

    public function test_legacy_payload_after_activation_proves_receipt_time_only_and_cannot_prove_collection_location(): void
    {
        // Explicit limitation test: no assignment epoch/sample ID is present.
        // The server cannot distinguish a retry from a fresh identical sample.
        $queuedAtA = $this->payload($this->device);
        $old = $this->ingest();
        app(DeviceAssignmentService::class)->change($this->device->id, $this->b->id);
        $response = $this->postJson('/api/sensor-readings', $queuedAtA)->assertOk();
        $this->assertSame($this->b->id, $response->json('data.farm_id'));
        $this->assertSame($this->a->id, $old->fresh()->farm_id);
        $this->assertSame(2, SensorReading::count());
        Http::assertNothingSent();
    }
}
