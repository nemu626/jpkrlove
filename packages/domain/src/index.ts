export const PRODUCT_NAME = 'jpkrlove' as const;

export { DomainError, DomainErrorCode } from './errors.js';
export { InvitationCodeSchema } from './invitation.js';
export { IdentityStatusSchema, VerifiedIdentitySchema } from './identity.js';
export { deriveMemberState } from './member-state.js';
export {
  ProfileDraftSchema,
  PublicProfileSchema,
  toPublicProfile,
} from './profile.js';
export type { InvitationCode } from './invitation.js';
export type { IdentityStatus, VerifiedIdentity } from './identity.js';
export type { MemberState, MemberStateInput } from './member-state.js';
export type { ProfileDraft, PublicProfile } from './profile.js';
