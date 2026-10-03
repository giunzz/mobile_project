import React from 'react';
import { Alert, Text } from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import fixture from '../docs/contract/ai-smart-pet-feeder-rtdb-final.json';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { useFeeder } from '../src/context/FeederContext';
import { mapDevice } from '../src/firebase/deviceContract';
import { FeedNowScreen } from '../src/screens/FeedNowScreen';
import { SpeciesSettingsScreen } from '../src/screens/SpeciesSettingsScreen';
import { DashboardScreen } from '../src/screens/DashboardScreen';
import { StatisticsScreen } from '../src/screens/StatisticsScreen';
import { DeviceSettingsScreen } from '../src/screens/DeviceSettingsScreen';
import { AppSnapshot } from '../src/types/models';

jest.mock('../src/context/FeederContext', () => ({ useFeeder: jest.fn() }));
let snapshot: AppSnapshot;
let renderer: Renderer.ReactTestRenderer;
const feedNow = jest.fn();
const updateProfile = jest.fn();
const displayText = () =>
  renderer.root
    .findAllByType(Text)
    .map(node =>
      React.Children.toArray(node.props.children)
        .filter(child => typeof child === 'string' || typeof child === 'number')
        .join(''),
    )
    .join('\n');
beforeEach(() => {
  jest.clearAllMocks();
  snapshot = mapDevice(fixture.devices['feeder-01'], true);
  snapshot.device.online = true;
  snapshot.device.lastSeenMs = Date.now();
  (useFeeder as jest.Mock).mockImplementation(() => ({
    snapshot,
    feedNow,
    updateProfile,
  }));
});
afterEach(async () => {
  if (renderer) {
    await act(() => renderer.unmount());
  }
  jest.restoreAllMocks();
});

test('request acknowledgment remains pending; only a realtime ESP32 result displays completion', async () => {
  const pending = {
    id: 'real-request-id',
    status: 'pending' as const,
    speciesId: 'dog' as const,
    targetGrams: 80,
    requestedAt: new Date().toISOString(),
  };
  feedNow.mockImplementation(async () => {
    snapshot = { ...snapshot, commands: [pending] };
    return { command: pending };
  });
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  await act(() => {
    renderer = Renderer.create(<FeedNowScreen />);
  });
  expect(renderer.root.findByType(PrimaryButton).props.disabled).toBe(false);
  await act(() => renderer.root.findByType(PrimaryButton).props.onPress());
  const send = alert.mock.calls[0][2]?.find(
    button => button.text === 'Send request',
  )?.onPress;
  expect(send).toBeDefined();
  await act(async () => {
    await send?.();
  });
  expect(feedNow).toHaveBeenCalledWith({ speciesId: 'dog', targetGrams: 80 });
  expect(displayText()).toContain('PENDING');
  expect(displayText()).not.toContain('ESP32 reported completion.');
  expect(renderer.root.findByType(PrimaryButton).props.disabled).toBe(true);
  snapshot = { ...snapshot, commands: [{ ...pending, status: 'processing' }] };
  await act(() => renderer.update(<FeedNowScreen />));
  expect(displayText()).toContain('PROCESSING');
  snapshot = { ...snapshot, commands: [{ ...pending, status: 'completed' }] };
  await act(() => renderer.update(<FeedNowScreen />));
  expect(displayText()).toContain('ESP32 reported completion.');
  expect(displayText()).toContain('No matching measured history yet.');
  expect(feedNow).toHaveBeenCalledTimes(1);
});

test('reopening feed screen shows a shared pending request without resending', async () => {
  snapshot.commands = [
    {
      id: 'other-phone',
      status: 'pending',
      speciesId: 'cat',
      targetGrams: 45,
      requestedAt: new Date(Date.now() - 60000).toISOString(),
    },
  ];
  await act(() => {
    renderer = Renderer.create(<FeedNowScreen />);
  });
  expect(displayText()).toContain('PENDING');
  expect(displayText()).toContain('Do not resend');
  expect(renderer.root.findByType(PrimaryButton).props.disabled).toBe(true);
  expect(feedNow).not.toHaveBeenCalled();
});

test('a heartbeat update preserves unsaved profile edits', async () => {
  updateProfile.mockResolvedValue(undefined);
  await act(() => {
    renderer = Renderer.create(<SpeciesSettingsScreen />);
  });
  const plus = renderer.root
    .findAllByType(Text)
    .find(node => node.props.children === '+' && node.props.onPress);
  expect(plus).toBeDefined();
  await act(() => plus!.props.onPress());
  snapshot = mapDevice(fixture.devices['feeder-01'], true);
  snapshot.device.lastSeenMs = Date.now();
  await act(() => renderer.update(<SpeciesSettingsScreen />));
  await act(async () => {
    await renderer.root.findByType(PrimaryButton).props.onPress();
  });
  expect(updateProfile).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'cat',
      portionGrams: 50,
      cooldownMinutes: 10,
    }),
  );
});

test('empty firmware data renders honest dashboard and statistics states', async () => {
  await act(() => {
    renderer = Renderer.create(<DashboardScreen navigate={jest.fn()} />);
  });
  expect(displayText()).toContain('No detection yet');
  expect(displayText()).toContain('No firmware history received yet.');
  await act(() => renderer.update(<StatisticsScreen navigate={jest.fn()} />));
  expect(displayText()).toContain('No dated firmware history for this period');
  expect(displayText()).toContain('Not available');
});

test('device screen exposes telemetry and no write action for firmware-owned status', async () => {
  await act(() => {
    renderer = Renderer.create(<DeviceSettingsScreen navigate={jest.fn()} />);
  });
  expect(displayText()).toContain('Device status is read-only.');
  expect(
    renderer.root
      .findAllByType(PrimaryButton)
      .map(button => button.props.label),
  ).toEqual(['Edit species profiles']);
});
