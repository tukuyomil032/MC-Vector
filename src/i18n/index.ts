/**
 * i18n Module Entry Point
 *
 * Exports the useTranslation hook and related utilities for internationalization.
 */
import { useMemo } from 'react';
import { en, ja } from './locales';
import { useI18nStore } from './store';
import type { LocaleCode, TranslationDictionary, TranslationKey, TranslationParams } from './types';

/**
 * Map of locale codes to their translation dictionaries.
 */
const dictionaries: Record<LocaleCode, TranslationDictionary> = {
  en,
  ja,
  // Korean and Chinese are reserved for future implementation
  ko: en, // Fallback to English
  zh: en, // Fallback to English
};

/**
 * Get a nested value from an object using dot notation.
 * @param obj - The object to traverse
 * @param path - Dot-notation path (e.g., 'common.cancel')
 * @returns The value at the path, or undefined if not found
 */
function getNestedValue(obj: unknown, path: string): string | undefined {
  const keys = path.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return typeof current === 'string' ? current : undefined;
}

/**
 * Interpolate parameters into a translation string.
 * Replaces {paramName} with the corresponding value from params.
 * @param text - The translation string with placeholders
 * @param params - Object with parameter values
 * @returns The interpolated string
 */
function interpolate(text: string, params?: TranslationParams): string {
  if (!params) return text;

  return text.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = params[key];
    return value !== undefined ? String(value) : `{${key}}`;
  });
}

/**
 * Create a translation function for a specific locale.
 * @param locale - The locale to use for translations
 * @returns A type-safe translation function
 */
function createTranslator(locale: LocaleCode) {
  const dictionary = dictionaries[locale];
  const fallbackDictionary = dictionaries.en;

  /**
   * Translate a key to the current locale.
   * Falls back to English, then to the key itself if not found.
   * @param key - Dot-notation translation key (e.g., 'common.cancel')
   * @param params - Optional interpolation parameters
   * @returns The translated string
   */
  return (key: TranslationKey, params?: TranslationParams): string => {
    // Try current locale first
    let value = getNestedValue(dictionary, key);

    // Fallback to English if not found
    if (value === undefined && locale !== 'en') {
      value = getNestedValue(fallbackDictionary, key);
    }

    // Fallback to key itself if still not found
    if (value === undefined) {
      console.warn(`[i18n] Missing translation for key: "${key}" in locale: "${locale}"`);
      return key;
    }

    return interpolate(value, params);
  };
}

/**
 * Return type for the useTranslation hook.
 */
export interface UseTranslationReturn {
  /**
   * Type-safe translation function.
   * @param key - Dot-notation translation key
   * @param params - Optional interpolation parameters
   * @returns Translated string
   */
  t: (key: TranslationKey, params?: TranslationParams) => string;
  /** Current locale code */
  locale: LocaleCode;
  /** Set the current locale */
  setLocale: (locale: LocaleCode) => Promise<void>;
}

/**
 * React hook for accessing translations.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { t, locale, setLocale } = useTranslation();
 *
 *   return (
 *     <div>
 *       <p>{t('common.cancel')}</p>
 *       <button onClick={() => setLocale('ja')}>日本語</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useTranslation(): UseTranslationReturn {
  const { currentLocale, setLocale } = useI18nStore();

  const t = useMemo(() => createTranslator(currentLocale), [currentLocale]);

  return {
    t,
    locale: currentLocale,
    setLocale,
  };
}

/**
 * Get a translation function for use outside React components.
 * This function reads the current locale from the store and returns
 * a translator function.
 *
 * @example
 * ```ts
 * import { getTranslation } from '../i18n';
 *
 * function myLibFunction() {
 *   const t = getTranslation();
 *   throw new Error(t('errors.updateSignatureVerificationFailed'));
 * }
 * ```
 */
export function getTranslation() {
  const { currentLocale } = useI18nStore.getState();
  return createTranslator(currentLocale);
}

// Re-export types and utilities
export { useI18nStore, getCurrentLocale, setLocale } from './store';
export type { LocaleCode, TranslationKey, TranslationParams, TranslationDictionary } from './types';
export { DEFAULT_LOCALE, isValidLocaleCode } from './types';
