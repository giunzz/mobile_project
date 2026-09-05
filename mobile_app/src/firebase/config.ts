import { getDatabase } from '@react-native-firebase/database';

export const FIREBASE_DATABASE_URL =
  'https://ai-smart-pet-feeder-default-rtdb.asia-southeast1.firebasedatabase.app';

export const FEEDER_DEVICE_ID = 'feeder-01';

/**
 * The mobile demo simulates the ESP32 acknowledgement so the full command
 * lifecycle can be demonstrated with real Firebase writes before hardware is
 * available. Set this to false when the ESP32 firmware consumes pending
 * commands and publishes their result.
 */
export const DEMO_DEVICE_SIMULATOR_ENABLED = true;

export const getFeederDatabase = () =>
  getDatabase(undefined, FIREBASE_DATABASE_URL);
