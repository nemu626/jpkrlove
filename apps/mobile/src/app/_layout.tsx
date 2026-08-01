import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import {
  AuthSessionProvider,
  useAuthSessionContext,
} from '@/features/auth/model/use-auth-session';
import { deviceLocale, initializeI18n } from '@/i18n';
import { AppServicesProvider, useAppServices } from '@/lib/app-services';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <AppServicesProvider>
      <SessionBoundary />
    </AppServicesProvider>
  );
}

function SessionBoundary() {
  const { authRepository } = useAppServices();
  const [translationsReady, setTranslationsReady] = useState(false);
  useEffect(() => {
    void initializeI18n(deviceLocale()).then(() => setTranslationsReady(true));
  }, []);
  if (!translationsReady) return <Loading />;
  return (
    <AuthSessionProvider repository={authRepository}>
      <ProtectedRoutes />
    </AuthSessionProvider>
  );
}

function ProtectedRoutes() {
  const { session, isLoading } = useAuthSessionContext();
  useEffect(() => {
    if (!isLoading) void SplashScreen.hideAsync();
  }, [isLoading]);
  if (isLoading) return <Loading />;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(session)}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}

function Loading() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color="#176B66" />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8F9F8',
  },
});
