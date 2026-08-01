import type {
  OnboardingRepository,
  OnboardingState,
} from '@jpkrlove/api-client';
import { Redirect } from 'expo-router';
import { createContext, type ReactNode, useContext, useEffect } from 'react';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { deviceLocale, translate } from '@/i18n';
import { routeForMemberState, type OnboardingRoute } from './onboarding-gate';
import { useOnboarding } from './model/use-onboarding';

type GuardedOnboardingContextValue = {
  state: OnboardingState;
  refresh: () => Promise<void>;
};

const GuardedOnboardingContext =
  createContext<GuardedOnboardingContextValue | null>(null);

export function MemberStateRouteGate({
  children,
  currentRoute,
  repository,
}: {
  children: ReactNode;
  currentRoute: OnboardingRoute;
  repository: OnboardingRepository;
}) {
  const { state, error, isLoading, refresh } = useOnboarding(repository);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  if (error) {
    return (
      <View style={styles.centered}>
        <Text accessibilityRole="alert">
          {translate(deviceLocale(), 'common.unexpectedError')}
        </Text>
        <Pressable accessibilityRole="button" onPress={() => void refresh()}>
          <Text>{translate(deviceLocale(), 'common.retry')}</Text>
        </Pressable>
      </View>
    );
  }
  if (isLoading || !state) {
    return (
      <View
        accessibilityLabel={translate(deviceLocale(), 'common.loading')}
        accessibilityRole="progressbar"
        style={styles.centered}
      >
        <ActivityIndicator color="#176B66" />
      </View>
    );
  }

  const assignedRoute = routeForMemberState(state.memberState);
  if (assignedRoute !== currentRoute) {
    return <Redirect href={assignedRoute} />;
  }
  return (
    <GuardedOnboardingContext.Provider value={{ state, refresh }}>
      {children}
    </GuardedOnboardingContext.Provider>
  );
}

export function useGuardedOnboardingState(): GuardedOnboardingContextValue {
  const value = useContext(GuardedOnboardingContext);
  if (!value) {
    throw new Error('useGuardedOnboardingState requires MemberStateRouteGate');
  }
  return value;
}

export function onboardingRouteFromSegments(
  segments: readonly string[],
): OnboardingRoute | null {
  const groupIndex = segments.indexOf('(onboarding)');
  const screen = groupIndex >= 0 ? segments[groupIndex + 1] : undefined;
  if (
    screen === 'invite' ||
    screen === 'identity' ||
    screen === 'profile' ||
    screen === 'status'
  ) {
    return `/(onboarding)/${screen}`;
  }
  return null;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    backgroundColor: '#F8F9F8',
  },
});
