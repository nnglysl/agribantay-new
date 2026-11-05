<?php

namespace Tests\Feature;

use App\Models\{Farm, MaintenanceLog, MaintenanceNotification, Notification, SmsLog, User};
use App\Services\{MaintenanceStatusService, GeneratedReportService};
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\{Artisan, DB, Http, Mail, Storage};
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/** Explicitly guarded private MySQL only; every fixture row rolls back. */
class AnnualCleanoutComplianceTest extends TestCase
{
    private bool $transaction = false;
    private User $owner;
    private User $staff;
    private User $head;
    private Farm $farm;

    protected function setUp(): void
    {
        parent::setUp();
        if (getenv('PHASE8_TEST_MYSQL') !== '1') $this->markTestSkipped('Explicit isolated fixture required.');
        $this->assertSame('mysql', DB::connection()->getDriverName());
        $this->assertMatchesRegularExpression('/\Aagribantay_phase4_test_[a-f0-9]{12}\z/', DB::connection()->getDatabaseName());
        $this->assertContains(config('database.connections.mysql.host'), ['127.0.0.1', 'localhost', '::1']);
        DB::beginTransaction(); $this->transaction = true;
        Farm::query()->update(['status' => 'Inactive']);
        $this->travelTo(Carbon::parse('2026-11-01 04:00:00', 'UTC'));
        Http::preventStrayRequests(); Http::fake(['*' => Http::response(['message' => ['status' => 'sent', 'reference_id' => 'synthetic-only']], 200)]); Mail::fake();
        config(['maintenance_compliance.notifications_enabled' => false,
            'filesystems.disks.public.root' => sys_get_temp_dir().'/agribantay-phase8-'.Str::uuid()]);
        Storage::forgetDisk('public');
        $this->owner = $this->user('farm_owner'); $this->staff = $this->user('admin'); $this->head = $this->user('super_admin');
        $this->farm = $this->makeFarm('2026-11-01 02:00:00');
        $this->actingAs($this->owner, 'sanctum');
    }

    protected function tearDown(): void
    {
        if ($this->transaction) DB::rollBack();
        $this->travelBack();
        parent::tearDown();
    }

    private function user(string $role): User
    {
        return User::create(['first_name' => 'Annual', 'last_name' => Str::random(8), 'role' => $role, 'status' => 'active',
            'mobile_number' => '09'.random_int(100000000, 999999999), 'password' => bcrypt('synthetic-only')]);
    }

    private function makeFarm(?string $registered, string $size = 'Medium'): Farm
    {
        return Farm::forceCreate(['user_id' => $this->owner->id, 'farm_name' => 'Annual Fixture '.Str::random(8),
            'owner_name' => $this->owner->full_name, 'mobile_number' => $this->owner->mobile_number,
            'barangay' => 'Calansayan', 'address' => 'Synthetic fixture', 'farm_size' => $size, 'status' => 'Active',
            'created_at' => $registered])->fresh();
    }

    private function log(string $date, string $type = MaintenanceStatusService::FULL_CLEANOUT, ?Farm $farm = null): MaintenanceLog
    {
        return MaintenanceLog::create(['farm_id' => ($farm ?? $this->farm)->id, 'maintenance_type' => $type,
            'performed_at' => $date, 'notes' => 'Synthetic evidence', 'photo_path' => 'synthetic-photo.jpg']);
    }

    private function evaluate(string $asOf, ?Farm $farm = null): array
    {
        return app(MaintenanceStatusService::class)->getStatus($farm ?? $this->farm, Carbon::parse($asOf, 'Asia/Manila'));
    }

