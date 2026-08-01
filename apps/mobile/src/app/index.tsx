import { type Href, useRouter } from 'expo-router';
import { useCallback } from 'react';
import {
  OnboardingGate,
  type OnboardingRoute,
} from '@/features/onboarding/onboarding-gate';
import { deviceLocale } from '@/i18n';
import { useAppServices } from '@/lib/app-services';

export default function GateRoute() {
  const router = useRouter();
  const { onboardingRepository } = useAppServices();
  const resolveRoute = useCallback(
    (route: OnboardingRoute) => router.replace(route as Href),
    [router],
  );
  return (
    <OnboardingGate
      locale={deviceLocale()}
      onRouteResolved={resolveRoute}
      repository={onboardingRepository}
    />
  );
}
