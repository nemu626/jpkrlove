import { redirect } from 'next/navigation';

import {
  createSupabaseClientForAccessToken,
  findAccessToken,
  setAccessTokenCookie,
} from '../../lib/supabase/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

async function verifyMfa(formData: FormData) {
  'use server';
  const factorId = String(formData.get('factorId') ?? '').trim();
  const code = String(formData.get('code') ?? '').trim();
  const token = findAccessToken((await cookies()).getAll());
  if (!token || !factorId || !/^\d{6}$/.test(code))
    redirect('/mfa?error=invalid');

  const client = createSupabaseClientForAccessToken(token);
  const challenge = await client.auth.mfa.challenge({ factorId });
  if (challenge.error) redirect('/mfa?error=invalid');

  const verified = await client.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code,
  });
  if (verified.error || !verified.data.access_token) {
    redirect('/mfa?error=invalid');
  }
  await setAccessTokenCookie(
    verified.data.access_token,
    verified.data.expires_in ?? 60 * 60,
  );
  redirect('/reviews');
}

export default async function MfaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const token = findAccessToken((await cookies()).getAll());
  if (!token) redirect('/login');

  const client = createSupabaseClientForAccessToken(token);
  const { error: userError } = await client.auth.getUser();
  if (userError) redirect('/login');
  const { data, error } = await client.auth.mfa.listFactors();
  const factors = (data?.totp ?? []).filter(
    (factor) => factor.status === 'verified',
  );
  const params = await searchParams;

  return (
    <main>
      <h1>追加認証が必要です</h1>
      <p>AAL2を満たすため、登録済みのTOTP認証を完了してください。</p>
      {params.error || error ? (
        <p role="alert">認証に失敗しました。コードを確認してください。</p>
      ) : null}
      {factors.length === 0 ? (
        <p role="alert">
          登録済みの認証器がありません。管理者へ連絡してください。
        </p>
      ) : (
        <form action={verifyMfa}>
          <label htmlFor="factorId">認証器</label>
          <select
            id="factorId"
            name="factorId"
            required
            defaultValue={factors[0]?.id}
          >
            {factors.map((factor) => (
              <option key={factor.id} value={factor.id}>
                {factor.friendly_name ?? '認証アプリ'}
              </option>
            ))}
          </select>
          <label htmlFor="code">6桁の認証コード</label>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            autoComplete="one-time-code"
            required
          />
          <button type="submit">認証して審査へ進む</button>
        </form>
      )}
    </main>
  );
}
