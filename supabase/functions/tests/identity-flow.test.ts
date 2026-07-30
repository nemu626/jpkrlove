import {
  type Authenticator,
  createSupabaseJwtAuthenticator,
  createWorkerRpc,
  HttpError,
  type UserRpc,
  type WorkerRpc,
} from '../_shared/http.ts';
import {
  FakeIdentityProvider,
  selectIdentityProvider,
  signFakeWebhookBody,
} from '../_shared/fake-identity-provider.ts';
import type { IdentityProvider } from '../_shared/identity-provider.ts';
import { handleRedeemInvitation } from '../redeem-invitation/index.ts';
import { handleCreateIdentitySession } from '../create-identity-session/index.ts';
import { handleIdentityWebhook } from '../identity-webhook/index.ts';

const USER_ID = '11111111-1111-4111-8111-111111111111';

function assert(
  condition: unknown,
  message = 'assertion failed',
): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(
  actual: unknown,
  expected: unknown,
  message?: string,
): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(
      message ?? `expected ${expectedJson}, received ${actualJson}`,
    );
  }
}

async function assertRejects(
  operation: () => Promise<unknown>,
  errorMessage: string,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    assert(error instanceof Error);
    const searchable = error instanceof HttpError
      ? `${error.code} ${error.message}`
      : error.message;
    assert(
      searchable.includes(errorMessage),
      `expected error containing ${errorMessage}, received ${searchable}`,
    );
    return;
  }
  throw new Error(`expected rejection containing ${errorMessage}`);
}

