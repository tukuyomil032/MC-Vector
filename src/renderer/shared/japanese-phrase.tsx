import { Fragment, type ReactNode } from 'react';
import { useI18nStore } from '../../i18n/store';
import { jaModel } from './budoux-ja-model';
import { Parser } from './budoux-parser';

/**
 * BudouX segmenter for Japanese copy. macOS WKWebView (Safari) has no
 * `word-break: auto-phrase`, so line breaks are placed at phrase boundaries here.
 */
const segmenter = new Parser(jaModel);

/** The UI language, read from the store so copy re-segments when the locale changes. */
export function useCopyLocale(): string {
  return useI18nStore((state) => state.currentLocale);
}

/**
 * Renders Japanese copy with a <wbr> at every BudouX phrase boundary. Only the ja
 * locale is segmented; other locales get the plain string. The text content is
 * unchanged, so text queries and screen readers see the same copy.
 */
export function Phrase({ text }: { text: string }): ReactNode {
  const locale = useCopyLocale();
  if (locale !== 'ja') return text;
  // Each phrase is keyed by its start offset, which is unique within the copy.
  let offset = 0;
  return (
    <span className="mv-phrase">
      {segmenter.parse(text).map((phrase) => {
        const start = offset;
        offset += phrase.length;
        return (
          <Fragment key={start}>
            {start > 0 && <wbr />}
            {phrase}
          </Fragment>
        );
      })}
    </span>
  );
}

/**
 * Splits copy into the units a word-by-word animation renders: BudouX phrases for
 * ja (separated by <wbr>), spaces for every other locale.
 */
export function copyUnits(text: string, locale: string): string[] {
  return locale === 'ja' ? segmenter.parse(text) : text.split(' ');
}
