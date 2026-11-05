<?php

namespace Tests\Feature;

use App\Models\AiRecommendation;
use App\Services\DeviceAssignmentService;
use App\Services\RootCauseService;
use App\Services\TrendAnalysisService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\Support\PhaseOneCorrectionTestCase;

class InsightAssignmentConsistencyTest extends PhaseOneCorrectionTestCase
{
    private function history(): AiRecommendation
    {
        return AiRecommendation::create(['farm_id' => $this->a->id, 'explanation_en' => 'Preserved earlier recommendation',
            'generated_date' => now()->toDateString(), 'force_refresh' => false])->fresh();
    }

    private function rotate(): void
    {
        $assignments = app(DeviceAssignmentService::class);
        $assignments->change($this->device->id, $this->b->id);
        $assignments->change($this->device->id, $this->a->id);
    }

    public function test_measurement_trend_interleaving_is_discarded_without_generation(): void
    {
        $this->ingest();
        $old = $this->history();
        $attributes = $old->getAttributes();
        $this->mock(TrendAnalysisService::class)->shouldReceive('analyzeFarm')->once()->andReturnUsing(function ($id, $current) {
            // SQLite permits this same-connection injection. Real competing
            // writers are serialized by the MySQL snapshot-lock regression.
            $this->rotate();

            return (new TrendAnalysisService)->analyzeFarm($id, $current);
        });
        $this->actingAs($this->owner, 'sanctum')->getJson('/api/farmer/insights?farm_id='.$this->a->id)
            ->assertOk()->assertJsonPath('data.available', false);
        Http::assertNothingSent();
        $this->assertEquals($attributes, $old->fresh()->getAttributes());
    }

    private function rotateDuringDiagnosis(): void
    {
        $this->mock(RootCauseService::class)->shouldReceive('diagnose')->once()->andReturnUsing(function ($values, $trend) {
            $result = (new RootCauseService)->diagnose($values, $trend);
            $this->rotate();

            return $result;
        });
    }

    public function test_farmer_revalidates_after_measurements_and_before_cache_generation(): void
    {
        $this->ingest();
        $this->rotateDuringDiagnosis();
        $this->actingAs($this->owner, 'sanctum')->getJson('/api/farmer/insights?farm_id='.$this->a->id)
            ->assertOk()->assertJsonPath('data.available', false);
        Http::assertNothingSent();
    }

    public function test_staff_and_super_admin_recommendation_endpoint_uses_the_same_guard(): void
    {
        $this->ingest();
        $this->rotateDuringDiagnosis();
        $this->getJson('/api/admin/farms/'.$this->a->id.'/root-cause')->assertOk()->assertJsonPath('data', null);
        Http::assertNothingSent();
    }

    public function test_reassignment_during_generation_cannot_save_or_return_the_old_facts(): void
    {
        $this->ingest();
        $old = $this->history();
        $attributes = $old->getAttributes();
        $calls = 0;
        $this->fakeProviders(function () use (&$calls) {
            $this->assertSame(0, DB::transactionLevel(), 'Provider call must not hold database locks.');
            if (++$calls === 1) {
                $this->rotate();
            }

            return $this->geminiResponse($calls === 1 ? 'Discard this old assignment' : 'New assignment only');
        });
        $this->actingAs($this->owner, 'sanctum')->getJson('/api/farmer/insights?farm_id='.$this->a->id)
            ->assertOk()->assertJsonPath('data.available', false);
        $this->ingest();
        $this->getJson('/api/farmer/insights?farm_id='.$this->a->id)->assertOk()
            ->assertJsonPath('data.available', true)->assertJsonPath('data.explanation', null);
        $this->assertSame(1, $calls); // Existing retry throttle still applies.
        $this->travel(10)->minutes();
        $this->ingest();
        $this->getJson('/api/farmer/insights?farm_id='.$this->a->id)->assertOk()
            ->assertJsonPath('data.explanation', 'New assignment only');
        $this->assertSame(2, $calls);
        $this->assertEquals($attributes, $old->fresh()->getAttributes());
    }

    public function test_a_valid_cache_is_shared_by_roles_but_never_reused_after_rotation(): void
    {
        $this->ingest();
        $old = $this->history();
        $attributes = $old->getAttributes();
        $calls = 0;
        $this->fakeProviders(function () use (&$calls) {
            return $this->geminiResponse(++$calls === 1 ? 'First visit only' : 'Second visit only');
        });
        $this->actingAs($this->owner, 'sanctum')->getJson('/api/farmer/insights?farm_id='.$this->a->id)
            ->assertOk()->assertJsonPath('data.explanation', 'First visit only');
        $this->actingAs($this->admin, 'sanctum')->getJson('/api/admin/farms/'.$this->a->id.'/root-cause')
            ->assertOk()->assertJsonPath('data.explanation.explanation_en', 'First visit only');
        $this->assertSame(1, $calls);
        $this->rotate();
        $this->ingest();
        $this->actingAs($this->owner, 'sanctum')->getJson('/api/farmer/insights?farm_id='.$this->a->id)
            ->assertOk()->assertJsonPath('data.explanation', null);
        $this->travel(10)->minutes();
        $this->ingest();
        $this->getJson('/api/farmer/insights?farm_id='.$this->a->id)->assertOk()
            ->assertJsonPath('data.explanation', 'Second visit only');
        $this->assertSame(2, $calls);
        $this->assertEquals($attributes, $old->fresh()->getAttributes());
    }

    public function test_status_refresh_invalidates_same_assignment_cache_without_overwriting_saved_text(): void
    {
        $this->ingest();
        $old = $this->history();
        $this->actingAs($this->owner, 'sanctum')->getJson('/api/farmer/insights?farm_id='.$this->a->id)
            ->assertOk()->assertJsonPath('data.explanation', 'Current assignment advice');
        $this->ingest($this->device, true);
        $this->getJson('/api/farmer/insights?farm_id='.$this->a->id)->assertOk()
            ->assertJsonPath('data.available', true)->assertJsonPath('data.explanation', null);
        $this->assertSame('Preserved earlier recommendation', $old->fresh()->explanation_en);
    }
}
