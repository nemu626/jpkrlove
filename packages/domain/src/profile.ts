import { z } from 'zod';
import { DomainError, DomainErrorCode } from './errors.js';
import type { VerifiedIdentity } from './identity.js';
import { deriveMemberState, type MemberStateInput } from './member-state.js';

const LocaleSchema = z.enum(['ja', 'ko']);
const NationalitySchema = z.enum(['JP', 'KR']);
const LanguageLevelSchema = z.enum([
  'basic',
  'intermediate',
  'advanced',
  'native',
]);

export const ProfileDraftSchema = z.strictObject({
  locale: LocaleSchema,
  selfIdentifiedGender: z.enum(['woman', 'man']),
  displayName: z.string().trim().min(1).max(100),
  nationality: NationalitySchema,
  regionCode: z.string().trim().min(1).max(32),
  photos: z.array(z.string().trim().min(1)).min(2).max(6),
  introduction: z.string().trim().min(40).max(1000),
  marriageTiming: z.enum([
    'within_1_year',
    'within_2_years',
    'within_3_years',
    'not_sure',
  ]),
  residenceCountry: NationalitySchema,
  willingToRelocate: z.boolean(),
  childrenPreference: z.enum([
    'want_children',
    'do_not_want_children',
    'open_to_discuss',
  ]),
  smokingStatus: z.enum(['non_smoker', 'smoker', 'trying_to_quit']),
  jaLevel: LanguageLevelSchema,
  koLevel: LanguageLevelSchema,
  willingToLearnPartnerLanguage: z.boolean(),
});

export const PublicProfileSchema = z.strictObject({
  locale: LocaleSchema,
  selfIdentifiedGender: z.enum(['woman', 'man']),
  displayName: z.string().trim().min(1).max(100),
  nationality: NationalitySchema,
  regionCode: z.string().trim().min(1).max(32),
  photos: z.array(z.string().trim().min(1)).min(2).max(6),
  introduction: z.string().trim().min(40).max(1000),
  marriageTiming: z.enum([
    'within_1_year',
    'within_2_years',
    'within_3_years',
    'not_sure',
  ]),
  residenceCountry: NationalitySchema,
  willingToRelocate: z.boolean(),
  childrenPreference: z.enum([
    'want_children',
    'do_not_want_children',
    'open_to_discuss',
  ]),
  smokingStatus: z.enum(['non_smoker', 'smoker', 'trying_to_quit']),
  jaLevel: LanguageLevelSchema,
  koLevel: LanguageLevelSchema,
  willingToLearnPartnerLanguage: z.boolean(),
  age: z.int().min(18),
});

export type ProfileDraft = z.infer<typeof ProfileDraftSchema>;
export type PublicProfile = z.infer<typeof PublicProfileSchema>;

export function toPublicProfile(input: {
  profile: ProfileDraft;
  identity: VerifiedIdentity;
  eligibility: MemberStateInput;
  asOf: Date;
}): PublicProfile {
  if (deriveMemberState(input.eligibility) !== 'active') {
    throw new DomainError(DomainErrorCode.PROFILE_NOT_ACTIVE);
  }

  if (input.identity.status !== 'verified') {
    throw new DomainError(DomainErrorCode.IDENTITY_NOT_VERIFIED);
  }

  const age = calculateAge(input.identity.birthDate, input.asOf);
  if (age < 18) {
    throw new DomainError(DomainErrorCode.IDENTITY_UNDERAGE);
  }

  return PublicProfileSchema.parse({
    ...input.profile,
    age,
  });
}

function calculateAge(birthDate: string, asOf: Date): number {
  const [birthYear, birthMonth, birthDay] = birthDate.split('-').map(Number);
  const year = asOf.getUTCFullYear();
  const month = asOf.getUTCMonth() + 1;
  const day = asOf.getUTCDate();
  const hasHadBirthday =
    month > birthMonth || (month === birthMonth && day >= birthDay);

  return year - birthYear - (hasHadBirthday ? 0 : 1);
}
