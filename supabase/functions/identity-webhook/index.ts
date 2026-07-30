import {
  createWorkerRpc,
  errorResponse,
  requestId,
  requireEnvironment,
  requirePost,
  successResponse,
  type WorkerRpc,
} from '../_shared/http.ts';
import { selectIdentityProvider } from '../_shared/fake-identity-provider.ts';
import type { IdentityProvider } from '../_shared/identity-provider.ts';

export interface IdentityWebhookDependencies {
  provider: IdentityProvider;
  workerRpc: WorkerRpc;
  clock: () => Date;
}

export async function handleIdentityWebhook(
  request: Request,
  dependencies: IdentityWebhookDependencies,
): Promise<Response> {
  const id = requestId(request);
  try {
    requirePost(request);
    const result = await dependencies.provider.verifyWebhook(request);
    const applied = await dependencies.workerRpc.applyIdentityResult({
      providerCaseId: result.providerCaseId,
      status: result.status,
      verifiedBirthDate: result.status === 'verified'
        ? result.verifiedBirthDate
        : null,
      verifiedNationality: result.status === 'verified'
        ? result.verifiedNationality
        : null,
      observedAt: dependencies.clock().toISOString(),
    });

    return successResponse(
      {
        accepted: true,
        applied: applied.applied,
        status: applied.status,
      },
      id,
    );
  } catch (error) {
    return errorResponse(error, id);
  }
}

function dependenciesFromEnvironment(): IdentityWebhookDependencies {
  const supabaseUrl = requireEnvironment('SUPABASE_URL');
  const serviceRoleKey = requireEnvironment('SUPABASE_SERVICE_ROLE_KEY');
  return {
    provider: selectIdentityProvider({
      environment: requireEnvironment('APP_ENVIRONMENT'),
      mode: requireEnvironment('IDENTITY_PROVIDER_MODE'),
      webhookSecret: requireEnvironment('IDENTITY_WEBHOOK_SECRET'),
      sessionBaseUrl: Deno.env.get('FAKE_IDENTITY_SESSION_BASE_URL'),
    }),
    workerRpc: createWorkerRpc({ supabaseUrl, serviceRoleKey }),
    clock: () => new Date(),
  };
}

if (import.meta.main) {
  const dependencies = dependenciesFromEnvironment();
  Deno.serve((request) => handleIdentityWebhook(request, dependencies));
}
