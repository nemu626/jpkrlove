import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createServerSupabaseClient,
  createServiceRoleSupabaseClient,
} from './supabase/server';
import { getReviewCase } from './operator-role';

vi.mock('./supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleSupabaseClient: vi.fn(),
  createSupabaseClientForAccessToken: vi.fn(),
}));

const mockedCreateServerSupabaseClient = vi.mocked(createServerSupabaseClient);
const mockedCreateServiceRoleSupabaseClient = vi.mocked(
  createServiceRoleSupabaseClient,
);

describe('getReviewCase media signing boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the server-only service-role signer for a non-owner reviewer', async () => {
    const reviewerStorage = {
      from: vi.fn().mockReturnValue({
        createSignedUrl: vi.fn(),
      }),
    };
    const reviewerRpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            user_id: 'reviewer-1',
            aal: 'aal2',
            roles: ['profile_reviewer'],
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            case_id: 'case-1',
            display_name: '対象者',
            nationality: 'JP',
            region_code: 'JP-13',
            introduction: '紹介文',
            photo_count: 1,
            identity_status: 'verified',
            submitted_at: '2026-08-01T00:00:00.000Z',
            photos: [
              {
                id: 'media-1',
                position: 1,
                object_path: 'member-1/photo-1.jpg',
              },
            ],
          },
        ],
        error: null,
      });
    const reviewerClient = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'reviewer-1' } },
          error: null,
        }),
      },
      schema: vi.fn().mockReturnValue({ rpc: reviewerRpc }),
      storage: reviewerStorage,
    };
    const signerCreateSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: 'https://signed.example/photo-1' },
      error: null,
    });
    const signer = {
      storage: {
        from: vi.fn().mockReturnValue({
          createSignedUrl: signerCreateSignedUrl,
        }),
      },
    };

    mockedCreateServerSupabaseClient.mockResolvedValue(reviewerClient as never);
    mockedCreateServiceRoleSupabaseClient.mockReturnValue(signer as never);

    const result = await getReviewCase('case-1');

    expect(result?.photos).toEqual([
      {
        id: 'media-1',
        position: 1,
        signedUrl: 'https://signed.example/photo-1',
      },
    ]);
    expect(signer.storage.from).toHaveBeenCalledWith('profile-media');
    expect(signerCreateSignedUrl).toHaveBeenCalledWith(
      'member-1/photo-1.jpg',
      300,
    );
    expect(reviewerStorage.from).not.toHaveBeenCalled();
    expect(reviewerRpc).toHaveBeenCalledTimes(2);
  });
});
