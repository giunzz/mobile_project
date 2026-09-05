/**
 * @format
 */

import { AppRegistry } from 'react-native';
import {
  getMessaging,
  setBackgroundMessageHandler,
} from '@react-native-firebase/messaging';
import App from './App';
import { name as appName } from './app.json';

setBackgroundMessageHandler(getMessaging(), async () => undefined);

AppRegistry.registerComponent(appName, () => App);