function request(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request(`http://local/${path}`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer member-jwt',
      'content-type': 'application/json',
      'x-request-id': 'req-test',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

async function responseJson(
  response: Response,
): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function authenticated(): Authenticator {
  return {
    authenticate: () =>
      Promise.resolve({ userId: USER_ID, accessToken: 'member-jwt' }),
  };
}

function userRpc(overrides: Partial<UserRpc> = {}): UserRpc {
  return {
    redeemInvitation: () => Promise.resolve(),
    hasAcceptedInvitation: () => Promise.resolve(true),
    ...overrides,
  };
}

function workerRpc(overrides: Partial<WorkerRpc> = {}): WorkerRpc {
  return {
    createIdentityCase: (input) =>
      Promise.resolve({
        providerCaseId: input.providerCaseId,
        status: 'pending',
      }),
    applyIdentityResult: () =>
      Promise.resolve({
        applied: true,
        status: 'verified',
        failureReason: null,
      }),
    ...overrides,
  };
}

Deno.test(
  'JWT authenticator rejects a missing bearer token before network access',
  async () => {
    let fetched = false;
    const authenticator = createSupabaseJwtAuthenticator({
      supabaseUrl: 'https://supabase.example',
      anonKey: 'anon-key',
      fetch: () => {
        fetched = true;
        return Promise.resolve(new Response());
      },
    });

    await assertRejects(
      () => authenticator.authenticate(new Request('http://local')),
      'AUTHENTICATION_REQUIRED',
    );
    assertEquals(fetched, false);
  },
);

Deno.test(
  'JWT authenticator trusts the verified auth user rather than JWT payload text',
  async () => {
    const calls: Array<{ url: string; authorization: string | null }> = [];
    const authenticator = createSupabaseJwtAuthenticator({
      supabaseUrl: 'https://supabase.example/',
      anonKey: 'anon-key',
      fetch: (input, init) => {
        calls.push({
          url: String(input),
          authorization: new Headers(init?.headers).get('authorization'),
        });
        return Promise.resolve(Response.json({ id: USER_ID }, { status: 200 }));
      },
    });

    const result = await authenticator.authenticate(
      new Request('http://local', {
        headers: { authorization: 'Bearer forged.payload.signature' },
      }),
    );

    assertEquals(result, {
      userId: USER_ID,
      accessToken: 'forged.payload.signature',
    });
    assertEquals(calls, [
      {
        url: 'https://supabase.example/auth/v1/user',
        authorization: 'Bearer forged.payload.signature',
      },
    ]);
  },
);

Deno.test(
  'redeems an invitation with the authenticated member JWT',
  async () => {
    const calls: unknown[] = [];
    const response = await handleRedeemInvitation(
      request('redeem-invitation', { code: '  jp-start  ' }),
      {
        authenticator: authenticated(),
        userRpc: userRpc({
          redeemInvitation: (accessToken, code) => {
            calls.push({ accessToken, code });
            return Promise.resolve();
          },
        }),
      },
    );

    assertEquals(response.status, 200);
    assertEquals(calls, [
      {
        accessToken: 'member-jwt',
        code: 'JP-START',
      },
    ]);
    assertEquals(await responseJson(response), {
      data: { redeemed: true },
      requestId: 'req-test',
    });
  },
);

Deno.test(
  'treats a same-code duplicate invitation redemption as success',
  async () => {
    const response = await handleRedeemInvitation(
      request('redeem-invitation', { code: 'JP-START' }),
      {
        authenticator: authenticated(),
        userRpc: userRpc(),
      },
    );

    assertEquals(response.status, 200);
    assertEquals(await responseJson(response), {
      data: { redeemed: true },
      requestId: 'req-test',
    });
  },
);

Deno.test(
  'normalizes an exhausted invitation without exposing a database error',
  async () => {
    const response = await handleRedeemInvitation(
      request('redeem-invitation', { code: 'FULL-CODE' }),
      {
        authenticator: authenticated(),
        userRpc: userRpc({
          redeemInvitation: () => {
            throw new HttpError(
              409,
              'INVITATION_UNAVAILABLE',
              'Invitation is unavailable.',
            );
          },
        }),
      },
    );

    assertEquals(response.status, 409);
    assertEquals(await responseJson(response), {
      error: {
        code: 'INVITATION_UNAVAILABLE',
        message: 'Invitation is unavailable.',
        requestId: 'req-test',
      },
    });
  },
);

Deno.test(
  'does not expose unexpected database details in invitation errors',
  async () => {
    const response = await handleRedeemInvitation(
      request('redeem-invitation', { code: 'JP-START' }),
      {
        authenticator: authenticated(),
        userRpc: userRpc({
          redeemInvitation: () => {
            throw new Error(
              'relation private.invitation_codes contains secret details',
            );
          },
        }),
      },
    );
    const body = JSON.stringify(await responseJson(response));

    assertEquals(response.status, 500);
    assert(body.includes('INTERNAL_ERROR'));
    assert(!body.includes('private.invitation_codes'));
    assert(!body.includes('secret details'));
  },
);

Deno.test(
  'rejects malformed invitation input before calling the RPC',
  async () => {
    let called = false;
    const response = await handleRedeemInvitation(
      request('redeem-invitation', { code: '   ' }),
      {
        authenticator: authenticated(),
        userRpc: userRpc({
          redeemInvitation: () => {
            called = true;
            return Promise.resolve();
          },
        }),
      },
    );

    assertEquals(response.status, 400);
    assertEquals(called, false);
  },
);

Deno.test(
  'checks accepted invitation before creating a provider session',
  async () => {
    let providerCalled = false;
    const provider: IdentityProvider = {
      createSession: () => {
        providerCalled = true;
        return Promise.resolve({
          providerCaseId: 'case-never',
          redirectUrl: 'https://identity.example/never',
        });
      },
      verifyWebhook: () => Promise.reject(new Error('not used')),
    };

    const response = await handleCreateIdentitySession(
      request('create-identity-session', {}),
      {
        authenticator: authenticated(),
        userRpc: userRpc({
          hasAcceptedInvitation: () => Promise.resolve(false),
        }),
        workerRpc: workerRpc(),
        provider,
        callbackUrl: 'jpkrlove://identity/callback',
      },
    );

    assertEquals(response.status, 403);
    assertEquals(providerCalled, false);
    assertEquals(await responseJson(response), {
      error: {
        code: 'INVITATION_REQUIRED',
        message: 'An accepted invitation is required.',
        requestId: 'req-test',
      },
    });
  },
);

Deno.test(
  'creates an identity session for the authenticated member and persists a pending case',
  async () => {
    const calls: unknown[] = [];
    const provider: IdentityProvider = {
      createSession: (input) => {
        calls.push({ provider: input });
        return Promise.resolve({
          providerCaseId: 'case-123',
          redirectUrl: 'https://identity.example/session/case-123',
        });
      },
      verifyWebhook: () => Promise.reject(new Error('not used')),
    };

    const response = await handleCreateIdentitySession(
      request('create-identity-session', {}),
      {
        authenticator: authenticated(),
        userRpc: userRpc({
          hasAcceptedInvitation: (accessToken, userId) => {
            calls.push({ access: { accessToken, userId } });
            return Promise.resolve(true);
          },
        }),
        workerRpc: workerRpc({
          createIdentityCase: (input) => {
            calls.push({ worker: input });
            return Promise.resolve({
              providerCaseId: input.providerCaseId,
              status: 'pending',
            });
          },
        }),
        provider,
        callbackUrl: 'jpkrlove://identity/callback',
      },
    );

    assertEquals(response.status, 201);
    assertEquals(calls, [
      {
        access: { accessToken: 'member-jwt', userId: USER_ID },
      },
      {
        provider: {
          userId: USER_ID,
          callbackUrl: 'jpkrlove://identity/callback',
          idempotencyKey: `identity-session:${USER_ID}`,
        },
      },
      {
        worker: {
          userId: USER_ID,
          providerCaseId: 'case-123',
        },
      },
    ]);
    assertEquals(await responseJson(response), {
      data: {
        providerCaseId: 'case-123',
        redirectUrl: 'https://identity.example/session/case-123',
      },
      requestId: 'req-test',
    });
  },
);

Deno.test('retries identity session creation with one stable provider allocation', async () => {
  const sessions = new Map<
    string,
    { providerCaseId: string; redirectUrl: string }
  >();
  let allocations = 0;
  let storedProviderCaseId: string | null = null;
  const provider: IdentityProvider = {
    createSession: (input) => {
      const existing = sessions.get(input.idempotencyKey);
      if (existing) return Promise.resolve(existing);
      allocations += 1;
      const session = {
        providerCaseId: `case-${allocations}`,
        redirectUrl: `https://identity.example/session/${allocations}`,
      };
      sessions.set(input.idempotencyKey, session);
      return Promise.resolve(session);
    },
    verifyWebhook: () => Promise.reject(new Error('not used')),
  };
  const dependencies = {
    authenticator: authenticated(),
    userRpc: userRpc(),
    workerRpc: workerRpc({
      createIdentityCase: (input) => {
        storedProviderCaseId ??= input.providerCaseId;
        return Promise.resolve({
          providerCaseId: storedProviderCaseId,
          status: 'pending' as const,
        });
      },
    }),
    provider,
    callbackUrl: 'jpkrlove://identity/callback',
  };

  const first = await handleCreateIdentitySession(
    request('create-identity-session', {}),
    dependencies,
  );
  const retry = await handleCreateIdentitySession(
    request('create-identity-session', {}),
    dependencies,
  );

  assertEquals(first.status, 201);
  assertEquals(retry.status, 201);
  assertEquals(await responseJson(first), await responseJson(retry));
  assertEquals(allocations, 1);
  assertEquals(storedProviderCaseId, 'case-1');
});

Deno.test(
  'fake provider creates deterministic sessions without identity document fields',
  async () => {
    const provider = new FakeIdentityProvider({
      webhookSecret: 'test-secret',
      sessionBaseUrl: 'https://fake-identity.example/session',
    });
    const first = await provider.createSession({
      userId: USER_ID,
      callbackUrl: 'jpkrlove://identity/callback',
      idempotencyKey: `identity-session:${USER_ID}`,
    });
    const second = await provider.createSession({
      userId: USER_ID,
      callbackUrl: 'jpkrlove://identity/callback',
      idempotencyKey: `identity-session:${USER_ID}`,
    });

    assertEquals(first, second);
    assert(first.providerCaseId.startsWith('fake_'));
    assert(!JSON.stringify(first).includes('legalName'));
    assert(!JSON.stringify(first).includes('document'));
  },
);

Deno.test('fake provider preserves the documented derived fields on a signed failed result', async () => {
  const rawBody = JSON.stringify({
    providerCaseId: 'case-provider-failed',
    status: 'failed',
    verifiedBirthDate: '1990-01-01',
    verifiedNationality: 'KR',
  });
  const signature = await signFakeWebhookBody(rawBody, 'test-secret');
  const result = await new FakeIdentityProvider({
    webhookSecret: 'test-secret',
  }).verifyWebhook(
    new Request('http://local/identity-webhook', {
      method: 'POST',
      headers: { 'x-identity-signature': signature },
      body: rawBody,
    }),
  );

  assertEquals(result, {
    providerCaseId: 'case-provider-failed',
    status: 'failed',
    verifiedBirthDate: '1990-01-01',
    verifiedNationality: 'KR',
  });
});

Deno.test('refuses fake provider in production', () => {
  try {
    selectIdentityProvider({
      environment: 'production',
      mode: 'fake',
      webhookSecret: 'secret',
    });
  } catch (error) {
    assert(error instanceof Error);
    assert(error.message.includes('FAKE_PROVIDER_FORBIDDEN'));
    return;
  }
  throw new Error('expected fake provider rejection');
});

Deno.test('refuses fake provider for abbreviated or unknown environment names', () => {
  for (const environment of ['prod', 'staging', 'unknown']) {
    try {
      selectIdentityProvider({
        environment,
        mode: 'fake',
        webhookSecret: 'secret',
      });
    } catch (error) {
      assert(error instanceof Error);
      assert(error.message.includes('FAKE_PROVIDER_FORBIDDEN'));
      continue;
    }
    throw new Error(`expected fake provider rejection for ${environment}`);
  }
});

Deno.test(
  'rejects an unsigned identity webhook without applying a result',
  async () => {
    let applied = false;
    const response = await handleIdentityWebhook(
      request(
        'identity-webhook',
        {
          providerCaseId: 'case-1',
          status: 'verified',
          verifiedBirthDate: '1990-01-01',
          verifiedNationality: 'JP',
        },
        { authorization: '' },
      ),
      {
        provider: new FakeIdentityProvider({
          webhookSecret: 'test-secret',
        }),
        workerRpc: workerRpc({
          applyIdentityResult: () => {
            applied = true;
            return Promise.resolve({
              applied: true,
              status: 'verified',
              failureReason: null,
            });
          },
        }),
        clock: () => new Date('2026-07-30T00:00:00.000Z'),
      },
    );

    assertEquals(response.status, 401);
    assertEquals(applied, false);
  },
);

Deno.test(
  'verifies the webhook signature against the exact raw body',
  async () => {
    const rawBody =
      '{"verifiedNationality":"JP", "providerCaseId":"case-raw", "status":"verified", "verifiedBirthDate":"1990-01-01"}';
    const signature = await signFakeWebhookBody(rawBody, 'test-secret');
    const applied: unknown[] = [];
    const response = await handleIdentityWebhook(
      new Request('http://local/identity-webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-identity-signature': signature,
          'x-request-id': 'req-test',
        },
        body: rawBody,
      }),
      {
        provider: new FakeIdentityProvider({
          webhookSecret: 'test-secret',
        }),
        workerRpc: workerRpc({
          applyIdentityResult: (input) => {
            applied.push(input);
            return Promise.resolve({
              applied: true,
              status: 'verified',
              failureReason: null,
            });
          },
        }),
        clock: () => new Date('2026-07-30T00:00:00.000Z'),
      },
    );

    assertEquals(response.status, 200);
    assertEquals(applied, [
      {
        providerCaseId: 'case-raw',
        status: 'verified',
        verifiedBirthDate: '1990-01-01',
        verifiedNationality: 'JP',
        observedAt: '2026-07-30T00:00:00.000Z',
      },
    ]);
  },
);

