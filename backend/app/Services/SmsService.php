<?php

namespace App\Services;

use App\Models\SmsLog;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class SmsService
{
    protected string $apiToken;
    protected string $baseUrl;

    public function __construct()
    {
        $this->apiToken = config('services.iprog_sms.api_token');
        $this->baseUrl  = config('services.iprog_sms.base_url');
    }

    /**
     * Send an SMS and log the attempt regardless of outcome.
     *
     * @param string $phoneNumber
     * @param string $message
     * @param string $type 'Account Creation' or 'Farm Status'
     * @param int|null $userId
     * @param int|null $farmId
     * @return bool true if sent successfully, false otherwise
     */
    public function send(string $phoneNumber, string $message, string $type, ?int $userId = null, ?int $farmId = null): bool
    {
        try {
            $response = Http::asJson()->post("{$this->baseUrl}/sms_messages", [
                'api_token'    => $this->apiToken,
                'phone_number' => $this->normalizeNumber($phoneNumber),
                'message'      => $message,
            ]);

            $data = $response->json();

            if ($response->successful() && ($data['status'] ?? null) == 200) {
                SmsLog::create([
                    'user_id'      => $userId,
                    'farm_id'      => $farmId,
                    'phone_number' => $phoneNumber,
                    'message'      => $message,
                    'type'         => $type,
                    'status'       => 'Sent',
                    'message_id'   => $data['message_id'] ?? null,
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
                'failure_reason' => $this->stringifyReason($data['message'] ?? 'Unknown API error'),
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
     * Normalize Philippine mobile numbers to the 09XXXXXXXXX format iProg expects.
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
     * since iProg may return either a string or an array of errors.
     */
    private function stringifyReason($reason): string
    {
        if (is_array($reason)) {
            return json_encode($reason);
        }

        return (string) $reason;
    }
}