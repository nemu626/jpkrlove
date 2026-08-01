import {
  ProfileDraftSchema,
  type MemberState,
  type ProfileDraft,
} from '@jpkrlove/domain';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  RepositoryError,
  type IdentitySession,
  type OnboardingRepository,
  type OnboardingState,
  type ProfileMedia,
  type ProfileMediaUpload,
  type RepositoryErrorCode,
} from './onboarding-repository.js';

export interface Clock {
  now(): Date;
}

export interface OnboardingSnapshot {
  memberState: MemberState;
  profile: ProfileDraft | null;
  media: Array<{ id: string; objectPath: string; position: number }>;
}

export interface GatewayError {
  code?: string;
  message?: string;
}

export interface OnboardingGateway {
  invoke<T>(
    functionName: string,
    body: Record<string, unknown>,
  ): Promise<{ data: T | null; error: GatewayError | null }>;
  getCurrentUserId(): Promise<string>;
  getOnboardingSnapshot(userId: string): Promise<OnboardingSnapshot>;
  uploadProfileObject(
    path: string,
    bytes: Uint8Array | ArrayBuffer,
    contentType: string,
  ): Promise<void>;
  removeProfileObjects(paths: string[]): Promise<void>;
  createSignedProfileMediaUrl(
    path: string,
    expiresInSeconds: number,
  ): Promise<string>;
  callRpc<T>(functionName: string, body: Record<string, unknown>): Promise<T>;
}

const SIGNED_URL_TTL_SECONDS = 60;
const defaultClock: Clock = { now: () => new Date() };

export class SupabaseOnboardingRepository implements OnboardingRepository {
  constructor(
    private readonly gateway: OnboardingGateway,
    private readonly clock: Clock = defaultClock,
  ) {}

  async getCurrentState(): Promise<OnboardingState> {
    const userId = await this.gateway.getCurrentUserId();
    const snapshot = await this.gateway.getOnboardingSnapshot(userId);
    const media = await Promise.all(
      snapshot.media
        .toSorted((left, right) => left.position - right.position)
        .map((item) => this.issueSignedMedia(item)),
    );
    return {
      memberState: snapshot.memberState,
      profile: snapshot.profile
        ? { ...snapshot.profile, photos: media.map((item) => item.objectPath) }
        : null,
      media,
    };
  }

  async redeemInvitation(code: string): Promise<void> {
    const result = await this.gateway.invoke<{ redeemed: boolean }>(
      'redeem-invitation',
      { code: code.trim().toUpperCase() },
    );
    if (result.error || result.data?.redeemed !== true) {
      throw new RepositoryError(
        invitationErrorCode(result.error?.code ?? result.error?.message),
      );
    }
  }

  async createIdentitySession(): Promise<IdentitySession> {
    const result = await this.gateway.invoke<IdentitySession>(
      'create-identity-session',
      {},
    );
    if (
      result.error ||
      typeof result.data?.providerCaseId !== 'string' ||
      typeof result.data.redirectUrl !== 'string'
    ) {
      throw new RepositoryError('IDENTITY_UNAVAILABLE');
    }
    return result.data;
  }

  async uploadProfileMedia(input: ProfileMediaUpload): Promise<ProfileMedia> {
    const userId = await this.gateway.getCurrentUserId();
    return this.uploadAtPath(`${userId}/${validMediaId(input.mediaId)}`, input);
  }

  async retryProfileMediaUpload(input: {
    media: ProfileMedia;
    bytes: Uint8Array | ArrayBuffer;
    contentType: ProfileMediaUpload['contentType'];
  }): Promise<ProfileMedia> {
    return this.uploadAtPath(input.media.objectPath, {
      mediaId: input.media.id,
      bytes: input.bytes,
      contentType: input.contentType,
    });
  }