Deno.test(
  'rejects a signature made for normalized JSON instead of the received bytes',
  async () => {
    const rawBody =
      '{"providerCaseId":"case-raw", "status":"verified", "verifiedBirthDate":"1990-01-01", "verifiedNationality":"JP"}';
    const normalized = JSON.stringify(JSON.parse(rawBody));
    assert(rawBody !== normalized);
    const signature = await signFakeWebhookBody(normalized, 'test-secret');

    const response = await handleIdentityWebhook(
      new Request('http://local/identity-webhook', {
        method: 'POST',
        headers: {
          'x-identity-signature': signature,
          'x-request-id': 'req-test',
        },
        body: rawBody,
      }),
      {
        provider: new FakeIdentityProvider({
          webhookSecret: 'test-secret',
        }),
        workerRpc: workerRpc(),
        clock: () => new Date('2026-07-30T00:00:00.000Z'),
      },
    );

    assertEquals(response.status, 401);
  },
);

Deno.test(
  'passes failed provider results without requiring derived identity fields',
  async () => {
    const rawBody = JSON.stringify({
      providerCaseId: 'case-failed',
      status: 'failed',
      verifiedBirthDate: '1990-01-01',
      verifiedNationality: 'KR',
    });
    const signature = await signFakeWebhookBody(rawBody, 'test-secret');
    const calls: unknown[] = [];
    const response = await handleIdentityWebhook(
      new Request('http://local/identity-webhook', {
        method: 'POST',
        headers: {
          'x-identity-signature': signature,
          'x-request-id': 'req-test',
        },
        body: rawBody,
      }),
      {
        provider: new FakeIdentityProvider({
          webhookSecret: 'test-secret',
        }),
        workerRpc: workerRpc({
          applyIdentityResult: (input) => {
            calls.push(input);
            return Promise.resolve({
              applied: true,
              status: 'failed',
              failureReason: 'PROVIDER_FAILED',
            });
          },
        }),
        clock: () => new Date('2026-07-30T00:00:00.000Z'),
      },
    );

    assertEquals(response.status, 200);
    assertEquals(calls, [
      {
        providerCaseId: 'case-failed',
        status: 'failed',
        verifiedBirthDate: null,
        verifiedNationality: null,
        observedAt: '2026-07-30T00:00:00.000Z',
      },
    ]);
  },
);

