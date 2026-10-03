import {
  feedingDayStartMs,
  measuredTodayGrams,
  nextScheduleAtMs,
} from '../src/utils/feedingDay';
import { FeedingHistory } from '../src/types/models';

test('daily limit uses UTC+7 and includes food dispensed by failed feeds', () => {
  const now = Date.parse('2026-09-25T17:30:00.000Z'); // 00:30 UTC+7
  expect(feedingDayStartMs(now)).toBe(
    Date.parse('2026-09-25T17:00:00.000Z'),
  );
  const history: FeedingHistory[] = [
    {
      id: 'previous-day',
      speciesId: 'dog',
      targetGrams: 80,
      actualGrams: 80,
      result: 'completed',
      timestamp: '2026-09-25T16:59:59.000Z',
      mode: 'manual',
    },
    {
      id: 'success',
      speciesId: 'dog',
      targetGrams: 80,
      actualGrams: 78,
      result: 'completed',
      timestamp: '2026-09-25T17:10:00.000Z',
      mode: 'manual',
    },
    {
      id: 'partial-failure',
      speciesId: 'dog',
      targetGrams: 45,
      actualGrams: 7,
      result: 'failed',
      timestamp: '2026-09-25T17:20:00.000Z',
      mode: 'automatic',
    },
    {
      id: 'cat',
      speciesId: 'cat',
      targetGrams: 45,
      actualGrams: 45,
      result: 'completed',
      timestamp: '2026-09-25T17:20:00.000Z',
      mode: 'automatic',
    },
  ];
  expect(measuredTodayGrams(history, 'dog', now)).toBe(85);
  expect(measuredTodayGrams(history, 'cat', now)).toBe(45);
  expect(nextScheduleAtMs(now, '07:00')).toBe(
    Date.parse('2026-09-26T00:00:00.000Z'),
  );
});
