import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { routeForMemberState } from '@/features/onboarding/onboarding-gate';
import { useOnboarding } from '@/features/onboarding/model/use-onboarding';
import { useAppServices } from '@/lib/app-services';

export default function AppLayout() {
  const { onboardingRepository } = useAppServices();
  const { state } = useOnboarding(onboardingRepository);
  if (!state) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#176B66" />
      </View>
    );
  }
  if (state.memberState !== 'active') {
    return <Redirect href={routeForMemberState(state.memberState)} />;
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8F9F8',
  },
});
