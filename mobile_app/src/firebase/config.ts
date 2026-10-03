import { getDatabase } from '@react-native-firebase/database';

export const FIREBASE_DATABASE_URL =
  'https://ai-smart-pet-feeder-default-rtdb.asia-southeast1.firebasedatabase.app';

export const FEEDER_DEVICE_ID = 'feeder-01';

// Firmware 1.1 expects Unix seconds for outgoing manual commands.
// Incoming timestamps accept seconds or milliseconds for older records.
export const COMMAND_EPOCH_UNIT: 'seconds' | 'milliseconds' = 'seconds';

// Firmware heartbeat is every 10 seconds; allow brief network interruptions.
export const DEVICE_HEARTBEAT_MAX_AGE_MS = 120000;

// Push is outside the current contract. Keep in-app results only.
export const FIREBASE_MESSAGING_ENABLED = false;

export const getFeederDatabase = () =>
  getDatabase(undefined, FIREBASE_DATABASE_URL);
