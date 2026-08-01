import { fireEvent, render, screen } from '@testing-library/react-native';
import type { AuthRepository } from '@jpkrlove/api-client';
import { RepositoryError } from '@jpkrlove/api-client';
import { EmailOtpScreen } from './email-otp-screen';

function createAuthRepository(
  overrides: Partial<AuthRepository> = {},
): AuthRepository {
  return {
    requestEmailOtp: jest.fn().mockResolvedValue({ status: 'accepted' }),
    verifyEmailOtp: jest.fn(),
    getSession: jest.fn().mockResolvedValue(null),
    signOut: jest.fn(),
    ...overrides,
  };
}

describe('EmailOtpScreen', () => {
  it('always shows the enumeration-safe OTP request message', async () => {
    await render(
      <EmailOtpScreen locale="ja" repository={createAuthRepository()} />,
    );

    await fireEvent.changeText(
      screen.getByLabelText('メールアドレス'),
      'member@example.test',
    );
    await fireEvent.press(
      screen.getByRole('button', { name: '認証コードを送信' }),
    );

    expect(
      await screen.findByText(
        'アカウントを確認できた場合は、6桁の認証コードを送信しました。',
      ),
    ).toBeOnTheScreen();
  });

  it('shows a localized retry state for an expired OTP', async () => {
    const repository = createAuthRepository({
      verifyEmailOtp: jest
        .fn()
        .mockRejectedValue(new RepositoryError('OTP_INVALID_OR_EXPIRED')),
    });
    await render(<EmailOtpScreen locale="ko" repository={repository} />);

    await fireEvent.changeText(
      screen.getByLabelText('이메일 주소'),
      'member@example.test',
    );
    await fireEvent.press(
      screen.getByRole('button', { name: '인증 코드 보내기' }),
    );
    await screen.findByLabelText('6자리 인증 코드');
    await fireEvent.changeText(
      screen.getByLabelText('6자리 인증 코드'),
      '123456',
    );
    await fireEvent.press(screen.getByRole('button', { name: '로그인' }));

    expect(
      await screen.findByText(
        '인증 코드가 올바르지 않거나 만료되었습니다. 새 코드를 요청해 주세요.',
      ),
    ).toBeOnTheScreen();
  });
});
