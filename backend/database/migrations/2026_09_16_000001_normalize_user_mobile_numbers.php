<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Older user rows stored mobile numbers with cosmetic formatting
 * ("0992 772 4857", "0992-772-4857") while the app now stores digits only
 * ("09927724857"). The unique index sees those as different strings, so the
 * same number could be registered twice and an edit that re-saves the old
 * row collides with the new one as a raw integrity error. Strip formatting
 * from the legacy rows so all numbers share one form.
 *
 * Rows whose normalized number is already held by ANOTHER user are left
 * untouched and reported: that's a genuine duplicate account and a human
 * has to decide which one to keep. See `php artisan users:mobile-conflicts`.
 */
return new class extends Migration
{
    public function up(): void
    {
        $unnormalized = DB::table('users')
            ->whereNotNull('mobile_number')
            ->whereRaw("mobile_number REGEXP '[^0-9]'")
            ->get(['id', 'mobile_number']);

        $skipped = [];

        foreach ($unnormalized as $user) {
            $clean = preg_replace('/\D+/', '', $user->mobile_number);

            $taken = DB::table('users')
                ->where('mobile_number', $clean)
                ->where('id', '!=', $user->id)
                ->exists();

            if ($taken) {
                $skipped[] = "user #{$user->id} ({$user->mobile_number} -> {$clean})";
                continue;
            }

            DB::table('users')->where('id', $user->id)->update(['mobile_number' => $clean]);
        }

        if ($skipped) {
            $msg = 'Mobile number conflicts left unresolved (run `php artisan users:mobile-conflicts`): '
                . implode('; ', $skipped);
            Log::warning($msg);
            fwrite(STDERR, "\nWARNING: {$msg}\n\n");
        }

        // farms.mobile_number has no unique index; normalize it outright.
        DB::table('farms')
            ->whereNotNull('mobile_number')
            ->whereRaw("mobile_number REGEXP '[^0-9]'")
            ->update(['mobile_number' => DB::raw("REGEXP_REPLACE(mobile_number, '[^0-9]', '')")]);
    }

    public function down(): void
    {
        // Formatting-only change; the original spacing is not worth restoring.
    }
};
