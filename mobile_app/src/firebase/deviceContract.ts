import {
  AppSnapshot,
  FeedingCommandRecord,
  FeedingHistory,
  FeedingSchedule,
  NotificationItem,
  SpeciesId,
  SpeciesProfile,
} from '../types/models';
import { FEEDER_DEVICE_ID, DEVICE_HEARTBEAT_MAX_AGE_MS } from './config';

export const SPECIES: SpeciesId[] = ['dog', 'cat'];
export const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export const finite = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
export const isSpecies = (value: unknown): value is SpeciesId =>
  value === 'dog' || value === 'cat';
const text = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value : fallback;

export function epochMs(value: unknown): number | null {
  const number = finite(value);
  if (number === null || number < 0) {
    return null;
  }
  const milliseconds = number < 1e12 ? number * 1000 : number;
  return milliseconds <= 8640000000000000 ? milliseconds : null;
}
const isoEpoch = (value: unknown): string => {
  const milliseconds = epochMs(value);
  return milliseconds && milliseconds > 0
    ? new Date(milliseconds).toISOString()
    : '';
};
const isoTimestamp = (value: unknown): string => {
  if (typeof value === 'number') {
    return isoEpoch(value);
  }
  if (typeof value !== 'string' || !value.trim()) {
    return '';
  }
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds)
    ? new Date(milliseconds).toISOString()
    : '';
};

export function serializeProfile(profile: SpeciesProfile) {
  if (!isSpecies(profile.id)) {
    throw new Error('Firmware V1 only supports dog and cat.');
  }
  if (
    !Number.isFinite(profile.portionGrams) ||
    profile.portionGrams <= 0 ||
    !Number.isFinite(profile.dailyLimitGrams) ||
    profile.dailyLimitGrams < profile.portionGrams ||
    !Number.isInteger(profile.cooldownMinutes) ||
    profile.cooldownMinutes < 0 ||
    typeof profile.autoFeedEnabled !== 'boolean' ||
    typeof profile.notificationsEnabled !== 'boolean'
  ) {
    throw new Error(
      'Use a positive portion, a daily limit at least as large, and a non-negative whole cooldown in minutes.',
    );
  }
  return {
    portionGrams: profile.portionGrams,
    dailyLimitGrams: profile.dailyLimitGrams,
    cooldownMinutes: profile.cooldownMinutes,
    autoFeedEnabled: profile.autoFeedEnabled,
    notificationsEnabled: profile.notificationsEnabled,
  };
}
export function serializeSchedule(schedule: FeedingSchedule) {
  if (
    !isSpecies(schedule.speciesId) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.time) ||
    !Number.isFinite(schedule.portionGrams) ||
    schedule.portionGrams <= 0 ||
    typeof schedule.enabled !== 'boolean'
  ) {
    throw new Error('Use dog/cat, a valid HH:MM time, and a positive portion.');
  }
  return {
    time: schedule.time,
    portionGrams: schedule.portionGrams,
    enabled: schedule.enabled,
  };
}
// dog/schedule-01 and cat/schedule-01 are DIFFERENT schedules.
export function scheduleLocation(id: string) {
  const [species, key, extra] = id.split('/');
  if (
    !isSpecies(species) ||
    !key ||
    extra !== undefined ||
    Array.from(key).some(
      character =>
        '.#$[]'.includes(character) ||
        character.charCodeAt(0) < 32 ||
        character.charCodeAt(0) === 127,
    )
  ) {
    throw new Error('Invalid schedule ID. Reload schedules before editing.');
  }
  return { species, key, path: `config/schedules/${species}/${key}` };
}
export function readCommand(value: unknown): FeedingCommandRecord | null {
  const command = record(value);
  if (
    !text(command.requestId) ||
    command.type !== 'feed_now' ||
    !isSpecies(command.speciesId) ||
    !['pending', 'processing', 'completed', 'failed'].includes(
      text(command.status),
    )
  ) {
    return null;
  }
  return {
    id: text(command.requestId),
    speciesId: command.speciesId,
    targetGrams: finite(command.targetGrams) ?? 0,
    status: command.status as FeedingCommandRecord['status'],
    requestedAt: isoEpoch(command.requestedAtEpoch),
    // Command schema has no actualGrams/completedAt. Never borrow another
    // command's measurement or uncorrelated runtime data.
  };
}
export function isDeviceReady(snapshot: AppSnapshot, now = Date.now()) {
  const age = now - snapshot.device.lastSeenMs;
  return (
    snapshot.connected &&
    snapshot.device.online &&
    snapshot.device.lastSeenMs > 0 &&
    age >= -30000 &&
    age <= DEVICE_HEARTBEAT_MAX_AGE_MS &&
    snapshot.device.errorCode === 'none'
  );
}

