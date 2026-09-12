# AI Smart Pet Feeder - ESP32-S3 CAM Firmware V1

## Scope

Firmware V1 intentionally does **not** include AI inference yet.

Implemented:

- ESP32-S3 CAM initialization
- DOG feeder: Servo 1 + HX711 / Load Cell 1
- CAT feeder: Servo 2 + HX711 / Load Cell 2
- Feeding LED on GPIO 48
- Passive buzzer on GPIO 47
- Wi-Fi
- Firebase Authentication with Email/Password
- Firebase Realtime Database
- `Feed Now` command
- Firebase portion fallback
- 10-minute per-species cooldown
- Weight-based gate closing
- Timeout / no-weight-progress protection
- Feeding history
- Serial calibration mode
- Camera capture diagnostic

Future AI module only needs to produce `dog` or `cat` and call the same
feeding controller.

---

## Hardware mapping

| Function | GPIO |
|---|---:|
| Servo 1 - DOG | 42 |
| HX711 #1 DT | 1 |
| HX711 #1 SCK | 2 |
| Servo 2 - CAT | 41 |
| HX711 #2 DT | 39 |
| HX711 #2 SCK | 40 |
| Passive buzzer | 47 |
| Feeding LED | 48 |

Camera pins are in `hardware_pins.h`.

---

## Arduino IDE settings

- Board: **ESP32S3 Dev Module**
- PSRAM: **OPI PSRAM**
- Serial Monitor: **115200 baud**

For Flash Size / Partition Scheme, initially reuse the exact settings that
were used successfully with the verified camera test.

---

## Before flashing

Edit `secrets.h`:

```cpp
#define WIFI_SSID "..."
#define WIFI_PASSWORD "..."

#define FIREBASE_API_KEY "..."
#define FIREBASE_DATABASE_URL "https://ai-smart-pet-feeder-default-rtdb.asia-southeast1.firebasedatabase.app"
#define FIREBASE_USER_EMAIL "..."
#define FIREBASE_USER_PASSWORD "..."
```

Use an Email/Password Firebase Authentication account that has permission
under your RTDB rules.

Do not publish real credentials.

---

## IMPORTANT - Load-cell calibration

The supplied hardware test only verified raw HX711 readings. Therefore V1
refuses to feed until both scales have been calibrated.

See `docs/CALIBRATION_GUIDE.md`.

Calibration factors are stored in ESP32 NVS using `Preferences`, so they
survive reboot.

---

## Firebase V1 contract

Device root:

```text
/devices/feeder-01
```

App writes:

```text
/devices/feeder-01/command
```

Firmware reads config:

```text
/devices/feeder-01/config/speciesProfiles/dog
/devices/feeder-01/config/speciesProfiles/cat
```

Firmware writes:

```text
/devices/feeder-01/status
/devices/feeder-01/runtime
/devices/feeder-01/feedingHistory
```

See `docs/FIREBASE_CONTRACT.md`.

---

## Feed command example

```json
{
  "requestId": "req-001",
  "type": "feed_now",
  "speciesId": "dog",
  "targetGrams": 80,
  "status": "pending",
  "requestedAtEpoch": 1788890000
}
```

If `targetGrams <= 0`, firmware reads Firebase `portionGrams`.
If Firebase has no valid portion, it falls back to:

- DOG: 80 g
- CAT: 45 g

---

## Feeding flow

```text
Firebase pending command
        |
        v
Validate DOG/CAT
        |
        v
Check load-cell calibration
        |
        v
Check per-species cooldown
        |
        v
Measure initial bowl weight
        |
        v
LED ON + correct servo OPEN
        |
        v
Measure added food continuously
        |
        +--> timeout/no progress -> CLOSE + ERROR
        |
        v
Target - tolerance reached
        |
        v
Servo CLOSE
        |
        v
Wait for food to settle
        |
        v
Final actual grams
        |
        v
LED OFF + buzzer
        |
        v
Firebase status/history + cooldown
```

The measurement is **delta weight**:

```text
actual dispensed = current bowl weight - initial bowl weight
```

so food already present in the bowl does not count as newly dispensed food.

---

## Serial test commands

Open Serial Monitor at 115200 with newline enabled.

```text
HELP
TARE1
TARE2
CAL1 100
CAL2 100
SHOWCAL
WEIGHT
CAM
TESTDOG 20
TESTCAT 20
```

`TESTDOG` and `TESTCAT` still require calibration and respect cooldown.

---

## First hardware test order

1. Flash firmware with correct `secrets.h`.
2. Confirm camera / servo / HX711 boot logs.
3. Calibrate HX711 #1 and #2.
4. Run `WEIGHT`.
5. Run a small `TESTDOG 10` with a safe amount of dry test material.
6. Wait cooldown or temporarily change cooldown in Firebase for bench testing.
7. Run `TESTCAT 10`.
8. Send Firebase `feed_now` command.
9. Confirm command status + runtime + history update.

Keep a hand near the power switch during the first mechanical test and use
small target amounts until the gate behavior has been verified.

---

## AI integration later

The future AI module should return:

```cpp
speciesId = "dog"; // or "cat"
confidence = 0.94;
```

Then call:

```cpp
feedSpecies(speciesId, 0, requestId, "automatic");
```

A target of `0` makes the feeding controller obtain the portion from
Firebase/default configuration.
