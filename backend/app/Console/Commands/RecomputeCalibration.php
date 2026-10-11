<?php

namespace App\Console\Commands;

use App\Models\Sensor;
use App\Models\SensorReading;
use App\Services\MoistureThresholdService;
use App\Services\SensorCalibrationService;
use Illuminate\Console\Command;

/**
 * Re-derive ammonia and moisture from the raw ADC counts already stored.
 *
 * WHY THIS EXISTS
 * ppm and moisture content depend on constants that change the day a device
 * is calibrated. Every reading therefore keeps the count the sensor actually
 * reported (sensor_readings.ammonia_raw / soil_raw) beside the value made of
 * it, so a later calibration can be applied to readings already collected
 * rather than only to the ones that come after.
 *
 * That is what makes it worth installing the devices BEFORE the reference
 * meter is available: the week in between is not lost, it is simply holding
 * values that this command will replace.
 *
 * WHAT IT WILL NOT DO
 * Rows whose raw column is null predate that column. There is no way back to
 * a measurement from a number produced by a formula nobody recorded, so those
 * rows are reported and left exactly as they are.
 *
 * alert_history is never touched. Recomputing a value does not change the
 * fact that an alert was, or was not, raised at the time — that record is
 * what the system did, not what it would do now, and rewriting it would
 * destroy the only honest account of the deployment.
 */
class RecomputeCalibration extends Command
{
    protected $signature = 'calibration:recompute
        {--force : Actually write the recomputed values (otherwise this is a dry run)}
        {--device= : Only this device, by its name, e.g. AGB-D01}
        {--from= : Only readings at or after this date/time}
        {--to= : Only readings at or before this date/time}
        {--chunk=500 : Rows per batch}';

    protected $description = 'Re-derive ammonia ppm and moisture from stored raw ADC counts after a recalibration';

    public function handle(SensorCalibrationService $calibration, MoistureThresholdService $moistureThresholds): int
    {
        $dryRun = ! $this->option('force');

        // Device names are resolved once. Calibration is per device — the two
        // units read roughly 283 and 332 in the same clean air — so a single
        // fleet-wide constant would be wrong for one of them, and the name is
        // what selects the right one.
        $sensors = Sensor::all()->keyBy('id');

        $query = SensorReading::query()
            ->where(function ($q) {
                $q->whereNotNull('ammonia_raw')->orWhereNotNull('soil_raw');
            })
            ->orderBy('id');

        if ($deviceName = $this->option('device')) {
            $sensor = $sensors->first(fn (Sensor $s) => $s->device_name === $deviceName);

            if (! $sensor) {
                $this->error("No device named {$deviceName}. Known: ".$sensors->map->device_name->filter()->implode(', '));

                return self::FAILURE;
            }

            $query->where('sensor_id', $sensor->id);
        }

        if ($from = $this->option('from')) {
            $query->where('created_at', '>=', $from);
        }

        if ($to = $this->option('to')) {
            $query->where('created_at', '<=', $to);
        }

        $total = (int) $query->clone()->count();
        $skippedNoRaw = (int) SensorReading::whereNull('ammonia_raw')->whereNull('soil_raw')->count();

        $this->line('');
        $this->info($dryRun ? 'DRY RUN — nothing will be written. Add --force to apply.' : 'APPLYING — values will be rewritten.');
        $this->line('');
        $this->line("Rows with a raw value in scope : ".number_format($total));
        $this->line("Rows with no raw at all        : ".number_format($skippedNoRaw)." (left untouched)");
        $this->line('');

        if ($total === 0) {
            $this->warn('Nothing to do.');

            return self::SUCCESS;
        }

        $changedAmmonia = 0;
        $changedMoisture = 0;
        $changedStatus = 0;
        $examined = 0;
        $samples = [];

        $progress = $this->output->createProgressBar($total);
        $progress->start();

        $query->chunkById((int) $this->option('chunk'), function ($rows) use (
            $sensors, $calibration, $moistureThresholds, $dryRun, $progress,
            &$changedAmmonia, &$changedMoisture, &$changedStatus, &$examined, &$samples
        ) {
            foreach ($rows as $reading) {
                $examined++;
                $progress->advance();

                $deviceName = $sensors->get($reading->sensor_id)?->device_name;
                $updates = [];

                if ($reading->ammonia_raw !== null) {
                    [$ammonia, $ammoniaStatus] = $this->ammoniaFrom(
                        (int) $reading->ammonia_raw, $deviceName, $calibration
                    );

                    if ($this->differs($reading->ammonia, $ammonia)) {
                        $updates['ammonia'] = $ammonia;
                        $changedAmmonia++;
                    }

                    if ($reading->ammonia_status !== $ammoniaStatus) {
                        $updates['ammonia_status'] = $ammoniaStatus;
                        $changedStatus++;
                    }

                    if (count($samples) < 10 && $this->differs($reading->ammonia, $ammonia)) {
                        $samples[] = [
                            $reading->created_at?->toDateTimeString(),
                            $deviceName ?? "#{$reading->sensor_id}",
                            $reading->ammonia_raw,
                            $reading->ammonia,
                            $ammonia,
                            $reading->ammonia_status.' → '.$ammoniaStatus,
                        ];
                    }
                }

                // soil_raw of 0 is the documented hardware fault (unplugged or
                // unpowered probe), not a measurement, so it is left as the
                // null it was stored as rather than converted into 100%.
                if ($reading->soil_raw !== null && (int) $reading->soil_raw !== 0) {
                    [$moisture, $moistureStatus] = $this->moistureFrom(
                        (int) $reading->soil_raw, $deviceName, $calibration, $moistureThresholds
                    );

                    if ($this->differs($reading->moisture, $moisture)) {
                        $updates['moisture'] = $moisture;
                        $changedMoisture++;
                    }

                    if ($reading->moisture_status !== $moistureStatus) {
                        $updates['moisture_status'] = $moistureStatus;
                        $changedStatus++;
                    }
                }

                if ($updates && ! $dryRun) {
                    // Through the query builder so the row's created_at and
                    // updated_at are not touched: a recomputed reading is the
                    // same reading, taken at the same moment.
                    SensorReading::query()->whereKey($reading->id)->update($updates);
                }
            }
        });

        $progress->finish();
        $this->line('');
        $this->line('');

        if ($samples) {
            $this->line('Sample of what changes:');
            $this->table(
                ['taken at', 'device', 'raw', 'was', 'becomes', 'status'],
                $samples
            );
        }

        $this->line('Rows examined        : '.number_format($examined));
        $this->line('Ammonia values changed: '.number_format($changedAmmonia));
        $this->line('Moisture values changed: '.number_format($changedMoisture));
        $this->line('Statuses changed      : '.number_format($changedStatus));
        $this->line('');

        if ($dryRun) {
            $this->warn('Dry run — nothing was written. Re-run with --force to apply.');
        } else {
            $this->info('Done. Values rewritten; alert_history was not touched.');
        }

        return self::SUCCESS;
    }

