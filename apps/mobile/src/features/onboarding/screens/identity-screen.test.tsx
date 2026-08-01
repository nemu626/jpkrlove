import { fireEvent, render, screen } from '@testing-library/react-native';
import type { OnboardingRepository } from '@jpkrlove/api-client';
import { IDENTITY_CALLBACK_URL } from '../identity-callback';
import { IdentityScreen } from './identity-screen';

const repository = {
  getCurrentState: jest.fn(),
  redeemInvitation: jest.fn(),
  createIdentitySession: jest.fn(),
  uploadProfileMedia: jest.fn(),
  retryProfileMediaUpload: jest.fn(),
  reorderProfileMedia: jest.fn(),
  deleteProfileMedia: jest.fn(),
  refreshProfileMediaUrl: jest.fn(),
  saveProfileDraft: jest.fn(),
  submitProfile: jest.fn(),
} satisfies OnboardingRepository;

describe('IdentityScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows an invited identity_pending member to start verification', async () => {
    await render(
      <IdentityScreen
        locale="ja"
        memberState="identity_pending"
        repository={repository}
      />,
    );

    expect(
      screen.getByRole('button', { name: '本人確認を開始' }),
    ).toBeOnTheScreen();
  });

  it('opens the registered callback URI and refreshes state without trusting callback payload', async () => {
    repository.createIdentitySession.mockResolvedValue({
      providerCaseId: 'case-1',
      redirectUrl: 'https://identity.example/session/case-1',
    });
    const openIdentitySession = jest.fn().mockResolvedValue({
      type: 'success',
      url: `${IDENTITY_CALLBACK_URL}?untrusted_status=verified`,
    });
    const onSessionClosed = jest.fn();
    await render(
      <IdentityScreen
        locale="ja"
        memberState="identity_pending"
        onSessionClosed={onSessionClosed}
        openIdentitySession={openIdentitySession}
        repository={repository}
      />,
    );

    await fireEvent.press(
      screen.getByRole('button', { name: '本人確認を開始' }),
    );

    expect(openIdentitySession).toHaveBeenCalledWith(
      'https://identity.example/session/case-1',
      'jpkrlove://identity/callback',
    );
    expect(onSessionClosed).toHaveBeenCalledTimes(1);
  });
});
