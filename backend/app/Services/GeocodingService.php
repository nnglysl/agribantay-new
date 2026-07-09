<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class GeocodingService
{
    // Bounding box roughly covering San Jose, Batangas municipality
    // Format: left(min lon), top(max lat), right(max lon), bottom(min lat)
    private const VIEWBOX = '121.05,13.92,121.15,13.83';

    public function geocode(string $address): ?array
    {
        try {
            $response = Http::withHeaders([
                'User-Agent' => 'AgriBantay/1.0 (San Jose Municipal Agriculture Office)',
            ])->get('https://nominatim.openstreetmap.org/search', [
                'q'        => $address,
                'format'   => 'json',
                'limit'    => 1,
                'viewbox'  => self::VIEWBOX,
                'bounded'  => 1,
                'countrycodes' => 'ph',
            ]);

            $results = $response->json();

            if (empty($results)) {
                return null;
            }

            return [
                'latitude'  => (float) $results[0]['lat'],
                'longitude' => (float) $results[0]['lon'],
            ];
        } catch (\Exception $e) {
            Log::error('Geocoding failed: ' . $e->getMessage());
            return null;
        }
    }
}