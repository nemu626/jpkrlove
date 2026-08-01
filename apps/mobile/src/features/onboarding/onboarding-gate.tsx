import type {
  OnboardingRepository,
  OnboardingState,
} from '@jpkrlove/api-client';
import type { MemberState } from '@jpkrlove/domain';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { AppLocale } from '@/i18n';
import { translate } from '@/i18n';
import {
  OnboardingScreen,
  onboardingStyles,
} from './components/onboarding-screen';

export type OnboardingRoute =
  | '/(onboarding)/invite'
  | '/(onboarding)/identity'
  | '/(onboarding)/profile'
  | '/(onboarding)/status'
  | '/(app)';

const routes: Record<MemberState, OnboardingRoute> = {
  waiting: '/(onboarding)/invite',
  identity_pending: '/(onboarding)/identity',
  identity_failed: '/(onboarding)/identity',
  identity_expired: '/(onboarding)/identity',
  profile_draft: '/(onboarding)/profile',
  profile_in_review: '/(onboarding)/status',
  changes_requested: '/(onboarding)/profile',
  active: '/(app)',
  paused: '/(onboarding)/status',
  restricted: '/(onboarding)/status',
};

const messageKeys: Record<MemberState, { title: string; body: string }> = {
  waiting: { title: 'gate.waitingTitle', body: 'gate.waitingBody' },
  identity_pending: {
    title: 'gate.identityTitle',
    body: 'gate.identityBody',
  },
  identity_failed: {
    title: 'gate.identityFailedTitle',
    body: 'gate.identityFailedBody',
  },
  identity_expired: {
    title: 'gate.identityFailedTitle',
    body: 'identity.expired',
  },
  profile_draft: { title: 'gate.profileTitle', body: 'gate.profileBody' },
  profile_in_review: {
    title: 'gate.reviewTitle',
    body: 'gate.reviewBody',
  },
  changes_requested: {
    title: 'gate.changesTitle',
    body: 'gate.changesBody',
  },
  active: { title: 'gate.activeTitle', body: 'gate.activeBody' },
  paused: { title: 'gate.pausedTitle', body: 'gate.pausedBody' },
  restricted: {
    title: 'gate.restrictedTitle',
    body: 'gate.restrictedBody',
  },
};

export function routeForMemberState(state: MemberState): OnboardingRoute {
  return routes[state];
}

export function OnboardingGate({
  repository,
  locale,
  onRouteResolved,
}: {
  repository: OnboardingRepository;
  locale: AppLocale;
  onRouteResolved?: (route: OnboardingRoute) => void;
}) {
  const [state, setState] = useState<OnboardingState | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const next = await repository.getCurrentState();
      setState(next);
      onRouteResolved?.(routeForMemberState(next.memberState));
    } catch {
      setError(true);
    }
  }, [onRouteResolved, repository]);

  useEffect(() => {
    let mounted = true;
    repository
      .getCurrentState()
      .then((next) => {
        if (!mounted) return;
        setState(next);
        onRouteResolved?.(routeForMemberState(next.memberState));
      })
      .catch(() => {
        if (mounted) setError(true);
      });
    return () => {
      mounted = false;
    };
  }, [onRouteResolved, repository]);

  if (error) {
    return (
      <OnboardingScreen title={translate(locale, 'common.unexpectedError')}>
        <Pressable
          accessibilityRole="button"
          onPress={() => void load()}
          style={onboardingStyles.secondaryButton}
        >
          <Text style={onboardingStyles.secondaryButtonText}>
            {translate(locale, 'common.retry')}
          </Text>
        </Pressable>
      </OnboardingScreen>
    );
  }

  if (!state) {
    return (
      <View
        accessibilityLabel={translate(locale, 'common.loading')}
        accessibilityRole="progressbar"
        style={styles.loading}
      >
        <ActivityIndicator color="#176B66" />
      </View>
    );
  }

  const message = messageKeys[state.memberState];
  return (
    <OnboardingScreen
      title={translate(locale, message.title)}
      description={translate(locale, message.body)}
    />
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
