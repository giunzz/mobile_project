import {
  get,
  onValue,
  push,
  ref,
  remove,
  set,
  update,
} from '@react-native-firebase/database';
import { FirebaseFeederRepository } from '../src/repositories/FirebaseFeederRepository';

interface FakeReference {
  key: string | null;
  path: string;
}

const firebaseState: Record<string, unknown> = {};
let nextId = 0;

const segments = (path: string) => path.split('/').filter(Boolean);

const readPath = (path: string): unknown =>
  segments(path).reduce<unknown>((value, key) => {
    if (!value || typeof value !== 'object') {
      return undefined;
    }
    return (value as Record<string, unknown>)[key];
  }, firebaseState);

const writePath = (path: string, value: unknown) => {
  const keys = segments(path);
  let target = firebaseState;
  keys.slice(0, -1).forEach(key => {
    if (!target[key] || typeof target[key] !== 'object') {
      target[key] = {};
    }
    target = target[key] as Record<string, unknown>;
  });
  if (keys.length) {
    target[keys[keys.length - 1]] = value;
  }
};

const fakeSnapshot = (value: unknown) => ({
  exists: () => value !== undefined && value !== null,
  val: () => value ?? null,
});

describe('FirebaseFeederRepository', () => {
  beforeEach(() => {
    Object.keys(firebaseState).forEach(key => delete firebaseState[key]);
    nextId = 0;
    jest.useFakeTimers();

    jest.mocked(ref).mockImplementation((_, path = '') => ({
      key: segments(path).at(-1) ?? null,
      path,
    }) as never);
    jest.mocked(get).mockImplementation(async reference =>
      fakeSnapshot(readPath((reference as unknown as FakeReference).path)) as never,
    );
    jest.mocked(push).mockImplementation(parent => {
      const id = `firebase-id-${++nextId}`;
      const parentPath = (parent as unknown as FakeReference).path;
      return {
        key: id,
        path: `${parentPath}/${id}`,
      } as never;
    });
    jest.mocked(set).mockImplementation(async (reference, value) => {
      writePath((reference as unknown as FakeReference).path, value);
    });
    jest.mocked(update).mockImplementation(async (reference, values) => {
      const basePath = (reference as unknown as FakeReference).path;
      Object.entries(values).forEach(([path, value]) => {
        writePath(basePath ? `${basePath}/${path}` : path, value);
      });
    });
    jest.mocked(remove).mockImplementation(async reference => {
      writePath((reference as unknown as FakeReference).path, null);
    });
    jest.mocked(onValue).mockImplementation(() => jest.fn());
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('bootstraps account data in Firebase when the database is empty', async () => {
    const repository = new FirebaseFeederRepository(
      'uid-1',
      'owner@example.com',
      'owner',
    );

    const snapshot = await repository.getSnapshot();

    expect(snapshot.profiles).toHaveLength(5);
    expect(snapshot.schedules).toHaveLength(3);
    expect(readPath('users/uid-1/profile')).toMatchObject({
      deviceId: 'feeder-01',
      email: 'owner@example.com',
    });
    expect(readPath('devices/feeder-01/status')).toMatchObject({
      name: 'Smart Feeder 01',
      online: true,
    });
  });

  it('writes the complete Feed Now result to Firebase', async () => {
    const repository = new FirebaseFeederRepository(
      'uid-1',
      'owner@example.com',
      'owner',
    );
    await repository.getSnapshot();

    const resultPromise = repository.feedNow({
      speciesId: 'dog',
      targetGrams: 20,
    });
    await jest.advanceTimersByTimeAsync(2000);
    const result = await resultPromise;

    expect(result.command.status).toBe('completed');
    expect(
      readPath(
        `devices/feeder-01/feeding_commands/${result.command.id}/status`,
      ),
    ).toBe('completed');
    expect(
      readPath(`devices/feeder-01/feeding_history/${result.history.id}`),
    ).toMatchObject({ result: 'completed', speciesId: 'dog' });
    expect(
      readPath(`users/uid-1/notifications/${result.notification.id}`),
    ).toMatchObject({ event: 'feeding_completed', read: false });
  });
});
