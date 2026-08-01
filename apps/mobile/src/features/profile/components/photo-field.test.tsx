import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ProfileMedia } from '@jpkrlove/api-client';
import { PhotoField } from './photo-field';

const photos: ProfileMedia[] = [
  {
    id: 'one',
    objectPath: 'member/one',
    position: 1,
    signedUrl: 'https://signed.test/one',
    signedUrlExpiresAt: '2026-07-30T00:01:00.000Z',
    uploadStatus: 'uploaded',
  },
  {
    id: 'two',
    objectPath: 'member/two',
    position: 2,
    signedUrl: 'https://signed.test/two',
    signedUrlExpiresAt: '2026-07-30T00:01:00.000Z',
    uploadStatus: 'uploaded',
  },
];

describe('PhotoField', () => {
  it('keeps delete disabled at the two-photo minimum', async () => {
    await render(
      <PhotoField
        locale="ja"
        photos={photos}
        onAdd={jest.fn()}
        onDelete={jest.fn()}
        onMove={jest.fn()}
        onRetry={jest.fn()}
      />,
    );

    expect(
      screen.getAllByRole('button', { name: '写真を削除' })[0],
    ).toBeDisabled();
  });

  it('offers retry for a failed upload and accessible reorder controls', async () => {
    const onRetry = jest.fn();
    const onMove = jest.fn();
    await render(
      <PhotoField
        locale="ko"
        photos={[
          ...photos,
          {
            id: 'failed',
            objectPath: 'member/failed',
            position: 3,
            signedUrl: null,
            signedUrlExpiresAt: null,
            uploadStatus: 'failed',
          },
        ]}
        onAdd={jest.fn()}
        onDelete={jest.fn()}
        onMove={onMove}
        onRetry={onRetry}
      />,
    );

    await fireEvent.press(
      screen.getByRole('button', { name: '사진 업로드 다시 시도' }),
    );
    await fireEvent.press(
      screen.getAllByRole('button', { name: '사진을 앞으로 이동' })[1],
    );

    expect(onRetry).toHaveBeenCalledWith('failed');
    expect(onMove).toHaveBeenCalledWith(1, 0);
  });

  it('disables adding at six photos', async () => {
    const six = Array.from({ length: 6 }, (_, index) => ({
      ...photos[0],
      id: `photo-${index}`,
      objectPath: `member/photo-${index}`,
      position: index + 1,
    }));
    await render(
      <PhotoField
        locale="ja"
        photos={six}
        onAdd={jest.fn()}
        onDelete={jest.fn()}
        onMove={jest.fn()}
        onRetry={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '写真を追加' })).toBeDisabled();
  });
});
