import { render, screen } from '@testing-library/react-native';

import type { OnboardingRepository } from '@jpkrlove/api-client';
import { OnboardingGate, routeForMemberState } from './onboarding-gate';

function createFakeOnboardingRepository(
  memberState: Awaited<
    ReturnType<OnboardingRepository['getCurrentState']>
  >['memberState'],
): OnboardingRepository {
  return {
    getCurrentState: jest
      .fn()
      .mockResolvedValue({ memberState, profile: null }),
    redeemInvitation: jest.fn(),
    createIdentitySession: jest.fn(),
    uploadProfileMedia: jest.fn(),
    retryProfileMediaUpload: jest.fn(),
    reorderProfileMedia: jest.fn(),
    deleteProfileMedia: jest.fn(),
    refreshProfileMediaUrl: jest.fn(),
    saveProfileDraft: jest.fn(),
    submitProfile: jest.fn(),
  };
}

describe('OnboardingGate', () => {
  it('does not route a pending identity to discovery', async () => {
    const repository = createFakeOnboardingRepository('identity_pending');

    await render(<OnboardingGate repository={repository} locale="ko" />);

    expect(
      await screen.findByText('본인 확인을 완료해 주세요'),
    ).toBeOnTheScreen();
    expect(screen.queryByText('오늘의 소개')).not.toBeOnTheScreen();
  });

  it.each([
    ['waiting', '/(onboarding)/invite'],
    ['identity_pending', '/(onboarding)/identity'],
    ['identity_failed', '/(onboarding)/identity'],
    ['identity_expired', '/(onboarding)/identity'],
    ['profile_draft', '/(onboarding)/profile'],
    ['profile_in_review', '/(onboarding)/status'],
    ['changes_requested', '/(onboarding)/profile'],
    ['active', '/(app)'],
    ['paused', '/(onboarding)/status'],
    ['restricted', '/(onboarding)/status'],
  ] as const)(
    'maps %s deterministically without defaulting to discovery',
    (state, route) => {
      expect(routeForMemberState(state)).toBe(route);
    },
  );

  it('renders long Japanese status copy without truncating its accessibility label', async () => {
    const repository = createFakeOnboardingRepository('profile_in_review');

    await render(<OnboardingGate repository={repository} locale="ja" />);

    expect(
      await screen.findByRole('header', {
        name: 'プロフィールを審査しています',
      }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        '審査が完了するまでおすすめプロフィールは表示されません。結果はこの画面で確認できます。',
      ),
    ).toBeOnTheScreen();
  });
});
