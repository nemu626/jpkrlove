import { Redirect, Stack, useSegments } from 'expo-router';
import {
  MemberStateRouteGate,
  onboardingRouteFromSegments,
} from '@/features/onboarding/member-state-route-gate';
import { useAppServices } from '@/lib/app-services';

export default function OnboardingLayout() {
  const segments = useSegments();
  const { onboardingRepository } = useAppServices();
  const currentRoute = onboardingRouteFromSegments(segments);
  if (!currentRoute) return <Redirect href="/" />;
  return (
    <MemberStateRouteGate
      currentRoute={currentRoute}
      repository={onboardingRepository}
    >
      <Stack screenOptions={{ headerShown: false }} />
    </MemberStateRouteGate>
  );
}
