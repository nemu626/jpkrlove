import { useRouter } from 'expo-router';
import { useGuardedOnboardingState } from '@/features/onboarding/member-state-route-gate';
import { ProfileEditorScreen } from '@/features/profile/screens/profile-editor-screen';
import { deviceLocale } from '@/i18n';
import { useAppServices } from '@/lib/app-services';

export default function ProfileRoute() {
  const router = useRouter();
  const { onboardingRepository } = useAppServices();
  const { state } = useGuardedOnboardingState();
  return (
    <ProfileEditorScreen
      initialMedia={state.media}
      initialProfile={state.profile}
      locale={deviceLocale()}
      onSubmitted={() => router.replace('/(onboarding)/status')}
      repository={onboardingRepository}
    />
  );
}