Deno.test('worker RPC rejects a malformed identity case response', async () => {
  const rpc = createWorkerRpc({
    supabaseUrl: 'https://supabase.example',
    serviceRoleKey: 'service-role-secret',
    fetch: () =>
      Promise.resolve(
        Response.json([{ status: 'pending' }], { status: 200 }),
      ),
  });

  await assertRejects(
    () =>
      rpc.createIdentityCase({
        userId: USER_ID,
        providerCaseId: 'case-requested',
      }),
    'DATABASE_ERROR',
  );
});

Deno.test(
  'accepts a replayed signed webhook as an idempotent success',
  async () => {
    const rawBody = JSON.stringify({
      providerCaseId: 'case-replay',
      status: 'verified',
      verifiedBirthDate: '1990-01-01',
      verifiedNationality: 'KR',
    });
    const signature = await signFakeWebhookBody(rawBody, 'test-secret');
    const response = await handleIdentityWebhook(
      new Request('http://local/identity-webhook', {
        method: 'POST',
        headers: {
          'x-identity-signature': signature,
          'x-request-id': 'req-test',
        },
        body: rawBody,
      }),
      {
        provider: new FakeIdentityProvider({
          webhookSecret: 'test-secret',
        }),
        workerRpc: workerRpc({
          applyIdentityResult: () =>
            Promise.resolve({
              applied: false,
              status: 'verified',
              failureReason: null,
            }),
        }),
        clock: () => new Date('2026-07-30T00:00:00.000Z'),
      },
    );

    assertEquals(response.status, 200);
    assertEquals(await responseJson(response), {
      data: {
        accepted: true,
        applied: false,
        status: 'verified',
      },
      requestId: 'req-test',
    });
  },
);