    public static function boundaries(): array
    {
        return [
            'registration cycle' => ['2026-11-01 02:00:00', '2026-11-01', '2027-11-01', 'Compliant', 365, 0],
            'inclusive due date' => ['2026-11-01 02:00:00', '2027-11-01 23:59:59', '2027-11-01', 'Compliant', 0, 0],
            'following day' => ['2026-11-01 02:00:00', '2027-11-02', '2027-11-01', 'Non-Compliant', 0, 1],
            'no grace' => ['2026-11-01 02:00:00', '2027-11-16', '2027-11-01', 'Non-Compliant', 0, 15],
            'leap-day registration' => ['2024-02-29 02:00:00', '2025-02-28', '2025-02-28', 'Compliant', 0, 0],
            'leap-day following day' => ['2024-02-29 02:00:00', '2025-03-01', '2025-02-28', 'Non-Compliant', 0, 1],
            'leap interval 366 days' => ['2023-03-01 02:00:00', '2023-03-01', '2024-03-01', 'Compliant', 366, 0],
            'month end January' => ['2026-01-31 02:00:00', '2027-01-31', '2027-01-31', 'Compliant', 0, 0],
            'month end August' => ['2026-08-31 02:00:00', '2027-09-01', '2027-08-31', 'Non-Compliant', 0, 1],
            'UTC registration becomes next Manila day' => ['2026-10-31 16:00:00', '2027-11-01', '2027-11-01', 'Compliant', 0, 0],
        ];
    }

    #[DataProvider('boundaries')]
    public function test_calendar_boundaries(string $registered, string $asOf, string $due, string $state, int $remaining, int $late): void
    {
        $status = $this->evaluate($asOf, $this->makeFarm($registered));
        $this->assertSame($due, $status['due_date_raw']); $this->assertSame($state, $status['status']);
        $this->assertSame($remaining, $status['days_remaining']); $this->assertSame($late, $status['days_overdue']);
        $this->assertNull($status['days_since']); $this->assertNull($status['last_full_cleanout_date']);
        $this->assertSame('farm_registration', $status['compliance_basis']);
        $this->assertArrayNotHasKey('grace_end_date', $status);
    }

    public function test_same_annual_cycle_for_every_size(): void
    {
        foreach (['Small', 'Medium', 'Large'] as $size) {
            $status = $this->evaluate('2027-11-01', $this->makeFarm('2026-11-01 02:00:00', $size));
            $this->assertSame('Compliant', $status['status']); $this->assertSame('2027-11-01', $status['due_date_raw']);
        }
    }

    public static function fullDates(): array
    {
        return [['2027-08-15', '2028-08-15'], ['2027-11-01', '2028-11-01'], ['2027-12-01', '2028-12-01']];
    }

    #[DataProvider('fullDates')]
    public function test_full_cleanout_before_on_or_after_due_date_resets_from_actual_work(string $date, string $due): void
    {
        $this->log($date);
        $status = $this->evaluate($date);
        $this->assertSame('Compliant', $status['status']); $this->assertSame($due, $status['due_date_raw']);
        $this->assertSame(0, $status['days_since']); $this->assertSame('latest_full_cleanout', $status['compliance_basis']);
        if ($date > '2027-11-01') $this->assertSame('Non-Compliant', $this->evaluate('2027-11-02')['status']);
    }

    public function test_latest_full_record_wins_but_partial_and_other_activities_do_not_reset(): void
    {
        $this->log('2027-02-28'); $last = $this->log('2028-02-29');
        $this->log('2028-03-01', 'Partial Manure Removal'); $this->log('2028-03-03', 'Other Maintenance');
        $status = $this->evaluate('2028-03-05');
        $this->assertSame('2029-02-28', $status['due_date_raw']); $this->assertSame($last->id, $status['latest_full_cleanout_id']);
        $this->assertSame(5, $status['days_since']);
        $this->assertSame(4, MaintenanceLog::where('farm_id', $this->farm->id)->count());
    }

    public function test_missing_invalid_or_future_dates_are_undetermined_without_today_fallback(): void
    {
        $missing = $this->makeFarm(null);
        $this->assertSame('Undetermined', $this->evaluate('2026-11-01', $missing)['status']);
        $this->assertNull($this->evaluate('2026-11-01', $missing)['due_date']);
        $bad = new Farm; $bad->setRawAttributes(['created_at' => '2026-02-30 00:00:00']); $bad->setRelation('qualifyingCleanouts', collect());
        $this->assertSame('Undetermined', $this->evaluate('2026-11-01', $bad)['status']);
        $this->assertSame('Undetermined', $this->evaluate('2026-11-01', $this->makeFarm('2027-01-01 00:00:00'))['status']);
        $this->log('2026-11-02');
        $this->assertSame('Undetermined', app(MaintenanceStatusService::class)->getStatus($this->farm)['status']);
    }

