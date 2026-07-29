export const DomainErrorCode = {
  INVALID_INVITATION_CODE: 'INVALID_INVITATION_CODE',
  IDENTITY_NOT_VERIFIED: 'IDENTITY_NOT_VERIFIED',
  IDENTITY_UNDERAGE: 'IDENTITY_UNDERAGE',
  INVALID_PROFILE: 'INVALID_PROFILE',
} as const;

export type DomainErrorCode =
  (typeof DomainErrorCode)[keyof typeof DomainErrorCode];

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode) {
    super(code);
    this.name = 'DomainError';
    this.code = code;
  }
}
