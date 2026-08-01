import { zodResolver } from '@hookform/resolvers/zod';
import type { OnboardingRepository, ProfileMedia } from '@jpkrlove/api-client';
import { ProfileDraftSchema, type ProfileDraft } from '@jpkrlove/domain';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  Controller,
  type Control,
  type FieldPath,
  useForm,
  useWatch,
} from 'react-hook-form';
import type { AppLocale } from '@/i18n';
import { translate } from '@/i18n';
import {
  OnboardingScreen,
  onboardingStyles,
} from '@/features/onboarding/components/onboarding-screen';
import { PhotoField } from '../components/photo-field';

type UploadSource = {
  bytes: Uint8Array;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
};

export function ProfileEditorScreen({
  locale,
  repository,
  initialProfile,
  initialMedia = [],
  createMediaId = () => globalThis.crypto.randomUUID(),
  onSubmitted,
}: {
  locale: AppLocale;
  repository: OnboardingRepository;
  initialProfile?: ProfileDraft | null;
  initialMedia?: ProfileMedia[];
  createMediaId?: () => string;
  onSubmitted?: () => void;
}) {
  const [media, setMedia] = useState(initialMedia);
  const [isWorking, setIsWorking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uploads = useRef(new Map<string, UploadSource>());
  const { control, handleSubmit, setValue } = useForm<ProfileDraft>({
    resolver: zodResolver(ProfileDraftSchema),
    defaultValues: initialProfile ?? emptyProfile(locale),
    mode: 'onBlur',
  });
  const preview = useWatch({ control });

  useEffect(() => {
    setValue(
      'photos',
      media
        .filter((item) => item.uploadStatus === 'uploaded')
        .map((item) => item.objectPath),
      { shouldValidate: true },
    );
  }, [media, setValue]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      initialMedia.map((item) => repository.refreshProfileMediaUrl(item)),
    ).then((refreshed) => {
      if (!cancelled) setMedia(refreshed);
    });
    return () => {
      cancelled = true;
    };
  }, [initialMedia, repository]);

  const addPhoto = async () => {
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(translate(locale, 'photo.permission'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.85,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;

    const contentType = supportedContentType(asset.mimeType);
    const bytes = new Uint8Array(await (await fetch(asset.uri)).arrayBuffer());
    const mediaId = createMediaId();
    uploads.current.set(mediaId, { bytes, contentType });
    const placeholder: ProfileMedia = {
      id: mediaId,
      objectPath: mediaId,
      position: media.length + 1,
      signedUrl: asset.uri,
      signedUrlExpiresAt: null,
      uploadStatus: 'uploading',
    };
    setMedia((current) => [...current, placeholder]);

    const uploaded = await repository.uploadProfileMedia({
      mediaId,
      bytes,
      contentType,
    });
    setMedia((current) =>
      current.map((item) => (item.id === mediaId ? uploaded : item)),
    );
  };

  const retryPhoto = async (id: string) => {
    const source = uploads.current.get(id);
    const failed = media.find((item) => item.id === id);
    if (!source || !failed) {
      setError(translate(locale, 'photo.failed'));
      return;
    }
    setError(null);
    const uploaded = await repository.retryProfileMediaUpload({
      media: failed,
      ...source,
    });
    setMedia((current) =>
      current.map((item) => (item.id === id ? uploaded : item)),
    );
  };

  const deletePhoto = async (id: string) => {
    const target = media.find((item) => item.id === id);
    if (!target || media.length <= 2) return;
    setError(null);
    try {
      await repository.deleteProfileMedia(target);
      setMedia((current) =>
        current
          .filter((item) => item.id !== id)
          .map((item, index) => ({ ...item, position: index + 1 })),
      );
      uploads.current.delete(id);
    } catch {
      setError(translate(locale, 'common.unexpectedError'));
    }
  };

  const movePhoto = async (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= media.length) return;
    const previous = media;
    const next = [...media];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setMedia(next);
    if (
      next.every(
        (item) => item.uploadStatus === 'uploaded' && item.position > 0,
      )
    ) {
      try {
        await repository.reorderProfileMedia(next.map((item) => item.id));
        setMedia(next.map((item, index) => ({ ...item, position: index + 1 })));
      } catch {
        setMedia(previous);
        setError(translate(locale, 'common.unexpectedError'));
      }
    }
  };

  const persist = async (profile: ProfileDraft, submit: boolean) => {
    setIsWorking(true);
    setError(null);
    setNotice(null);
    try {
      if (submit) {
        await repository.submitProfile(profile);
        setNotice(translate(locale, 'profile.submitted'));
        onSubmitted?.();
      } else {
        await repository.saveProfileDraft(profile);
        const refreshed = await repository.getCurrentState();
        setMedia(refreshed.media);
        setNotice(translate(locale, 'profile.saved'));
      }
    } catch {
      setError(translate(locale, 'common.unexpectedError'));
    } finally {
      setIsWorking(false);
    }
  };

  const invalid = () => setError(translate(locale, 'profile.invalid'));

  return (
    <OnboardingScreen
      title={translate(locale, 'profile.title')}
      description={translate(locale, 'profile.description')}
    >
      <ChoiceField
        control={control}
        label={translate(locale, 'profile.locale')}
        locale={locale}
        name="locale"
        values={['ja', 'ko']}
      />
      <ChoiceField
        control={control}
        label={translate(locale, 'profile.gender')}
        locale={locale}
        name="selfIdentifiedGender"
        values={['woman', 'man']}
      />
      <FormTextField
        control={control}
        errorMessage={translate(locale, 'profile.invalid')}
        label={translate(locale, 'profile.displayName')}
        name="displayName"
      />
      <ChoiceField
        control={control}
        label={translate(locale, 'profile.nationality')}
        locale={locale}
        name="nationality"
        values={['JP', 'KR']}
      />
      <FormTextField
        control={control}
        errorMessage={translate(locale, 'profile.invalid')}
        label={translate(locale, 'profile.regionCode')}
        name="regionCode"
      />
      <ChoiceField
        control={control}
        label={translate(locale, 'profile.residenceCountry')}
        locale={locale}
        name="residenceCountry"
        values={['JP', 'KR']}
      />
      <FormTextField
        control={control}
        errorMessage={translate(locale, 'profile.invalid')}
        hint={translate(locale, 'profile.introductionHint')}
        label={translate(locale, 'profile.introduction')}
        multiline
        name="introduction"
      />
      <ChoiceField
        control={control}
        label={translate(locale, 'profile.marriageTiming')}
        locale={locale}
        name="marriageTiming"
        values={[
          'within_1_year',
          'within_2_years',
          'within_3_years',
          'not_sure',
        ]}
      />
      <ChoiceField
        control={control}
        label={translate(locale, 'profile.childrenPreference')}
        locale={locale}
        name="childrenPreference"
        values={['want_children', 'do_not_want_children', 'open_to_discuss']}
      />
      <ChoiceField
        control={control}
        label={translate(locale, 'profile.smokingStatus')}
        locale={locale}
        name="smokingStatus"
        values={['non_smoker', 'smoker', 'trying_to_quit']}
      />
      <ChoiceField
        control={control}
        label={translate(locale, 'profile.jaLevel')}
        locale={locale}
        name="jaLevel"
        values={['basic', 'intermediate', 'advanced', 'native']}
      />
      <ChoiceField
        control={control}
        label={translate(locale, 'profile.koLevel')}
        locale={locale}
        name="koLevel"
        values={['basic', 'intermediate', 'advanced', 'native']}
      />
      <BooleanField
        control={control}
        label={translate(locale, 'profile.relocate')}
        name="willingToRelocate"
      />
      <BooleanField
        control={control}
        label={translate(locale, 'profile.learnLanguage')}
        name="willingToLearnPartnerLanguage"
      />

      <PhotoField
        locale={locale}
        onAdd={() => void addPhoto()}
        onDelete={(id) => void deletePhoto(id)}
        onMove={(from, to) => void movePhoto(from, to)}
        onRetry={(id) => void retryPhoto(id)}
        photos={media}
      />

      <View style={styles.preview}>
        <Text accessibilityRole="header" style={styles.previewTitle}>
          {translate(locale, 'profile.preview')}
        </Text>
        <Text style={styles.previewName}>{preview.displayName}</Text>
        <Text style={styles.previewBody}>{preview.introduction}</Text>
      </View>

      {error ? (
        <Text accessibilityRole="alert" style={onboardingStyles.error}>
          {error}
        </Text>
      ) : null}
      {notice ? (
        <Text accessibilityRole="alert" style={onboardingStyles.success}>
          {notice}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        disabled={isWorking}
        onPress={() =>
          void handleSubmit((data) => persist(data, false), invalid)()
        }
        style={[
          onboardingStyles.secondaryButton,
          isWorking && onboardingStyles.buttonDisabled,
        ]}
      >
        <Text style={onboardingStyles.secondaryButtonText}>
          {translate(locale, 'common.save')}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        disabled={isWorking}
        onPress={() =>
          void handleSubmit((data) => persist(data, true), invalid)()
        }
        style={[
          onboardingStyles.primaryButton,
          isWorking && onboardingStyles.buttonDisabled,
        ]}
      >
        {isWorking ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={onboardingStyles.primaryButtonText}>
            {translate(locale, 'common.submit')}
          </Text>
        )}
      </Pressable>
    </OnboardingScreen>
  );
}

function FormTextField({
  control,
  name,
  label,
  errorMessage,
  hint,
  multiline = false,
}: {
  control: Control<ProfileDraft>;
  name: FieldPath<ProfileDraft>;
  label: string;
  errorMessage: string;
  hint?: string;
  multiline?: boolean;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <View style={onboardingStyles.field}>
          <Text style={onboardingStyles.label}>{label}</Text>
          <TextInput
            accessibilityHint={hint}
            accessibilityLabel={label}
            multiline={multiline}
            onBlur={field.onBlur}
            onChangeText={field.onChange}
            style={[
              onboardingStyles.input,
              multiline && styles.multiline,
              fieldState.error && styles.invalidInput,
            ]}
            value={typeof field.value === 'string' ? field.value : ''}
          />
          {fieldState.error ? (
            <Text accessibilityRole="alert" style={onboardingStyles.error}>
              {errorMessage}
            </Text>
          ) : null}
        </View>
      )}
    />
  );
}

