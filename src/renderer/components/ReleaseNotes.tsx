const VISIBLE_SECTIONS = ['Breaking Changes', 'Features', 'Bug Fixes', 'Performance'] as const;
type VisibleSection = (typeof VISIBLE_SECTIONS)[number];

interface ParsedReleaseNotes {
  version: string;
  sections: Array<{ title: VisibleSection; entries: string[] }>;
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

function parseReleaseNotes(releaseNotes: unknown, fallbackVersion?: string): ParsedReleaseNotes {
  const text = getReleaseNotesText(releaseNotes);
  let version = fallbackVersion?.replace(/^v/i, '') || '';
  let currentSection: VisibleSection | null = null;
  const entries = new Map<VisibleSection, string[]>(
    VISIBLE_SECTIONS.map((section) => [section, []]),
  );

  for (const line of text.split(/\r?\n/)) {
    const releaseHeading = /^##\s+v?(\d+\.\d+\.\d+)\s*$/.exec(line.trim());
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
  const parsed = parseReleaseNotes(releaseNotes, version);
  if (parsed.sections.length === 0) return null;

  return (
    <div className={['release-notes-wrapper', className].filter(Boolean).join(' ')}>
      {label && <div className="release-notes__label">{label}</div>}
      <article className="release-notes" aria-label="Release notes">
        {parsed.version && <h3 className="release-notes__version">Version {parsed.version}</h3>}
        <div className="release-notes__content">
          {parsed.sections.map(({ title, entries: sectionEntries }) => (
            <section className="release-notes__section" key={title}>
              <h4 className="release-notes__section-title">{title}</h4>
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
          ))}
        </div>
      </article>
    </div>
  );
}
