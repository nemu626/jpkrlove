import type { AuthRepository, AuthSession } from '@jpkrlove/api-client';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

export function useAuthSession(repository: AuthRepository) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const restore = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setSession(await repository.getSession());
    } catch (nextError) {
      setError(nextError);
    } finally {
      setIsLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    let mounted = true;
    repository
      .getSession()
      .then((next) => {
        if (mounted) setSession(next);
      })
      .catch((nextError: unknown) => {
        if (mounted) setError(nextError);
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [repository]);

  const verifyEmailOtp = useCallback(
    async (email: string, token: string) => {
      const next = await repository.verifyEmailOtp(email, token);
      setSession(next);
      return next;
    },
    [repository],
  );

  const signOut = useCallback(async () => {
    await repository.signOut();
    setSession(null);
  }, [repository]);

  return {
    session,
    isLoading,
    error,
    restore,
    requestEmailOtp: repository.requestEmailOtp.bind(repository),
    verifyEmailOtp,
    signOut,
  };
}

type AuthSessionContextValue = ReturnType<typeof useAuthSession>;

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

export function AuthSessionProvider({
  repository,
  children,
}: PropsWithChildren<{ repository: AuthRepository }>) {
  const value = useAuthSession(repository);
  return (
    <AuthSessionContext.Provider value={value}>
      {children}
    </AuthSessionContext.Provider>
  );
}

export function useAuthSessionContext(): AuthSessionContextValue {
  const value = useContext(AuthSessionContext);
  if (!value) {
    throw new Error('AuthSessionProvider is required');
  }
  return value;
}
