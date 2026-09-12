# Firmware V1 Test Procedure

## Test A - Boot

Expected:

```text
[CAM] Camera initialized.
[SERVO] Servo 1/2 initialized and closed.
[HX711-1] Ready and tared.
[HX711-2] Ready and tared.
[WIFI] Connected.
[FIREBASE] Ready.
```

If load cells are not calibrated, this warning is expected:

```text
[ACTION REQUIRED] Calibrate both load cells before feeding.
```

## Test B - Camera

Serial:

```text
CAM
```

Expected: one frame with width/height/size is printed.

## Test C - Calibration

Follow `CALIBRATION_GUIDE.md`.

## Test D - Servo/load-cell closed loop

Use a small amount first:

```text
TESTDOG 10
```

Expected:

```text
Servo 1 opens
LED ON
Load Cell 1 increases
Servo 1 closes near target
LED OFF
Success beep
```

Then test CAT.

## Test E - Firebase Feed Now

Write:

```json
{
  "requestId": "bench-001",
  "type": "feed_now",
  "speciesId": "dog",
  "targetGrams": 10,
  "status": "pending",
  "requestedAtEpoch": 0
}
```

Expected:

```text
pending -> processing -> completed
```

and new history appears.

## Test F - Cooldown

Immediately submit another DOG request.

Expected:

```text
status = failed
errorCode = cooldown_active
```

CAT remains independently eligible.

## Test G - No food / jam

Temporarily test with an empty hopper.

Expected after no-weight-progress timeout:

```text
Servo closes
LED OFF
3 error beeps
status = failed
errorCode = no_weight_progress
```

## Test H - Timeout

If weight remains below target but changes too slowly, firmware must close the
servo no later than `FEEDING_TIMEOUT_MS`.
