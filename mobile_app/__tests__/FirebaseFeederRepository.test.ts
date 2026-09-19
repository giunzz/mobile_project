import * as db from '@react-native-firebase/database';
import fixture from '../docs/contract/ai-smart-pet-feeder-rtdb-final.json';
import { FirebaseFeederRepository } from '../src/repositories/FirebaseFeederRepository';
import {
  epochMs,
  mapDevice,
  record,
  scheduleLocation,
} from '../src/firebase/deviceContract';
import { formatDateTime, formatTimeAgo } from '../src/utils/format';
import { AppSnapshot, FeedCommand } from '../src/types/models';

// A deterministic RTDB fixture, not a live Firebase project. Transactions retry
// against the latest server value to exercise command-slot contention.
const ROOT = 'devices/feeder-01';
type FakeRef = { path: string; key: string };
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
let state: Record<string, unknown>;
let writes: { method: string; path: string; value?: unknown }[];
let subscribers: Map<string, (value: ReturnType<typeof snap>) => void>;
let cancelListeners: Map<string, (error: Error) => void>;
let keyCounter: number;
const read = (path: string) =>
  path.split('/').reduce<unknown>((node, key) => record(node)[key], state) ??
  null;
const snap = (value: unknown) => ({
  val: () => copy(value),
  exists: () => value !== null,
});
function put(path: string, value: unknown, notify = true) {
  const parts = path.split('/');
  const last = parts.pop()!;
  let parent = state;
  for (const part of parts) {
    if (!parent[part]) {
      parent[part] = {};
    }
    parent = parent[part] as Record<string, unknown>;
  }
  if (value === null) {
    delete parent[last];
  } else {
    parent[last] = copy(value);
  }
  if (notify) {
    subscribers.forEach((listener, at) => {
      if (
        path === at ||
        path.startsWith(`${at}/`) ||
        at.startsWith(`${path}/`)
      ) {
        listener(snap(read(at)));
      }
    });
  }
}
const repository = () =>
  new FirebaseFeederRepository('test-user', 'test@example.invalid', 'Test');
function ready() {
  put(`${ROOT}/status/online`, true);
  put(`${ROOT}/status/lastSeenEpoch`, Math.floor(Date.now() / 1000));
}
beforeEach(() => {
  jest.clearAllMocks();
  state = copy(fixture);
  writes = [];
  subscribers = new Map();
  cancelListeners = new Map();
  keyCounter = 0;
  put('.info/connected', true);
  put('.info/serverTimeOffset', 0);
  (db.ref as jest.Mock).mockImplementation((_database, path: string) => ({
    path,
    key: path.split('/').pop(),
  }));
  (db.get as jest.Mock).mockImplementation(async (reference: FakeRef) =>
    snap(read(reference.path)),
  );
  (db.onValue as jest.Mock).mockImplementation(
    (reference: FakeRef, listener, onError) => {
      subscribers.set(reference.path, listener);
      cancelListeners.set(reference.path, onError);
      listener(snap(read(reference.path)));
      return () => {
        subscribers.delete(reference.path);
        cancelListeners.delete(reference.path);
      };
    },
  );
  (db.push as jest.Mock).mockImplementation((reference: FakeRef) => {
    const key = `generated-${++keyCounter}`;
    return { path: `${reference.path}/${key}`, key };
  });
  (db.update as jest.Mock).mockImplementation(
    async (reference: FakeRef, value) => {
      writes.push({
        method: 'update',
        path: reference.path,
        value: copy(value),
      });
      put(reference.path, { ...record(read(reference.path)), ...value });
    },
  );
  (db.remove as jest.Mock).mockImplementation(async (reference: FakeRef) => {
    writes.push({ method: 'remove', path: reference.path });
    put(reference.path, null);
  });
  (db.runTransaction as jest.Mock).mockImplementation(
    async (reference: FakeRef, updater) => {
      const before = copy(read(reference.path));
      let value = updater(before);
      await Promise.resolve();
      if (JSON.stringify(read(reference.path)) !== JSON.stringify(before)) {
        value = updater(copy(read(reference.path)));
      }
      if (value === undefined) {
        return { committed: false, snapshot: snap(read(reference.path)) };
      }
      writes.push({
        method: 'transaction',
        path: reference.path,
        value: copy(value),
      });
      put(reference.path, value);
      return { committed: true, snapshot: snap(value) };
    },
  );
});

