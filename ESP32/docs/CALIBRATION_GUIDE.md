# HX711 Calibration Guide

The current hardware test confirms that both HX711 modules return raw values,
but raw counts are not grams. Calibrate before any automatic feeding.

## DOG - Load Cell 1

1. Power on the complete feeder.
2. Make sure the DOG weighing platform has no **calibration weight** on it.
3. Serial Monitor:
   ```text
   TARE1
   ```
4. Put a known weight on Load Cell 1. A 100 g calibration weight is convenient.
5. Run:
   ```text
   CAL1 100
   ```
6. Firmware computes:
   ```text
   factor = (raw_average - tare_offset) / known_grams
   ```
7. Verify:
   ```text
   WEIGHT
   ```
   DOG should read close to 100 g.

## CAT - Load Cell 2

Repeat:

```text
TARE2
CAL2 100
WEIGHT
```

## Persistence

The two factors are stored in ESP32 NVS:

```text
hx1_factor
hx2_factor
```

They remain after reboot.

## Notes

- A negative calibration factor can be valid depending on load-cell wiring.
- Do calibration only after the mechanical platform is fully assembled.
- Do not move the load cell or change mounting geometry after calibration.
- If readings drift significantly, recalibrate.
