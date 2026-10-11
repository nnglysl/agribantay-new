<?php

namespace App\Services;

use App\Models\SmsLog;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class SmsService
{
    public const ACCEPTED = 'accepted';

    public const REJECTED = 'rejected';

    public const UNKNOWN = 'unknown';

    protected string $secretKey;

    protected string $baseUrl;

    protected string $senderId;

    public function __construct()
    {
        $this->secretKey = (string) config('services.unisms.secret_key');
        $this->baseUrl = config('services.unisms.base_url', 'https://unismsapi.com/api');
        $this->senderId = config('services.unisms.sender_id', 'UNISOFT');
    }

    /**
     * Send an SMS and log the attempt regardless of outcome.
     *
     * @param  string  $type  'Account Creation' or 'Farm Status'
     * @param  string|null  $logMessage  What to write into sms_logs INSTEAD of
     *                                   $message. Credential sends pass a redacted line here: the real
     *                                   message carries a temporary password, and sms_logs is readable
     *                                   from the Activity/SMS views, so storing it verbatim would keep a
     *                                   live password in plain text long after it was issued. Defaults to
     *                                   $message, so every existing caller logs exactly as before.
     * @return bool true if sent/queued successfully, false otherwise
     */
    public function send(string $phoneNumber, string $message, string $type, ?int $userId = null, ?int $farmId = null, ?string $logMessage = null): bool
    {
        return $this->sendWithOutcome($phoneNumber, $message, $type, $userId, $farmId, $logMessage) === self::ACCEPTED;
    }

    /**
     * An alert retry must distinguish a rejection from an uncertain delivery.
     * UniSMS documents no idempotency key: retrying a timeout could send twice.
     * The optional token also lets SMS tracking recover an accepted request
     * when a process dies after logging it but before updating the farm clock.
     */
    public function sendWithOutcome(string $phoneNumber, string $message, string $type, ?int $userId = null, ?int $farmId = null, ?string $logMessage = null, ?string $alertToken = null): string
    {
        $outcome = self::UNKNOWN;
        $referenceId = null;
        $failureReason = null;

        try {
            $payload = [
                'recipient' => $this->normalizeNumber($phoneNumber),
                'content' => $message,
                'sender_id' => $this->senderId,
            ];
            if ($alertToken !== null) {
                $payload['metadata'] = ['sms_alert_token' => $alertToken];
            }

            $response = Http::withBasicAuth($this->secretKey, '')
                ->connectTimeout(5)
                ->timeout(15)
                ->asJson()
                ->post("{$this->baseUrl}/sms", $payload);

            $data = $response->json();
            $status = $data['message']['status'] ?? null;
            if ($response->successful() && in_array($status, ['pending', 'sent', 'retrying'], true)) {
                $outcome = self::ACCEPTED;
                $referenceId = $data['message']['reference_id'] ?? null;
            } elseif ($status === 'failed' || in_array($response->status(), [400, 401, 403, 422, 429], true)) {
                $outcome = self::REJECTED;
                $failureReason = 'Provider rejected the SMS request (HTTP '.$response->status().').';
            } else {
                $failureReason = 'SMS acceptance is unknown (HTTP '.$response->status().'); verify with the provider before retrying.';
            }
        } catch (\Exception $e) {
            // Exception text and provider bodies may contain the recipient,
            // credentials, or request URL. Never copy them into app logs.
            $failureReason = 'SMS acceptance is unknown; verify with the provider before retrying.';
            Log::error('SMS request did not confirm acceptance.', ['exception' => get_class($e)]);
        }

        try {
            SmsLog::create([
                'user_id' => $userId,
                'farm_id' => $farmId,
                'phone_number' => $phoneNumber,
                'message' => $logMessage ?? $message,
                'type' => $type,
                'status' => $outcome === self::ACCEPTED ? 'Sent' : 'Failed',
                'message_id' => $referenceId,
                'failure_reason' => $failureReason,
                // NULL for every non-alert caller, preserving the existing API.
                'sms_alert_token' => $alertToken,
            ]);
        } catch (\Exception $e) {
            // A logging error must never turn an accepted send into a retry.
            Log::error('Could not persist the SMS delivery log.', ['exception' => get_class($e)]);
        }

        return $outcome;
    }

    /**
     * Normalize Philippine mobile numbers to the 09XXXXXXXXX local format,
     * which UniSMS accepts alongside E.164 (+63...) format.
     */
    private function normalizeNumber(string $number): string
    {
        $digits = preg_replace('/\D/', '', $number);

        if (str_starts_with($digits, '63')) {
            $digits = '0'.substr($digits, 2);
        }

        return $digits;
    }
}
