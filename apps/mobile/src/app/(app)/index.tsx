import { useRouter } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { useAuthSessionContext } from '@/features/auth/model/use-auth-session';
import {
  OnboardingScreen,
  onboardingStyles,
} from '@/features/onboarding/components/onboarding-screen';
import { deviceLocale, translate } from '@/i18n';

export default function DiscoveryRoute() {
  const locale = deviceLocale();
  const router = useRouter();
  const { signOut } = useAuthSessionContext();
  return (
    <OnboardingScreen
      title={translate(locale, 'gate.activeTitle')}
      description={translate(locale, 'gate.activeBody')}
    >
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          void signOut().then(() => router.replace('/(auth)/login'))
        }
        style={onboardingStyles.secondaryButton}
      >
        <Text style={onboardingStyles.secondaryButtonText}>
          {translate(locale, 'auth.signOut')}
        </Text>
      </Pressable>
    </OnboardingScreen>
  );
}
