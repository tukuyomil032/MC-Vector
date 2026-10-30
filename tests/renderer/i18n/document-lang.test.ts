import { describe, expect, it } from 'vitest';
import { useI18nStore } from '@/i18n/store';

describe('document language', () => {
  it('follows the active locale', () => {
    useI18nStore.setState({ currentLocale: 'ja' });
    expect(document.documentElement.lang).toBe('ja');

    useI18nStore.setState({ currentLocale: 'en' });
    expect(document.documentElement.lang).toBe('en');
  });
});