export function mapDevice(
  value: unknown,
  connected = false,
  readIds = new Set<string>(),
): AppSnapshot {
  const device = record(value);
  if (
    !Object.keys(device).length ||
    !Object.keys(record(device.config)).length
  ) {
    throw new Error(
      `Missing devices/${FEEDER_DEVICE_ID}/config. Ask the Firebase owner to merge the supplied V1 config. The app will not seed or overwrite device data.`,
    );
  }
  const warnings: string[] = [];
  const config = record(device.config);
  const wireProfiles = record(config.speciesProfiles);
  const profiles = SPECIES.map(id => {
    const wire = record(wireProfiles[id]);
    const profile: SpeciesProfile = {
      id,
      displayName: id === 'dog' ? 'Dog' : 'Cat',
      emoji: id === 'dog' ? '🐕' : '🐈',
      description:
        id === 'dog'
          ? 'Feeder 1 · Servo 1 · Load cell 1'
          : 'Feeder 2 · Servo 2 · Load cell 2',
      foodType: id === 'dog' ? 'Dog food' : 'Cat food',
      portionGrams: finite(wire.portionGrams) ?? (id === 'dog' ? 80 : 45),
      dailyLimitGrams:
        finite(wire.dailyLimitGrams) ?? (id === 'dog' ? 320 : 180),
      cooldownMinutes: finite(wire.cooldownMinutes) ?? 10,
      autoFeedEnabled: wire.autoFeedEnabled === true,
      notificationsEnabled: wire.notificationsEnabled === true,
      configValid: false,
    };
    try {
      serializeProfile({ ...profile, ...wire, id } as SpeciesProfile);
      profile.configValid = [
        'portionGrams',
        'dailyLimitGrams',
        'cooldownMinutes',
        'autoFeedEnabled',
        'notificationsEnabled',
      ].every(key => wire[key] !== undefined);
    } catch {
      /* Invalid config remains disabled for feeding. */
    }
    if (!profile.configValid) {
      warnings.push(
        `${profile.displayName} config is missing/invalid. Defaults are only for editing; save a valid profile before feeding.`,
      );
    }
    return profile;
  });

  const schedules: FeedingSchedule[] = [];
  const wireSchedules = record(config.schedules);
  for (const speciesId of SPECIES) {
    for (const [key, item] of Object.entries(
      record(wireSchedules[speciesId]),
    )) {
      const wire = record(item);
      const schedule = {
        id: `${speciesId}/${key}`,
        speciesId,
        time: text(wire.time),
        portionGrams: finite(wire.portionGrams) ?? 0,
        enabled: wire.enabled === true,
        repeatLabel: 'Daily · ESP32 clock',
      };
      try {
        scheduleLocation(schedule.id);
        serializeSchedule({ ...schedule, enabled: wire.enabled as boolean });
        schedules.push(schedule);
      } catch {
        warnings.push(
          `Schedule ${speciesId}/${key} has an invalid format and was not loaded.`,
        );
      }
    }
  }

  const history: FeedingHistory[] = [];
  let invalidHistory = 0;
  for (const [id, item] of Object.entries(record(device.feedingHistory))) {
    const wire = record(item);
    const result = wire.result ?? wire.status;
    const actual = finite(wire.actualGrams);
    const target = finite(wire.targetGrams);
    // Keep invalid history out of totals; never invent successful records.
    if (
      !isSpecies(wire.speciesId) ||
      actual === null ||
      actual < 0 ||
      target === null ||
      target < 0 ||
      !['completed', 'failed', 'cancelled'].includes(text(result))
    ) {
      invalidHistory += 1;
      continue;
    }
    const timestamp =
      isoEpoch(wire.completedAtEpoch ?? wire.timestampEpoch) ||
      isoTimestamp(wire.timestamp);
    if (!timestamp) {
      warnings.push(
        `History ${id} has no supported timestamp; it is excluded from time-based statistics.`,
      );
    }
    history.push({
      id,
      speciesId: wire.speciesId,
      actualGrams: actual,
      targetGrams: target,
      timestamp,
      mode:
        wire.mode === 'manual' || wire.mode === 'automatic'
          ? wire.mode
          : 'unknown',
      result: result as FeedingHistory['result'],
      requestId: text(wire.requestId) || undefined,
    });
  }
  if (invalidHistory) {
    warnings.push(
      `${invalidHistory} history record(s) have unsupported fields. Confirm the firmware history schema; statistics may be incomplete.`,
    );
  }
  history.sort(
    (a, b) => (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0),
  );
  const status = record(device.status);
  const runtime = record(device.runtime);
  const feeding = record(runtime.feeding);
  const cooldown = record(runtime.cooldown);
  const detection = record(runtime.latestDetection);
  const command = readCommand(device.command);
  const notifications: NotificationItem[] = history
    .filter(
      item =>
        profiles.find(profile => profile.id === item.speciesId)
          ?.notificationsEnabled,
    )
    .map(item => ({
      id: `history:${item.id}`,
      kind: item.result === 'completed' ? 'success' : 'error',
      event:
        item.result === 'completed' ? 'feeding_completed' : 'feeding_failed',
      title:
        item.result === 'completed'
          ? 'Firmware recorded a completed feed'
          : 'Firmware recorded an unsuccessful feed',
      message: `${item.speciesId}: ${item.actualGrams} g measured.`,
      timestamp: item.timestamp,
      read: readIds.has(`history:${item.id}`),
    }));
  if (
    command &&
    ['completed', 'failed'].includes(command.status) &&
    !history.some(item => item.requestId === command.id) &&
    profiles.find(profile => profile.id === command.speciesId)
      ?.notificationsEnabled
  ) {
    notifications.unshift({
      id: `command:${command.id}`,
      kind: command.status === 'completed' ? 'success' : 'error',
      event:
        command.status === 'completed' ? 'feeding_completed' : 'feeding_failed',
      title: `ESP32 command ${command.status}`,
      message: `${command.speciesId}: requested ${command.targetGrams} g. Actual amount awaits matching firmware history. Time shown is request time.`,
      timestamp: command.requestedAt,
      read: readIds.has(`command:${command.id}`),
    });
  }
  const rssi = finite(status.wifiRssi);
  return {
    device: {
      id: FEEDER_DEVICE_ID,
      name: 'Smart Feeder 01',
      online: status.online === true,
      foodLevelPercent: null,
      wifiStrengthPercent: null,
      lidClosed: null,
      wifiRssi: rssi !== null && rssi < 0 ? rssi : null,
      lastSeenMs: epochMs(status.lastSeenEpoch) ?? 0,
      lastSync: isoEpoch(status.lastSeenEpoch),
      firmwareVersion: text(status.firmwareVersion, 'Unknown'),
      ipAddress: text(status.ipAddress),
      errorCode: text(status.errorCode, 'unknown'),
      aiModelName: 'Not reported by firmware',
      operatingMode:
        status.operatingMode === 'manual' ||
        status.operatingMode === 'automatic'
          ? status.operatingMode
          : 'unknown',
    },
    detection: {
      speciesId: isSpecies(detection.speciesId) ? detection.speciesId : 'none',
      confidence: Math.min(1, Math.max(0, finite(detection.confidence) ?? 0)),
      capturedAt: isoEpoch(detection.capturedAtEpoch),
    },
    profiles,
    schedules,
    history,
    notifications,
    commands: command ? [command] : [],
    connected,
    warnings,
    runtime: {
      feeding: {
        status: text(feeding.status, 'unknown'),
        activeSpecies: isSpecies(feeding.activeSpecies)
          ? feeding.activeSpecies
          : 'none',
        targetGrams: finite(feeding.targetGrams),
        actualGrams: finite(feeding.actualGrams),
        ledOn: feeding.ledOn === true,
      },
      cooldownUntilMs: {
        dog: epochMs(cooldown.dogUntilEpoch),
        cat: epochMs(cooldown.catUntilEpoch),
      },
    },
  };
}
