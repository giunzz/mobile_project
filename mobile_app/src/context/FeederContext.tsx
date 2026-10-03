import React, {
  PropsWithChildren,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from '@react-native-firebase/auth';
import { configureFirebaseMessaging } from '../firebase/messaging';
import { FIREBASE_MESSAGING_ENABLED } from '../firebase/config';
import { FeederRepository } from '../repositories/FeederRepository';
import { FirebaseFeederRepository } from '../repositories/FirebaseFeederRepository';
import {
  AppSnapshot,
  FeedCommand,
  FeedCommandResult,
  FeedingMode,
  FeedingSchedule,
  SpeciesProfile,
  UserAccount,
} from '../types/models';

interface FeederContextValue {
  snapshot: AppSnapshot | null;
  loading: boolean;
  dataError: string | null;
  currentUser: UserAccount | null;
  login(email: string, password: string): Promise<void>;
  register(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  refresh(): Promise<void>;
  updateProfile(profile: SpeciesProfile): Promise<void>;
  addSchedule(schedule: FeedingSchedule): Promise<void>;
  updateSchedule(schedule: FeedingSchedule): Promise<void>;
  toggleSchedule(id: string, enabled: boolean): Promise<void>;
  deleteSchedule(id: string): Promise<void>;
  feedNow(command: FeedCommand): Promise<FeedCommandResult>;
  markAllNotificationsRead(): Promise<void>;
  updateDeviceName(name: string): Promise<void>;
  updateOperatingMode(mode: FeedingMode): Promise<void>;
}

const FeederContext = createContext<FeederContextValue | undefined>(undefined);

const firebaseAuthError = (error: unknown) => {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String(error.code)
      : '';
  const messages: Record<string, string> = {
    'auth/email-already-in-use':
      'This email already has an account. Use Sign in instead.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/network-request-failed':
      'Unable to reach Firebase. Check the Internet connection.',
    'auth/too-many-requests':
      'Too many attempts. Wait a moment before trying again.',
    'auth/user-disabled': 'This Firebase account has been disabled.',
    'auth/user-not-found': 'No Firebase account exists for this email.',
    'auth/weak-password': 'Use a password with at least 6 characters.',
    'auth/wrong-password': 'Incorrect email or password.',
  };
  return new Error(
    messages[code] ??
      (error instanceof Error ? error.message : 'Firebase sign-in failed.'),
  );
};

export function FeederProvider({ children }: PropsWithChildren) {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [subscriptionVersion, setSubscriptionVersion] = useState(0);
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const repositoryRef = useRef<FeederRepository | null>(null);

  useEffect(() => {
    const auth = getAuth();
    return onAuthStateChanged(auth, user => {
      setDataLoading(Boolean(user));
      setCurrentUser(
        user
          ? {
              id: user.uid,
              name:
                user.displayName ?? user.email?.split('@')[0] ?? 'Pet Owner',
              email: user.email ?? '',
            }
          : null,
      );
      setAuthLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!currentUser) {
      repositoryRef.current = null;
      setSnapshot(null);
      setDataError(null);
      setDataLoading(false);
      return;
    }
    const repository = new FirebaseFeederRepository(
      currentUser.id,
      currentUser.email,
      currentUser.name,
    );
    repositoryRef.current = repository;
    setSnapshot(null);
    setDataLoading(true);
    setDataError(null);
    return repository.subscribe(
      nextSnapshot => {
        setSnapshot(nextSnapshot);
        setDataError(null);
        setDataLoading(false);
      },
      error => {
        setDataError(error.message);
        setDataLoading(false);
      },
    );
  }, [currentUser, subscriptionVersion]);

  useEffect(() => {
    if (!currentUser || !FIREBASE_MESSAGING_ENABLED) {
      return;
    }
    let active = true;
    let cleanup: () => void = () => undefined;
    configureFirebaseMessaging(currentUser.id)
      .then(unsubscribe => {
        if (active) {
          cleanup = unsubscribe;
        } else {
          unsubscribe();
        }
      })
      .catch(() => {
        // Push registration is best-effort and must not block app data.
      });
    return () => {
      active = false;
      cleanup();
    };
  }, [currentUser]);

  const getRepository = () => {
    if (!repositoryRef.current) {
      throw new Error('Sign in before accessing feeder data.');
    }
    return repositoryRef.current;
  };

  const loading = authLoading || Boolean(currentUser && dataLoading);

  const value = useMemo<FeederContextValue>(
    () => ({
      snapshot,
      loading,
      dataError,
      currentUser,
      login: async (email: string, password: string) => {
        if (!email.trim() || password.length < 6) {
          throw new Error(
            'Enter an email and a password of at least 6 characters.',
          );
        }
        try {
          await signInWithEmailAndPassword(getAuth(), email.trim(), password);
        } catch (error) {
          throw firebaseAuthError(error);
        }
      },
      register: async (email: string, password: string) => {
        if (!email.trim() || password.length < 6) {
          throw new Error(
            'Enter an email and a password of at least 6 characters.',
          );
        }
        try {
          await createUserWithEmailAndPassword(
            getAuth(),
            email.trim(),
            password,
          );
        } catch (error) {
          throw firebaseAuthError(error);
        }
      },
      logout: () => signOut(getAuth()),
      refresh: async () => {
        setDataLoading(true);
        setSubscriptionVersion(version => version + 1);
      },
      updateProfile: async profile => {
        await getRepository().updateProfile(profile);
      },
      addSchedule: async schedule => {
        await getRepository().addSchedule(schedule);
      },
      updateSchedule: async schedule => {
        await getRepository().updateSchedule(schedule);
      },
      toggleSchedule: async (id, enabled) => {
        await getRepository().toggleSchedule(id, enabled);
      },
      deleteSchedule: async id => {
        await getRepository().deleteSchedule(id);
      },
      feedNow: command => getRepository().feedNow(command),
      markAllNotificationsRead: async () => {
        await getRepository().markAllNotificationsRead();
      },
      updateDeviceName: async name => {
        await getRepository().updateDeviceName(name);
      },
      updateOperatingMode: async mode => {
        await getRepository().updateOperatingMode(mode);
      },
    }),
    [currentUser, dataError, loading, snapshot],
  );

  return (
    <FeederContext.Provider value={value}>{children}</FeederContext.Provider>
  );
}

export function useFeeder() {
  const context = useContext(FeederContext);
  if (!context) {
    throw new Error('useFeeder must be used inside FeederProvider.');
  }
  return context;
}
