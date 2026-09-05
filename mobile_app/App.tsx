import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { FeederProvider } from './src/context/FeederContext';
import { RootApp } from './src/RootApp';
import { colors } from './src/theme';

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar backgroundColor={colors.background} barStyle="dark-content" />
      <FeederProvider>
        <RootApp />
      </FeederProvider>
    </SafeAreaProvider>
  );
}

export default App;