    public function test_manila_midnight_changes_status_and_not_the_due_day_clock_time(): void
    {
        $this->travelTo(Carbon::parse('2027-11-01 15:59:59', 'UTC'));
        $this->assertSame('Compliant', app(MaintenanceStatusService::class)->getStatus($this->farm)['status']);
        $this->travelTo(Carbon::parse('2027-11-01 16:00:00', 'UTC'));
        $this->assertSame('Non-Compliant', app(MaintenanceStatusService::class)->getStatus($this->farm)['status']);
    }

    public function test_farmer_ownership_multi_farm_and_staff_super_consistency(): void
    {
        $other = $this->makeFarm('2024-11-01 02:00:00');
        $first = $this->getJson('/api/farmer/maintenance?farm_id='.$this->farm->id)->assertOk()->assertJsonPath('data.farm_id', $this->farm->id)->json('data.status');
        $this->getJson('/api/farmer/maintenance?farm_id='.$other->id)->assertOk()->assertJsonPath('data.status.status', 'Non-Compliant');
        foreach ([$this->staff, $this->head] as $actor) {
            $this->actingAs($actor, 'sanctum')->getJson('/api/admin/maintenance/'.$this->farm->id.'/details')->assertOk()->assertJsonPath('data.maintenance', $first);
        }
        $this->actingAs($this->user('farm_owner'), 'sanctum')->getJson('/api/farmer/maintenance?farm_id='.$this->farm->id)->assertNotFound();
        $this->actingAs($this->user('vet'), 'sanctum')->getJson('/api/admin/maintenance/overdue')->assertForbidden();
        $this->actingAs($this->owner, 'sanctum')->getJson('/api/admin/maintenance/overdue')->assertForbidden();
    }

    public function test_overdue_dashboard_and_reports_use_the_same_policy_and_preserve_snapshots(): void
    {
        $late = $this->makeFarm('2025-10-01 02:00:00'); $this->makeFarm(null);
        $snapshots = DB::table('generated_reports')->orderBy('id')->pluck('snapshot', 'id')->all();
        $this->actingAs($this->staff, 'sanctum');
        $this->getJson('/api/admin/maintenance/overdue?per_page=10')->assertOk()->assertJsonPath('data.total', 1)->assertJsonPath('data.items.0.farm_id', $late->id)->assertJsonPath('data.items.0.status', 'Non-Compliant');
        $this->getJson('/api/admin/maintenance/overdue?per_page=10&farm_size=Large')->assertOk()->assertJsonPath('data.total', 0);
        $this->getJson('/api/admin/dashboard')->assertOk()->assertJsonPath('data.cleanout_compliance.compliant', 1)->assertJsonPath('data.cleanout_compliance.non_compliant', 1)->assertJsonPath('data.cleanout_compliance.undetermined', 1);
        $this->getJson('/api/admin/reports?from=2026-11-01&to=2026-11-01')->assertOk()->assertJsonPath('data.maintenance_summary.non_compliant', 1)->assertJsonPath('data.maintenance_summary.undetermined', 1)->assertJsonPath('data.maintenance_summary.overdue', 0);
        $snapshot = app(GeneratedReportService::class)->buildSnapshot(Carbon::parse('2026-11-01', 'Asia/Manila'), Carbon::parse('2026-11-01 23:59:59', 'Asia/Manila'));
        $this->assertSame(1, $snapshot['maintenance_summary']['non_compliant']); $this->assertSame(1, $snapshot['maintenance_summary']['undetermined']);
        $this->assertSame($snapshots, DB::table('generated_reports')->orderBy('id')->pluck('snapshot', 'id')->all());
    }

