import type { TranslationKey } from '../../i18n';
import { useTranslation } from '../../i18n';

// Release notes are written in English, so the section headings are matched in English and shown translated.
const VISIBLE_SECTIONS = ['Breaking Changes', 'Features', 'Bug Fixes', 'Performance'] as const;
type VisibleSection = (typeof VISIBLE_SECTIONS)[number];

const SECTION_KEYS: Record<VisibleSection, TranslationKey> = {
  'Breaking Changes': 'releaseNotes.sections.breaking',
  Features: 'releaseNotes.sections.features',
  'Bug Fixes': 'releaseNotes.sections.fixes',
  Performance: 'releaseNotes.sections.performance',
};

interface ParsedReleaseNotes {
  version: string;
  sections: Array<{ title: VisibleSection; entries: string[] }>;
  plainText: string;
}

function getReleaseNotesText(releaseNotes: unknown): string {
  if (typeof releaseNotes === 'string') return releaseNotes;
  if (!Array.isArray(releaseNotes)) return '';

  return releaseNotes
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      if (
        entry &&
        typeof entry === 'object' &&
        'body' in entry &&
        typeof (entry as Record<string, unknown>).body === 'string'
      ) {
        return (entry as Record<string, unknown>).body as string;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

export function parseReleaseNotes(
  releaseNotes: unknown,
  fallbackVersion?: string,
): ParsedReleaseNotes {
  const text = getReleaseNotesText(releaseNotes);
  let version = fallbackVersion?.replace(/^v/i, '') || '';
  let currentSection: VisibleSection | null = null;
  let hasMarkdownStructure = false;
  const entries = new Map<VisibleSection, string[]>(
    VISIBLE_SECTIONS.map((section) => [section, []]),
  );

  for (const line of text.split(/\r?\n/)) {
    if (/^\s{0,3}#{1,6}\s/.test(line)) hasMarkdownStructure = true;

    const releaseHeading = /^##\s+v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\s*$/.exec(line.trim());
    if (releaseHeading) {
      if (!version) version = releaseHeading[1];
      currentSection = null;
      continue;
    }

    const sectionHeading = /^###\s+(.+?)\s*$/.exec(line.trim());
    if (sectionHeading) {
      const title = sectionHeading[1] as VisibleSection;
      currentSection = VISIBLE_SECTIONS.includes(title) ? title : null;
      continue;
    }

    if (!currentSection) continue;
    const bullet = /^\s*[-*]\s+(.+?)\s*$/.exec(line);
    if (bullet) entries.get(currentSection)?.push(bullet[1]);
  }

  return {
    version,
    sections: VISIBLE_SECTIONS.flatMap((title) => {
      const sectionEntries = entries.get(title) ?? [];
      return sectionEntries.length > 0 ? [{ title, entries: sectionEntries }] : [];
    }),
    plainText: hasMarkdownStructure ? '' : text.trim(),
  };
}

function renderInlineText(text: string) {
  const occurrences = new Map<string, number>();
  return text.split(/(\*\*[^*]+\*\*)/g).map((part) => {
    const occurrence = occurrences.get(part) ?? 0;
    occurrences.set(part, occurrence + 1);
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={`bold-${part}-${occurrence}`}>
          {part.slice(2, -2).replace(/\\([\\`*_{}\u005B\u005D()#+.!|<>-])/g, '$1')}
        </strong>
      );
    }
    return part.replace(/\\([\\`*_{}\u005B\u005D()#+.!|<>-])/g, '$1');
  });
}

export default function ReleaseNotes({
  releaseNotes,
  version,
  label,
  className,
}: {
  releaseNotes: unknown;
  version?: string;
  label?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const parsed = parseReleaseNotes(releaseNotes, version);
  if (parsed.sections.length === 0 && !parsed.plainText) return null;

  return (
    <div className={['release-notes-wrapper', className].filter(Boolean).join(' ')}>
      {label && <div className="release-notes__label">{label}</div>}
      <article className="release-notes" aria-label={t('releaseNotes.ariaLabel')}>
        {parsed.version && (
          <h3 className="release-notes__version">
            {t('releaseNotes.version', { version: parsed.version })}
          </h3>
        )}
        <div className="release-notes__content">
          {parsed.sections.length === 0 ? (
            <p className="release-notes__plain-text whitespace-pre-wrap">{parsed.plainText}</p>
          ) : (
            parsed.sections.map(({ title, entries: sectionEntries }) => (
              <section className="release-notes__section" key={title}>
                <h4 className="release-notes__section-title">{t(SECTION_KEYS[title])}</h4>
                <ul className="release-notes__list">
                  {(() => {
                    const occurrences = new Map<string, number>();
                    return sectionEntries.map((entry) => {
                      const occurrence = occurrences.get(entry) ?? 0;
                      occurrences.set(entry, occurrence + 1);
                      return (
                        <li className="release-notes__item" key={`${title}-${entry}-${occurrence}`}>
                          {renderInlineText(entry)}
                        </li>
                      );
                    });
                  })()}
                </ul>
              </section>
            ))
          )}
        </div>
      </article>
    </div>
  );
}
