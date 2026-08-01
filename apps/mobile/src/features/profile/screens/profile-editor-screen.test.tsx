import { render, screen } from '@testing-library/react-native';
import type { OnboardingRepository, ProfileMedia } from '@jpkrlove/api-client';
import type { ProfileDraft } from '@jpkrlove/domain';
import { ProfileEditorScreen } from './profile-editor-screen';

const draft: ProfileDraft = {
  locale: 'ja',
  selfIdentifiedGender: 'woman',
  displayName: 'Aiko',
  nationality: 'JP',
  regionCode: '13',
  photos: ['member/photo-1', 'member/photo-2'],
  introduction:
    '静かなカフェと散歩が好きです。韓国語を学びながら、互いを尊重できる関係を築きたいです。',
  marriageTiming: 'within_3_years',
  residenceCountry: 'JP',
  willingToRelocate: true,
  childrenPreference: 'open_to_discuss',
  smokingStatus: 'non_smoker',
  jaLevel: 'native',
  koLevel: 'intermediate',
  willingToLearnPartnerLanguage: true,
};

const media: ProfileMedia[] = draft.photos.map((objectPath, index) => ({
  id: `photo-${index + 1}`,
  objectPath,
  position: index + 1,
  signedUrl: `https://signed.test/${index + 1}`,
  signedUrlExpiresAt: '2026-07-30T00:01:00.000Z',
  uploadStatus: 'uploaded',
}));

const repository: OnboardingRepository = {
  getCurrentState: jest.fn(),
  redeemInvitation: jest.fn(),
  createIdentitySession: jest.fn(),
  uploadProfileMedia: jest.fn(),
  retryProfileMediaUpload: jest.fn(),
  reorderProfileMedia: jest.fn(),
  deleteProfileMedia: jest.fn(),
  refreshProfileMediaUrl: jest.fn(async (item: ProfileMedia) => item),
  saveProfileDraft: jest.fn(),
  submitProfile: jest.fn(),
};

describe('ProfileEditorScreen', () => {
  it('renders a domain-backed public draft without sensitive identity fields', async () => {
    await render(
      <ProfileEditorScreen
        initialMedia={media}
        initialProfile={draft}
        locale="ja"
        repository={repository}
      />,
    );

    expect(screen.getByLabelText('表示名')).toHaveDisplayValue('Aiko');
    expect(screen.queryByText('法的氏名')).not.toBeOnTheScreen();
    expect(screen.queryByText('生年月日')).not.toBeOnTheScreen();
    expect(screen.queryByText('連絡先')).not.toBeOnTheScreen();
    expect(
      screen.getByRole('header', { name: '公開プロフィールのプレビュー' }),
    ).toBeOnTheScreen();
  });
});
