import { render, screen } from '@testing-library/react-native';
import type { OnboardingRepository } from '@jpkrlove/api-client';
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
});
