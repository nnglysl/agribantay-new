<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\GeneratedReport;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Deleting an archived report.
 *
 * The archive is append-only on generation — store() refuses to overwrite a
 * period that already exists — so deleting is the only way to redo one after a
 * correction. Without it that refusal is a dead end, which is why this exists.
 *
 * What the tests actually guard is the boundary: one table backs every module,
 * so a missing ownership check would let any staff member or veterinarian erase
 * an archive belonging to someone they cannot even see.
 *
 *   DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=GeneratedReportDeletionTest
 *
 * Runs inside a rolled-back transaction.
 */
class GeneratedReportDeletionTest extends TestCase
{
    use DatabaseTransactions;

    private User $owner;

    private User $otherStaff;

    protected function setUp(): void
    {
        parent::setUp();

        if (config('database.default') !== 'mysql') {
            $this->markTestSkipped('Run with: DB_CONNECTION=mysql DB_DATABASE=db_agribantay php artisan test --filter=GeneratedReportDeletionTest');
        }

        Http::fake();

        $this->owner = $this->makeUser('admin');
        $this->otherStaff = $this->makeUser('admin');
    }

    private function makeUser(string $role): User
    {
        return User::create([
            'first_name' => 'Deleter',
            'last_name' => Str::random(6),
            'email' => Str::lower(Str::random(10)).'@agribantay.test',
            'mobile_number' => '09'.random_int(100000000, 999999999),
            'password' => bcrypt('password'),
            'role' => $role,
            'status' => 'active',
        ]);
    }

    private function makeReport(?User $generatedBy): GeneratedReport
    {
        return GeneratedReport::create([
            'report_name' => 'Deletable Report '.Str::random(5),
            'period_start' => '2026-02-01',
            'period_end' => '2026-02-28',
            'report_type' => 'Monthly',
            'generated_by_id' => $generatedBy?->id,
            'snapshot' => ['period' => ['start' => '2026-02-01 00:00:00', 'end' => '2026-02-28 23:59:59']],
        ]);
    }

    public function test_the_generator_can_delete_their_own_report(): void
    {
        $report = $this->makeReport($this->owner);

        Sanctum::actingAs($this->owner);

        $this->deleteJson("/api/admin/generated-reports/{$report->id}")
            ->assertOk()
            ->assertJsonPath('success', true);

        $this->assertDatabaseMissing('generated_reports', ['id' => $report->id]);
    }

    public function test_another_staff_member_cannot_delete_it(): void
    {
        $report = $this->makeReport($this->owner);

        Sanctum::actingAs($this->otherStaff);

        // 404, not 403: a refusal that names the resource confirms it exists.
        $this->deleteJson("/api/admin/generated-reports/{$report->id}")->assertNotFound();

        $this->assertDatabaseHas('generated_reports', ['id' => $report->id]);
    }

    public function test_a_vet_cannot_delete_a_staff_members_report(): void
    {
        $report = $this->makeReport($this->owner);
        $vet = $this->makeUser('vet');

        Sanctum::actingAs($vet);

        $this->deleteJson("/api/vet/generated-reports/{$report->id}")->assertNotFound();

        $this->assertDatabaseHas('generated_reports', ['id' => $report->id]);
    }

    public function test_a_vet_can_delete_their_own_report(): void
    {
        $vet = $this->makeUser('vet');
        $report = $this->makeReport($vet);

        Sanctum::actingAs($vet);

        $this->deleteJson("/api/vet/generated-reports/{$report->id}")->assertOk();

        $this->assertDatabaseMissing('generated_reports', ['id' => $report->id]);
    }

    public function test_deleting_is_recorded_in_the_activity_log(): void
    {
        $report = $this->makeReport($this->owner);
        $name = $report->report_name;

        Sanctum::actingAs($this->owner);
        $this->deleteJson("/api/admin/generated-reports/{$report->id}")->assertOk();

        // An official archive disappearing with no trace of who removed it is
        // exactly what the Activity Log exists to prevent.
        $log = ActivityLog::where('action', 'Deleted Generated Report')
            ->where('user_id', $this->owner->id)
            ->latest('id')
            ->first();

        $this->assertNotNull($log, 'Deleting a report wrote no Activity Log entry.');
        $this->assertStringContainsString($name, $log->details);
    }

    public function test_the_period_can_be_generated_again_afterwards(): void
    {
        // The whole point of the feature: store() refuses a period that already
        // exists, so a correction is impossible until the old archive is gone.
        $report = $this->makeReport($this->owner);

        Sanctum::actingAs($this->owner);

        $payload = [
            'report_name' => 'February 2026 Report',
            'period_start' => '2026-02-01',
            'period_end' => '2026-02-28',
            'report_type' => 'Monthly',
        ];

        $this->postJson('/api/admin/generated-reports', $payload)->assertStatus(409);

        $this->deleteJson("/api/admin/generated-reports/{$report->id}")->assertOk();

        $this->postJson('/api/admin/generated-reports', $payload)->assertCreated();
    }
}
