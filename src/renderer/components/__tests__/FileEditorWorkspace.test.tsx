import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Translate } from '../../../i18n';
import FileEditorWorkspace from '../FileEditorWorkspace';

vi.mock('@monaco-editor/react', () => ({
  Editor: ({ value, onChange }: { value: string; onChange?: (value: string) => void }) => (
    <textarea
      data-testid="monaco-editor"
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));

const translate = ((key: string, params?: Record<string, string | number>) => {
  if (key === 'files.editor.lineColumn') {
    return `Ln ${params?.line}, Col ${params?.column}`;
  }
  return key;
}) as Translate;

function renderWorkspace(isDirty = false) {
  return render(
    <FileEditorWorkspace
      file={{ name: 'server.properties', path: '/servers/Test/server.properties' }}
      content="motd=Test"
      language="ini"
      isDirty={isDirty}
      isSaving={false}
      onChange={vi.fn()}
      onSave={vi.fn()}
      onClose={vi.fn()}
      t={translate}
    />,
  );
}

describe('FileEditorWorkspace', () => {
  it('keeps save disabled until the file is dirty and exposes the editor path', () => {
    renderWorkspace();

    expect(screen.getByText('server.properties')).toBeInTheDocument();
    expect(screen.getByText('Test')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'common.save' })).toBeDisabled();
  });

  it('shows the save action once the parent marks the file dirty', () => {
    renderWorkspace(true);

    expect(screen.getByRole('button', { name: 'common.save' })).toBeEnabled();
    expect(screen.getAllByText('files.editor.unsaved').length).toBeGreaterThan(0);
  });

  it('renders the editor content through the Monaco boundary', () => {
    const onChange = vi.fn();
    render(
      <FileEditorWorkspace
        file={{ name: 'server.properties', path: '/servers/Test/server.properties' }}
        content="motd=Test"
        language="ini"
        isDirty={false}
        isSaving={false}
        onChange={onChange}
        onSave={vi.fn()}
        onClose={vi.fn()}
        t={translate}
      />,
    );

    expect(screen.getByTestId('monaco-editor')).toHaveValue('motd=Test');
    fireEvent.change(screen.getByTestId('monaco-editor'), { target: { value: 'motd=Updated' } });
    expect(onChange).toHaveBeenCalledWith('motd=Updated');
  });
});
