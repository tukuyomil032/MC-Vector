import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getTranslation } from '../../../src/i18n';
import AppUpdateModal from '../../../src/renderer/components/AppUpdateModal';
// Same stylesheet order as src/main.tsx. Arc components read the foundation tokens.
import '../../../src/components/arc/foundation.css';
import '../../../src/styles/arc-brand.css';
import '../../../src/styles/index.css';

// The app is dark-only and sets its theme on the document root. Arc tokens are scoped to that root.
document.documentElement.dataset.theme = 'dark';

const SHORT_RELEASE_NOTES = `## v2.4.0

### Breaking Changes
- **Java 17 is now required** for newly created server profiles.

### Features
- Added a searchable **release notes preview** to the update dialog.

### Bug Fixes
- Fixed stale server status after reconnecting to a stopped server.
- Kept literal <em>HTML-like</em> release note text escaped in the preview.

### Performance
- Reduced startup work when loading large plugin catalogs.

### Maintenance
- Updated internal development tooling.

### Other Changes
- Refreshed contributor documentation.`;

const LONG_RELEASE_NOTES = `## v2.4.0

### Breaking Changes
- **Java 17 is now required** for newly created server profiles.

### Features
${Array.from(
  { length: 30 },
  (_, index) =>
    `- Added feature ${index + 1}: server operators can review the update details before restarting.`,
).join('\n')}

### Bug Fixes
- Fixed stale server status after reconnecting to a stopped server.

### Performance
- Reduced startup work when loading large plugin catalogs.

### Maintenance
- Updated internal development tooling.`;

type PreviewBridge = {
  calls: string[];
  mode: 'short' | 'long';
};

declare global {
  interface Window {
    __RELEASE_NOTES_PREVIEW__?: PreviewBridge;
  }
}

function ReleaseNotesPreview() {
  const mode =
    new URLSearchParams(window.location.search).get('case') === 'long' ? 'long' : 'short';
  const calls = useRef<string[]>([]);
  const [isOpen, setIsOpen] = useState(true);
  const [actionMessage, setActionMessage] = useState('');
  const t = getTranslation();

  const record = (action: string) => {
    calls.current.push(action);
    window.__RELEASE_NOTES_PREVIEW__ = { calls: calls.current, mode };
  };

  window.__RELEASE_NOTES_PREVIEW__ = { calls: calls.current, mode };

  return (
    <div className="app-shell flex h-screen w-screen theme-dark" data-theme="dark">
      <div data-testid="release-notes-preview" data-action-message={actionMessage} />
      <AppUpdateModal
        open={isOpen}
        onSkipVersion={() => undefined}
        updatePrompt={
          isOpen
            ? {
                version: '2.4.0',
                releaseNotes: mode === 'long' ? LONG_RELEASE_NOTES : SHORT_RELEASE_NOTES,
              }
            : null
        }
        updateProgress={null}
        updateError={null}
        updateReady={false}
        t={t}
        onDismiss={() => {
          record('dismiss');
          setIsOpen(false);
        }}
        onUpdateNow={() => {
          record('update');
          setActionMessage('update-requested');
        }}
        onInstall={() => {
          record('install');
          setActionMessage('install-requested');
        }}
      />
    </div>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(<ReleaseNotesPreview />);