Deno.test(
  'reports an under-18 verified result as failed at the injected clock boundary',
  async () => {
    const rawBody = JSON.stringify({
      providerCaseId: 'case-underage',
      status: 'verified',
      verifiedBirthDate: '2008-07-31',
      verifiedNationality: 'JP',
    });
    const signature = await signFakeWebhookBody(rawBody, 'test-secret');
    const response = await handleIdentityWebhook(
      new Request('http://local/identity-webhook', {
        method: 'POST',
        headers: {
          'x-identity-signature': signature,
          'x-request-id': 'req-test',
        },
        body: rawBody,
      }),
      {
        provider: new FakeIdentityProvider({
          webhookSecret: 'test-secret',
        }),
        workerRpc: workerRpc({
          applyIdentityResult: (input) => {
            assertEquals(input.observedAt, '2026-07-30T12:00:00.000Z');
            return Promise.resolve({
              applied: true,
              status: 'failed',
              failureReason: 'UNDERAGE',
            });
          },
        }),
        clock: () => new Date('2026-07-30T12:00:00.000Z'),
      },
    );

    assertEquals(response.status, 200);
    assertEquals(await responseJson(response), {
      data: {
        accepted: true,
        applied: true,
        status: 'failed',
      },
      requestId: 'req-test',
    });
  },
);

