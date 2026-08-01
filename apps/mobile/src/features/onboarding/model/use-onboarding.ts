import type {
  OnboardingRepository,
  OnboardingState,
} from '@jpkrlove/api-client';
import { useCallback, useEffect, useState } from 'react';

export function useOnboarding(repository: OnboardingRepository) {
  const [state, setState] = useState<OnboardingState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setState(await repository.getCurrentState());
    } catch (nextError) {
      setError(nextError);
    } finally {
      setIsLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    let mounted = true;
    repository
      .getCurrentState()
      .then((next) => {
        if (mounted) setState(next);
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

  return { state, isLoading, error, refresh };
}
