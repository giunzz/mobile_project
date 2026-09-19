import { getDatabase } from '@react-native-firebase/database';

export const FIREBASE_DATABASE_URL =
  'https://ai-smart-pet-feeder-default-rtdb.asia-southeast1.firebasedatabase.app';

export const FEEDER_DEVICE_ID = 'feeder-01';

// Contract omits the time unit. Confirm with the firmware author.
// Reads accept seconds or milliseconds; outgoing commands use this setting.
export const COMMAND_EPOCH_UNIT: 'seconds' | 'milliseconds' = 'seconds';

// Conservative app guard, not a firmware timeout. ESP32 heartbeat must be
// more frequent than this; otherwise agree on a new value with its author.
export const DEVICE_HEARTBEAT_MAX_AGE_MS = 120000;

// V1 defines no FCM/token path. Do not create legacy users/* nodes.
export const FIREBASE_MESSAGING_ENABLED = false;

export const getFeederDatabase = () =>
  getDatabase(undefined, FIREBASE_DATABASE_URL);
