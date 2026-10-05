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

The two sketches are **identical except for line 21** (the Device Key) and the
banner text that prints which unit is running. Pins, sensor logic, API URL,
timing and HTTP handling are the same in both.

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
  "ammonia_raw": 0,
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
