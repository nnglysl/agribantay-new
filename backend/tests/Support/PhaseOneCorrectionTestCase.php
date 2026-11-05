<?php

namespace Tests\Support;

use App\Mail\OtpCodeMail;
use App\Models\Farm;
use App\Models\Sensor;
use App\Models\SensorReading;
use App\Models\User;
use App\Services\DeviceAssignmentService;
use Illuminate\Http\Client\Factory;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

abstract class PhaseOneCorrectionTestCase extends TestCase
{
    protected User $admin;

    protected User $owner;

    protected Farm $a;

    protected Farm $b;

    protected Sensor $device;

    protected function setUp(): void
    {
        parent::setUp();
        config(['database.connections.phase1_corrections' => ['driver' => 'sqlite', 'database' => ':memory:', 'foreign_key_constraints' => true],
            'cache.default' => 'array', 'sensors.alerting_metrics' => ['ammonia', 'moisture'],
            'services.gemini.api_key' => 'isolated-test', 'services.unisms.secret_key' => 'isolated-test',
            'services.unisms.base_url' => 'https://sms.test/api', 'sensors.offline_after_minutes' => 3,
            'sms_alerts.timezone' => 'Asia/Manila', 'sms_alerts.minimum_repeat_minutes' => 30,
            'sms_alerts.critical_reminder_times' => ['07:00', '12:00', '17:00'],
            'sms_alerts.reminder_window_minutes' => 30]);
        DB::setDefaultConnection('phase1_corrections');
        DB::purge('phase1_corrections');
        PhaseOneDatabase::create();
        PhaseOneDatabase::correctionTables();
        $this->travelTo(now()->setDate(2026, 10, 30)->setTime(3, 50, 0));
        Mail::fake();
        $this->fakeProviders();
        $this->admin = $this->user('super_admin');
        $this->owner = $this->user('farm_owner');
        $this->actingAs($this->admin, 'sanctum');
        $this->a = $this->farm('Correction A');
        $this->b = $this->farm('Correction B');
        $this->device = $this->device('Correction D01', $this->a);
    }

    protected function tearDown(): void
    {
        $this->travelBack();
        DB::purge('phase1_corrections');
        parent::tearDown();
    }

    protected function user(string $role): User
    {
        $n = User::count() + 1;

        return User::create(['first_name' => 'Isolated', 'last_name' => $role,
            'mobile_number' => '09'.str_pad((string) $n, 9, '0', STR_PAD_LEFT),
            'email' => 'fixture'.$n.'@example.test', 'role' => $role, 'status' => 'active']);
    }

    protected function farm(string $name): Farm
    {
        return Farm::create(['user_id' => $this->owner->id, 'owner_name' => $this->owner->full_name,
            'farm_name' => $name, 'farm_size' => 'Small', 'mobile_number' => $this->owner->mobile_number]);
    }

    protected function device(string $name, Farm $farm): Sensor
    {
        $device = Sensor::create(['label' => $name, 'device_key' => 'fixture-'.Sensor::count(), 'status' => 'Active']);

        return app(DeviceAssignmentService::class)->change($device->id, $farm->id);
    }

    protected function ingest(?Sensor $device = null, bool $critical = false): SensorReading
    {
        $this->postJson('/api/sensor-readings', $this->payload($device ?? $this->device, $critical))->assertOk();

        return SensorReading::latest('id')->firstOrFail();
    }

    protected function payload(Sensor $device, bool $critical = false): array
    {
        return ['device_key' => $device->device_key, 'ammonia_raw' => $critical ? 3000 : 100,
            'soil_raw' => 3500, 'temperature' => 28, 'humidity' => 60];
    }

    protected function fakeProviders(?callable $gemini = null): void
    {
        Http::swap(new Factory);
        Http::preventStrayRequests();
        Http::fake(['sms.test/*' => Http::response(['message' => ['status' => 'pending']], 201),
            'generativelanguage.googleapis.com/*' => $gemini ?? fn () => $this->geminiResponse()]);
    }

    protected function geminiResponse(string $text = 'Current assignment advice')
    {
        return Http::response(['candidates' => [['content' => ['parts' => [['text' => json_encode([
            'explanation_en' => $text, 'explanation_fil' => 'Fixture advice',
            'main_action_fil' => 'Fixture action', 'tips_fil' => ['Fixture tip'],
        ])]]]]]], 200);
    }

    protected function deletionCode(Farm $farm): string
    {
        $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/superadmin/farms/'.$farm->id.'/delete/otp/request', $this->deletionConfirmations())->assertOk();

        return Mail::sent(OtpCodeMail::class)->last()->code;
    }

    protected function deletionConfirmations(array $extra = []): array
    {
        return $extra + ['permanently_discontinued' => true, 'acknowledge_permanent_loss' => true];
    }
}
