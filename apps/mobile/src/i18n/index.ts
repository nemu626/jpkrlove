import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import ja from './locales/ja.json';
import ko from './locales/ko.json';

export type AppLocale = 'ja' | 'ko';

const resources = { ja, ko } as const;
const i18next = createInstance();

export function deviceLocale(): AppLocale {
  return Intl.DateTimeFormat().resolvedOptions().locale.startsWith('ko')
    ? 'ko'
    : 'ja';
}

export async function initializeI18n(locale: AppLocale): Promise<void> {
  if (i18next.isInitialized) {
    await i18next.changeLanguage(locale);
    return;
  }
  await i18next.use(initReactI18next).init({
    compatibilityJSON: 'v4',
    lng: locale,
    fallbackLng: 'ja',
    resources: {
      ja: { translation: ja },
      ko: { translation: ko },
    },
    interpolation: { escapeValue: false },
  });
}

export function translate(locale: AppLocale, key: string): string {
  const value = key.split('.').reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[part];
  }, resources[locale]);
  if (typeof value !== 'string') throw new Error(`MISSING_I18N_KEY:${key}`);
  return value;
}
