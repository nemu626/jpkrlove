import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useOnboarding } from '@/features/onboarding/model/use-onboarding';
import { IdentityScreen } from '@/features/onboarding/screens/identity-screen';
import { deviceLocale } from '@/i18n';
import { useAppServices } from '@/lib/app-services';

export default function IdentityRoute() {
  const router = useRouter();
  const { onboardingRepository } = useAppServices();
  const { state, refresh } = useOnboarding(onboardingRepository);
  useEffect(() => {
    if (state?.memberState === 'profile_draft') {
      router.replace('/(onboarding)/profile');
    }
  }, [router, state?.memberState]);
  if (!state) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#176B66" />
      </View>
    );
  }
  return (
    <IdentityScreen
      locale={deviceLocale()}
      memberState={state.memberState}
      onSessionClosed={() => void refresh()}
      repository={onboardingRepository}
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