  async reorderProfileMedia(mediaIds: string[]): Promise<void> {
    if (mediaIds.length < 2 || mediaIds.length > 6) {
      throw new RepositoryError('MEDIA_OPERATION_FAILED');
    }
    await this.gateway.callRpc('reorder_profile_media', {
      ordered_media_ids: mediaIds,
    });
  }

  async deleteProfileMedia(media: ProfileMedia): Promise<void> {
    if (media.position > 0) {
      await this.gateway.callRpc('delete_profile_media', {
        target_media_id: media.id,
      });
    }
    await this.gateway.removeProfileObjects([media.objectPath]);
  }

  async refreshProfileMediaUrl(media: ProfileMedia): Promise<ProfileMedia> {
    if (
      media.signedUrl &&
      media.signedUrlExpiresAt &&
      new Date(media.signedUrlExpiresAt).getTime() >
        this.clock.now().getTime() + 5_000
    ) {
      return media;
    }
    return this.issueSignedMedia(media);
  }

  async saveProfileDraft(profile: ProfileDraft): Promise<void> {
    const parsed = parseProfile(profile);
    await this.gateway.callRpc('save_profile_draft', profileRpcInput(parsed));
  }

  async submitProfile(profile: ProfileDraft): Promise<void> {
    const parsed = parseProfile(profile);
    await this.gateway.callRpc('submit_profile', profileRpcInput(parsed));
  }

  private async uploadAtPath(
    objectPath: string,
    input: ProfileMediaUpload,
  ): Promise<ProfileMedia> {
    const base: ProfileMedia = {
      id: input.mediaId,
      objectPath,
      position: 0,
      signedUrl: null,
      signedUrlExpiresAt: null,
      uploadStatus: 'failed',
    };
    try {
      await this.gateway.uploadProfileObject(
        objectPath,
        input.bytes,
        input.contentType,
      );
      return this.issueSignedMedia(base);
    } catch {
      return base;
    }
  }

  private async issueSignedMedia(
    media: Pick<ProfileMedia, 'id' | 'objectPath' | 'position'>,
  ): Promise<ProfileMedia> {
    const signedUrl = await this.gateway.createSignedProfileMediaUrl(
      media.objectPath,
      SIGNED_URL_TTL_SECONDS,
    );
    return {
      ...media,
      signedUrl,
      signedUrlExpiresAt: new Date(
        this.clock.now().getTime() + SIGNED_URL_TTL_SECONDS * 1_000,
      ).toISOString(),
      uploadStatus: 'uploaded',
    };
  }
}