    public function test_notifications_default_off_require_transition_date_and_never_mass_send_for_old_late_cycles(): void
    {
        $this->makeFarm('2024-11-01 02:00:00'); $before = MaintenanceNotification::count();
        $this->artisan('compliance:check-maintenance')->assertSuccessful(); Http::assertNothingSent();
        config(['maintenance_compliance.notifications_enabled' => true, 'maintenance_compliance.notification_start_date' => null]);
        $this->artisan('compliance:check-maintenance')->assertFailed(); Http::assertNothingSent();
        config(['maintenance_compliance.notification_start_date' => '2026-11-01']);
        $this->artisan('compliance:check-maintenance')->assertSuccessful(); Http::assertNothingSent();
        $this->assertSame($before, MaintenanceNotification::count());
    }

    public function test_annual_notice_is_reserved_once_and_has_no_grace_period_or_advance_reminder(): void
    {
        $farm = $this->makeFarm('2025-10-31 02:00:00');
        config(['maintenance_compliance.notifications_enabled' => true, 'maintenance_compliance.notification_start_date' => '2026-11-01']);
        $this->artisan('compliance:check-maintenance')->assertSuccessful();
        $this->artisan('compliance:check-maintenance')->assertSuccessful();
        Http::assertSentCount(1);
        $notice = MaintenanceNotification::where('farm_id', $farm->id)->sole();
        $this->assertSame('non_compliant_notice', $notice->event);
        $message = $notice->smsLog->message;
        $this->assertStringContainsString('annual full manure clean-out', $message);
        $this->assertStringNotContainsString('grace', $message);
        $this->assertSame(0, MaintenanceNotification::where('farm_id', $farm->id)->where('event', 'overdue_reminder')->count());
        $this->actingAs($this->head, 'sanctum')->getJson('/api/admin/maintenance/'.$farm->id.'/details')->assertOk()->assertJsonPath('data.notifications.0.description', $message);
    }

    public function test_failed_or_unknown_delivery_is_not_automatically_retried(): void
    {
        $farm = $this->makeFarm('2025-10-31 02:00:00');
        config(['maintenance_compliance.notifications_enabled' => true, 'maintenance_compliance.notification_start_date' => '2026-11-01']);
        Http::swap(new \Illuminate\Http\Client\Factory);
        Http::preventStrayRequests(); Http::fake(['*' => Http::response([], 503)]);
        $this->artisan('compliance:check-maintenance')->assertSuccessful(); $this->artisan('compliance:check-maintenance')->assertSuccessful();
        Http::assertSentCount(1); $this->assertSame('Failed', MaintenanceNotification::where('farm_id', $farm->id)->sole()->smsLog->status);
    }

