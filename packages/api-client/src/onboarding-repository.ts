import type { MemberState, ProfileDraft } from '@jpkrlove/domain';

export type RepositoryErrorCode =
  | 'AUTHENTICATION_REQUIRED'
  | 'AUTH_UNAVAILABLE'
  | 'INVALID_EMAIL'
  | 'INVALID_OTP'
  | 'OTP_INVALID_OR_EXPIRED'
  | 'INVITATION_UNAVAILABLE'
  | 'INVITATION_ALREADY_REDEEMED'
  | 'IDENTITY_UNAVAILABLE'
  | 'INVALID_PROFILE'
  | 'MEDIA_UPLOAD_FAILED'
  | 'MEDIA_OPERATION_FAILED'
  | 'ONBOARDING_UNAVAILABLE';

export class RepositoryError extends Error {
  constructor(readonly code: RepositoryErrorCode) {
    super(code);
    this.name = 'RepositoryError';
  }
}

export interface IdentitySession {
  providerCaseId: string;
  redirectUrl: string;
}

export interface ProfileMedia {
  id: string;
  objectPath: string;
  position: number;
  signedUrl: string | null;
  signedUrlExpiresAt: string | null;
  uploadStatus: 'uploading' | 'uploaded' | 'failed';
}

export interface OnboardingState {
  memberState: MemberState;
  profile: ProfileDraft | null;
  media: ProfileMedia[];
}

export interface ProfileMediaUpload {
  mediaId: string;
  bytes: Uint8Array | ArrayBuffer;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
}

export interface OnboardingRepository {
  getCurrentState(): Promise<OnboardingState>;
  redeemInvitation(code: string): Promise<void>;
  createIdentitySession(): Promise<IdentitySession>;
  uploadProfileMedia(input: ProfileMediaUpload): Promise<ProfileMedia>;
  retryProfileMediaUpload(input: {
    media: ProfileMedia;
    bytes: Uint8Array | ArrayBuffer;
    contentType: ProfileMediaUpload['contentType'];
  }): Promise<ProfileMedia>;
  reorderProfileMedia(mediaIds: string[]): Promise<void>;
  deleteProfileMedia(media: ProfileMedia): Promise<void>;
  refreshProfileMediaUrl(media: ProfileMedia): Promise<ProfileMedia>;
  saveProfileDraft(profile: ProfileDraft): Promise<void>;
  submitProfile(profile: ProfileDraft): Promise<void>;
}
