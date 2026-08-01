import type { ProfileMedia } from '@jpkrlove/api-client';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AppLocale } from '@/i18n';
import { translate } from '@/i18n';
import { onboardingStyles } from '@/features/onboarding/components/onboarding-screen';

export function PhotoField({
  locale,
  photos,
  onAdd,
  onDelete,
  onMove,
  onRetry,
}: {
  locale: AppLocale;
  photos: ProfileMedia[];
  onAdd: () => void;
  onDelete: (id: string) => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  onRetry: (id: string) => void;
}) {
  return (
    <View style={styles.container}>
      <View style={styles.heading}>
        <Text style={styles.title}>{translate(locale, 'photo.title')}</Text>
        <Text style={styles.description}>
          {translate(locale, 'photo.description')}
        </Text>
      </View>

      <View style={styles.grid}>
        {photos.map((photo, index) => (
          <View key={photo.id} style={styles.photoItem}>
            <View style={styles.imageFrame}>
              {photo.signedUrl ? (
                <Image
                  accessibilityLabel={`${translate(locale, 'photo.title')} ${index + 1}`}
                  contentFit="cover"
                  source={{ uri: photo.signedUrl }}
                  style={styles.image}
                />
              ) : (
                <View style={styles.placeholder}>
                  <Text style={styles.failedText}>
                    {translate(locale, 'photo.failed')}
                  </Text>
                </View>
              )}
            </View>
            {photo.uploadStatus === 'failed' ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => onRetry(photo.id)}
                style={styles.textControl}
              >
                <Text style={styles.controlText}>
                  {translate(locale, 'photo.retry')}
                </Text>
              </Pressable>
            ) : null}
            <View style={styles.controls}>
              <Pressable
                accessibilityLabel={translate(locale, 'photo.movePrevious')}
                accessibilityRole="button"
                disabled={index === 0}
                onPress={() => onMove(index, index - 1)}
                style={[
                  styles.iconControl,
                  index === 0 && onboardingStyles.buttonDisabled,
                ]}
              >
                <Text style={styles.icon}>↑</Text>
              </Pressable>
              <Pressable
                accessibilityLabel={translate(locale, 'photo.moveNext')}
                accessibilityRole="button"
                disabled={index === photos.length - 1}
                onPress={() => onMove(index, index + 1)}
                style={[
                  styles.iconControl,
                  index === photos.length - 1 &&
                    onboardingStyles.buttonDisabled,
                ]}
              >
                <Text style={styles.icon}>↓</Text>
              </Pressable>
              <Pressable
                accessibilityLabel={translate(locale, 'photo.delete')}
                accessibilityRole="button"
                disabled={photos.length <= 2}
                onPress={() => onDelete(photo.id)}
                style={[
                  styles.deleteControl,
                  photos.length <= 2 && onboardingStyles.buttonDisabled,
                ]}
              >
                <Text style={styles.deleteText}>×</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={photos.length >= 6}
        onPress={onAdd}
        style={[
          onboardingStyles.secondaryButton,
          photos.length >= 6 && onboardingStyles.buttonDisabled,
        ]}
      >
        <Text style={onboardingStyles.secondaryButtonText}>
          {translate(locale, 'photo.add')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 14 },
  heading: { gap: 6 },
  title: { color: '#25282A', fontSize: 16, fontWeight: '700' },
  description: { color: '#5D6366', fontSize: 14, lineHeight: 20 },
  grid: { gap: 12 },
  photoItem: {
    borderWidth: 1,
    borderColor: '#D8DCDA',
    borderRadius: 8,
    padding: 8,
    gap: 8,
    backgroundColor: '#FFFFFF',
  },
  imageFrame: {
    width: '100%',
    aspectRatio: 4 / 3,
    overflow: 'hidden',
    borderRadius: 4,
    backgroundColor: '#ECEFED',
  },
  image: { width: '100%', height: '100%' },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  failedText: { color: '#A32833', fontSize: 14 },
  controls: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  iconControl: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#8B9194',
    borderRadius: 8,
  },
  deleteControl: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#A32833',
    borderRadius: 8,
  },
  icon: { color: '#25282A', fontSize: 22 },
  deleteText: { color: '#A32833', fontSize: 24 },
  textControl: { minHeight: 44, justifyContent: 'center' },
  controlText: { color: '#176B66', fontSize: 14, fontWeight: '700' },
});
