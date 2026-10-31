import { Editor, type Monaco } from '@monaco-editor/react';
import { ArrowLeft, Check, Circle, FileText, Save } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/arc/button/button';
import { Tooltip } from '@/components/arc/tooltip/tooltip';
import type { Translate } from '../../i18n';
import { EmptyLine } from './ui/EmptyLine';
import styles from './FileEditorWorkspace.module.css';

/** Why a file opens without an editor: binary files are not text, and large files are too slow to edit in Monaco. */
export type UnsupportedReason = 'binary' | 'large';

/** Files above this size are not read into the editor. */
export const MAX_EDITABLE_MEGABYTES = 5;

interface FileEditorWorkspaceProps {
  file: {
    name: string;
    path: string;
  };
  content: string;
  language: string;
  isDirty: boolean;
  isSaving: boolean;
  onChange: (content: string) => void;
  onSave: () => void;
  onClose: () => void;
  /** Set when the file cannot be edited. The editor is replaced by an explanation and nothing is loaded. */
  unsupported?: UnsupportedReason | null;
  t: Translate;
}

/** Theme name used by every Monaco instance in the app. It is defined from the Arc tokens on each mount. */
const ARC_MONACO_THEME = 'mc-vector-arc';

const COLOR_PROBE = '#010203';

function toHexChannel(value: number): string {
  return value.toString(16).padStart(2, '0');
}

/**
 * Resolves a CSS color token, such as an oklch() value, to the hex form Monaco accepts. A token that is missing or
 * not a valid color resolves to the fallback.
 */
function resolveMonacoColor(token: string, fallback: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  const context = document.createElement('canvas').getContext('2d');
  if (!raw || !context) {
    return fallback;
  }
  // An invalid value leaves the previous fill in place, so the probe color shows that nothing was accepted.
  context.fillStyle = COLOR_PROBE;
  context.fillStyle = raw;
  if (context.fillStyle === COLOR_PROBE) {
    return fallback;
  }
  context.fillRect(0, 0, 1, 1);
  const [red = 0, green = 0, blue = 0, alpha = 255] = context.getImageData(0, 0, 1, 1).data;
  const hex = `#${toHexChannel(red)}${toHexChannel(green)}${toHexChannel(blue)}`;
  return alpha === 255 ? hex : `${hex}${toHexChannel(alpha)}`;
}

function isDarkHex(hex: string): boolean {
  if (!/^#[0-9a-f]{6}/i.test(hex)) {
    return true;
  }
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255 < 0.5;
}

/** Defines the Arc theme for Monaco. The editor calls it from beforeMount. */
function defineArcMonacoTheme(monaco: Monaco): void {
  const background = resolveMonacoColor('--surface', '#1d1e21');
  monaco.editor.defineTheme(ARC_MONACO_THEME, {
    base: isDarkHex(background) ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': background,
      'editor.foreground': resolveMonacoColor('--foreground', '#e4e4e7'),
      'editorCursor.foreground': resolveMonacoColor('--foreground', '#e4e4e7'),
      'editor.lineHighlightBackground': resolveMonacoColor('--surface-muted', '#26282d'),
      'editorLineNumber.foreground': resolveMonacoColor('--text-muted', '#8a8d94'),
      'editorLineNumber.activeForeground': resolveMonacoColor('--foreground', '#e4e4e7'),
      'editor.selectionBackground': resolveMonacoColor('--accent-subtle', '#3a3d44'),
      'editor.inactiveSelectionBackground': resolveMonacoColor('--surface-muted', '#26282d'),
      'editorIndentGuide.background': resolveMonacoColor('--border', '#33363c'),
      'editorIndentGuide.activeBackground': resolveMonacoColor('--border-strong', '#4a4e57'),
      'minimap.background': background,
    },
  });
}

function formatLanguage(language: string, t: Translate): string {
  if (language === 'plaintext') {
    return t('files.editor.plainText');
  }
  return language.charAt(0).toUpperCase() + language.slice(1);
}

function isMacPlatform(): boolean {
  return navigator.platform.toLowerCase().includes('mac');
}

