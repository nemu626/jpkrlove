export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: string;
}

export interface OtpRequestResult {
  status: 'accepted';
}

export interface AuthRepository {
  requestEmailOtp(email: string): Promise<OtpRequestResult>;
  verifyEmailOtp(email: string, token: string): Promise<AuthSession>;
  getSession(): Promise<AuthSession | null>;
  signOut(): Promise<void>;
}
