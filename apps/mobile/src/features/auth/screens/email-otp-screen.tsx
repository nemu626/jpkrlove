import {
  RepositoryError,
  type AuthRepository,
  type AuthSession,
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
} from '@/features/onboarding/components/onboarding-screen';

export function EmailOtpScreen({
  locale,
  repository,
  onAuthenticated,
}: {
  locale: AppLocale;
  repository: AuthRepository;
  onAuthenticated?: (session: AuthSession) => void;
}) {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [codeRequested, setCodeRequested] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requestCode = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await repository.requestEmailOtp(email);
      setCodeRequested(true);
      setMessage(translate(locale, 'auth.requestAccepted'));
    } catch (nextError) {
      setError(authErrorMessage(locale, nextError));
    } finally {
      setIsLoading(false);
    }
  };

  const verifyCode = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const session = await repository.verifyEmailOtp(email, otp);
      onAuthenticated?.(session);
    } catch (nextError) {
      setError(authErrorMessage(locale, nextError));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <OnboardingScreen
      title={translate(locale, 'auth.title')}
      description={translate(locale, 'auth.description')}
    >
      <View style={onboardingStyles.field}>
        <Text style={onboardingStyles.label}>
          {translate(locale, 'auth.emailLabel')}
        </Text>
        <TextInput
          accessibilityHint={translate(locale, 'auth.emailHint')}
          accessibilityLabel={translate(locale, 'auth.emailLabel')}
          autoCapitalize="none"
          autoComplete="email"
          editable={!isLoading}
          inputMode="email"
          onChangeText={setEmail}
          style={onboardingStyles.input}
          value={email}
        />
      </View>

      {message ? (
        <Text accessibilityRole="alert" style={onboardingStyles.success}>
          {message}
        </Text>
      ) : null}

      {codeRequested ? (
        <View style={onboardingStyles.field}>
          <Text style={onboardingStyles.label}>
            {translate(locale, 'auth.otpLabel')}
          </Text>
          <TextInput
            accessibilityHint={translate(locale, 'auth.otpHint')}
            accessibilityLabel={translate(locale, 'auth.otpLabel')}
            autoComplete="one-time-code"
            editable={!isLoading}
            inputMode="numeric"
            maxLength={6}
            onChangeText={setOtp}
            style={onboardingStyles.input}
            value={otp}
          />
        </View>
      ) : null}

      {error ? (
        <Text accessibilityRole="alert" style={onboardingStyles.error}>
          {error}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        disabled={isLoading}
        onPress={() => void (codeRequested ? verifyCode() : requestCode())}
        style={[
          onboardingStyles.primaryButton,
          isLoading && onboardingStyles.buttonDisabled,
        ]}
      >
        {isLoading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={onboardingStyles.primaryButtonText}>
            {translate(locale, codeRequested ? 'auth.verify' : 'auth.sendCode')}
          </Text>
        )}
      </Pressable>

      {codeRequested ? (
        <Pressable
          accessibilityRole="button"
          disabled={isLoading}
          onPress={() => void requestCode()}
          style={onboardingStyles.secondaryButton}
        >
          <Text style={onboardingStyles.secondaryButtonText}>
            {translate(locale, 'auth.sendCode')}
          </Text>
        </Pressable>
      ) : null}
    </OnboardingScreen>
  );
}

function authErrorMessage(locale: AppLocale, error: unknown): string {
  if (error instanceof RepositoryError) {
    if (error.code === 'INVALID_EMAIL') {
      return translate(locale, 'auth.invalidEmail');
    }
    if (
      error.code === 'OTP_INVALID_OR_EXPIRED' ||
      error.code === 'INVALID_OTP'
    ) {
      return translate(locale, 'auth.otpExpired');
    }
  }
  return translate(locale, 'common.unexpectedError');
}
