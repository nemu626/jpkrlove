import { useRouter } from 'expo-router';
import { EmailOtpScreen } from '@/features/auth/screens/email-otp-screen';
import { useAuthSessionContext } from '@/features/auth/model/use-auth-session';
import { deviceLocale } from '@/i18n';
import { useAppServices } from '@/lib/app-services';

export default function LoginRoute() {
  const router = useRouter();
  const { authRepository } = useAppServices();
  const { restore } = useAuthSessionContext();
  return (
    <EmailOtpScreen
      locale={deviceLocale()}
      onAuthenticated={() => void restore().then(() => router.replace('/'))}
      repository={authRepository}
    />
  );
}
