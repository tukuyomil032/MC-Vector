import { Editor } from '@monaco-editor/react';
import { ArrowLeft, Check, Circle, FileText, Save } from 'lucide-react';
import { useState } from 'react';
import type { Translate } from '../../i18n';

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
  t: Translate;
}

function formatLanguage(language: string): string {
  if (language === 'plaintext') {
    return 'Text';
  }
  return language.charAt(0).toUpperCase() + language.slice(1);
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
  t,
}: FileEditorWorkspaceProps) {
  const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 });
  const [isEditorReady, setIsEditorReady] = useState(false);

  const parentPath = file.path.split(/[\\/]/).slice(-2, -1)[0] ?? '';

  return (
    <section className="files-view__editor-overlay" aria-label={file.name}>
      <header className="files-view__editor-header">
        <div className="files-view__editor-identity">
          <button
            type="button"
            className="files-view__editor-icon-button"
            onClick={onClose}
            aria-label={t('files.editor.close')}
            title={t('files.editor.close')}
          >
            <ArrowLeft aria-hidden="true" size={18} strokeWidth={1.8} />
          </button>
          <span className="files-view__editor-file-icon" aria-hidden="true">
            <FileText size={18} strokeWidth={1.8} />
          </span>
          <div className="files-view__editor-file-meta">
            <div className="files-view__editor-file-title">
              <strong>{file.name}</strong>
              {isDirty && (
                <span className="files-view__editor-dirty" title={t('files.editor.unsaved')}>
                  <Circle aria-hidden="true" size={8} fill="currentColor" />
                  <span className="sr-only">{t('files.editor.unsaved')}</span>
                </span>
              )}
            </div>
            <span className="files-view__editor-file-path">{parentPath}</span>
          </div>
        </div>

        <div className="files-view__editor-actions">
          <span className="files-view__editor-shortcut" aria-hidden="true">
            {navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl'} S
          </span>
          <button
            type="button"
            className="files-view__editor-save-button"
            onClick={onSave}
            disabled={!isDirty || isSaving}
            aria-label={isSaving ? t('files.editor.saving') : t('common.save')}
          >
            {isSaving ? (
              <Circle aria-hidden="true" className="files-view__editor-saving-icon" size={16} />
            ) : (
              <Save aria-hidden="true" size={16} strokeWidth={1.8} />
            )}
            <span>{isSaving ? t('files.editor.saving') : t('common.save')}</span>
          </button>
        </div>
      </header>

      <div
        className={`files-view__editor-canvas${isEditorReady ? '' : ' files-view__editor-canvas--loading'}`}
        aria-busy={!isEditorReady}
      >
        {!isEditorReady && (
          <div className="files-view__editor-canvas-loading">{t('files.loading')}</div>
        )}
        <Editor
          key={file.path}
          path={file.path}
          height="100%"
          language={language}
          theme="mc-vector-dark"
          value={content}
          beforeMount={(monaco) => {
            monaco.editor.defineTheme('mc-vector-dark', {
              base: 'vs-dark',
              inherit: true,
              rules: [],
              colors: {
                'editor.background': '#111214',
                'editor.foreground': '#e4e4e7',
                'editorCursor.foreground': '#f4f4f5',
                'editor.lineHighlightBackground': '#1d2026',
                'editorLineNumber.foreground': '#71717a',
                'editorLineNumber.activeForeground': '#f4f4f5',
                'editor.selectionBackground': '#334155',
                'editor.inactiveSelectionBackground': '#272f3d',
                'editorIndentGuide.background': '#27272a',
                'editorIndentGuide.activeBackground': '#52525b',
                'minimap.background': '#111214',
              },
            });
          }}
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
            const refreshEditor = () => {
              editor.layout();
              editor.render(true);
            };
            refreshEditor();
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
      </div>

      <footer className="files-view__editor-statusbar" aria-live="polite">
        <span>{formatLanguage(language)}</span>
        <span>{t('files.editor.encoding')}</span>
        <span>{t('files.editor.lineEnding')}</span>
        <span className="files-view__editor-position">
          {t('files.editor.lineColumn', {
            line: cursorPosition.line,
            column: cursorPosition.column,
          })}
        </span>
        <span className="files-view__editor-status">
          {isSaving ? (
            t('files.editor.saving')
          ) : isDirty ? (
            t('files.editor.unsaved')
          ) : (
            <>
              <Check aria-hidden="true" size={14} strokeWidth={2} />
              {t('files.editor.saved')}
            </>
          )}
        </span>
      </footer>
    </section>
  );
}
