import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useOnboarding } from '@/features/onboarding/model/use-onboarding';
import { ProfileEditorScreen } from '@/features/profile/screens/profile-editor-screen';
import { deviceLocale } from '@/i18n';
import { useAppServices } from '@/lib/app-services';

export default function ProfileRoute() {
  const router = useRouter();
  const { onboardingRepository } = useAppServices();
  const { state } = useOnboarding(onboardingRepository);
  if (!state) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#176B66" />
      </View>
    );
  }
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

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8F9F8',
  },
});
