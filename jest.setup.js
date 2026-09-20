/* eslint-env jest */

jest.mock('@react-native-firebase/auth', () => ({
  createUserWithEmailAndPassword: jest.fn(),
  getAuth: jest.fn(() => ({})),
  onAuthStateChanged: jest.fn((_auth, listener) => {
    listener(null);
    return jest.fn();
  }),
  signInWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
}));

jest.mock('@react-native-firebase/database', () => ({
  get: jest.fn(),
  getDatabase: jest.fn(() => ({})),
  onValue: jest.fn(),
  push: jest.fn(),
  ref: jest.fn(),
  remove: jest.fn(),
  runTransaction: jest.fn(),
  set: jest.fn(),
  update: jest.fn(),
}));

jest.mock('@react-native-firebase/messaging', () => ({
  getMessaging: jest.fn(() => ({})),
  getToken: jest.fn(),
  onMessage: jest.fn(),
  onTokenRefresh: jest.fn(),
  setBackgroundMessageHandler: jest.fn(),
}));
