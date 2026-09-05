import { MockFeederRepository } from '../src/repositories/MockFeederRepository';

describe('MockFeederRepository business rules', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('publishes pending, processing and completed Feed Now states', async () => {
    const repository = new MockFeederRepository();
    const statuses: string[] = [];
    repository.subscribe(snapshot => {
      const status = snapshot.commands[0]?.status;
      if (status && statuses[statuses.length - 1] !== status) {
        statuses.push(status);
      }
    });

    const resultPromise = repository.feedNow({
      speciesId: 'dog',
      targetGrams: 20,
    });
    await jest.advanceTimersByTimeAsync(1200);
    const result = await resultPromise;

    expect(result.command.status).toBe('completed');
    expect(result.history.actualGrams).toBeGreaterThan(0);
    expect(statuses).toEqual(['pending', 'processing', 'completed']);
  });

  it('rejects a command that would exceed the species daily limit', async () => {
    const repository = new MockFeederRepository();
    const resultPromise = repository.feedNow({
      speciesId: 'cat',
      targetGrams: 180,
    });
    await jest.advanceTimersByTimeAsync(500);
    const result = await resultPromise;

    expect(result.command.status).toBe('rejected');
    expect(result.command.errorMessage).toContain('daily limit');
    expect(result.notification.event).toBe('daily_limit');
    expect(result.history.result).toBe('cancelled');
  });

  it('updates an existing feeding schedule', async () => {
    const repository = new MockFeederRepository();
    const initialPromise = repository.getSnapshot();
    await jest.advanceTimersByTimeAsync(150);
    const initial = await initialPromise;
    const edited = { ...initial.schedules[0], time: '09:15', portionGrams: 50 };

    const updatePromise = repository.updateSchedule(edited);
    await jest.advanceTimersByTimeAsync(300);
    await updatePromise;
    const snapshotPromise = repository.getSnapshot();
    await jest.advanceTimersByTimeAsync(150);
    const snapshot = await snapshotPromise;

    expect(snapshot.schedules[0].time).toBe('09:15');
    expect(snapshot.schedules[0].portionGrams).toBe(50);
  });
});
