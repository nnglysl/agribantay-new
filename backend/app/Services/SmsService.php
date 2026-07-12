<?php

namespace App\Services;

use App\Models\SmsLog;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class SmsService
{
    protected string $secretKey;
    protected string $baseUrl;
    protected string $senderId;

    public function __construct()
    {
        $this->secretKey = config('services.unisms.secret_key');
        $this->baseUrl   = config('services.unisms.base_url', 'https://unismsapi.com/api');
        $this->senderId  = config('services.unisms.sender_id', 'UNISOFT');
    }

    /**
     * Send an SMS and log the attempt regardless of outcome.
     *
     * @param string $phoneNumber
     * @param string $message
     * @param string $type 'Account Creation' or 'Farm Status'
     * @param int|null $userId
     * @param int|null $farmId
     * @return bool true if sent/queued successfully, false otherwise
     */
    public function send(string $phoneNumber, string $message, string $type, ?int $userId = null, ?int $farmId = null): bool
    {
        try {
            $response = Http::withBasicAuth($this->secretKey, '')
                ->asJson()
                ->post("{$this->baseUrl}/sms", [
                    'recipient' => $this->normalizeNumber($phoneNumber),
                    'content'   => $message,
                    'sender_id' => $this->senderId,
                ]);

            $data = $response->json();
            $status = $data['message']['status'] ?? null;

            // UniSMS returns 201 with status "pending" when the message is
            // accepted and queued for delivery. "sent" is the final success
            // state once the carrier confirms handoff. Both count as success
            // here since "failed" is the only state that means it didn't go out.
            if ($response->successful() && in_array($status, ['pending', 'sent', 'retrying'], true)) {
                SmsLog::create([
                    'user_id'      => $userId,
                    'farm_id'      => $farmId,
                    'phone_number' => $phoneNumber,
                    'message'      => $message,
                    'type'         => $type,
                    'status'       => 'Sent',
                    'message_id'   => $data['message']['reference_id'] ?? null,
                ]);

                return true;
            }

            SmsLog::create([
                'user_id'        => $userId,
                'farm_id'        => $farmId,
                'phone_number'   => $phoneNumber,
                'message'        => $message,
                'type'           => $type,
                'status'         => 'Failed',
                'failure_reason' => $this->stringifyReason(
                    $data['message']['fail_reason'] ?? $data['errors'] ?? 'Unknown API error'
                ),
            ]);

            return false;

        } catch (\Exception $e) {
            Log::error('SMS send failed: ' . $e->getMessage());

            SmsLog::create([
                'user_id'        => $userId,
                'farm_id'        => $farmId,
                'phone_number'   => $phoneNumber,
                'message'        => $message,
                'type'           => $type,
                'status'         => 'Failed',
                'failure_reason' => $e->getMessage(),
            ]);

            return false;
        }
    }

    /**
     * Normalize Philippine mobile numbers to the 09XXXXXXXXX local format,
     * which UniSMS accepts alongside E.164 (+63...) format.
     */
    private function normalizeNumber(string $number): string
    {
        $digits = preg_replace('/\D/', '', $number);

        if (str_starts_with($digits, '63')) {
            $digits = '0' . substr($digits, 2);
        }

        return $digits;
    }

    /**
     * Safely convert an API error response into a loggable string,
     * since UniSMS may return either a string or an array of errors.
     */
    private function stringifyReason(mixed $reason): string
    {
        if (is_array($reason)) {
            return json_encode($reason);
        }

        return (string) $reason;
    }
}