export default function FileEditorWorkspace({
  file,
  content,
  language,
  isDirty,
  isSaving,
  onChange,
  onSave,
  onClose,
  unsupported = null,
  t,
}: FileEditorWorkspaceProps) {
  const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 });
  const [isEditorReady, setIsEditorReady] = useState(false);

  const parentPath = file.path.split(/[\\/]/).slice(-2, -1)[0] ?? '';
  const shortcut = isMacPlatform() ? '⌘S' : 'Ctrl+S';
  const saveState = unsupported ? 'readonly' : isSaving ? 'saving' : isDirty ? 'unsaved' : 'saved';
  const saveStateLabel = {
    saving: t('files.editor.saving'),
    unsaved: t('files.editor.unsaved'),
    saved: t('files.editor.saved'),
    readonly: t('files.editor.readOnly'),
  }[saveState];

  return (
    <section className={styles.workspace} aria-label={file.name}>
      <header className={styles.header}>
        <div className={styles.identity}>
          <Tooltip content={t('files.editor.close')} side="bottom">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={styles.backButton}
              aria-label={t('files.editor.close')}
              onClick={onClose}
            >
              <ArrowLeft aria-hidden="true" size={18} strokeWidth={1.75} />
            </Button>
          </Tooltip>
          <span className={styles.fileIcon} aria-hidden="true">
            <FileText size={18} strokeWidth={1.75} />
          </span>
          <div className={styles.fileMeta}>
            <div className={styles.fileTitle}>
              <strong>{file.name}</strong>
              {isDirty && (
                <Tooltip content={t('files.editor.unsaved')} side="bottom">
                  <span className={styles.dirty}>
                    <Circle aria-hidden="true" size={8} fill="currentColor" />
                    <span className="sr-only">{t('files.editor.unsaved')}</span>
                  </span>
                </Tooltip>
              )}
            </div>
            <span className={styles.filePath}>{parentPath}</span>
          </div>
        </div>

        <div className={styles.actions}>
          <Tooltip content={t('files.editor.saveShortcut', { shortcut })} side="bottom">
            <kbd className={styles.shortcut}>{shortcut}</kbd>
          </Tooltip>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!isDirty || isSaving}
            loading={isSaving}
            onClick={onSave}
          >
            <Save aria-hidden="true" size={16} strokeWidth={1.75} />
            {isSaving ? t('files.editor.saving') : t('common.save')}
          </Button>
        </div>
      </header>

      <div className={styles.canvas} aria-busy={!isEditorReady}>
        {unsupported ? (
          <div className={styles.unsupported}>
            <EmptyLine title={t('files.editor.unsupportedTitle')} />
          </div>
        ) : (
          <>
            {!isEditorReady && (
              <div className={styles.loading} role="status">
                {t('files.loading')}
              </div>
            )}
            <Editor
              key={file.path}
              path={file.path}
              height="100%"
              language={language}
              theme={ARC_MONACO_THEME}
              value={content}
              beforeMount={defineArcMonacoTheme}
              onChange={(value) => onChange(value ?? '')}
              onMount={(editor) => {
                const updateCursorPosition = () => {
                  const position = editor.getPosition();
                  if (position) {
                    setCursorPosition({ line: position.lineNumber, column: position.column });
                  }
                };
                updateCursorPosition();
                editor.onDidChangeCursorPosition(updateCursorPosition);
                let isDisposed = false;
                let renderFrame = 0;
                const refreshEditor = () => {
                  if (isDisposed) {
                    return;
                  }
                  editor.layout();
                  editor.render(true);
                };
                const scheduleRender = () => {
                  if (isDisposed || renderFrame !== 0) {
                    return;
                  }
                  renderFrame = requestAnimationFrame(() => {
                    renderFrame = 0;
                    refreshEditor();
                    requestAnimationFrame(refreshEditor);
                  });
                };
                refreshEditor();
                editor.onDidScrollChange(scheduleRender);
                editor.onDidLayoutChange(scheduleRender);
                editor.onDidDispose(() => {
                  isDisposed = true;
                  if (renderFrame !== 0) {
                    cancelAnimationFrame(renderFrame);
                  }
                });
                requestAnimationFrame(() => {
                  refreshEditor();
                  setIsEditorReady(true);
                  requestAnimationFrame(() => {
                    refreshEditor();
                    editor.focus();
                  });
                });
              }}
              options={{
                automaticLayout: true,
                cursorBlinking: 'smooth',
                cursorStyle: 'line',
                fontSize: 14,
                lineHeight: 22,
                minimap: { enabled: true },
                overviewRulerBorder: false,
                padding: { top: 16, bottom: 16 },
                renderLineHighlight: 'all',
                renderWhitespace: 'selection',
                scrollBeyondLastLine: false,
                smoothScrolling: false,
              }}
            />
          </>
        )}
      </div>

      <footer className={styles.statusbar} aria-live="polite">
        <span>{formatLanguage(language, t)}</span>
        <span>{t('files.editor.encoding')}</span>
        <span>{t('files.editor.lineEnding')}</span>
        <span className={styles.position}>
          {t('files.editor.lineColumn', {
            line: cursorPosition.line,
            column: cursorPosition.column,
          })}
        </span>
        <span className={styles.saveState} data-state={saveState}>
          {saveState === 'saved' && <Check aria-hidden="true" size={14} strokeWidth={2} />}
          {saveStateLabel}
        </span>
      </footer>
    </section>
  );
}
