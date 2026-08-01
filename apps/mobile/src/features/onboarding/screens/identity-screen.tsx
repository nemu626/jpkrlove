import type { MemberState } from '@jpkrlove/domain';
import type { OnboardingRepository } from '@jpkrlove/api-client';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';
import type { AppLocale } from '@/i18n';
import { translate } from '@/i18n';
import { IDENTITY_CALLBACK_URL } from '../identity-callback';
import {
  OnboardingScreen,
  onboardingStyles,
} from '../components/onboarding-screen';

export function IdentityScreen({
  locale,
  memberState,
  repository,
  openIdentitySession = (url, callbackUrl) =>
    WebBrowser.openAuthSessionAsync(url, callbackUrl),
  onSessionClosed,
}: {
  locale: AppLocale;
  memberState: MemberState;
  repository: OnboardingRepository;
  openIdentitySession?: (url: string, callbackUrl: string) => Promise<unknown>;
  onSessionClosed?: () => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const session = await repository.createIdentitySession();
      await openIdentitySession(session.redirectUrl, IDENTITY_CALLBACK_URL);
      onSessionClosed?.();
    } catch {
      setError(translate(locale, 'common.unexpectedError'));
    } finally {
      setIsLoading(false);
    }
  };

  const statusKey =
    memberState === 'identity_failed'
      ? 'identity.failed'
      : memberState === 'identity_expired'
        ? 'identity.expired'
        : 'identity.pending';
  const canStart =
    memberState === 'identity_pending' ||
    memberState === 'identity_failed' ||
    memberState === 'identity_expired' ||
    memberState === 'waiting';

  return (
    <OnboardingScreen
      title={translate(locale, 'identity.title')}
      description={translate(locale, 'identity.description')}
    >
      <Text accessibilityLiveRegion="polite" style={onboardingStyles.success}>
        {translate(locale, statusKey)}
      </Text>
      {error ? (
        <Text accessibilityRole="alert" style={onboardingStyles.error}>
          {error}
        </Text>
      ) : null}
      {canStart ? (
        <Pressable
          accessibilityRole="button"
          disabled={isLoading}
          onPress={() => void start()}
          style={[
            onboardingStyles.primaryButton,
            isLoading && onboardingStyles.buttonDisabled,
          ]}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={onboardingStyles.primaryButtonText}>
              {translate(locale, 'identity.start')}
            </Text>
          )}
        </Pressable>
      ) : null}
    </OnboardingScreen>
  );
}
