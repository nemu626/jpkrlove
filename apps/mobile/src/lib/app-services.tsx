import {
  createSupabaseAuthPort,
  createSupabaseOnboardingGateway,
  SupabaseAuthRepository,
  SupabaseOnboardingRepository,
  type AuthRepository,
  type OnboardingRepository,
} from '@jpkrlove/api-client';
import { createClient } from '@supabase/supabase-js';
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useMemo,
} from 'react';
import { createSecureSessionStorage } from './secure-session-storage';

export interface AppServices {
  authRepository: AuthRepository;
  onboardingRepository: OnboardingRepository;
}

const AppServicesContext = createContext<AppServices | null>(null);

export function AppServicesProvider({ children }: PropsWithChildren) {
  const services = useMemo(() => createAppServices(), []);
  if (!services) {
    return null;
  }
  return (
    <AppServicesContext.Provider value={services}>
      {children}
    </AppServicesContext.Provider>
  );
}

export function useAppServices(): AppServices {
  const value = useContext(AppServicesContext);
  if (!value) throw new Error('AppServicesProvider is required');
  return value;
}

function createAppServices(): AppServices | null {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;

  const client = createClient(url, anonKey, {
    auth: {
      storage: createSecureSessionStorage(),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  return {
    authRepository: new SupabaseAuthRepository(createSupabaseAuthPort(client)),
    onboardingRepository: new SupabaseOnboardingRepository(
      createSupabaseOnboardingGateway(client),
    ),
  };
}
