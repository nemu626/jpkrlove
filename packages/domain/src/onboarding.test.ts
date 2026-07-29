import { describe, expect, it } from 'vitest';
import { DomainError, DomainErrorCode } from './errors.js';
import { IdentityStatusSchema, VerifiedIdentitySchema } from './identity.js';
import { InvitationCodeSchema } from './invitation.js';
import { deriveMemberState, type MemberStateInput } from './member-state.js';
import {
  ProfileDraftSchema,
  PublicProfileSchema,
  toPublicProfile,
  type PublicProfile,
} from './profile.js';

type Assert<T extends true> = T;
type PublicProfileDoesNotExposePrivateIdentity = Assert<
  'legalName' extends keyof PublicProfile ? false : true
>;
type PublicProfileDoesNotExposeBirthDate = Assert<
  'birthDate' extends keyof PublicProfile ? false : true
>;
type PublicProfileDoesNotExposeContact = Assert<
  'contact' extends keyof PublicProfile ? false : true
>;

const validProfile = {
  locale: 'ja',
  selfIdentifiedGender: 'woman',
  displayName: 'Aiko',
  nationality: 'JP',
  regionCode: '13',
  photos: ['profile/aiko-1.jpg', 'profile/aiko-2.jpg'],
  introduction:
    'I enjoy quiet cafes, long walks, and studying Korean every day.',
  marriageTiming: 'within_3_years',
  residenceCountry: 'JP',
  willingToRelocate: true,
  childrenPreference: 'open_to_discuss',
  smokingStatus: 'non_smoker',
  jaLevel: 'native',
  koLevel: 'intermediate',
  willingToLearnPartnerLanguage: true,
};

const verifiedIdentity = {
  status: 'verified',
  legalName: 'Aiko Tanaka',
  birthDate: '1996-07-30',
  contact: {
    email: 'aiko@example.com',
    phoneNumber: '+819012345678',
  },
};

describe('onboarding domain contracts', () => {
  it('accepts a normalized invitation code', () => {
    expect(InvitationCodeSchema.parse('jpwm-2026')).toBe('JPWM-2026');
  });

  it('rejects an empty invitation code', () => {
    expect(InvitationCodeSchema.safeParse('')).toMatchObject({
      success: false,
    });
  });

  it('accepts every identity status and rejects an unknown status', () => {
    for (const status of [
      'not_started',
      'pending',
      'verified',
      'failed',
      'expired',
    ]) {
      expect(IdentityStatusSchema.parse(status)).toBe(status);
    }

    expect(IdentityStatusSchema.safeParse('approved')).toMatchObject({
      success: false,
    });
  });

  it('requires between two and six profile photos', () => {
    expect(
      ProfileDraftSchema.safeParse({ ...validProfile, photos: ['one.jpg'] })
        .success,
    ).toBe(false);
    expect(ProfileDraftSchema.safeParse(validProfile).success).toBe(true);
    expect(
      ProfileDraftSchema.safeParse({
        ...validProfile,
        photos: [
          'one.jpg',
          'two.jpg',
          'three.jpg',
          'four.jpg',
          'five.jpg',
          'six.jpg',
        ],
      }).success,
    ).toBe(true);
    expect(
      ProfileDraftSchema.safeParse({
        ...validProfile,
        photos: [
          'one.jpg',
          'two.jpg',
          'three.jpg',
          'four.jpg',
          'five.jpg',
          'six.jpg',
          'seven.jpg',
        ],
      }).success,
    ).toBe(false);
  });

  it('requires a supported locale and forbids a birth date in profile input', () => {
    const { locale: _locale, ...profileWithoutLocale } = validProfile;

    expect(ProfileDraftSchema.safeParse(profileWithoutLocale).success).toBe(
      false,
    );
    expect(
      ProfileDraftSchema.safeParse({
        ...validProfile,
        birthDate: '1996-07-30',
      }).success,
    ).toBe(false);
  });

  it('maps only an adult verified identity to a public profile', () => {
    const publicProfile = toPublicProfile({
      profile: ProfileDraftSchema.parse(validProfile),
      identity: VerifiedIdentitySchema.parse(verifiedIdentity),
      eligibility: {
        invitation: 'accepted',
        identity: 'verified',
        profileReview: 'approved',
        paused: false,
        restriction: 'none',
      },
      asOf: new Date('2026-07-29T00:00:00.000Z'),
    });

    expect(publicProfile.age).toBe(29);
    expect(publicProfile).not.toHaveProperty('legalName');
    expect(publicProfile).not.toHaveProperty('birthDate');
    expect(publicProfile).not.toHaveProperty('contact');
    expect(PublicProfileSchema.safeParse(publicProfile).success).toBe(true);
  });

  it.each([
    {
      name: 'a draft profile',
      eligibility: {
        invitation: 'accepted',
        identity: 'verified',
        profileReview: 'draft',
        paused: false,
        restriction: 'none',
      },
    },
    {
      name: 'a submitted profile',
      eligibility: {
        invitation: 'accepted',
        identity: 'verified',
        profileReview: 'submitted',
        paused: false,
        restriction: 'none',
      },
    },
    {
      name: 'a profile with changes requested',
      eligibility: {
        invitation: 'accepted',
        identity: 'verified',
        profileReview: 'changes_requested',
        paused: false,
        restriction: 'none',
      },
    },
    {
      name: 'a rejected profile',
      eligibility: {
        invitation: 'accepted',
        identity: 'verified',
        profileReview: 'rejected',
        paused: false,
        restriction: 'none',
      },
    },
    {
      name: 'a paused profile',
      eligibility: {
        invitation: 'accepted',
        identity: 'verified',
        profileReview: 'approved',
        paused: true,
        restriction: 'none',
      },
    },
    {
      name: 'a temporarily hidden profile',
      eligibility: {
        invitation: 'accepted',
        identity: 'verified',
        profileReview: 'approved',
        paused: false,
        restriction: 'temporary_hidden',
      },
    },
    {
      name: 'a suspended profile',
      eligibility: {
        invitation: 'accepted',
        identity: 'verified',
        profileReview: 'approved',
        paused: false,
        restriction: 'suspended',
      },
    },
    {
      name: 'a banned profile',
      eligibility: {
        invitation: 'accepted',
        identity: 'verified',
        profileReview: 'approved',
        paused: false,
        restriction: 'banned',
      },
    },
  ] satisfies ReadonlyArray<{ name: string; eligibility: MemberStateInput }>)(
    'rejects $name from public mapping',
    ({ eligibility }) => {
      expect(() =>
        toPublicProfile({
          profile: ProfileDraftSchema.parse(validProfile),
          identity: VerifiedIdentitySchema.parse(verifiedIdentity),
          eligibility,
          asOf: new Date('2026-07-29T00:00:00.000Z'),
        }),
      ).toThrow(
        expect.objectContaining({ code: DomainErrorCode.PROFILE_NOT_ACTIVE }),
      );
    },
  );

  it('rejects public mapping for a minor', () => {
    expect(() =>
      toPublicProfile({
        profile: ProfileDraftSchema.parse(validProfile),
        identity: VerifiedIdentitySchema.parse({
          ...verifiedIdentity,
          birthDate: '2008-07-30',
        }),
        eligibility: {
          invitation: 'accepted',
          identity: 'verified',
          profileReview: 'approved',
          paused: false,
          restriction: 'none',
        },
        asOf: new Date('2026-07-29T00:00:00.000Z'),
      }),
    ).toThrow(
      expect.objectContaining({ code: DomainErrorCode.IDENTITY_UNDERAGE }),
    );
  });

  it('rejects public mapping until identity is verified', () => {
    expect(() =>
      toPublicProfile({
        profile: ProfileDraftSchema.parse(validProfile),
        identity: VerifiedIdentitySchema.parse({
          ...verifiedIdentity,
          status: 'pending',
        }),
        eligibility: {
          invitation: 'accepted',
          identity: 'verified',
          profileReview: 'approved',
          paused: false,
          restriction: 'none',
        },
        asOf: new Date('2026-07-29T00:00:00.000Z'),
      }),
    ).toThrow(
      expect.objectContaining({ code: DomainErrorCode.IDENTITY_NOT_VERIFIED }),
    );
  });

  it('exposes stable domain error codes', () => {
    expect(new DomainError(DomainErrorCode.IDENTITY_UNDERAGE).code).toBe(
      'IDENTITY_UNDERAGE',
    );
  });
});

