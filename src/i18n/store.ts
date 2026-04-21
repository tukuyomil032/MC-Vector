/**
 * i18n Zustand Store
 *
 * Manages locale state and persists to AppSettings.
 */
import { create } from 'zustand';
import { getAppSettings, saveAppSettings } from '../lib/config-commands';
import { logError } from '../lib/error-utils';
import { DEFAULT_LOCALE, isValidLocaleCode } from './types';
import type { LocaleCode } from './types';

/**
 * i18n store state interface.
 */
interface I18nStoreState {
  /** Current active locale */
  currentLocale: LocaleCode;
  /** Whether the store has been initialized from persisted settings */
  initialized: boolean;
  /** Set the current locale and persist to config */
  setLocale: (locale: LocaleCode) => Promise<void>;
  /** Initialize the store by loading persisted locale */
  initLocale: () => Promise<void>;
}

/**
 * Zustand store for i18n state management.
 * Handles locale selection and persistence to AppSettings.
 */
export const useI18nStore = create<I18nStoreState>((set, get) => ({
  currentLocale: DEFAULT_LOCALE,
  initialized: false,

  /**
   * Set the current locale and persist to config.json.
   * @param locale - The locale code to set
   */
  setLocale: async (locale: LocaleCode) => {
    set({ currentLocale: locale });
    try {
      await saveAppSettings({ locale });
    } catch (error) {
      logError('[i18n] Failed to save locale to config', error, { locale });
    }
  },

  /**
   * Initialize the store by loading the persisted locale from config.
   * Falls back to DEFAULT_LOCALE if not found or invalid.
   */
  initLocale: async () => {
    if (get().initialized) return;

    try {
      const settings = await getAppSettings();
      const savedLocale = settings.locale;

      if (isValidLocaleCode(savedLocale)) {
        set({ currentLocale: savedLocale, initialized: true });
      } else {
        set({ initialized: true });
      }
    } catch (error) {
      logError('[i18n] Failed to load locale from config', error);
      set({ initialized: true });
    }
  },
}));

/**
 * Helper function to get the current locale synchronously.
 * Useful for non-React contexts.
 */
export function getCurrentLocale(): LocaleCode {
  return useI18nStore.getState().currentLocale;
}

/**
 * Helper function to set locale from non-React contexts.
 * @param locale - The locale code to set
 */
export async function setLocale(locale: LocaleCode): Promise<void> {
  return useI18nStore.getState().setLocale(locale);
}
