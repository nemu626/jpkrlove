import { describe, expect, it, vi } from 'vitest';
import type { ProfileDraft } from '@jpkrlove/domain';
import {
  createSupabaseOnboardingGateway,
  SupabaseOnboardingRepository,
  type Clock,
  type OnboardingGateway,
} from './supabase-onboarding-repository.js';
import type { SupabaseClient } from '@supabase/supabase-js';

const validDraft: ProfileDraft = {
  locale: 'ja',
  selfIdentifiedGender: 'woman',
  displayName: 'Aiko',
  nationality: 'JP',
  regionCode: '13',
  photos: ['member-1/photo-1', 'member-1/photo-2'],
  introduction:
    '静かなカフェと散歩が好きです。韓国語を学びながら、互いを尊重できる関係を築きたいです。',
  marriageTiming: 'within_3_years',
  residenceCountry: 'JP',
  willingToRelocate: true,
  childrenPreference: 'open_to_discuss',
  smokingStatus: 'non_smoker',
  jaLevel: 'native',
  koLevel: 'intermediate',
  willingToLearnPartnerLanguage: true,
};

function createGateway(
  overrides: Partial<OnboardingGateway> = {},
): OnboardingGateway {
  return {
    invoke: vi.fn().mockResolvedValue({ data: {}, error: null }),
    getCurrentUserId: vi.fn().mockResolvedValue('member-1'),
    getOnboardingSnapshot: vi.fn().mockResolvedValue({
      memberState: 'profile_draft',
      profile: null,
      media: [],
    }),
    uploadProfileObject: vi.fn().mockResolvedValue(undefined),
    removeProfileObjects: vi.fn().mockResolvedValue(undefined),
    createSignedProfileMediaUrl: vi
      .fn()
      .mockResolvedValue('https://signed.test/photo'),
    callRpc: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const clock: Clock = { now: () => new Date('2026-07-30T00:00:00.000Z') };

describe('SupabaseOnboardingRepository', () => {
  it('maps the current member state and issues short-lived media URLs', async () => {
    const gateway = createGateway({
      getOnboardingSnapshot: vi.fn().mockResolvedValue({
        memberState: 'profile_draft',
        profile: validDraft,
        media: [
          {
            id: 'photo-1',
            objectPath: 'member-1/photo-1',
            position: 1,
          },
        ],
      }),
    });
    const repository = new SupabaseOnboardingRepository(gateway, clock);

    const state = await repository.getCurrentState();

    expect(state.memberState).toBe('profile_draft');
    expect(state.media[0]).toMatchObject({
      signedUrl: 'https://signed.test/photo',
      signedUrlExpiresAt: '2026-07-30T00:01:00.000Z',
    });
  });

  it('refreshes an expired signed media URL using the injected clock', async () => {
    const gateway = createGateway();
    const repository = new SupabaseOnboardingRepository(gateway, clock);

    const media = await repository.refreshProfileMediaUrl({
      id: 'photo-1',
      objectPath: 'member-1/photo-1',
      position: 1,
      signedUrl: 'https://expired.test/photo',
      signedUrlExpiresAt: '2026-07-29T23:59:59.000Z',
      uploadStatus: 'uploaded',
    });

    expect(media.signedUrl).toBe('https://signed.test/photo');
    expect(gateway.createSignedProfileMediaUrl).toHaveBeenCalledWith(
      'member-1/photo-1',
      60,
    );
  });

  it('retries a failed profile upload with the same owner path', async () => {
    const upload = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined);
    const gateway = createGateway({ uploadProfileObject: upload });
    const repository = new SupabaseOnboardingRepository(gateway, clock);

    const failed = await repository.uploadProfileMedia({
      mediaId: 'photo-1',
      bytes: new Uint8Array([1, 2, 3]),
      contentType: 'image/jpeg',
    });
    expect(failed.uploadStatus).toBe('failed');

    await expect(
      repository.retryProfileMediaUpload({
        media: failed,
        bytes: new Uint8Array([1, 2, 3]),
        contentType: 'image/jpeg',
      }),
    ).resolves.toMatchObject({
      objectPath: 'member-1/photo-1',
      uploadStatus: 'uploaded',
    });
  });

  it('normalizes invalid or exhausted invitation responses', async () => {
    const gateway = createGateway({
      invoke: vi.fn().mockResolvedValue({
        data: null,
        error: { code: 'INVITATION_UNAVAILABLE' },
      }),
    });
    const repository = new SupabaseOnboardingRepository(gateway, clock);

    await expect(
      repository.redeemInvitation('JPWM-2026'),
    ).rejects.toMatchObject({ code: 'INVITATION_UNAVAILABLE' });
  });

  it('deletes an uploaded but unsaved photo without calling the database', async () => {
    const gateway = createGateway();
    const repository = new SupabaseOnboardingRepository(gateway, clock);

    await repository.deleteProfileMedia({
      id: 'new-photo',
      objectPath: 'member-1/new-photo',
      position: 0,
      signedUrl: 'https://signed.test/new-photo',
      signedUrlExpiresAt: '2026-07-30T00:01:00.000Z',
      uploadStatus: 'uploaded',
    });

    expect(gateway.callRpc).not.toHaveBeenCalled();
    expect(gateway.removeProfileObjects).toHaveBeenCalledWith([
      'member-1/new-photo',
    ]);
  });

  it('retries storage cleanup after the media row was already deleted', async () => {
    const removeProfileObjects = vi
      .fn()
      .mockRejectedValueOnce(new Error('storage unavailable'))
      .mockResolvedValueOnce(undefined);
    const callRpc = vi
      .fn()
      .mockResolvedValueOnce('member-1/photo-3')
      .mockResolvedValueOnce(null);
    const gateway = createGateway({ callRpc, removeProfileObjects });
    const repository = new SupabaseOnboardingRepository(gateway, clock);
    const media = {
      id: 'photo-3',
      objectPath: 'member-1/photo-3',
      position: 3,
      signedUrl: 'https://signed.test/photo-3',
      signedUrlExpiresAt: '2026-07-30T00:01:00.000Z',
      uploadStatus: 'uploaded' as const,
    };

    await expect(repository.deleteProfileMedia(media)).rejects.toThrow(
      'storage unavailable',
    );
    await expect(repository.deleteProfileMedia(media)).resolves.toBeUndefined();

    expect(callRpc).toHaveBeenCalledTimes(2);
    expect(removeProfileObjects).toHaveBeenCalledTimes(2);
    expect(removeProfileObjects).toHaveBeenLastCalledWith(['member-1/photo-3']);
  });

  it('rejects another member storage path before deleting media', async () => {
    const gateway = createGateway();
    const repository = new SupabaseOnboardingRepository(gateway, clock);

    await expect(
      repository.deleteProfileMedia({
        id: 'photo-3',
        objectPath: 'member-2/photo-3',
        position: 3,
        signedUrl: 'https://signed.test/photo-3',
        signedUrlExpiresAt: '2026-07-30T00:01:00.000Z',
        uploadStatus: 'uploaded',
      }),
    ).rejects.toMatchObject({ code: 'MEDIA_OPERATION_FAILED' });

    expect(gateway.callRpc).not.toHaveBeenCalled();
    expect(gateway.removeProfileObjects).not.toHaveBeenCalled();
  });

  it('saves and submits only a domain-valid profile', async () => {
    const gateway = createGateway();
    const repository = new SupabaseOnboardingRepository(gateway, clock);

    await repository.saveProfileDraft(validDraft);
    await repository.submitProfile(validDraft);

    expect(gateway.callRpc).toHaveBeenNthCalledWith(
      1,
      'save_profile_draft',
      expect.objectContaining({
        display_name: 'Aiko',
        media_paths: validDraft.photos,
      }),
    );
    expect(gateway.callRpc).toHaveBeenNthCalledWith(
      2,
      'submit_profile',
      expect.objectContaining({ media_paths: validDraft.photos }),
    );
  });
});

describe('createSupabaseOnboardingGateway', () => {
  it('maps an authenticated user without a member row to waiting', async () => {
    const query = (data: unknown, error: unknown = null) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data, error }),
      single: vi.fn().mockResolvedValue({ data, error }),
      maybeSingle: vi.fn().mockResolvedValue({ data, error }),
    });
    const tables = {
      members: query(null, { code: 'PGRST116' }),
      profiles: query(null),
      profile_media: query([]),
    };
    tables.members.maybeSingle.mockResolvedValue({ data: null, error: null });
    const client = {
      schema: () => ({
        from: (name: keyof typeof tables) => tables[name],
      }),
    } as unknown as SupabaseClient;
    const gateway = createSupabaseOnboardingGateway(client);

    await expect(
      gateway.getOnboardingSnapshot('member-without-invite'),
    ).resolves.toEqual({
      memberState: 'waiting',
      profile: null,
      media: [],
    });
  });

  it('combines member locale and gender with the profile row', async () => {
    const query = (singleData: unknown, listData: unknown[] = []) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: listData, error: null }),
      single: vi.fn().mockResolvedValue({ data: singleData, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: singleData, error: null }),
    });
    const tables = {
      members: query({
        member_state: 'profile_draft',
        locale: 'ja',
        self_identified_gender: 'woman',
      }),
      profiles: query({
        display_name: validDraft.displayName,
        nationality: validDraft.nationality,
        region_code: validDraft.regionCode,
        introduction: validDraft.introduction,
        marriage_timing: validDraft.marriageTiming,
        residence_country: validDraft.residenceCountry,
        willing_to_relocate: validDraft.willingToRelocate,
        children_preference: validDraft.childrenPreference,
        smoking_status: validDraft.smokingStatus,
        ja_level: validDraft.jaLevel,
        ko_level: validDraft.koLevel,
        willing_to_learn_partner_language:
          validDraft.willingToLearnPartnerLanguage,
      }),
      profile_media: query(null, [
        { id: 'one', object_path: validDraft.photos[0], position: 1 },
        { id: 'two', object_path: validDraft.photos[1], position: 2 },
      ]),
    };
    const gateway = createSupabaseOnboardingGateway({
      schema: () => ({
        from: (name: keyof typeof tables) => tables[name],
      }),
    } as unknown as SupabaseClient);

    await expect(
      gateway.getOnboardingSnapshot('member-1'),
    ).resolves.toMatchObject({ profile: validDraft });
  });
});
