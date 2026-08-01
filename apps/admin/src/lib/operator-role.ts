import type { SupabaseClient } from '@supabase/supabase-js';

import {
  createServerSupabaseClient,
  createSupabaseClientForAccessToken,
} from './supabase/server';

export type OperatorRole =
  | 'support'
  | 'profile_reviewer'
  | 'identity_reviewer'
  | 'recommender'
  | 'moderator'
  | 'admin';

export type AuthenticatorAssuranceLevel = 'aal1' | 'aal2';

export interface OperatorContext {
  userId: string;
  aal: AuthenticatorAssuranceLevel;
  roles: OperatorRole[];
}

interface OperatorRow {
  user_id?: string;
  aal?: string;
  roles?: unknown;
}

export async function getOperatorContext(
  clientFactory: () => Promise<SupabaseClient> = createServerSupabaseClient,
): Promise<OperatorContext | null> {
  const client = await clientFactory();
  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();
  if (userError || !user) return null;

  const { data, error } = await client
    .schema('app')
    .rpc('admin_current_operator');
  if (error || !data) {
    return {
      userId: user.id,
      aal: 'aal1',
      roles: [],
    };
  }

  const row = Array.isArray(data)
    ? (data[0] as OperatorRow | undefined)
    : (data as OperatorRow);
  return {
    userId: user.id,
    aal: row?.aal === 'aal2' ? 'aal2' : 'aal1',
    roles: normalizeRoles(row?.roles),
  };
}

export async function getOperatorContextForAccessToken(
  accessToken: string,
): Promise<OperatorContext | null> {
  if (!accessToken) return null;
  return getOperatorContext(() =>
    Promise.resolve(createSupabaseClientForAccessToken(accessToken)),
  );
}

function normalizeRoles(value: unknown): OperatorRole[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isOperatorRole);
}

function isOperatorRole(value: unknown): value is OperatorRole {
  return (
    value === 'support' ||
    value === 'profile_reviewer' ||
    value === 'identity_reviewer' ||
    value === 'recommender' ||
    value === 'moderator' ||
    value === 'admin'
  );
}

export interface ReviewCaseSummary {
  caseId: string;
  displayName: string;
  nationality: 'JP' | 'KR';
  regionCode: string;
  introduction: string;
  photoCount: number;
  identityVerified: boolean;
  submittedAt: string;
}

export interface ReviewCaseDetail extends ReviewCaseSummary {
  photos: Array<{ id: string; position: number; signedUrl: string }>;
}

export async function listReviewCases(): Promise<ReviewCaseSummary[]> {
  const client = await createServerSupabaseClient();
  const { data, error } = await client
    .schema('app')
    .rpc('admin_profile_review_cases');
  if (error) throw new Error('審査一覧を取得できませんでした。');
  return (Array.isArray(data) ? data : []).map(mapSummary);
}

export async function getReviewCase(
  caseId: string,
): Promise<ReviewCaseDetail | null> {
  const client = await createServerSupabaseClient();
  const { data, error } = await client
    .schema('app')
    .rpc('admin_profile_review_case', { p_case_id: caseId });
  if (error) throw new Error('審査対象を取得できませんでした。');
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  const summary = mapSummary(row);
  const photos = await Promise.all(
    normalizePhotos(row.photos).map(async (photo) => {
      const { data: signed, error: signedError } = await client.storage
        .from('profile-media')
        .createSignedUrl(photo.object_path, 300);
      if (signedError || !signed?.signedUrl) {
        throw new Error('審査用画像URLを取得できませんでした。');
      }
      return {
        id: photo.id,
        position: photo.position,
        signedUrl: signed.signedUrl,
      };
    }),
  );
  return { ...summary, photos };
}

export async function reviewProfileWithServerClient(input: {
  caseId: string;
  decision: 'approved' | 'changes_requested' | 'rejected';
  reason?: string;
}): Promise<{ status: 'approved' | 'changes_requested' | 'rejected' }> {
  const client = await createServerSupabaseClient();
  const { data, error } = await client
    .schema('app')
    .rpc('admin_review_profile', {
      p_case_id: input.caseId,
      p_decision: input.decision,
      p_reason: input.reason ?? null,
    });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (
    !row ||
    (row.status !== 'approved' &&
      row.status !== 'changes_requested' &&
      row.status !== 'rejected')
  ) {
    throw new Error('審査RPCの応答が不正です。');
  }
  return { status: row.status };
}

function mapSummary(row: Record<string, unknown>): ReviewCaseSummary {
  return {
    caseId: String(row.case_id),
    displayName: String(row.display_name),
    nationality: row.nationality === 'KR' ? 'KR' : 'JP',
    regionCode: String(row.region_code),
    introduction: String(row.introduction),
    photoCount: Number(row.photo_count),
    identityVerified: row.identity_status === 'verified',
    submittedAt: String(row.submitted_at),
  };
}

function normalizePhotos(value: unknown): Array<{
  id: string;
  position: number;
  object_path: string;
}> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    if (
      typeof row.id !== 'string' ||
      typeof row.object_path !== 'string' ||
      typeof row.position !== 'number'
    ) {
      return [];
    }
    return [
      { id: row.id, position: row.position, object_path: row.object_path },
    ];
  });
}
