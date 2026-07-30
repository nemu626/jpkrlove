export interface AuthenticatedUser {
  userId: string;
  accessToken: string;
}

export interface Authenticator {
  authenticate(request: Request): Promise<AuthenticatedUser>;
}

export interface UserRpc {
  redeemInvitation(accessToken: string, code: string): Promise<void>;
  hasAcceptedInvitation(accessToken: string, userId: string): Promise<boolean>;
}

export interface CreateIdentityCaseInput {
  userId: string;
  providerCaseId: string;
}

export interface ApplyIdentityResultInput {
  providerCaseId: string;
  status: 'verified' | 'failed';
  verifiedBirthDate: string | null;
  verifiedNationality: 'JP' | 'KR' | null;
  observedAt: string;
}

export interface AppliedIdentityResult {
  applied: boolean;
  status: 'pending' | 'verified' | 'failed';
  failureReason: 'PROVIDER_FAILED' | 'UNDERAGE' | 'NATIONALITY_MISMATCH' | null;
}

export interface WorkerRpc {
  createIdentityCase(input: CreateIdentityCaseInput): Promise<{
    providerCaseId: string;
    status: 'pending' | 'verified' | 'failed';
  }>;
  applyIdentityResult(
    input: ApplyIdentityResultInput,
  ): Promise<AppliedIdentityResult>;
}

type Fetch = typeof fetch;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function requestId(request: Request): string {
  const supplied = request.headers.get('x-request-id')?.trim();
  return supplied && supplied.length <= 128 ? supplied : crypto.randomUUID();
}

export function successResponse(
  data: Record<string, unknown>,
  requestIdValue: string,
  status = 200,
): Response {
  return Response.json(
    { data, requestId: requestIdValue },
    {
      status,
      headers: { 'cache-control': 'no-store' },
    },
  );
}

export function errorResponse(
  error: unknown,
  requestIdValue: string,
): Response {
  const normalized = error instanceof HttpError
    ? error
    : new HttpError(500, 'INTERNAL_ERROR', 'An unexpected error occurred.');

  return Response.json(
    {
      error: {
        code: normalized.code,
        message: normalized.message,
        requestId: requestIdValue,
      },
    },
    {
      status: normalized.status,
      headers: { 'cache-control': 'no-store' },
    },
  );
}

export function requirePost(request: Request): void {
  if (request.method !== 'POST') {
    throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
  }
}

export async function parseJsonObject(
  request: Request,
): Promise<Record<string, unknown>> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    throw new HttpError(
      415,
      'UNSUPPORTED_MEDIA_TYPE',
      'Content-Type must be application/json.',
    );
  }

  try {
    const value: unknown = await request.json();
    if (value === null || Array.isArray(value) || typeof value !== 'object') {
      throw new Error('not an object');
    }
    return value as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'INVALID_REQUEST', 'Request body is invalid.');
  }
}

export function createSupabaseJwtAuthenticator(input: {
  supabaseUrl: string;
  anonKey: string;
  fetch?: Fetch;
}): Authenticator {
  const fetcher = input.fetch ?? fetch;
  const baseUrl = input.supabaseUrl.replace(/\/+$/, '');

  return {
    async authenticate(request): Promise<AuthenticatedUser> {
      const authorization = request.headers.get('authorization')?.trim() ?? '';
      const match = /^Bearer\s+(.+)$/i.exec(authorization);
      if (!match?.[1]) {
        throw new HttpError(
          401,
          'AUTHENTICATION_REQUIRED',
          'Authentication required.',
        );
      }

      const accessToken = match[1];
      const response = await fetcher(`${baseUrl}/auth/v1/user`, {
        headers: {
          authorization: `Bearer ${accessToken}`,
          apikey: input.anonKey,
        },
      });

      if (!response.ok) {
        throw new HttpError(
          401,
          'AUTHENTICATION_REQUIRED',
          'Authentication required.',
        );
      }

      const body: unknown = await response.json();
      const userId = body !== null &&
          typeof body === 'object' &&
          typeof (body as { id?: unknown }).id === 'string'
        ? (body as { id: string }).id
        : null;
      if (!userId) {
        throw new HttpError(
          401,
          'AUTHENTICATION_REQUIRED',
          'Authentication required.',
        );
      }

      return { userId, accessToken };
    },
  };
}