describe('deriveMemberState', () => {
  it('keeps an unverified profile private', () => {
    expect(
      deriveMemberState({
        invitation: 'accepted',
        identity: 'pending',
        profileReview: 'approved',
        paused: false,
        restriction: 'none',
      }),
    ).toBe('identity_pending');
  });

  it('publishes only verified and approved members', () => {
    expect(
      deriveMemberState({
        invitation: 'accepted',
        identity: 'verified',
        profileReview: 'approved',
        paused: false,
        restriction: 'none',
      }),
    ).toBe('active');
  });

  it('derives every member state with the defined precedence', () => {
    const accepted = {
      invitation: 'accepted' as const,
      identity: 'verified' as const,
      profileReview: 'draft' as const,
      paused: false,
      restriction: 'none' as const,
    };

    expect(
      deriveMemberState({ ...accepted, invitation: 'waiting', paused: true }),
    ).toBe('waiting');
    expect(
      deriveMemberState({ ...accepted, restriction: 'temporary_hidden' }),
    ).toBe('restricted');
    expect(deriveMemberState({ ...accepted, restriction: 'suspended' })).toBe(
      'restricted',
    );
    expect(deriveMemberState({ ...accepted, restriction: 'banned' })).toBe(
      'restricted',
    );
    expect(deriveMemberState({ ...accepted, profileReview: 'rejected' })).toBe(
      'restricted',
    );
    expect(deriveMemberState({ ...accepted, identity: 'failed' })).toBe(
      'identity_failed',
    );
    expect(deriveMemberState({ ...accepted, identity: 'expired' })).toBe(
      'identity_expired',
    );
    expect(deriveMemberState({ ...accepted, identity: 'not_started' })).toBe(
      'identity_pending',
    );
    expect(deriveMemberState({ ...accepted, identity: 'pending' })).toBe(
      'identity_pending',
    );
    expect(deriveMemberState({ ...accepted, paused: true })).toBe('paused');
    expect(deriveMemberState({ ...accepted, profileReview: 'submitted' })).toBe(
      'profile_in_review',
    );
    expect(
      deriveMemberState({ ...accepted, profileReview: 'changes_requested' }),
    ).toBe('changes_requested');
    expect(deriveMemberState({ ...accepted })).toBe('profile_draft');
  });
});
