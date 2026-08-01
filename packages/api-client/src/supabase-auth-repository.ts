import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AuthRepository,
  AuthSession,
  OtpRequestResult,
} from './auth-repository.js';
import { RepositoryError } from './onboarding-repository.js';

export { RepositoryError } from './onboarding-repository.js';

interface AuthPortError {
  message: string;
}

export interface SupabaseAuthPort {
  requestEmailOtp(email: string): Promise<{ error: AuthPortError | null }>;
  verifyEmailOtp(
    email: string,
    token: string,
  ): Promise<{
    session: AuthSession | null;
    error: AuthPortError | null;
  }>;
  getSession(): Promise<{
    session: AuthSession | null;
    error: AuthPortError | null;
  }>;
  signOut(): Promise<{ error: AuthPortError | null }>;
}

export class SupabaseAuthRepository implements AuthRepository {
  constructor(private readonly auth: SupabaseAuthPort) {}

  async requestEmailOtp(email: string): Promise<OtpRequestResult> {
    const normalizedEmail = normalizeEmail(email);
    const { error } = await this.auth.requestEmailOtp(normalizedEmail);
    if (error && !isEnumerationSensitive(error.message)) {
      throw new RepositoryError('AUTH_UNAVAILABLE');
    }
    return { status: 'accepted' };
  }

  async verifyEmailOtp(email: string, token: string): Promise<AuthSession> {
    const normalizedEmail = normalizeEmail(email);
    if (!/^\d{6}$/.test(token)) {
      throw new RepositoryError('INVALID_OTP');
    }

    const result = await this.auth.verifyEmailOtp(normalizedEmail, token);
    if (result.error || !result.session) {
      throw new RepositoryError('OTP_INVALID_OR_EXPIRED');
    }
    return result.session;
  }

  async getSession(): Promise<AuthSession | null> {
    const result = await this.auth.getSession();
    if (result.error) throw new RepositoryError('AUTH_UNAVAILABLE');
    return result.session;
  }

  async signOut(): Promise<void> {
    const { error } = await this.auth.signOut();
    if (error) throw new RepositoryError('AUTH_UNAVAILABLE');
  }
}

export function createSupabaseAuthPort(
  client: SupabaseClient,
): SupabaseAuthPort {
  return {
    async requestEmailOtp(email) {
      const { error } = await client.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });
      return { error };
    },
    async verifyEmailOtp(email, token) {
      const { data, error } = await client.auth.verifyOtp({
        email,
        token,
        type: 'email',
      });
      return { session: mapSession(data.session), error };
    },
    async getSession() {
      const { data, error } = await client.auth.getSession();
      return { session: mapSession(data.session), error };
    },
    async signOut() {
      const { error } = await client.auth.signOut();
      return { error };
    },
  };
}

function mapSession(
  session: {
    access_token: string;
    refresh_token: string;
    expires_at?: number;
    user: { id: string };
  } | null,
): AuthSession | null {
  if (!session?.expires_at) return null;
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at,
    userId: session.user.id,
  };
}

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new RepositoryError('INVALID_EMAIL');
  }
  return normalized;
}

function isEnumerationSensitive(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('signup') ||
    normalized.includes('not found') ||
    normalized.includes('does not exist') ||
    normalized.includes('registered')
  );
}