test('loads exactly two feeders and colliding schedule keys without seeding any data', async () => {
  const data = await repository().getSnapshot();
  expect(data.profiles.map(profile => profile.id)).toEqual(['dog', 'cat']);
  expect(data.schedules.map(item => item.id)).toEqual([
    'dog/schedule-01',
    'cat/schedule-01',
  ]);
  expect(data.profiles.map(profile => profile.configValid)).toEqual([
    true,
    true,
  ]);
  expect(data.detection.speciesId).toBe('none');
  expect(data.history).toEqual([]);
  expect(data.notifications).toEqual([]);
  expect(data.device.wifiRssi).toBeNull();
  expect(data.device.lastSync).toBe('');
  expect(writes).toEqual([]);
  expect(db.set).not.toHaveBeenCalled();
});

test('saves only the five contracted profile fields to the shared device', async () => {
  const repo = repository();
  const profile = (await repo.getSnapshot()).profiles[0];
  await repo.updateProfile({
    ...profile,
    portionGrams: 85,
    cooldownMinutes: 11,
  });
  expect(writes).toEqual([
    {
      method: 'update',
      path: `${ROOT}/config/speciesProfiles/dog`,
      value: {
        portionGrams: 85,
        dailyLimitGrams: 320,
        cooldownMinutes: 11,
        autoFeedEnabled: false,
        notificationsEnabled: true,
      },
    },
  ]);
  expect(read('users')).toBeNull();
});

test('add, edit, toggle and delete dog schedules never affect the cat schedule with the same key', async () => {
  const repo = repository();
  const catBefore = copy(read(`${ROOT}/config/schedules/cat`));
  const dog = (await repo.getSnapshot()).schedules[0];
  await repo.updateSchedule({ ...dog, time: '08:30' });
  await repo.toggleSchedule(dog.id, true);
  expect(read(`${ROOT}/config/schedules/dog/schedule-01`)).toEqual({
    time: '08:30',
    portionGrams: 80,
    enabled: true,
  });
  const added = await repo.addSchedule({
    ...dog,
    id: '',
    time: '12:00',
    enabled: false,
  });
  expect(added.id).toBe('dog/generated-1');
  expect(read(`${ROOT}/config/schedules/dog/generated-1`)).toEqual({
    time: '12:00',
    portionGrams: 80,
    enabled: false,
  });
  await repo.deleteSchedule(dog.id);
  expect(read(`${ROOT}/config/schedules/cat`)).toEqual(catBefore);
  expect(
    writes.every(write =>
      write.path.startsWith(`${ROOT}/config/schedules/dog/`),
    ),
  ).toBe(true);
});

test('does not recreate deleted schedules or let an edit move feeders', async () => {
  const repo = repository();
  const dog = (await repo.getSnapshot()).schedules[0];
  await expect(
    repo.updateSchedule({ ...dog, speciesId: 'cat' }),
  ).rejects.toThrow('cannot change feeder');
  put(`${ROOT}/config/schedules/dog/schedule-01`, null);
  await expect(repo.updateSchedule(dog)).rejects.toThrow('no longer exists');
  await expect(repo.toggleSchedule(dog.id, true)).rejects.toThrow(
    'no longer exists',
  );
  expect(writes).toEqual([]);
});

test.each(['dog/../status', 'cat', 'cat/a/b', 'rabbit/id', 'dog/a.b'])(
  'rejects unsafe schedule path %s',
  id => {
    expect(() => scheduleLocation(id)).toThrow();
  },
);

test('checks portions when enabling an existing schedule', async () => {
  put(`${ROOT}/config/schedules/dog/schedule-01/portionGrams`, 500);
  await expect(
    repository().toggleSchedule('dog/schedule-01', true),
  ).rejects.toThrow('daily limit');
  expect(writes).toEqual([]);
});

test('rejects malformed schedule and profile data', async () => {
  const repo = repository();
  const data = await repo.getSnapshot();
  await expect(
    repo.updateProfile({ ...data.profiles[0], cooldownMinutes: -1 }),
  ).rejects.toThrow();
  await expect(
    repo.addSchedule({ ...data.schedules[0], time: '25:00' }),
  ).rejects.toThrow();
  await expect(
    repo.addSchedule({ ...data.schedules[0], portionGrams: NaN }),
  ).rejects.toThrow();
  expect(writes).toEqual([]);
});