Deno.test(
  'allows an exactly-18 result at the injected clock boundary',
  async () => {
    const rawBody = JSON.stringify({
      providerCaseId: 'case-adult-boundary',
      status: 'verified',
      verifiedBirthDate: '2008-07-30',
      verifiedNationality: 'JP',
    });
    const signature = await signFakeWebhookBody(rawBody, 'test-secret');
    let inputSeen: unknown;
    const response = await handleIdentityWebhook(
      new Request('http://local/identity-webhook', {
        method: 'POST',
        headers: {
          'x-identity-signature': signature,
          'x-request-id': 'req-test',
        },
        body: rawBody,
      }),
      {
        provider: new FakeIdentityProvider({
          webhookSecret: 'test-secret',
        }),
        workerRpc: workerRpc({
          applyIdentityResult: (input) => {
            inputSeen = input;
            return Promise.resolve({
              applied: true,
              status: 'verified',
              failureReason: null,
            });
          },
        }),
        clock: () => new Date('2026-07-30T23:59:59.000Z'),
      },
    );

    assertEquals(response.status, 200);
    assertEquals(
      (inputSeen as { verifiedBirthDate: string }).verifiedBirthDate,
      '2008-07-30',
    );
  },
);

Deno.test(
  'reports an invitation cohort nationality mismatch as failed',
  async () => {
    const rawBody = JSON.stringify({
      providerCaseId: 'case-mismatch',
      status: 'verified',
      verifiedBirthDate: '1990-01-01',
      verifiedNationality: 'KR',
    });
    const signature = await signFakeWebhookBody(rawBody, 'test-secret');
    const response = await handleIdentityWebhook(
      new Request('http://local/identity-webhook', {
        method: 'POST',
        headers: {
          'x-identity-signature': signature,
          'x-request-id': 'req-test',
        },
        body: rawBody,
      }),
      {
        provider: new FakeIdentityProvider({
          webhookSecret: 'test-secret',
        }),
        workerRpc: workerRpc({
          applyIdentityResult: () =>
            Promise.resolve({
              applied: true,
              status: 'failed',
              failureReason: 'NATIONALITY_MISMATCH',
            }),
        }),
        clock: () => new Date('2026-07-30T00:00:00.000Z'),
      },
    );

    assertEquals(response.status, 200);
    assertEquals(await responseJson(response), {
      data: {
        accepted: true,
        applied: true,
        status: 'failed',
      },
      requestId: 'req-test',
    });
  },
);

Deno.test(
  'drops legal names and raw document fields from signed provider payloads',
  async () => {
    const rawBody = JSON.stringify({
      providerCaseId: 'case-private-fields',
      status: 'verified',
      verifiedBirthDate: '1990-01-01',
      verifiedNationality: 'JP',
      legalName: 'Must Never Persist',
      documentData: 'raw-document-bytes',
    });
    const signature = await signFakeWebhookBody(rawBody, 'test-secret');
    let persisted = '';
    const response = await handleIdentityWebhook(
      new Request('http://local/identity-webhook', {
        method: 'POST',
        headers: { 'x-identity-signature': signature },
        body: rawBody,
      }),
      {
        provider: new FakeIdentityProvider({
          webhookSecret: 'test-secret',
        }),
        workerRpc: workerRpc({
          applyIdentityResult: (input) => {
            persisted = JSON.stringify(input);
            return Promise.resolve({
              applied: true,
              status: 'verified',
              failureReason: null,
            });
          },
        }),
        clock: () => new Date('2026-07-30T00:00:00.000Z'),
      },
    );

    assertEquals(response.status, 200);
    assert(!persisted.includes('Must Never Persist'));
    assert(!persisted.includes('raw-document-bytes'));
    assert(!persisted.includes('legalName'));
    assert(!persisted.includes('documentData'));
  },
);
