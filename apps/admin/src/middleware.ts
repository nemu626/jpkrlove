import { NextResponse, type NextRequest } from 'next/server';

/**
 * Middleware runs in the Edge runtime, so it must not import the server-only
 * Supabase client. It only performs the cheap session/AAL gate; the review
 * pages and RPCs re-check the operator role on the server.
 */
export function middleware(request: NextRequest) {
  const accessToken = findAccessToken(request);
  if (!accessToken)
    return NextResponse.redirect(new URL('/login', request.url));

  const aal = readJwtClaim(accessToken, 'aal');
  if (aal !== 'aal2')
    return NextResponse.redirect(new URL('/mfa', request.url));

  return NextResponse.next();
}

function findAccessToken(request: NextRequest): string | undefined {
  const direct = request.cookies.get('sb-access-token')?.value;
  if (direct) return direct;

  const session = request.cookies
    .getAll()
    .filter(({ name }) => /-auth-token(?:\.\d+)?$/.test(name))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(({ value }) => value)
    .join('');
  if (!session) return undefined;

  try {
    const parsed = JSON.parse(session) as unknown;
    if (Array.isArray(parsed) && typeof parsed[0] === 'string')
      return parsed[0];
    if (
      parsed &&
      typeof parsed === 'object' &&
      'access_token' in parsed &&
      typeof parsed.access_token === 'string'
    ) {
      return parsed.access_token;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function readJwtClaim(token: string, claim: string): unknown {
  const encodedPayload = token.split('.')[1];
  if (!encodedPayload) return undefined;
  try {
    const payload = JSON.parse(
      atob(encodedPayload.replaceAll('-', '+').replaceAll('_', '/')),
    ) as unknown;
    if (!payload || typeof payload !== 'object') return undefined;
    return (payload as Record<string, unknown>)[claim];
  } catch {
    return undefined;
  }
}

export const config = { matcher: ['/reviews/:path*'] };
