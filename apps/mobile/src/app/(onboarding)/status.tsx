import { OnboardingGate } from '@/features/onboarding/onboarding-gate';
import { deviceLocale } from '@/i18n';
import { useAppServices } from '@/lib/app-services';

export default function StatusRoute() {
  const { onboardingRepository } = useAppServices();
  return (
    <OnboardingGate locale={deviceLocale()} repository={onboardingRepository} />
  );
}
