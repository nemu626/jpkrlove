import {
  RepositoryError,
  type OnboardingRepository,
} from '@jpkrlove/api-client';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { AppLocale } from '@/i18n';
import { translate } from '@/i18n';
import {
  OnboardingScreen,
  onboardingStyles,
} from '../components/onboarding-screen';

export function InvitationScreen({
  locale,
  repository,
  onRedeemed,
}: {
  locale: AppLocale;
  repository: OnboardingRepository;
  onRedeemed?: () => void;
}) {
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redeem = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await repository.redeemInvitation(code);
      onRedeemed?.();
    } catch (nextError) {
      setError(
        nextError instanceof RepositoryError &&
          (nextError.code === 'INVITATION_UNAVAILABLE' ||
            nextError.code === 'INVITATION_ALREADY_REDEEMED')
          ? translate(locale, 'invite.unavailable')
          : translate(locale, 'common.unexpectedError'),
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <OnboardingScreen
      title={translate(locale, 'invite.title')}
      description={translate(locale, 'invite.description')}
    >
      <View style={onboardingStyles.field}>
        <Text style={onboardingStyles.label}>
          {translate(locale, 'invite.label')}
        </Text>
        <TextInput
          accessibilityHint={translate(locale, 'invite.hint')}
          accessibilityLabel={translate(locale, 'invite.label')}
          autoCapitalize="characters"
          editable={!isLoading}
          maxLength={32}
          onChangeText={setCode}
          style={onboardingStyles.input}
          value={code}
        />
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={onboardingStyles.error}>
          {error}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        disabled={isLoading || code.trim().length < 6}
        onPress={() => void redeem()}
        style={[
          onboardingStyles.primaryButton,
          (isLoading || code.trim().length < 6) &&
            onboardingStyles.buttonDisabled,
        ]}
      >
        {isLoading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={onboardingStyles.primaryButtonText}>
            {translate(locale, 'invite.submit')}
          </Text>
        )}
      </Pressable>
    </OnboardingScreen>
  );
}
