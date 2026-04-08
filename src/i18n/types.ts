/**
 * i18n Type Definitions
 *
 * Defines locale codes, translation dictionary structure, and type-safe key paths.
 */

/**
 * Supported locale codes.
 * - 'en': English (default)
 * - 'ja': Japanese
 * - 'ko': Korean (reserved for future)
 * - 'zh': Chinese (reserved for future)
 */
export type LocaleCode = 'en' | 'ja' | 'ko' | 'zh';

/**
 * Default locale when none is specified or saved.
 */
export const DEFAULT_LOCALE: LocaleCode = 'en';

/**
 * Hierarchical translation dictionary structure.
 * Organized by feature/component for maintainability.
 */
export interface TranslationDictionary {
  /** Common UI elements used across the app */
  common: {
    ok: string;
    cancel: string;
    save: string;
    delete: string;
    edit: string;
    create: string;
    close: string;
    back: string;
    next: string;
    loading: string;
    error: string;
    success: string;
    confirm: string;
    yes: string;
    no: string;
    search: string;
    refresh: string;
    copy: string;
    paste: string;
  };

  /** Settings page translations */
  settings: {
    title: string;
    language: {
      title: string;
      description: string;
    };
    theme: {
      title: string;
      description: string;
      options: {
        dark: string;
        darkBlue: string;
        grey: string;
        forest: string;
        sunset: string;
        neon: string;
        coffee: string;
        ocean: string;
        system: string;
      };
    };
    general: {
      title: string;
    };
    advanced: {
      title: string;
    };
  };

  /** Server management translations */
  server: {
    title: string;
    create: {
      title: string;
      name: string;
      version: string;
      type: string;
      description: string;
    };
    list: {
      empty: string;
      running: string;
      stopped: string;
    };
    actions: {
      start: string;
      stop: string;
      restart: string;
      backup: string;
      delete: string;
      openFolder: string;
    };
    console: {
      title: string;
      placeholder: string;
    };
  };

  /** Plugin management translations */
  plugins: {
    title: string;
    search: {
      placeholder: string;
      noResults: string;
    };
    install: {
      button: string;
      success: string;
      error: string;
    };
    installed: {
      title: string;
      empty: string;
    };
    sources: {
      modrinth: string;
      hangar: string;
      spigot: string;
    };
  };

  /** Navigation translations */
  nav: {
    home: string;
    servers: string;
    plugins: string;
    settings: string;
  };

  /** Error messages */
  errors: {
    generic: string;
    network: string;
    notFound: string;
    permission: string;
    validation: string;
  };
}

/**
 * Utility type to generate dot-notation keys from nested object structure.
 * E.g., { common: { ok: string } } -> 'common.ok'
 */
export type NestedKeyOf<T, Prefix extends string = ''> = T extends object
  ? {
      [K in keyof T & string]: T[K] extends object
        ? NestedKeyOf<T[K], `${Prefix}${Prefix extends '' ? '' : '.'}${K}`>
        : `${Prefix}${Prefix extends '' ? '' : '.'}${K}`;
    }[keyof T & string]
  : never;

/**
 * All valid translation keys as dot-notation strings.
 * Provides autocomplete support in IDEs.
 */
export type TranslationKey = NestedKeyOf<TranslationDictionary>;

/**
 * Parameters for interpolation in translation strings.
 * E.g., t('greeting', { name: 'John' }) for "Hello, {name}!"
 */
export type TranslationParams = Record<string, string | number>;

/**
 * Type guard to check if a value is a valid LocaleCode.
 */
export function isValidLocaleCode(value: unknown): value is LocaleCode {
  return typeof value === 'string' && ['en', 'ja', 'ko', 'zh'].includes(value);
}
