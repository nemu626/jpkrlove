import { HttpError } from './http.ts';
import type {
  IdentityProvider,
  IdentityWebhookResult,
} from './identity-provider.ts';

const encoder = new TextEncoder();

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return bytesToHex(new Uint8Array(digest));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(value),
  );
  return bytesToHex(new Uint8Array(signature));
}

function secureEquals(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^
      (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function parseWebhookPayload(rawBody: string): IdentityWebhookResult {
  let value: unknown;
  try {
    value = JSON.parse(rawBody);
  } catch {
    throw new HttpError(400, 'INVALID_WEBHOOK', 'Webhook payload is invalid.');
  }
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw new HttpError(400, 'INVALID_WEBHOOK', 'Webhook payload is invalid.');
  }

  const body = value as Record<string, unknown>;
  if (
    typeof body.providerCaseId !== 'string' ||
    body.providerCaseId.length < 1 ||
    body.providerCaseId.length > 255
  ) {
    throw new HttpError(400, 'INVALID_WEBHOOK', 'Webhook payload is invalid.');
  }

  if (
    (body.status !== 'verified' && body.status !== 'failed') ||
    typeof body.verifiedBirthDate !== 'string' ||
    !isIsoDate(body.verifiedBirthDate) ||
    (body.verifiedNationality !== 'JP' && body.verifiedNationality !== 'KR')
  ) {
    throw new HttpError(400, 'INVALID_WEBHOOK', 'Webhook payload is invalid.');
  }

  return {
    providerCaseId: body.providerCaseId,
    status: body.status,
    verifiedBirthDate: body.verifiedBirthDate,
    verifiedNationality: body.verifiedNationality,
  };
}

function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}

export async function signFakeWebhookBody(
  rawBody: string,
  secret: string,
): Promise<string> {
  return `v1=${await hmac(rawBody, secret)}`;
}

export class FakeIdentityProvider implements IdentityProvider {
  readonly #webhookSecret: string;
  readonly #sessionBaseUrl: string;

  constructor(input: { webhookSecret: string; sessionBaseUrl?: string }) {
    if (!input.webhookSecret) throw new Error('FAKE_WEBHOOK_SECRET_REQUIRED');
    this.#webhookSecret = input.webhookSecret;
    this.#sessionBaseUrl = (
      input.sessionBaseUrl ?? 'http://localhost:54321/fake-identity'
    ).replace(/\/+$/, '');
  }

  async createSession(input: {
    userId: string;
    callbackUrl: string;
    idempotencyKey: string;
  }): Promise<{ providerCaseId: string; redirectUrl: string }> {
    const providerCaseId = `fake_${
      (await sha256(input.idempotencyKey)).slice(0, 32)
    }`;
    const query = new URLSearchParams({
      callback_url: input.callbackUrl,
    });
    return {
      providerCaseId,
      redirectUrl:
        `${this.#sessionBaseUrl}/${providerCaseId}?${query.toString()}`,
    };
  }

  async verifyWebhook(request: Request): Promise<IdentityWebhookResult> {
    const signature = request.headers.get('x-identity-signature') ?? '';
    const rawBody = await request.text();
    const expected = await signFakeWebhookBody(rawBody, this.#webhookSecret);
    if (!secureEquals(signature, expected)) {
      throw new HttpError(
        401,
        'INVALID_WEBHOOK_SIGNATURE',
        'Webhook signature is invalid.',
      );
    }
    return parseWebhookPayload(rawBody);
  }
}

export function selectIdentityProvider(input: {
  environment: string;
  mode: string;
  webhookSecret: string;
  sessionBaseUrl?: string;
}): IdentityProvider {
  const fakeEnvironments = new Set(['development', 'local', 'preview', 'test']);
  if (
    input.mode === 'fake' &&
    !fakeEnvironments.has(input.environment.toLowerCase())
  ) {
    throw new Error('FAKE_PROVIDER_FORBIDDEN');
  }
  if (input.mode !== 'fake') {
    throw new Error('IDENTITY_PROVIDER_NOT_CONFIGURED');
  }
  return new FakeIdentityProvider({
    webhookSecret: input.webhookSecret,
    sessionBaseUrl: input.sessionBaseUrl,
  });
}
