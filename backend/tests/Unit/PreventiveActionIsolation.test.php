<?php

// Standalone: php backend/tests/Unit/PreventiveActionIsolation.test.php
// No Laravel bootstrap, database, .env, HTTP, cache or provider connection.
declare(strict_types=1);

require dirname(__DIR__, 2).'/app/Services/PreventiveActionService.php';

use App\Services\PreventiveActionService;

function verify(bool $condition, string $message): void
{
    if (! $condition) throw new RuntimeException($message);
}

$service = new PreventiveActionService();
$memberships = ['ammonia_high' => 0.9, 'moisture_high' => 0.8, 'humidity_high' => 0.7, 'temp_hot' => 0.6, 'temp_cold' => 0.4];
$original = $memberships;
$expectedSensors = ['ammonia', 'moisture', 'humidity', 'temperature', 'temperature'];
$causes = ['Manure buildup', 'Poor ventilation', 'Excess moisture (drainage or weather)', 'Litter or bedding saturation', 'Normal conditions', 'Unknown cause'];
$legacyCount = 0;
foreach ($causes as $cause) {
    $before = $service->suggestActions($memberships, $cause);
    $legacy = $service->suggestServiceRequests($cause);
    $legacyCount += count($legacy);
    verify($before === $service->suggestActions($memberships, $cause), 'Legacy lookup must not alter active environmental advice.');
    verify($memberships === $original, 'Input memberships must remain unchanged.');
    verify(array_column($before['sensor_actions'], 'sensor') === $expectedSensors, 'All environmental advice channels must remain available.');
    verify(array_column($before['sensor_actions'], 'severity') === [90.0, 80.0, 70.0, 60.0, 40.0], 'Recommendations retain severity ordering.');
    foreach ($before['sensor_actions'] as $action) {
        verify(!str_contains($action['suggestion'], 'Control Request'), 'Self-directed tips must remain separate from retired workflow suggestions.');
    }
    foreach ($legacy as $suggestion) {
        verify(in_array($suggestion['type'], ['Odor Control Request', 'Fly Control Request'], true), 'Classify only the exact retired request types.');
    }
}
$tips = $service->suggestActions($memberships, 'Manure buildup')['sensor_actions'];
verify(str_contains($tips[0]['suggestion'], 'remove manure') && str_contains($tips[0]['suggestion'], 'ventilation'), 'Keep ammonia/manure/ventilation advice.');
verify(str_contains($tips[1]['suggestion'], 'wet litter') && str_contains($tips[1]['suggestion'], 'leaks'), 'Keep moisture/litter/drinker advice.');
verify(str_contains($tips[2]['suggestion'], 'airflow'), 'Keep humidity advice.');
verify(str_contains($tips[3]['suggestion'], 'fresh water') && str_contains($tips[4]['suggestion'], 'insulation'), 'Keep hot/cold environmental advice.');
verify($service->suggestActions(['ammonia_high'=>0.2999], 'Manure buildup')['sensor_actions'] === [], 'Preserve the suggestion threshold below 0.3.');
verify(count($service->suggestActions(['ammonia_high'=>0.3], 'Manure buildup')['sensor_actions']) === 1, 'Preserve the inclusive threshold at 0.3.');
verify($service->suggestServiceRequests('Normal conditions') === [] && $service->suggestServiceRequests('Unknown cause') === [], 'No service suggestions for normal/unknown causes.');
verify(str_contains($service->suggestActions([], 'Excess moisture (drainage or weather)')['overall_action'], 'drainage'), 'Keep the drainage strategy.');
verify(str_contains($service->suggestActions([], 'Unknown cause')['overall_action'], 'Municipal Agriculture Office'), 'Keep the unknown-cause fallback.');
echo 'PASS: independent environmental/manure advice, threshold, ordering, fallback and legacy lookup isolation; observed legacy mappings: '.$legacyCount.PHP_EOL;