test('writes the six-field command to the singleton and does not fabricate completion/history', async () => {
  ready();
  const repo = repository();
  const before = copy(read(ROOT));
  const result = await repo.feedNow({ speciesId: 'cat', targetGrams: 45 });
  expect(result.command.status).toBe('pending');
  expect(Object.keys(result)).toEqual(['command']);
  expect(writes).toHaveLength(1);
  expect(writes[0]).toEqual({
    method: 'transaction',
    path: `${ROOT}/command`,
    value: {
      requestId: 'generated-1',
      type: 'feed_now',
      speciesId: 'cat',
      targetGrams: 45,
      status: 'pending',
      requestedAtEpoch: expect.any(Number),
    },
  });
  expect(record(read(`${ROOT}/command`)).requestedAtEpoch).toBeLessThan(1e12);
  expect(read(`${ROOT}/status`)).toEqual(record(before).status);
  expect(read(`${ROOT}/runtime`)).toEqual(record(before).runtime);
  expect(read(`${ROOT}/feedingHistory`)).toBeNull();
  expect(db.runTransaction).toHaveBeenCalledWith(
    expect.anything(),
    expect.any(Function),
    { applyLocally: false },
  );
});

test('propagates hardware response, connection changes and unsubscribes both listeners', async () => {
  ready();
  const repo = repository();
  const received: AppSnapshot[] = [];
  const stop = repo.subscribe(value => received.push(value));
  const sent = await repo.feedNow({ speciesId: 'dog', targetGrams: 80 });
  put(`${ROOT}/command/status`, 'processing');
  expect(received.at(-1)?.commands[0].status).toBe('processing');
  put(`${ROOT}/command/status`, 'completed');
  expect(received.at(-1)?.commands[0].id).toBe(sent.command.id);
  expect(received.at(-1)?.commands[0].status).toBe('completed');
  expect(received.at(-1)?.commands[0].actualGrams).toBeUndefined();
  expect(received.at(-1)?.history).toEqual([]);
  put('.info/connected', false);
  expect(received.at(-1)?.connected).toBe(false);
  const count = received.length;
  stop();
  put(`${ROOT}/command/status`, 'failed');
  expect(received).toHaveLength(count);
  expect(subscribers.size).toBe(0);
});

test('two clients cannot overwrite the same in-flight command', async () => {
  ready();
  const results = await Promise.allSettled([
    repository().feedNow({ speciesId: 'dog', targetGrams: 80 }),
    repository().feedNow({ speciesId: 'cat', targetGrams: 45 }),
  ]);
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(
    1,
  );
  expect(results.filter(result => result.status === 'rejected')).toHaveLength(
    1,
  );
  expect(writes).toHaveLength(1);
});

test.each(['pending', 'processing'])(
  'does not overwrite an existing %s command',
  async status => {
    ready();
    put(`${ROOT}/command`, {
      requestId: 'other-phone',
      type: 'feed_now',
      speciesId: 'dog',
      targetGrams: 80,
      status,
      requestedAtEpoch: Math.floor(Date.now() / 1000),
    });
    await expect(
      repository().feedNow({ speciesId: 'cat', targetGrams: 45 }),
    ).rejects.toThrow('pending/processing');
    expect(record(read(`${ROOT}/command`)).requestId).toBe('other-phone');
    expect(writes).toEqual([]);
  },
);

test.each([
  ['Firebase offline', '.info/connected', false],
  ['device offline', `${ROOT}/status/online`, false],
  ['stale heartbeat', `${ROOT}/status/lastSeenEpoch`, 1],
  ['device error', `${ROOT}/status/errorCode`, 'jammed'],
  ['busy runtime', `${ROOT}/runtime/feeding/status`, 'processing'],
  ['missing cooldown', `${ROOT}/runtime/cooldown/dogUntilEpoch`, null],
] as [string, string, unknown][])(
  'blocks feeding when %s',
  async (_label, path, value) => {
    ready();
    put(path, value);
    await expect(
      repository().feedNow({ speciesId: 'dog', targetGrams: 80 }),
    ).rejects.toThrow();
    expect(writes).toEqual([]);
  },
);

test('honors species-specific cooldown and server time offset', async () => {
  ready();
  put(
    `${ROOT}/runtime/cooldown/dogUntilEpoch`,
    Math.floor(Date.now() / 1000) + 60,
  );
  await expect(
    repository().feedNow({ speciesId: 'dog', targetGrams: 80 }),
  ).rejects.toThrow('Cooldown');
  const cat = await repository().feedNow({ speciesId: 'cat', targetGrams: 45 });
  expect(cat.command.status).toBe('pending');
  put(`${ROOT}/command/status`, 'completed');
  put('.info/serverTimeOffset', 300000);
  put(`${ROOT}/status/lastSeenEpoch`, Math.floor((Date.now() + 300000) / 1000));
  const dog = await repository().feedNow({ speciesId: 'dog', targetGrams: 80 });
  expect(dog.command.status).toBe('pending');
});

