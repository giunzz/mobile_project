import { FeedingHistory, SpeciesId } from '../types/models';

// The ESP32 interprets daily schedules and limits in UTC+7.
const DAY_MS = 24 * 60 * 60 * 1000;
const FEEDING_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

export function feedingDayStartMs(now: number) {
  return (
    Math.floor((now + FEEDING_UTC_OFFSET_MS) / DAY_MS) * DAY_MS -
    FEEDING_UTC_OFFSET_MS
  );
}

export function measuredTodayGrams(
  history: FeedingHistory[],
  speciesId: SpeciesId,
  now: number,
) {
  const start = feedingDayStartMs(now);
  // A failed feed can still have dispensed food. Count its measured grams.
  return history
    .filter(item => {
      const timestamp = Date.parse(item.timestamp);
      return (
        item.speciesId === speciesId &&
        Number.isFinite(timestamp) &&
        timestamp >= start &&
        timestamp <= now
      );
    })
    .reduce((sum, item) => sum + item.actualGrams, 0);
}

export function nextScheduleAtMs(now: number, time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  const today = feedingDayStartMs(now) +
    (hours * 60 + minutes) * 60 * 1000;
  return today <= now ? today + DAY_MS : today;
}