function ChoiceField({
  control,
  name,
  label,
  locale,
  values,
}: {
  control: Control<ProfileDraft>;
  name: FieldPath<ProfileDraft>;
  label: string;
  locale: AppLocale;
  values: readonly string[];
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <View
          accessibilityLabel={label}
          accessibilityRole="radiogroup"
          style={onboardingStyles.field}
        >
          <Text style={onboardingStyles.label}>{label}</Text>
          <View style={styles.choices}>
            {values.map((value) => {
              const selected = field.value === value;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  key={value}
                  onPress={() => field.onChange(value)}
                  style={[styles.choice, selected && styles.choiceSelected]}
                >
                  <Text
                    style={[
                      styles.choiceText,
                      selected && styles.choiceTextSelected,
                    ]}
                  >
                    {translate(locale, `options.${value}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    />
  );
}

function BooleanField({
  control,
  name,
  label,
}: {
  control: Control<ProfileDraft>;
  name: 'willingToRelocate' | 'willingToLearnPartnerLanguage';
  label: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>{label}</Text>
          <Switch
            accessibilityLabel={label}
            onValueChange={field.onChange}
            trackColor={{ false: '#8B9194', true: '#176B66' }}
            value={Boolean(field.value)}
          />
        </View>
      )}
    />
  );
}

function emptyProfile(locale: AppLocale): ProfileDraft {
  return {
    locale,
    selfIdentifiedGender: 'woman',
    displayName: '',
    nationality: 'JP',
    regionCode: '',
    photos: [],
    introduction: '',
    marriageTiming: 'not_sure',
    residenceCountry: 'JP',
    willingToRelocate: false,
    childrenPreference: 'open_to_discuss',
    smokingStatus: 'non_smoker',
    jaLevel: locale === 'ja' ? 'native' : 'basic',
    koLevel: locale === 'ko' ? 'native' : 'basic',
    willingToLearnPartnerLanguage: true,
  };
}

function supportedContentType(
  value: string | undefined,
): UploadSource['contentType'] {
  if (
    value === 'image/png' ||
    value === 'image/webp' ||
    value === 'image/jpeg'
  ) {
    return value;
  }
  return 'image/jpeg';
}

const styles = StyleSheet.create({
  multiline: { minHeight: 128, textAlignVertical: 'top' },
  invalidInput: { borderColor: '#A32833' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: {
    minHeight: 44,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#8B9194',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
  },
  choiceSelected: { borderColor: '#176B66', backgroundColor: '#E3F1EF' },
  choiceText: { color: '#3F4446', fontSize: 14 },
  choiceTextSelected: { color: '#115A55', fontWeight: '700' },
  switchRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  switchLabel: { flex: 1, color: '#25282A', fontSize: 16, lineHeight: 22 },
  preview: {
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#BFC5C2',
    paddingVertical: 18,
  },
  previewTitle: { color: '#25282A', fontSize: 20, fontWeight: '700' },
  previewName: { color: '#25282A', fontSize: 16, fontWeight: '700' },
  previewBody: { color: '#5D6366', fontSize: 15, lineHeight: 22 },
});