    public function test_only_owner_can_record_full_cleanout_and_manila_today_is_allowed(): void
    {
        $this->travelTo(Carbon::parse('2026-11-01 16:01:00', 'UTC'));
        $body = ['farm_id' => $this->farm->id, 'performed_at' => '2026-11-02', 'photo' => UploadedFile::fake()->createWithContent('cleanout.png', base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aR1sAAAAASUVORK5CYII='))];
        foreach ([$this->staff, $this->head, $this->user('vet')] as $actor) $this->actingAs($actor, 'sanctum')->post('/api/farmer/maintenance', $body, ['Accept' => 'application/json'])->assertForbidden();
        $this->actingAs($this->owner, 'sanctum')->post('/api/farmer/maintenance', $body, ['Accept' => 'application/json'])->assertOk();
        $this->assertSame(MaintenanceStatusService::FULL_CLEANOUT, MaintenanceLog::where('farm_id', $this->farm->id)->sole()->maintenance_type);
        $this->postJson('/api/farmer/maintenance', ['farm_id' => $this->farm->id, 'performed_at' => '2026-11-03'])->assertUnprocessable();
    }

    public function test_retired_demo_entry_points_cannot_backdate_or_fabricate_evidence(): void
    {
        $original = $this->farm->getAttributes(); $before = MaintenanceLog::count();
        $this->artisan('maintenance:seed-overdue', ['--force' => true])->assertFailed();
        (new \Database\Seeders\OverdueMaintenanceTestSeeder)->run();
        $this->assertSame($original, $this->farm->fresh()->getAttributes()); $this->assertSame($before, MaintenanceLog::count()); Http::assertNothingSent();
    }

    public function test_partial_only_history_leaves_registration_as_the_basis(): void
    {
        $this->log('2027-10-31', 'Partial Manure Removal');
        $status = $this->evaluate('2027-11-02');
        $this->assertSame('Non-Compliant', $status['status']); $this->assertSame('2027-11-01', $status['due_date_raw']);
        $this->assertSame('farm_registration', $status['compliance_basis']); $this->assertNull($status['days_since']);
    }

    public function test_new_full_cycle_can_have_a_new_notice_but_keeps_the_previous_late_evidence(): void
    {
        $this->farm->update(['status' => 'Inactive']);
        $farm = $this->makeFarm('2025-10-31 02:00:00');
        config(['maintenance_compliance.notifications_enabled' => true, 'maintenance_compliance.notification_start_date' => '2026-11-01']);
        $this->artisan('compliance:check-maintenance')->assertSuccessful();
        $original = MaintenanceNotification::where('farm_id', $farm->id)->sole()->getAttributes();
        $this->log('2026-11-01', MaintenanceStatusService::FULL_CLEANOUT, $farm);
        $this->artisan('compliance:check-maintenance')->assertSuccessful(); Http::assertSentCount(1);
        $this->travelTo(Carbon::parse('2027-11-02 04:00:00', 'UTC'));
        $this->artisan('compliance:check-maintenance')->assertSuccessful(); Http::assertSentCount(2);
        $this->assertSame(2, MaintenanceNotification::where('farm_id', $farm->id)->count());
        $this->assertSame($original, MaintenanceNotification::findOrFail($original['id'])->getAttributes());
    }

    public function test_existing_claim_prevents_retry_after_process_failure_without_a_delivery_log(): void
    {
        $farm = $this->makeFarm('2025-10-31 02:00:00');
        MaintenanceNotification::create(['farm_id' => $farm->id, 'event' => 'non_compliant_notice', 'anchor_date' => '2025-10-31', 'sent_at' => now()]);
        config(['maintenance_compliance.notifications_enabled' => true, 'maintenance_compliance.notification_start_date' => '2026-11-01']);
        $this->artisan('compliance:check-maintenance')->assertSuccessful(); Http::assertNothingSent();
    }

    public function test_known_registration_rejects_pre_registration_or_non_date_input_before_writing(): void
    {
        $before = MaintenanceLog::count();
        foreach (['2026-10-31', '2026-11-01T00:00:00Z', '2026-02-30'] as $date) {
            $this->postJson('/api/farmer/maintenance', ['farm_id' => $this->farm->id, 'performed_at' => $date])->assertUnprocessable()->assertJsonValidationErrors('performed_at');
        }
        $this->postJson('/api/farmer/maintenance', ['farm_id' => $this->farm->id, 'performed_at' => '2026-11-01', 'maintenance_type' => 'Partial Manure Removal'])
            ->assertUnprocessable()->assertJsonValidationErrors('maintenance_type');
        $this->assertSame($before, MaintenanceLog::count());
    }

    public function test_report_counts_only_qualifying_full_work_and_preserves_other_history(): void
    {
        $this->log('2026-11-01'); $this->log('2026-11-01', 'Partial Manure Removal');
        $this->actingAs($this->staff, 'sanctum')->getJson('/api/admin/reports?from=2026-11-01&to=2026-11-01')
            ->assertOk()->assertJsonPath('data.maintenance_summary.completed_this_month', 1)->assertJsonCount(1, 'data.maintenance_completed_list');
        $this->assertSame(2, MaintenanceLog::where('farm_id', $this->farm->id)->count());
    }
}
