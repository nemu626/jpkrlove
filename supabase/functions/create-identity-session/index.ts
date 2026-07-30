import {
  type Authenticator,
  createSupabaseJwtAuthenticator,
  createUserRpc,
  createWorkerRpc,
  errorResponse,
  HttpError,
  requestId,
  requireEnvironment,
  requirePost,
  successResponse,
  type UserRpc,
  type WorkerRpc,
} from '../_shared/http.ts';
import { selectIdentityProvider } from '../_shared/fake-identity-provider.ts';
import type { IdentityProvider } from '../_shared/identity-provider.ts';

export interface CreateIdentitySessionDependencies {
  authenticator: Authenticator;
  userRpc: UserRpc;
  workerRpc: WorkerRpc;
  provider: IdentityProvider;
  callbackUrl: string;
}

export async function handleCreateIdentitySession(
  request: Request,
  dependencies: CreateIdentitySessionDependencies,
): Promise<Response> {
  const id = requestId(request);
  try {
    requirePost(request);
    const user = await dependencies.authenticator.authenticate(request);
    const accepted = await dependencies.userRpc.hasAcceptedInvitation(
      user.accessToken,
      user.userId,
    );
    if (!accepted) {
      throw new HttpError(
        403,
        'INVITATION_REQUIRED',
        'An accepted invitation is required.',
      );
    }

    const session = await dependencies.provider.createSession({
      userId: user.userId,
      callbackUrl: dependencies.callbackUrl,
      idempotencyKey: `identity-session:${user.userId}`,
    });
    const identityCase = await dependencies.workerRpc.createIdentityCase({
      userId: user.userId,
      providerCaseId: session.providerCaseId,
    });
    if (identityCase.providerCaseId !== session.providerCaseId) {
      throw new HttpError(
        409,
        'IDENTITY_CASE_EXISTS',
        'An identity case already exists.',
      );
    }

    return successResponse(
      {
        providerCaseId: session.providerCaseId,
        redirectUrl: session.redirectUrl,
      },
      id,
      201,
    );
  } catch (error) {
    return errorResponse(error, id);
  }
}

function dependenciesFromEnvironment(): CreateIdentitySessionDependencies {
  const supabaseUrl = requireEnvironment('SUPABASE_URL');
  const anonKey = requireEnvironment('SUPABASE_ANON_KEY');
  const serviceRoleKey = requireEnvironment('SUPABASE_SERVICE_ROLE_KEY');
  return {
    authenticator: createSupabaseJwtAuthenticator({ supabaseUrl, anonKey }),
    userRpc: createUserRpc({ supabaseUrl, anonKey }),
    workerRpc: createWorkerRpc({ supabaseUrl, serviceRoleKey }),
    provider: selectIdentityProvider({
      environment: requireEnvironment('APP_ENVIRONMENT'),
      mode: requireEnvironment('IDENTITY_PROVIDER_MODE'),
      webhookSecret: requireEnvironment('IDENTITY_WEBHOOK_SECRET'),
      sessionBaseUrl: Deno.env.get('FAKE_IDENTITY_SESSION_BASE_URL'),
    }),
    callbackUrl: requireEnvironment('IDENTITY_CALLBACK_URL'),
  };
}

if (import.meta.main) {
  const dependencies = dependenciesFromEnvironment();
  Deno.serve((request) => handleCreateIdentitySession(request, dependencies));
}
