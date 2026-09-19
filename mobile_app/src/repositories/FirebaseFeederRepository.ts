import {
  get,
  onValue,
  push,
  ref,
  remove,
  runTransaction,
  update,
} from '@react-native-firebase/database';
import {
  COMMAND_EPOCH_UNIT,
  FEEDER_DEVICE_ID,
  getFeederDatabase,
} from '../firebase/config';
import {
  finite,
  isDeviceReady,
  isSpecies,
  mapDevice,
  readCommand,
  record,
  scheduleLocation,
  serializeProfile,
  serializeSchedule,
} from '../firebase/deviceContract';
import {
  AppSnapshot,
  FeedCommand,
  FeedCommandResult,
  FeedingMode,
  FeedingSchedule,
  SpeciesProfile,
} from '../types/models';
import { FeederRepository } from './FeederRepository';

const asError = (error: unknown) =>
  error instanceof Error ? error : new Error(String(error));

export class FirebaseFeederRepository implements FeederRepository {
  private readonly readNotificationIds = new Set<string>();
  private readonly refreshListeners = new Set<() => void>();
  private sending = false;

  // Auth controls access through security rules; config belongs to the DEVICE.
  constructor(_uid: string, _email: string, _name: string) {}

  private deviceRef(child = '') {
    return ref(
      getFeederDatabase(),
      `devices/${FEEDER_DEVICE_ID}${child ? `/${child}` : ''}`,
    );
  }

  subscribe(
    onSnapshot: (snapshot: AppSnapshot) => void,
    onError?: (error: Error) => void,
  ) {
    let active = true;
    let cancelled = false;
    let rawDevice: unknown;
    let received = false;
    let connected = false;
    const emit = () => {
      if (!active || cancelled || !received) {
        return;
      }
      try {
        onSnapshot(mapDevice(rawDevice, connected, this.readNotificationIds));
      } catch (error) {
        onError?.(asError(error));
      }
    };
    const fail = (error: unknown) => {
      cancelled = true;
      if (active) {
        onError?.(asError(error));
      }
    };
    const unsubscribeConnection = onValue(
      ref(getFeederDatabase(), '.info/connected'),
      snapshot => {
        connected = snapshot.val() === true;
        emit();
      },
      fail,
    );
    const unsubscribeDevice = onValue(
      this.deviceRef(),
      snapshot => {
        rawDevice = snapshot.val();
        received = true;
        emit();
      },
      fail,
    );
    this.refreshListeners.add(emit);
    return () => {
      active = false;
      unsubscribeConnection();
      unsubscribeDevice();
      this.refreshListeners.delete(emit);
    };
  }

  async getSnapshot() {
    const [device, connection] = await Promise.all([
      get(this.deviceRef()),
      get(ref(getFeederDatabase(), '.info/connected')),
    ]);
    return mapDevice(
      device.val(),
      connection.val() === true,
      this.readNotificationIds,
    );
  }

  private async requireConnection() {
    const connection = await get(ref(getFeederDatabase(), '.info/connected'));
    if (connection.val() !== true) {
      throw new Error(
        'Firebase is disconnected. Reconnect before sending changes.',
      );
    }
  }

  async updateProfile(profile: SpeciesProfile) {
    const payload = serializeProfile(profile);
    await this.requireConnection();
    await update(
      this.deviceRef(`config/speciesProfiles/${profile.id}`),
      payload,
    );
    return { ...profile, configValid: true };
  }

  private async validateSchedule(schedule: FeedingSchedule) {
    const payload = serializeSchedule(schedule);
    const snapshot = await this.getSnapshot();
    if (!snapshot.connected) {
      throw new Error('Reconnect to Firebase before changing schedules.');
    }
    const profile = snapshot.profiles.find(
      item => item.id === schedule.speciesId,
    );
    if (
      !profile?.configValid ||
      schedule.portionGrams > profile.dailyLimitGrams
    ) {
      throw new Error(
        'Save a valid species profile first and keep this portion within its daily limit.',
      );
    }
    return payload;
  }

  async addSchedule(schedule: FeedingSchedule) {
    const payload = await this.validateSchedule(schedule);
    const target = push(
      this.deviceRef(`config/schedules/${schedule.speciesId}`),
    );
    if (!target.key) {
      throw new Error('Could not generate a schedule ID.');
    }
    await update(target, payload);
    return { ...schedule, id: `${schedule.speciesId}/${target.key}` };
  }

  async updateSchedule(schedule: FeedingSchedule) {
    const location = scheduleLocation(schedule.id);
    if (location.species !== schedule.speciesId) {
      throw new Error(
        'A schedule cannot change feeder. Delete it and add a new schedule for the other species.',
      );
    }
    const payload = await this.validateSchedule(schedule);
    // Abort if another client removed it; do not recreate deleted schedules.
    const current = await get(this.deviceRef(location.path));
    if (!current.exists()) {
      throw new Error('Schedule no longer exists.');
    }
    const result = await runTransaction(
      this.deviceRef(location.path),
      value => (value === null ? null : { ...record(value), ...payload }),
      { applyLocally: false },
    );
    if (!result.committed || !result.snapshot.exists()) {
      throw new Error('Schedule no longer exists. Reload and try again.');
    }
    return schedule;
  }

