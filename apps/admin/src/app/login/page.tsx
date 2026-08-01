import {
  createServerSupabaseClient,
  setAccessTokenCookie,
} from '../../lib/supabase/server';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

async function requestOtp(formData: FormData) {
  'use server';
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  if (email) {
    const client = await createServerSupabaseClient();
    // Keep the response identical for unknown and provisioned accounts.
    await client.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
  }
  redirect('/login?sent=1');
}

async function verifyOtp(formData: FormData) {
  'use server';
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const token = String(formData.get('token') ?? '').trim();
  if (!email || !/^\d{6}$/.test(token)) redirect('/login?error=invalid');

  const client = await createServerSupabaseClient();
  const { data, error } = await client.auth.verifyOtp({
    email,
    token,
    type: 'email',
  });
  if (error || !data.session?.access_token) redirect('/login?error=invalid');

  await setAccessTokenCookie(
    data.session.access_token,
    data.session.expires_in ?? 60 * 60,
  );
  redirect('/mfa');
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const params = await searchParams;
  return (
    <main>
      <h1>運営ログイン</h1>
      <p>事前発行された運営アカウントでメール認証を開始します。</p>
      {params.sent ? <p role="status">認証コードを送信しました。</p> : null}
      {params.error ? (
        <p role="alert">認証に失敗しました。コードを確認してください。</p>
      ) : null}
      <form action={requestOtp}>
        <label htmlFor="email">メールアドレス</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
        <button type="submit">認証コードを送信</button>
      </form>
      <form action={verifyOtp}>
        <fieldset>
          <legend>受信した認証コード</legend>
          <label htmlFor="verify-email">メールアドレス</label>
          <input
            id="verify-email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
          <label htmlFor="token">6桁の認証コード</label>
          <input
            id="token"
            name="token"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            autoComplete="one-time-code"
            required
          />
          <button type="submit">認証して続ける</button>
        </fieldset>
      </form>
      <p>アカウントの新規登録はできません。</p>
    </main>
  );
}
