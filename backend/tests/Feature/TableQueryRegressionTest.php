<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\AlertHistory;
use App\Models\Farm;
use App\Models\Inspection;
use App\Models\MaintenanceLog;
use App\Models\ManureDisposalRecord;
use App\Models\ServiceRequest;
use App\Support\ServiceTypes;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Support\PhaseOneCorrectionTestCase;
use Tests\Support\RegistrationDatabase;

class TableQueryRegressionTest extends PhaseOneCorrectionTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        RegistrationDatabase::fields();
        Schema::table('inspections', function ($t) {
            foreach (['inspection_number', 'inspection_type'] as $field) {
                $t->string($field)->nullable();
            }
            $t->unsignedBigInteger('scheduled_by')->nullable();
            $t->timestamp('completed_at')->nullable();
            $t->timestamps();
        });
        Schema::table('service_requests', function ($t) {
            $t->string('request_number')->nullable();
            $t->unsignedBigInteger('requested_by')->nullable();
            $t->timestamp('completed_at')->nullable();
            $t->timestamps();
        });
        Schema::create('service_request_attachments', function ($t) {
            $t->id();
            $t->unsignedBigInteger('service_request_id');
            $t->unsignedBigInteger('uploaded_by')->nullable();
        });
        Schema::table('generated_reports', function ($t) {
            foreach (['report_name', 'report_type'] as $field) {
                $t->string($field)->nullable();
            }
            $t->unsignedBigInteger('generated_by_id')->nullable();
            $t->date('period_start')->nullable();
            $t->date('period_end')->nullable();
            $t->timestamps();
        });
    }

    public function test_disposal_search_and_combined_filters_find_rows_beyond_page_one(): void
    {
        for ($i = 1; $i <= 23; $i++) {
            ManureDisposalRecord::create(['farm_id' => $this->a->id, 'disposal_method' => $i === 1 ? 'Sold' : 'Composted',
                'disposal_date' => sprintf('2026-10-%02d', $i), 'quantity' => $i,
                'buyer_name' => $i === 1 ? 'Beyond first page' : 'Other buyer']);
        }
        $this->getJson('/api/admin/farms/'.$this->a->id.'/disposal-records?per_page=10&search=Beyond&disposal_method=Sold&from=2026-10-01&to=2026-10-01')
            ->assertOk()->assertJsonPath('data.total', 1)->assertJsonCount(1, 'data.records')
            ->assertJsonPath('data.records.0.buyer_name', 'Beyond first page');
    }

    public function test_cleanout_sort_is_global_and_ties_have_stable_pages(): void
    {
        $ids = [];
        for ($i = 0; $i < 23; $i++) {
            $ids[] = MaintenanceLog::create(['farm_id' => $this->a->id, 'maintenance_type' => 'Full Manure Clean-out',
                'performed_at' => '2026-10-01', 'notes' => 'Stable'])->id;
        }
        $url = '/api/admin/farms/'.$this->a->id.'/maintenance-logs?per_page=10&dir=asc';
        $first = $this->getJson($url)->assertOk()->assertJsonPath('data.total', 23)->json('data.logs');
        $second = $this->getJson($url.'&page=2')->assertOk()->json('data.logs');
        $this->assertSame(array_slice($ids, 0, 10), array_column($first, 'id'));
        $this->assertSame(array_slice($ids, 10, 10), array_column($second, 'id'));
        $descending = $this->getJson(str_replace('dir=asc', 'dir=desc', $url))->assertOk()->json('data.logs');
        $this->assertSame(array_slice(array_reverse($ids), 0, 10), array_column($descending, 'id'));
    }

    public function test_activity_search_includes_records_older_than_the_former_hundred_row_cap(): void
    {
        for ($i = 0; $i < 125; $i++) {
            ActivityLog::create(['user_id' => $this->admin->id, 'role' => 'super_admin', 'type' => 'Farm',
                'action' => $i === 0 ? 'Needle oldest' : 'Other action', 'details' => 'Fixture',
                'created_at' => now()->subMinutes(125 - $i)]);
        }
        $this->getJson('/api/superadmin/activity-logs?per_page=10&search=Needle&type=Farm&role=super_admin')
            ->assertOk()->assertJsonPath('data.total', 1)->assertJsonPath('data.items.0.action', 'Needle oldest');
    }

    public function test_invalid_page_and_sort_parameters_are_safe_and_empty_or_excess_pages_are_consistent(): void
    {
        $url = '/api/admin/farms/'.$this->a->id.'/maintenance-logs?per_page=10';
        foreach (['page=-1', 'page=abc', 'per_page=0', 'dir=drop%20table'] as $invalid) {
            $this->getJson($url.'&'.$invalid)->assertUnprocessable();
        }
        $this->getJson($url.'&page=999&sort=untrusted_column')->assertOk()
            ->assertJsonPath('data.current_page', 1)->assertJsonPath('data.last_page', 1)->assertJsonPath('data.total', 0);
        $this->getJson($url.'&dir=')->assertOk()->assertJsonPath('data.total', 0);
    }

    public function test_role_filters_cannot_bypass_module_authorization(): void
    {
        $this->actingAs($this->owner, 'sanctum')->getJson('/api/admin/farms/'.$this->a->id.'/maintenance-logs?per_page=10&role=super_admin')->assertForbidden();
        $this->actingAs($this->user('admin'), 'sanctum')->getJson('/api/superadmin/activity-logs?per_page=10&role=super_admin')->assertForbidden();
        $this->actingAs($this->user('vet'), 'sanctum')->getJson('/api/admin/alert-history?per_page=10')->assertForbidden();
    }

    public function test_alert_filters_and_sorting_apply_to_all_pages_and_keep_historical_incidents(): void
    {
        $this->a->update(['barangay' => 'Calansayan']);
        for ($i = 0; $i < 24; $i++) {
            AlertHistory::create(['farm_id' => $this->a->id, 'sensor_id' => $this->device->id, 'sensor_type' => 'ammonia',
                'status' => $i % 2 ? 'Warning' : 'Critical', 'value' => 25, 'triggered_at' => now()->subDays($i),
                'resolved_at' => now()]);
        }
        $url = '/api/admin/alert-history?per_page=10&barangay=Calansayan&status=Critical&alert_status=Resolved&sort=oldest';
        $oldest = $this->getJson($url)->assertOk()->assertJsonPath('data.total', 12)->assertJsonCount(10, 'data.items')->json('data.items.0.id');
        $this->getJson($url.'&page=2')->assertOk()->assertJsonCount(2, 'data.items');
        $newest = $this->getJson(str_replace('sort=oldest', 'sort=newest', $url))->assertOk()->json('data.items.0.id');
        $this->assertGreaterThan($newest, $oldest);
        $this->getJson($url.'&search=NoMatch')->assertOk()->assertJsonPath('data.total', 0);
    }

    private function requestFixture(string $type, string $status = 'Completed', ?int $farmId = null): ServiceRequest
    {
        return ServiceRequest::create(['request_number' => 'SR-'.(ServiceRequest::count() + 1000),
            'farm_id' => $farmId ?? $this->a->id, 'requested_by' => $this->owner->id,
            'service_type' => $type, 'status' => $status, 'created_at' => now()->subDays(2),
            'scheduled_at' => now()->startOfDay(), 'completed_at' => $status === 'Completed' ? now() : null]);
    }

    public function test_service_search_combines_with_role_scope_and_legacy_history_remains_visible(): void
    {
        $staff = $this->user('admin');
        $vet = $this->user('vet');
        for ($i = 0; $i < 22; $i++) {
            $this->requestFixture(ServiceTypes::ODOR_CONTROL);
        }
        $legacy = $this->requestFixture(ServiceTypes::VACCINE_LEGACY);
        $url = '/api/admin/service-requests?per_page=10&tab=history&search='.$legacy->request_number;
        $this->actingAs($staff, 'sanctum')->getJson($url)->assertOk()->assertJsonPath('data.total', 0);
        $this->actingAs($this->admin, 'sanctum')->getJson($url)->assertOk()->assertJsonPath('data.total', 1);
        $this->actingAs($vet, 'sanctum')->getJson('/api/vet/vaccination-requests?per_page=10&tab=history&search='.$legacy->request_number)
            ->assertOk()->assertJsonPath('data.total', 1)->assertJsonPath('data.items.0.service_type', ServiceTypes::VACCINE_LEGACY);
        $this->getJson('/api/vet/vaccination-requests?per_page=10&service_type='.urlencode(ServiceTypes::ODOR_CONTROL))
            ->assertOk()->assertJsonPath('data.total', 0);
    }

    public function test_service_sort_and_today_overdue_boundary_preserve_the_existing_calendar_day_rule(): void
    {
        $today = $this->requestFixture(ServiceTypes::BLOOD_TEST, 'Scheduled');
        $today->update(['scheduled_at' => now('Asia/Manila')->startOfDay()->utc()]);
        $yesterday = $this->requestFixture(ServiceTypes::BLOOD_TEST, 'Scheduled');
        $yesterday->update(['scheduled_at' => now('Asia/Manila')->subDay()->startOfDay()->utc()]);
        $this->getJson('/api/admin/service-requests?per_page=10&tab=scheduled')->assertOk()->assertJsonPath('data.total', 1)->assertJsonPath('data.items.0.id', $today->id);
        $this->getJson('/api/admin/service-requests?per_page=10&tab=overdue')->assertOk()->assertJsonPath('data.items.0.id', $yesterday->id);
        $asc = $this->getJson('/api/admin/service-requests?per_page=1&sort=oldest')->assertOk()->json('data.items.0.id');
        $desc = $this->getJson('/api/admin/service-requests?per_page=1&sort=newest')->assertOk()->json('data.items.0.id');
        $this->assertSame($today->id, $asc);
        $this->assertSame($yesterday->id, $desc);
    }

    public function test_farmer_table_search_cannot_read_a_different_owner_or_a_different_selected_farm(): void
    {
        $other = $this->user('farm_owner');
        $private = Farm::create(['user_id' => $other->id, 'farm_name' => 'Private farm']);
        $mine = $this->requestFixture(ServiceTypes::BLOOD_TEST);
        $secret = $this->requestFixture(ServiceTypes::BLOOD_TEST, 'Completed', $private->id);
        $this->actingAs($this->owner, 'sanctum');
        $this->getJson('/api/farmer/service-requests?per_page=10&tab=past&farm_id='.$this->a->id)->assertOk()->assertJsonPath('data.total', 1)->assertJsonPath('data.items.0.id', $mine->id);
        $this->getJson('/api/farmer/service-requests?per_page=10&search='.$secret->request_number)->assertOk()->assertJsonPath('data.total', 0);
        foreach (['service-requests', 'inspections'] as $path) {
            $this->getJson('/api/farmer/'.$path.'?per_page=10&farm_id='.$private->id.'&role=super_admin')->assertNotFound();
        }
    }

    public function test_inspection_calendar_is_bounded_but_summary_and_filter_options_cover_the_full_scope(): void
    {
        $first = Inspection::create(['inspection_number' => 'IN-old', 'farm_id' => $this->a->id,
            'inspection_type' => 'General Inspection', 'status' => 'Completed', 'scheduled_by' => $this->admin->id,
            'scheduled_at' => '2026-09-15 01:00:00']);
        Inspection::create(['inspection_number' => 'IN-new', 'farm_id' => $this->b->id,
            'inspection_type' => 'Follow-up', 'status' => 'Scheduled', 'scheduled_by' => $this->admin->id,
            'scheduled_at' => '2026-10-30 01:00:00']);
        Inspection::create(['inspection_number' => 'IN-active-old', 'farm_id' => $this->a->id,
            'inspection_type' => 'General Inspection', 'status' => 'Scheduled', 'scheduled_by' => $this->admin->id,
            'scheduled_at' => '2026-08-30 01:00:00']);
        $this->getJson('/api/admin/inspections?calendar_month=10&calendar_year=2026')->assertOk()
            ->assertJsonCount(1, 'data.calendar')->assertJsonPath('data.summary.total', 3)->assertJsonCount(2, 'data.summary.farm_options')
            ->assertJsonCount(2, 'data.summary.active_inspections');
        $this->getJson('/api/admin/inspections?per_page=10&tab=history&search=IN-old')->assertOk()
            ->assertJsonPath('data.total', 1)->assertJsonPath('data.items.0.id', $first->id);
    }

    public function test_report_period_overlap_and_counts_remain_scoped_to_the_generator(): void
    {
        $vet = $this->user('vet');
        foreach ([$this->admin, $vet] as $actor) {
            DB::table('generated_reports')->insert(['payload' => '{}', 'report_name' => 'Private archive', 'report_type' => 'Monthly',
                'generated_by_id' => $actor->id, 'period_start' => '2026-09-01', 'period_end' => '2026-09-30',
                'created_at' => now(), 'updated_at' => now()]);
        }
        $this->getJson('/api/admin/generated-reports?per_page=10&from=2026-09-15&to=2026-10-01&generated_by_id='.$vet->id)
            ->assertOk()->assertJsonPath('data.total', 1)->assertJsonCount(1, 'data.items');
        $this->actingAs($vet, 'sanctum')->getJson('/api/vet/generated-reports?per_page=10&from=2026-10-01')
            ->assertOk()->assertJsonPath('data.total', 0);
    }

    public function test_per_farm_service_history_retains_staff_vet_and_super_admin_rules(): void
    {
        $this->requestFixture(ServiceTypes::ODOR_CONTROL, 'Pending');
        $this->requestFixture(ServiceTypes::VACCINE_LEGACY);
        $base = '/api/admin/farms/'.$this->a->id.'/service-requests?per_page=10';
        $this->getJson($base)->assertOk()->assertJsonPath('data.total', 2)->assertJsonCount(2, 'data.requests');
        $this->actingAs($this->user('admin'), 'sanctum')->getJson($base)->assertOk()->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.requests.0.request_type', ServiceTypes::ODOR_CONTROL);
        $this->actingAs($this->user('vet'), 'sanctum')->getJson('/api/vet/farms/'.$this->a->id.'/service-requests?per_page=10')
            ->assertOk()->assertJsonPath('data.total', 1)->assertJsonPath('data.requests.0.request_type', ServiceTypes::VACCINE_LEGACY);
    }

    public function test_account_and_owner_search_are_complete_and_cannot_select_unmanageable_roles(): void
    {
        for ($i = 0; $i < 22; $i++) {
            $this->user('admin');
        }
        $vet = $this->user('vet');
        $this->getJson('/api/superadmin/accounts?per_page=10&role=vet&search='.$vet->email)->assertOk()->assertJsonPath('data.total', 1);
        $this->getJson('/api/superadmin/accounts?per_page=10&role=super_admin')->assertOk()->assertJsonPath('data.total', 23);
        $this->getJson('/api/admin/farm-owners?search='.urlencode($this->owner->full_name))->assertOk()->assertJsonPath('data.0.id', $this->owner->id);
    }

    public function test_overdue_filtering_and_counts_are_applied_before_paging_derived_results(): void
    {
        $this->a->forceFill(['created_at' => now()->subYears(3), 'farm_size' => 'Small', 'barangay' => 'Calansayan'])->save();
        $this->b->forceFill(['created_at' => now()->subYears(3), 'farm_size' => 'Large', 'barangay' => 'Calansayan'])->save();
        $this->getJson('/api/admin/maintenance/overdue?per_page=1&barangay=Calansayan&farm_size=Large')
            ->assertOk()->assertJsonPath('data.total', 1)->assertJsonPath('data.items.0.farm_id', $this->b->id);
    }
}