test('does not use invalid profile defaults to authorize feeding', async () => {
  ready();
  put(`${ROOT}/config/speciesProfiles/dog/portionGrams`, null);
  const data = await repository().getSnapshot();
  expect(data.profiles[0].configValid).toBe(false);
  await expect(
    repository().feedNow({ speciesId: 'dog', targetGrams: 80 }),
  ).rejects.toThrow('valid species profile');
  expect(writes).toEqual([]);
});

test.each([0, -5, NaN, Infinity])(
  'rejects invalid target %s',
  async targetGrams => {
    ready();
    await expect(
      repository().feedNow({ speciesId: 'dog', targetGrams }),
    ).rejects.toThrow();
    expect(writes).toEqual([]);
  },
);

test('rejects unsupported species even if a caller bypasses TypeScript', async () => {
  ready();
  await expect(
    repository().feedNow({
      speciesId: 'rabbit',
      targetGrams: 10,
    } as unknown as FeedCommand),
  ).rejects.toThrow();
  expect(writes).toEqual([]);
});

test('daily guard uses completed, dated history for the selected species only', async () => {
  ready();
  put(`${ROOT}/feedingHistory/record-1`, {
    speciesId: 'dog',
    targetGrams: 300,
    actualGrams: 300,
    result: 'completed',
    completedAtEpoch: Math.floor(Date.now() / 1000),
  });
  await expect(
    repository().feedNow({ speciesId: 'dog', targetGrams: 80 }),
  ).rejects.toThrow('daily limit');
  await expect(
    repository().feedNow({ speciesId: 'cat', targetGrams: 45 }),
  ).resolves.toMatchObject({ command: { status: 'pending' } });
});

test('missing data / cancelled subscriptions expose errors without creating a device', async () => {
  const repo = repository();
  const errors = jest.fn();
  const onSnapshot = jest.fn();
  const stop = repo.subscribe(onSnapshot, errors);
  const receivedBeforeCancel = onSnapshot.mock.calls.length;
  cancelListeners.get(ROOT)?.(new Error('permission-denied'));
  expect(errors).toHaveBeenCalledWith(
    expect.objectContaining({ message: 'permission-denied' }),
  );
  put('.info/connected', false);
  put('.info/connected', true);
  expect(onSnapshot).toHaveBeenCalledTimes(receivedBeforeCancel);
  stop();
  put(ROOT, null);
  await expect(repo.getSnapshot()).rejects.toThrow(
    'Missing devices/feeder-01/config',
  );
  expect(writes).toEqual([]);
});

test('read-only device properties and in-app read flags never write firmware nodes', async () => {
  const repo = repository();
  put(`${ROOT}/feedingHistory/one`, {
    speciesId: 'dog',
    targetGrams: 80,
    actualGrams: 79,
    result: 'completed',
    timestampEpoch: Math.floor(Date.now() / 1000),
  });
  await repo.markAllNotificationsRead();
  expect(
    (await repo.getSnapshot()).notifications.every(item => item.read),
  ).toBe(true);
  await expect(repo.updateDeviceName('Changed')).rejects.toThrow();
  await expect(repo.updateOperatingMode('automatic')).rejects.toThrow();
  expect(writes).toEqual([]);
});

test('history adapter exposes unsupported records and unknown time/mode without inventing measurements', () => {
  const device = copy(record(read(ROOT)));
  device.feedingHistory = {
    supported: {
      speciesId: 'cat',
      targetGrams: 45,
      actualGrams: 44,
      status: 'completed',
      timestampEpoch: 1800000000,
    },
    noTime: {
      speciesId: 'dog',
      targetGrams: 80,
      actualGrams: 0,
      result: 'failed',
    },
    invalid: { speciesId: 'dog', targetGrams: 80, result: 'completed' },
  };
  const data = mapDevice(device, true);
  expect(data.history).toHaveLength(2);
  expect(data.history[0].mode).toBe('unknown');
  expect(data.history[1].timestamp).toBe('');
  expect(data.warnings).toHaveLength(2);
  expect(formatDateTime('')).toBe('Time not reported');
  expect(formatTimeAgo('bad-time')).toBe('Time not reported');
  expect(epochMs(1800000000)).toBe(1800000000000);
  expect(epochMs(1800000000000)).toBe(1800000000000);
  expect(epochMs(0)).toBe(0);
  expect(epochMs('1800000000')).toBeNull();
});
