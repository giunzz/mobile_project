import { Alert, PermissionsAndroid, Platform } from 'react-native';
import {
  getMessaging,
  getToken,
  onMessage,
  onTokenRefresh,
} from '@react-native-firebase/messaging';
import { ref, set } from '@react-native-firebase/database';
import { getFeederDatabase } from './config';

const saveToken = (uid: string, token: string) =>
  set(ref(getFeederDatabase(), `users/${uid}/fcm_tokens/android_primary`), {
    platform: Platform.OS,
    token,
    updatedAt: new Date().toISOString(),
  });

const requestAndroidNotificationPermission = async () => {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 33) {
    return true;
  }
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
  );
  return result === PermissionsAndroid.RESULTS.GRANTED;
};

export async function configureFirebaseMessaging(uid: string) {
  const permissionGranted = await requestAndroidNotificationPermission();
  const messaging = getMessaging();
  const token = await getToken(messaging);
  await saveToken(uid, token);

  const unsubscribeToken = onTokenRefresh(messaging, nextToken => {
    saveToken(uid, nextToken).catch(() => undefined);
  });
  const unsubscribeMessage = onMessage(messaging, message => {
    if (!permissionGranted) {
      return;
    }
    Alert.alert(
      message.notification?.title ?? 'Smart feeder notification',
      message.notification?.body ?? 'The feeder sent a new update.',
    );
  });

  return () => {
    unsubscribeMessage();
    unsubscribeToken();
  };
}
