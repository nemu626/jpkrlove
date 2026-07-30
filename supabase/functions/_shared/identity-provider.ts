export interface IdentityWebhookResult {
  providerCaseId: string;
  status: 'verified' | 'failed';
  verifiedBirthDate: string;
  verifiedNationality: 'JP' | 'KR';
}

export interface IdentityProvider {
  // Adapters must return the same live session for repeated idempotency keys.
  createSession(input: {
    userId: string;
    callbackUrl: string;
    idempotencyKey: string;
  }): Promise<{ providerCaseId: string; redirectUrl: string }>;
  verifyWebhook(request: Request): Promise<IdentityWebhookResult>;
}
