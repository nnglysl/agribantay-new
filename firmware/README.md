# AgriBantay — IoT Device Firmware

ESP32 firmware for the AgriBantay poultry manure monitoring devices.

## ⚠️ Device Keys are NOT in this repository

Every `.ino` here ships with a placeholder:

```cpp
const char* DEVICE_KEY = "AGB-XXXXXXXX";
```

**This is deliberate.** The Device Key is a credential — anything holding it can
post readings to the API as that device. This repository is public, and a key
committed here would stay in the git history permanently even if deleted later.

The real keys live in exactly two places:

1. The **device inventory record** (notebook / spreadsheet, kept offline)
2. The **firmware already flashed** onto each physical ESP32

Lose both and the key is gone — you must provision a new one and re-flash.

## Folder layout

```
firmware/
├── AGB_D01/
│   └── AGB_D01.ino     → physical unit labelled AGB-D01
└── AGB_D02/
    └── AGB_D02.ino     → physical unit labelled AGB-D02
```

One folder per physical device. The Arduino IDE requires the `.ino` filename to
match its folder name exactly, so do not rename one without the other.

The sketches share pin assignments, transmission timing and HTTP handling.
Each unit has its own Device Key and banner. D02 also prints the MQ-137 voltage
diagnostic described below and sends it as optional `ammonia_adc_mv` telemetry.
Deploy the database column and backend support BEFORE flashing this version.
See [the deployment steps](../docs/AMMONIA-VOLTAGE-DEPLOY.md).

## Before uploading to a device

1. Check the sticker on the physical unit — it carries the Device Name.
2. Open the matching folder (`AGB_D01/` for unit AGB-D01, and so on).
3. Replace line 21 with the real key from the inventory record:
   ```cpp
   const char* DEVICE_KEY = "AGB-4T8NRW6H";   // not a real key — illustration only
   ```
4. Select **ESP32 Dev Module** and the correct COM port.
5. Upload.
6. **Restore the placeholder before committing.** Run `git diff` to confirm no
   real key is staged.

Never flash the same key to two units — the backend authenticates by key and
would treat them as a single device, interleaving readings from two farms.

## Adding a new device

```bash
cd backend
php artisan agribantay:provision-device "AGB-D03" --imei=<imei> --sim=<sim>
```

The command prints a key and saves nothing. Record it in the inventory, copy an
existing device folder, rename folder and `.ino` to the new Device Name, then
register the key in the dashboard (Farm Details → Devices → Register Device).

`--imei` and `--sim` are printed for the inventory record only. There are no
columns for them and the backend never verifies them against the hardware.

## Hardware

| Component | Connection |
|---|---|
| DHT22 | GPIO 4 |
| Capacitive soil moisture sensor | GPIO 34 |
| MQ-137 ammonia sensor | GPIO 35 |
| A7670C TXD2 | GPIO 16 (ESP32 RX2) |
| A7670C RXD2 | GPIO 17 (ESP32 TX2) |

Board: ESP32 DevKit V1 · Arduino IDE board target: **ESP32 Dev Module**

## API

```
POST http://agribantay.com/api/sensor-readings
Content-Type: application/json

{
  "device_key": "AGB-XXXXXXXX",
  "ammonia_raw": 364,
  "ammonia_adc_mv": 433,
  "temperature": 33.70,
  "humidity": 52.50,
  "soil_raw": 3311
}
```

Responses:

| Code | Meaning |
|---|---|
| `200` | Reading saved |
| `401` | Key not registered in the system |
| `409` | Device registered but not assigned to a farm |
| `422` | Missing or invalid JSON fields |

`ammonia_raw` and `soil_raw` are raw 12-bit ADC values (0–4095), not calibrated
units. Conversion happens server-side and is still uncalibrated.
`ammonia_adc_mv` is optional, separate GPIO35 voltage telemetry in millivolts.
Older firmware may omit it; missing/historical values stay NULL. It does not yet
change the ammonia formula, statuses or historical readings.

