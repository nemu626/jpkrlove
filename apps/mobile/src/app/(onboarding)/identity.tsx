import { useGuardedOnboardingState } from '@/features/onboarding/member-state-route-gate';
import { IdentityScreen } from '@/features/onboarding/screens/identity-screen';
import { deviceLocale } from '@/i18n';
import { useAppServices } from '@/lib/app-services';

export default function IdentityRoute() {
  const { onboardingRepository } = useAppServices();
  const { state, refresh } = useGuardedOnboardingState();
  return (
    <IdentityScreen
      locale={deviceLocale()}
      memberState={state.memberState}
      onSessionClosed={() => void refresh()}
      repository={onboardingRepository}
    />
  );
}