export function createSupabaseOnboardingGateway(
  client: SupabaseClient,
): OnboardingGateway {
  const app = client.schema('app');
  return {
    async invoke<T>(
      functionName: string,
      body: Record<string, unknown>,
    ): Promise<{ data: T | null; error: GatewayError | null }> {
      const { data, error } = await client.functions.invoke(functionName, {
        body,
      });
      return { data: unwrapFunctionData<T>(data), error };
    },
    async getCurrentUserId() {
      const { data, error } = await client.auth.getUser();
      if (error || !data.user) {
        throw new RepositoryError('AUTHENTICATION_REQUIRED');
      }
      return data.user.id;
    },
    async getOnboardingSnapshot(userId) {
      const [memberResult, profileResult, mediaResult] = await Promise.all([
        app
          .from('members')
          .select('member_state, locale, self_identified_gender')
          .eq('user_id', userId)
          .maybeSingle(),
        app.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
        app
          .from('profile_media')
          .select('id, object_path, position')
          .eq('user_id', userId)
          .order('position'),
      ]);
      if (memberResult.error || profileResult.error || mediaResult.error) {
        throw new RepositoryError('ONBOARDING_UNAVAILABLE');
      }
      if (!memberResult.data) {
        return { memberState: 'waiting', profile: null, media: [] };
      }
      const memberState = memberResult.data.member_state as MemberState;
      const media = (mediaResult.data ?? []).map((row) => ({
        id: String(row.id),
        objectPath: String(row.object_path),
        position: Number(row.position),
      }));
      return {
        memberState,
        profile: profileResult.data
          ? mapProfileRow(
              profileResult.data,
              media.map((item) => item.objectPath),
              {
                locale: memberResult.data.locale,
                selfIdentifiedGender: memberResult.data.self_identified_gender,
              },
            )
          : null,
        media,
      };
    },
    async uploadProfileObject(path, bytes, contentType) {
      const { error } = await client.storage
        .from('profile-media')
        .upload(path, bytes, { contentType, upsert: true });
      if (error) throw new RepositoryError('MEDIA_UPLOAD_FAILED');
    },
    async removeProfileObjects(paths) {
      const { error } = await client.storage
        .from('profile-media')
        .remove(paths);
      if (error) throw new RepositoryError('MEDIA_OPERATION_FAILED');
    },
    async createSignedProfileMediaUrl(path, expiresInSeconds) {
      const { data, error } = await client.storage
        .from('profile-media')
        .createSignedUrl(path, expiresInSeconds);
      if (error || !data.signedUrl) {
        throw new RepositoryError('MEDIA_OPERATION_FAILED');
      }
      return data.signedUrl;
    },
    async callRpc<T>(
      functionName: string,
      body: Record<string, unknown>,
    ): Promise<T> {
      const { data, error } = await app.rpc(functionName, body);
      if (error) throw new RepositoryError('ONBOARDING_UNAVAILABLE');
      return data as T;
    },
  };
}

function unwrapFunctionData<T>(value: unknown): T | null {
  if (!value || typeof value !== 'object') return null;
  if ('data' in value) return (value as { data: T }).data;
  return value as T;
}

function invitationErrorCode(value?: string): RepositoryErrorCode {
  if (value?.includes('ALREADY_REDEEMED')) {
    return 'INVITATION_ALREADY_REDEEMED';
  }
  return 'INVITATION_UNAVAILABLE';
}

function validMediaId(value: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new RepositoryError('MEDIA_OPERATION_FAILED');
  }
  return value;
}

function parseProfile(profile: ProfileDraft): ProfileDraft {
  const result = ProfileDraftSchema.safeParse(profile);
  if (!result.success) throw new RepositoryError('INVALID_PROFILE');
  return result.data;
}

function profileRpcInput(profile: ProfileDraft): Record<string, unknown> {
  return {
    profile_locale: profile.locale,
    self_identified_gender: profile.selfIdentifiedGender,
    display_name: profile.displayName,
    nationality: profile.nationality,
    region_code: profile.regionCode,
    introduction: profile.introduction,
    marriage_timing: profile.marriageTiming,
    residence_country: profile.residenceCountry,
    willing_to_relocate: profile.willingToRelocate,
    children_preference: profile.childrenPreference,
    smoking_status: profile.smokingStatus,
    ja_level: profile.jaLevel,
    ko_level: profile.koLevel,
    willing_to_learn_partner_language: profile.willingToLearnPartnerLanguage,
    media_paths: profile.photos,
  };
}

function mapProfileRow(
  row: Record<string, unknown>,
  photos: string[],
  member: { locale: unknown; selfIdentifiedGender: unknown },
): ProfileDraft {
  return parseProfile({
    locale: member.locale,
    selfIdentifiedGender: member.selfIdentifiedGender,
    displayName: row.display_name,
    nationality: row.nationality,
    regionCode: row.region_code,
    photos,
    introduction: row.introduction,
    marriageTiming: row.marriage_timing,
    residenceCountry: row.residence_country,
    willingToRelocate: row.willing_to_relocate,
    childrenPreference: row.children_preference,
    smokingStatus: row.smoking_status,
    jaLevel: row.ja_level,
    koLevel: row.ko_level,
    willingToLearnPartnerLanguage: row.willing_to_learn_partner_language,
  } as ProfileDraft);
}