## MQ-137 voltage diagnostic (D02)

The D02 sketch prints one extra line per measurement cycle at **115200 baud**:

```text
MQ137_DIAG raw=<ADC count> adc_mV=<millivolts> pin=35 (separate samples)
```

`analogReadMilliVolts()` uses the ESP32 ADC calibration API. It measures the
voltage at GPIO35, not the MQ-137 supply. Raw and millivolts come from consecutive,
separate conversions, so they are not one exact paired ADC sample. This is a
diagnostic for the old `raw * 3.3 / 4095` assumption, not a new ppm formula.
[Espressif ADC documentation](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/adc.html)

Steps with a laptop and USB data cable:

1. Use the working D02 sketch with its correct Device Key and existing modem
   settings. The repository sketch contains a **placeholder key**: preserve the
   actual key privately before uploading. Alternatively, copy only the diagnostic
   block immediately after `analogRead(MQ137_PIN)` into that working sketch.
2. Have the hardware member check the board's USB/external-power arrangement
   before connecting the laptop. The reported single 10k series resistor does
   **not** establish a safe input voltage; ADC software cannot test protection.
3. Select **ESP32 Dev Module** and the D02 COM port, then **Verify** and **Upload**.
   Upload resets the device. Allow existing startup/network setup to finish.
4. Open **Tools → Serial Monitor**, choose **115200 baud**, and record 5–10
   `MQ137_DIAG` lines (one per roughly one-minute measurement cycle), together
   with the local time. The diagnostic prints before the network check, so it
   can still appear when the current measurement is not transmitted.
5. Share only those diagnostic lines. Existing serial output also prints the
   device credential. With the voltage deployment installed, millivolts are also
   stored as `sensor_readings.ammonia_adc_mv` on successful transmissions.

No multimeter: these lines permit an initial ADC check, but do not independently
verify the 5V supply, ADC accuracy or the maximum possible AOUT/DOUT voltage.
Borrow a meter from the school lab/hardware member for those checks; there is no
need to buy a new NH3 tester or repeat the same low-ppm farm observations first.
Do not connect the 5V supply to GPIO35 to try to measure it.

Reported wiring on 2026-10-10: VCC → VIN (nominal 5V), AOUT → one 10kΩ → GPIO35,
DOUT → GPIO27, GND → GND. DOUT is unused by this firmware. A single series resistor
is not a voltage divider. Check input protection for both connected signal pins;
do not add arbitrary resistor values without checking module loading and updating
the conversion for any circuit changes.

The server still uses legacy, unvalidated coefficients for compatibility. The
`-0.311` derivation is not supported by the supplied Hanwei PDF, which specifies
`alpha(20/10) <= 0.65`, a bound rather than an exact power-law coefficient.
See [the reference review](../docs/sistema/07-REFERENCES.md#b2-hanwei-mq-137-technical-datasheet--ang-hardware).

## Known issues

- **The Device Key is printed to the Serial Monitor** (in `setup()` and again
  with the JSON payload). Anyone reading the serial output — or a screenshot of
  it — sees the credential. Left in place because it is useful while debugging.
- **Plain HTTP.** The A7670C cannot complete a TLS handshake with
  `agribantay.com` because the server presents an ECDSA-only certificate and the
  modem's TLS stack negotiates RSA cipher suites. Confirmed by testing: an
  RSA-certificate host (`www.howsmyssl.com`) returns `200` from the same modem.
  Fix is server-side — add an RSA certificate alongside the ECDSA one.
- **MQ-137 reads near zero** (raw 0–10, ~143 mV). 143 mV is the ESP32 ADC floor,
  so any value below it is indistinguishable from 0. Not yet diagnosed; the
  sensor may be fine, since MQ-137 output is genuinely low in clean air.
- **`AT+HTTPREAD` is sent without parameters.** The A76XX manual specifies
  `AT+HTTPREAD=<start>,<size>`. May return `ERROR`, but this runs after the POST
  completes, so the reading is already saved.
