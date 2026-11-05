<?php

namespace Tests\Feature;

use App\Models\AlertHistory;
use App\Models\FarmSmsAlertState;
use App\Models\SmsLog;
use App\Services\DeviceAssignmentService;
use App\Services\FarmStatusService;
use Tests\Support\PhaseOneCorrectionTestCase;

class PartialRotationSmsTest extends PhaseOneCorrectionTestCase
{
    private function state(): FarmSmsAlertState
    {
        return FarmSmsAlertState::where('farm_id', $this->a->id)->firstOrFail();
    }

    public function test_two_critical_devices_keep_the_episode_and_clock_when_the_latest_device_leaves(): void
    {
        $other = $this->device('Correction D02', $this->a);
        $this->ingest($this->device, true);
        $initial = $this->state();
        $this->travel(1)->seconds();
        $last = $this->ingest($other, true);
        $old = AlertHistory::where('sensor_id', $other->id)->firstOrFail();
        $attributes = $old->getAttributes();
        $this->assertSame($last->id, $this->state()->last_reading_id);
        app(DeviceAssignmentService::class)->change($other->id, $this->b->id);
        $this->ingest($this->device, true);
        for ($i = 0; $i < 3; $i++) {
            app(FarmStatusService::class)->syncStatus($this->a->fresh());
        }
        $this->assertSame($initial->incident_token, $this->state()->incident_token);
        $this->assertTrue($initial->last_critical_sent_at->equalTo($this->state()->last_critical_sent_at));
        $this->assertSame(1, SmsLog::count());
        $this->assertEquals($attributes, $old->fresh()->getAttributes());
    }

    public function test_a_healthy_devices_departure_does_not_bypass_thirty_minutes_at_noon(): void
    {
        $other = $this->device('Correction D02', $this->a);
        $this->ingest($this->device, true); // 11:50 Manila
        $initial = $this->state()->last_critical_sent_at;
        $this->ingest($other);
        app(DeviceAssignmentService::class)->change($other->id, $this->b->id);
        $this->travel(10)->minutes(); // 12:00 reminder window, only ten minutes elapsed
        $this->ingest($this->device, true);
        $this->assertSame(1, SmsLog::count());
        $this->assertTrue($initial->equalTo($this->state()->last_critical_sent_at));
        $this->travel(19)->minutes();
        $this->ingest($this->device, true);
        $this->assertSame(1, SmsLog::count());
        $this->travel(1)->minutes(); // 12:20, exactly thirty minutes since success
        $this->ingest($this->device, true);
        $this->assertSame(2, SmsLog::count());
        $this->ingest($this->device, true);
        $this->assertSame(2, SmsLog::count());
    }

    public function test_partial_rotation_still_requires_complete_recovery_before_an_independent_critical_episode(): void
    {
        $other = $this->device('Correction D02', $this->a);
        $this->ingest($this->device, true);
        $this->ingest($other, true);
        $initial = $this->state()->incident_token;
        app(DeviceAssignmentService::class)->change($other->id, $this->b->id);
        for ($i = 0; $i < 2; $i++) {
            $this->ingest($this->device);
        }
        $this->assertNull($this->state()->resolved_at);
        $this->assertSame(1, SmsLog::count());
        $this->ingest($this->device);
        $this->assertNotNull($this->state()->resolved_at);
        $this->assertSame(2, SmsLog::count()); // One recovery
        app(FarmStatusService::class)->syncStatus($this->a->fresh());
        $this->assertSame(2, SmsLog::count());
        $this->ingest($this->device, true);
        $this->assertNotSame($initial, $this->state()->incident_token);
        $this->assertSame(3, SmsLog::count()); // New initial Critical is immediate
        $this->ingest($this->device, true);
        $this->assertSame(3, SmsLog::count());
    }
}
