import { useRouter } from 'expo-router';
import { useGuardedOnboardingState } from '@/features/onboarding/member-state-route-gate';
import { InvitationScreen } from '@/features/onboarding/screens/invitation-screen';
import { deviceLocale } from '@/i18n';
import { useAppServices } from '@/lib/app-services';

export default function InvitationRoute() {
  const router = useRouter();
  const { onboardingRepository } = useAppServices();
  const { refresh } = useGuardedOnboardingState();
  return (
    <InvitationScreen
      locale={deviceLocale()}
      onRedeemed={() => {
        void refresh().then(() => router.replace('/(onboarding)/identity'));
      }}
      repository={onboardingRepository}
    />
  );
}