async function callRpc(
  input: {
    supabaseUrl: string;
    apiKey: string;
    authorization: string;
    fetcher: Fetch;
  },
  name: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const response = await input.fetcher(
    `${input.supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/${name}`,
    {
      method: 'POST',
      headers: {
        authorization: input.authorization,
        apikey: input.apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    if (errorText.includes('invitation is invalid, expired, or at capacity')) {
      throw new HttpError(
        409,
        'INVITATION_UNAVAILABLE',
        'Invitation is unavailable.',
      );
    }
    if (errorText.includes('invitation already redeemed with another code')) {
      throw new HttpError(
        409,
        'INVITATION_ALREADY_REDEEMED',
        'A different invitation was already redeemed.',
      );
    }
    if (errorText.includes('accepted invitation required')) {
      throw new HttpError(
        403,
        'INVITATION_REQUIRED',
        'An accepted invitation is required.',
      );
    }
    throw new HttpError(
      502,
      'DATABASE_ERROR',
      'The request could not be saved.',
    );
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? (JSON.parse(text) as unknown) : null;
}

export function createUserRpc(input: {
  supabaseUrl: string;
  anonKey: string;
  fetch?: Fetch;
}): UserRpc {
  const fetcher = input.fetch ?? fetch;

  return {
    async redeemInvitation(accessToken, code): Promise<void> {
      await callRpc(
        {
          supabaseUrl: input.supabaseUrl,
          apiKey: input.anonKey,
          authorization: `Bearer ${accessToken}`,
          fetcher,
        },
        'redeem_invitation',
        { code },
      );
    },
    async hasAcceptedInvitation(accessToken, userId): Promise<boolean> {
      const result = await callRpc(
        {
          supabaseUrl: input.supabaseUrl,
          apiKey: input.anonKey,
          authorization: `Bearer ${accessToken}`,
          fetcher,
        },
        'has_active_access',
        { candidate_user_id: userId },
      );
      return result === true;
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (
    candidate === null ||
    candidate === undefined ||
    typeof candidate !== 'object'
  ) {
    throw new HttpError(
      502,
      'DATABASE_ERROR',
      'The request could not be saved.',
    );
  }
  return candidate as Record<string, unknown>;
}

export function createWorkerRpc(input: {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetch?: Fetch;
}): WorkerRpc {
  const fetcher = input.fetch ?? fetch;
  const rpc = (name: string, body: Record<string, unknown>) =>
    callRpc(
      {
        supabaseUrl: input.supabaseUrl,
        apiKey: input.serviceRoleKey,
        authorization: `Bearer ${input.serviceRoleKey}`,
        fetcher,
      },
      name,
      body,
    );

  return {
    async createIdentityCase(caseInput) {
      const result = asRecord(
        await rpc('internal_create_identity_case', {
          target_user_id: caseInput.userId,
          new_provider_case_id: caseInput.providerCaseId,
        }),
      );
      if (
        typeof result.provider_case_id !== 'string' ||
        result.provider_case_id.length === 0
      ) {
        throw new HttpError(
          502,
          'DATABASE_ERROR',
          'The request could not be saved.',
        );
      }
      return {
        providerCaseId: result.provider_case_id,
        status: parseIdentityStatus(result.status),
      };
    },
    async applyIdentityResult(resultInput) {
      const result = asRecord(
        await rpc('internal_apply_identity_result', {
          target_provider_case_id: resultInput.providerCaseId,
          provider_status: resultInput.status,
          provider_birth_date: resultInput.verifiedBirthDate,
          provider_nationality: resultInput.verifiedNationality,
          observed_at: resultInput.observedAt,
        }),
      );
      const reason = result.failure_reason;
      if (
        reason !== null &&
        reason !== 'PROVIDER_FAILED' &&
        reason !== 'UNDERAGE' &&
        reason !== 'NATIONALITY_MISMATCH'
      ) {
        throw new HttpError(
          502,
          'DATABASE_ERROR',
          'The request could not be saved.',
        );
      }
      return {
        applied: result.applied === true,
        status: parseIdentityStatus(result.status),
        failureReason: reason,
      };
    },
  };
}

function parseIdentityStatus(
  value: unknown,
): 'pending' | 'verified' | 'failed' {
  if (value === 'pending' || value === 'verified' || value === 'failed') {
    return value;
  }
  throw new HttpError(502, 'DATABASE_ERROR', 'The request could not be saved.');
}

export function requireEnvironment(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`MISSING_ENVIRONMENT:${name}`);
  return value;
}
