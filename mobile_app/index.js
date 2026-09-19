/**
 * @format
 */

import { AppRegistry } from 'react-native';
import {
  getMessaging,
  setBackgroundMessageHandler,
} from '@react-native-firebase/messaging';
import App from './App';
import { FIREBASE_MESSAGING_ENABLED } from './src/firebase/config';
import { name as appName } from './app.json';

if (FIREBASE_MESSAGING_ENABLED) {
  setBackgroundMessageHandler(getMessaging(), async () => undefined);
}

AppRegistry.registerComponent(appName, () => App);
