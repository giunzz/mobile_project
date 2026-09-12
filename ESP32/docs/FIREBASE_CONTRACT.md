# Firebase RTDB Contract - Firmware V1

Root:

```text
/devices/feeder-01
```

## App -> Firmware: command

Path:

```text
/devices/feeder-01/command
```

Fields:

| Field | Type | Meaning |
|---|---|---|
| requestId | string | Unique request ID |
| type | string | `feed_now` or `none` |
| speciesId | string | `dog`, `cat`, `none` |
| targetGrams | number | Requested portion, `0` = use profile/default |
| status | string | `pending`, `processing`, `completed`, `failed`, `idle` |
| requestedAtEpoch | number | UTC epoch seconds |

Firmware adds/updates:

```text
actualGrams
completedAtEpoch
errorCode
status
```

## App -> Firmware: species config

```text
/devices/feeder-01/config/speciesProfiles/dog
/devices/feeder-01/config/speciesProfiles/cat
```

V1 reads:

```text
portionGrams
cooldownMinutes
```

Reserved for later versions:

```text
dailyLimitGrams
autoFeedEnabled
notificationsEnabled
```

## Firmware -> App: runtime

```text
/devices/feeder-01/runtime/feeding
/devices/feeder-01/runtime/cooldown
/devices/feeder-01/runtime/latestDetection
```

`latestDetection` is reserved for AI integration.

## Firmware -> App: status heartbeat

```text
/devices/feeder-01/status
```

Important fields:

```text
online
firmwareVersion
ipAddress
wifiRssi
lastSeenEpoch
errorCode
```

The app should use `lastSeenEpoch` to detect stale/offline devices, because a
device that loses power cannot always write `online=false`.

## Firmware -> App: feeding history

Firmware dynamically pushes:

```text
/devices/feeder-01/feedingHistory/{pushId}
```

Fields:

```text
requestId
speciesId
mode
targetGrams
actualGrams
result
errorCode
timestampEpoch
```
