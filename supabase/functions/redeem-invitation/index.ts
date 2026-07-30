import {
  type Authenticator,
  createSupabaseJwtAuthenticator,
  createUserRpc,
  errorResponse,
  HttpError,
  parseJsonObject,
  requestId,
  requireEnvironment,
  requirePost,
  successResponse,
  type UserRpc,
} from '../_shared/http.ts';

export interface RedeemInvitationDependencies {
  authenticator: Authenticator;
  userRpc: UserRpc;
}

export async function handleRedeemInvitation(
  request: Request,
  dependencies: RedeemInvitationDependencies,
): Promise<Response> {
  const id = requestId(request);
  try {
    requirePost(request);
    const user = await dependencies.authenticator.authenticate(request);
    const body = await parseJsonObject(request);
    if (typeof body.code !== 'string') {
      throw new HttpError(
        400,
        'INVALID_INVITATION_CODE',
        'Invitation code is invalid.',
      );
    }
    const code = body.code.trim().toUpperCase();
    if (code.length < 6 || code.length > 32 || !/^[A-Z0-9-]+$/.test(code)) {
      throw new HttpError(
        400,
        'INVALID_INVITATION_CODE',
        'Invitation code is invalid.',
      );
    }

    await dependencies.userRpc.redeemInvitation(user.accessToken, code);
    return successResponse({ redeemed: true }, id);
  } catch (error) {
    return errorResponse(error, id);
  }
}

function dependenciesFromEnvironment(): RedeemInvitationDependencies {
  const supabaseUrl = requireEnvironment('SUPABASE_URL');
  const anonKey = requireEnvironment('SUPABASE_ANON_KEY');
  return {
    authenticator: createSupabaseJwtAuthenticator({ supabaseUrl, anonKey }),
    userRpc: createUserRpc({ supabaseUrl, anonKey }),
  };
}

if (import.meta.main) {
  const dependencies = dependenciesFromEnvironment();
  Deno.serve((request) => handleRedeemInvitation(request, dependencies));
}
