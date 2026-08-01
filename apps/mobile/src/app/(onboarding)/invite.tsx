import { useRouter } from 'expo-router';
import { InvitationScreen } from '@/features/onboarding/screens/invitation-screen';
import { deviceLocale } from '@/i18n';
import { useAppServices } from '@/lib/app-services';

export default function InvitationRoute() {
  const router = useRouter();
  const { onboardingRepository } = useAppServices();
  return (
    <InvitationScreen
      locale={deviceLocale()}
      onRedeemed={() => router.replace('/(onboarding)/identity')}
      repository={onboardingRepository}
    />
  );
}
