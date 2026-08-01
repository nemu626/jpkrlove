import { describe, expect, it, vi } from 'vitest';
import {
  RepositoryError,
  SupabaseAuthRepository,
  type SupabaseAuthPort,
} from './supabase-auth-repository.js';

function createAuthPort(
  overrides: Partial<SupabaseAuthPort> = {},
): SupabaseAuthPort {
  return {
    requestEmailOtp: vi.fn().mockResolvedValue({ error: null }),
    verifyEmailOtp: vi.fn().mockResolvedValue({
      session: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: 1_800_000_000,
        userId: 'member-1',
      },
      error: null,
    }),
    getSession: vi.fn().mockResolvedValue({ session: null, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    ...overrides,
  };
}

describe('SupabaseAuthRepository', () => {
  it('returns the same accepted result when an account does not exist', async () => {
    const repository = new SupabaseAuthRepository(
      createAuthPort({
        requestEmailOtp: vi.fn().mockResolvedValue({
          error: { message: 'Signups not allowed for otp' },
        }),
      }),
    );

    await expect(
      repository.requestEmailOtp('unknown@example.test'),
    ).resolves.toEqual({ status: 'accepted' });
  });

  it('rejects malformed email locally without contacting auth', async () => {
    const auth = createAuthPort();
    const repository = new SupabaseAuthRepository(auth);

    await expect(
      repository.requestEmailOtp('not-an-email'),
    ).rejects.toMatchObject({ code: 'INVALID_EMAIL' });
    expect(auth.requestEmailOtp).not.toHaveBeenCalled();
  });

  it('normalizes an expired email OTP without exposing provider copy', async () => {
    const repository = new SupabaseAuthRepository(
      createAuthPort({
        verifyEmailOtp: vi.fn().mockResolvedValue({
          session: null,
          error: { message: 'Token has expired or is invalid' },
        }),
      }),
    );

    await expect(
      repository.verifyEmailOtp('member@example.test', '123456'),
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'OTP_INVALID_OR_EXPIRED',
        message: 'OTP_INVALID_OR_EXPIRED',
      }),
    );
  });

  it('returns a verified session and signs out through the port', async () => {
    const auth = createAuthPort();
    const repository = new SupabaseAuthRepository(auth);

    await expect(
      repository.verifyEmailOtp('member@example.test', '123456'),
    ).resolves.toMatchObject({ userId: 'member-1' });
    await repository.signOut();
    expect(auth.signOut).toHaveBeenCalledOnce();
  });

  it('uses stable repository errors', () => {
    expect(new RepositoryError('AUTH_UNAVAILABLE').message).toBe(
      'AUTH_UNAVAILABLE',
    );
  });
});
