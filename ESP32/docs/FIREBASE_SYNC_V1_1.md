# Firebase, firmware and Android sync 1.1

The firmware and Android app use the same RTDB root, `devices/feeder-01`.
This document describes source-code behavior. Flashing and a live device test
are still required to confirm the installed firmware.

## Feeding configuration

- `config/speciesProfiles/{dog|cat}/portionGrams` sets the default portion.
- `cooldownMinutes` sets the per-species cooldown.
- `dailyLimitGrams` is required. The device refuses to open a servo if this
  field, the current clock, or today's history cannot be read safely.
- `autoFeedEnabled` gates both AI-triggered and scheduled feeds. Manual feeds
  remain available when this flag is false.
- A feeding day starts at **00:00 UTC+7**. The app uses the same boundary.
  Both sides count measured grams from completed and partially failed feeds.

The firmware queries `feedingHistory` by `timestampEpoch` for the current
UTC+7 day. Add `.indexOn: ["timestampEpoch"]` at the `feedingHistory` node
in the deployed RTDB Rules for efficient queries. Keep the current access
conditions when adding this index; the app package does not deploy Rules.
The device fails closed if the query fails or exceeds 16 KiB. Older history
records without numeric `timestampEpoch`, or with millisecond timestamps,
are excluded by this seconds-based Firebase query; normalize them to Unix
seconds before relying on daily limits.

## Daily schedules

The app writes `config/schedules/{dog|cat}/{scheduleId}` with `time` (`HH:MM`),
`portionGrams` and `enabled`. The firmware checks schedules every 20 seconds.
A schedule runs once per UTC+7 day only when its own `enabled` flag and the
species `autoFeedEnabled` flag are true. Each schedule is claimed in NVS before
feeding, so restarting during the scheduled minute does not dispense twice.
Missed minutes are not replayed. The firmware accepts up to 32 schedules per
species and a 16 KiB schedule response; invalid or excessive lists are skipped.
An automatic attempt blocked before the servo opens is logged on Serial but
does not create a zero-gram feeding-history record. Failed feeds that did
dispense food still record their measured grams.

## Manual commands and recovery

The app writes one command at `command` with a unique `requestId` and Unix
seconds in `requestedAtEpoch`. The firmware only processes `pending` commands
up to 120 seconds old, allowing 30 seconds of future clock skew. It records
the request ID in NVS before feeding to avoid repeating it after a restart.
After a restart, a command left in `processing` is marked `failed` with
`interrupted_by_restart`; a repeated `pending` ID is marked `failed` with
`duplicate_request`. Neither causes a new servo movement.
If a completed feed loses its final Firebase acknowledgement, the next
poll marks the orphaned `processing` command `completion_unconfirmed`; inspect
the scale and history before sending a fresh request.

Only a **manual** feed updates `command/status`. AI and scheduled feeds update
`runtime/feeding` and `feedingHistory`, leaving any manual command untouched.
The app uses matching history `requestId` values to show measured grams.

## Device test after flashing

1. Confirm the existing calibration and hardware test still pass.
2. Set `autoFeedEnabled=false`; verify AI detection updates Firebase but does
   not open a servo. A manual `feed_now` should still complete.
3. Set a low daily limit and verify another request fails before servo movement.
4. Enable automatic feeding and one schedule a few minutes ahead in UTC+7.
   Verify exactly one history record and no second feed after restarting in
   that minute.
5. Send a manual command, interrupt/restart during `processing`, and verify
   the old command is failed without another servo movement.
6. Verify the app shows matching status, history, cooldown and daily total.

Firebase acknowledgments do not prove that food was physically dispensed;
compare the history's `actualGrams` with the scale during the hardware test.