    /**
     * ppm and its status from one raw count, following exactly the rule
     * SensorIngestController uses: the cut points follow the SCALE, not the
     * metric. A calibrated device reports real ppm and is judged against
     * 15/20; an uncalibrated one reports the placeholder scale, where those
     * numbers mean nothing.
     */
    private function ammoniaFrom(int $raw, ?string $deviceName, SensorCalibrationService $calibration): array
    {
        $ppm = $calibration->ammoniaPpm($raw, $deviceName);
        $value = $ppm ?? round(($raw / 4095) * 100, 2);
        $cuts = config($ppm === null ? 'sensors.ammonia_placeholder' : 'sensors.ammonia_ppm');

        return [$value, $this->classify($value, $cuts['warning'], $cuts['critical'])];
    }

    /**
     * Moisture and its status, with the same fallback chain as ingestion:
     * polynomial (real moisture content), then two-point (a probe index),
     * then the placeholder inversion.
     */
    private function moistureFrom(
        int $raw,
        ?string $deviceName,
        SensorCalibrationService $calibration,
        MoistureThresholdService $thresholds
    ): array {
        $value = $calibration->moisturePercent($raw, $deviceName) ?? 100 - ($raw / 4095) * 100;

        return [round($value, 2), $thresholds->classify($value)];
    }

    private function classify(float $value, float $warningAt, float $criticalAt): string
    {
        if ($value >= $criticalAt) {
            return 'Critical';
        }

        return $value >= $warningAt ? 'Warning' : 'Safe';
    }

    /**
     * Stored values are rounded to two decimals, so a recomputation that
     * lands on the same number must not be counted as a change — otherwise a
     * no-op run reports thousands of rows "changed" and the real figure is
     * impossible to see.
     */
    private function differs($stored, ?float $computed): bool
    {
        if ($stored === null || $computed === null) {
            return $stored !== $computed;
        }

        return abs((float) $stored - $computed) >= 0.005;
    }
}
