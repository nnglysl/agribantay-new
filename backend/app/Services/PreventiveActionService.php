<?php

namespace App\Services;

/**
 * AI-Assisted Insight Layer, step 3: Preventive Action Suggestion.
 *
 * Takes the fuzzy membership scores RootCauseService already computed
 * and turns them into two distinct kinds of advice:
 *
 *  - suggestActions(): concrete, self-directed steps the farm owner can
 *    do themselves (litter, ventilation, drainage) — manure handling
 *    stays the farmer's own responsibility, not a municipal pickup.
 *
 *  - suggestServiceRequests(): when the diagnosed root cause matches a
 *    real municipal service (Odor Control, Fly Control), tells the
 *    farmer they can request it through Service Requests — this is
 *    the one place this layer points toward an LGU service rather
 *    than a self-directed action, since odor/fly control genuinely
 *    are things the Admin office handles, not the farmer alone.
 */
class PreventiveActionService
{
    // One overarching strategy per diagnosed root cause.
    private const ROOT_CAUSE_ACTIONS = [
        'Manure buildup' =>
            'Increase manure removal frequency — current buildup suggests collection is not keeping pace with accumulation.',
        'Poor ventilation' =>
            'Improve airflow by opening additional vents or adding fans to help disperse concentrated ammonia.',
        'Excess moisture (drainage or weather)' =>
            'Check and improve drainage around the coop; address any standing water or pooling.',
        'Litter or bedding saturation' =>
            'Replace wet litter and bedding with fresh, dry material to absorb excess moisture.',
        'Normal conditions' =>
            'No action needed — conditions are currently within a safe range.',
    ];

    // Which municipal service(s), if any, are worth requesting given a
    // diagnosed root cause — matches the exact service_type strings the
    // farmer-side Service Requests form actually submits (see
    // ServiceRequests.jsx), so a suggestion here can be acted on with
    // one click rather than the farmer re-typing anything.
    private const ROOT_CAUSE_SERVICE_SUGGESTIONS = [
        'Manure buildup' => [
            ['type' => 'Odor Control Request', 'reason' => 'Rising ammonia is usually accompanied by a real odor problem.'],
            ['type' => 'Fly Control Request', 'reason' => 'Manure buildup is a common breeding condition for flies.'],
        ],
        'Poor ventilation' => [
            ['type' => 'Odor Control Request', 'reason' => 'Poor airflow is concentrating ammonia, which usually means a noticeable smell too.'],
        ],
        'Excess moisture (drainage or weather)' => [
            ['type' => 'Fly Control Request', 'reason' => 'Standing moisture is a common breeding condition for flies.'],
        ],
        'Litter or bedding saturation' => [
            ['type' => 'Fly Control Request', 'reason' => 'Wet litter is a common breeding condition for flies.'],
        ],
        'Normal conditions' => [],
    ];

    // Membership above this counts as "contributing enough to warrant
    // its own suggestion" — below this, a sensor isn't flagged even if
    // technically non-zero, to avoid noisy over-suggestion.
    private const SUGGESTION_THRESHOLD = 0.3;

    /**
     * $memberships = RootCauseService's membership output (ammonia_high,
     * moisture_high, etc.). $rootCause = the diagnosed root_cause string.
     */
    public function suggestActions(array $memberships, string $rootCause): array
    {
        $actions = [];

        if (($memberships['ammonia_high'] ?? 0) >= self::SUGGESTION_THRESHOLD) {
            $actions[] = $this->action('ammonia', $memberships['ammonia_high'],
                'Clean and remove manure more frequently to reduce ammonia buildup. Improve ventilation to help disperse gas that has already accumulated.'
            );
        }

        if (($memberships['moisture_high'] ?? 0) >= self::SUGGESTION_THRESHOLD) {
            $actions[] = $this->action('moisture', $memberships['moisture_high'],
                'Replace wet litter with fresh, dry bedding. Check drinkers and piping for leaks or spillage that may be adding moisture.'
            );
        }

        if (($memberships['humidity_high'] ?? 0) >= self::SUGGESTION_THRESHOLD) {
            $actions[] = $this->action('humidity', $memberships['humidity_high'],
                'Increase airflow and ventilation. If the coop is overcrowded, reducing stocking density can also help lower humidity buildup.'
            );
        }

        if (($memberships['temp_hot'] ?? 0) >= self::SUGGESTION_THRESHOLD) {
            $actions[] = $this->action('temperature', $memberships['temp_hot'],
                'Add fans or shading to reduce heat. Ensure birds have constant access to fresh water during hot periods.'
            );
        }

        if (($memberships['temp_cold'] ?? 0) >= self::SUGGESTION_THRESHOLD) {
            $actions[] = $this->action('temperature', $memberships['temp_cold'],
                'Add insulation or windbreaks to reduce heat loss, and check for drafts reaching the birds directly.'
            );
        }

        // Worst-contributing sensor shown first.
        usort($actions, fn($a, $b) => $b['severity'] <=> $a['severity']);

        return [
            'overall_action' => self::ROOT_CAUSE_ACTIONS[$rootCause]
                ?? 'Monitor conditions and contact the Municipal Agriculture Office if levels remain elevated.',
            'sensor_actions' => $actions,
        ];
    }

    /**
     * Returns which municipal service(s) are worth requesting given the
     * diagnosed root cause, each with a short reason — empty array for
     * "Normal conditions" or any cause with no relevant service.
     */
    public function suggestServiceRequests(string $rootCause): array
    {
        return self::ROOT_CAUSE_SERVICE_SUGGESTIONS[$rootCause] ?? [];
    }

    private function action(string $sensor, float $membership, string $suggestion): array
    {
        return [
            'sensor'     => $sensor,
            'severity'   => round($membership * 100, 1), // matches RootCauseService's confidence scale
            'suggestion' => $suggestion,
        ];
    }
}