  async toggleSchedule(id: string, enabled: boolean) {
    const { path, species } = scheduleLocation(id);
    if (typeof enabled !== 'boolean') {
      throw new Error('Invalid schedule state.');
    }
    await this.requireConnection();
    const current = await get(this.deviceRef(path));
    if (!current.exists()) {
      throw new Error('Schedule no longer exists.');
    }
    if (enabled) {
      const wire = record(current.val());
      await this.validateSchedule({
        id,
        speciesId: species,
        time: String(wire.time ?? ''),
        portionGrams: finite(wire.portionGrams) ?? 0,
        enabled,
        repeatLabel: 'Every day',
      });
    }
    const result = await runTransaction(
      this.deviceRef(path),
      value => (value === null ? null : { ...record(value), enabled }),
      { applyLocally: false },
    );
    if (!result.committed || !result.snapshot.exists()) {
      throw new Error('Schedule no longer exists.');
    }
  }

  async deleteSchedule(id: string) {
    const { path } = scheduleLocation(id);
    await this.requireConnection();
    await remove(this.deviceRef(path));
  }

  async feedNow(request: FeedCommand): Promise<FeedCommandResult> {
    if (this.sending) {
      throw new Error('A request is already being sent. Do not send again.');
    }
    if (
      !isSpecies(request.speciesId) ||
      !Number.isFinite(request.targetGrams) ||
      request.targetGrams <= 0
    ) {
      throw new Error('Select dog/cat and a positive number of grams.');
    }
    this.sending = true;
    try {
      const snapshot = await this.getSnapshot();
      const offsetSnapshot = await get(
        ref(getFeederDatabase(), '.info/serverTimeOffset'),
      );
      const now = Date.now() + (finite(offsetSnapshot.val()) ?? 0);
      if (!isDeviceReady(snapshot, now)) {
        throw new Error(
          'Feeder unavailable: check Firebase connection, online status, recent lastSeenEpoch and errorCode.',
        );
      }
      if (
        !['idle', 'completed', 'failed'].includes(
          snapshot.runtime.feeding.status,
        )
      ) {
        throw new Error(
          'Feeder is busy or runtime/feeding has no valid idle status.',
        );
      }
      const profile = snapshot.profiles.find(
        item => item.id === request.speciesId,
      );
      if (!profile?.configValid) {
        throw new Error('Save a valid species profile before feeding.');
      }
      const cooldown = snapshot.runtime.cooldownUntilMs[request.speciesId];
      if (cooldown === null) {
        throw new Error('Firmware has not provided a valid cooldown value.');
      }
      if (cooldown > now) {
        throw new Error(
          `Cooldown active. Wait about ${Math.ceil(
            (cooldown - now) / 1000,
          )} seconds.`,
        );
      }
      const dayStart = new Date(now);
      dayStart.setHours(0, 0, 0, 0);
      const measuredToday = snapshot.history
        .filter(
          item =>
            item.speciesId === request.speciesId &&
            item.result === 'completed' &&
            Date.parse(item.timestamp) >= dayStart.getTime() &&
            Date.parse(item.timestamp) <= now,
        )
        .reduce((sum, item) => sum + item.actualGrams, 0);
      if (request.targetGrams + measuredToday > profile.dailyLimitGrams) {
        throw new Error(
          'This request would exceed the configured daily limit based on received history.',
        );
      }
      const requestId = push(this.deviceRef('command')).key;
      if (!requestId) {
        throw new Error('Could not generate a request ID.');
      }
      const command = {
        requestId,
        type: 'feed_now',
        speciesId: request.speciesId,
        targetGrams: request.targetGrams,
        status: 'pending',
        requestedAtEpoch:
          COMMAND_EPOCH_UNIT === 'seconds' ? Math.floor(now / 1000) : now,
      };
      // Atomic claim of the SINGLE command slot; never overwrite in-flight
      // commands submitted by this phone or another phone.
      const result = await runTransaction(
        this.deviceRef('command'),
        current => {
          if (
            current !== null &&
            !['idle', 'completed', 'failed'].includes(
              String(record(current).status),
            )
          ) {
            return undefined;
          }
          return command;
        },
        { applyLocally: false },
      );
      if (!result.committed) {
        throw new Error(
          'Another command is pending/processing. Wait for the ESP32 result; do not resend.',
        );
      }
      // Accepted is NOT completed. The realtime subscription shows the
      // eventual ESP32 response. No fake history or notification writes.
      return { command: readCommand(command)! };
    } finally {
      this.sending = false;
    }
  }

  async markAllNotificationsRead() {
    const snapshot = await this.getSnapshot();
    snapshot.notifications.forEach(item =>
      this.readNotificationIds.add(item.id),
    );
    this.refreshListeners.forEach(emit => emit());
  }
  async updateDeviceName(_name: string): Promise<void> {
    throw new Error('Device renaming is not part of firmware contract V1.');
  }
  async updateOperatingMode(_mode: FeedingMode): Promise<void> {
    throw new Error(
      'status/operatingMode is ESP32-owned and read-only. Edit species config instead.',
    );
  }
}
