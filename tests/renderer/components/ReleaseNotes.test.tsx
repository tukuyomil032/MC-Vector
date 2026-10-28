import { render, screen } from '@testing-library/react';
import { parseReleaseNotes } from '@/renderer/components/ReleaseNotes';
import ReleaseNotes from '@/renderer/components/ReleaseNotes';
import { describe, expect, it } from 'vitest';

describe('ReleaseNotes', () => {
  it('parses prerelease semver headings without dropping the prerelease suffix', () => {
    const parsed = parseReleaseNotes(`
## v2.0.64-beta.2
### Features
- Try the beta updater feed
`);

    expect(parsed.version).toBe('2.0.64-beta.2');
    expect(parsed.sections).toEqual([
      { title: 'Features', entries: ['Try the beta updater feed'] },
    ]);
  });

  it('renders the complete prerelease version in the DOM', () => {
    render(
      <ReleaseNotes
        releaseNotes={'## v2.0.64-beta.2\n### Features\n- Try the beta updater feed'}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Version 2.0.64-beta.2' })).toBeInTheDocument();
  });

  it('renders structured changelog sections and inline bold text', () => {
    render(
      <ReleaseNotes
        releaseNotes={'## v2.0.64\n### Features\n- Added **shared updater checks**.'}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Features' })).toBeInTheDocument();
    expect(screen.getByText('shared updater checks')).toBeInTheDocument();
  });

  it('renders non-empty plain-text notes as text without creating HTML elements', () => {
    render(<ReleaseNotes releaseNotes="MC-Vector v2.0.63" version="2.0.63" />);

    expect(screen.getByText('MC-Vector v2.0.63')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Version 2.0.63' })).toBeInTheDocument();
  });

  it('renders HTML-like plain text as text instead of injecting it', () => {
    render(<ReleaseNotes releaseNotes={'<img src=x onerror="alert(1)">'} />);

    expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });

  it('does not expose unsupported structured sections as raw Markdown', () => {
    const parsed = parseReleaseNotes('## v2.0.64\n### Maintenance\n- Internal tooling updates');

    expect(parsed.sections).toEqual([]);
    expect(parsed.plainText).toBe('');
    render(<ReleaseNotes releaseNotes="## v2.0.64\n### Maintenance\n- Internal tooling updates" />);
    expect(screen.queryByText('### Maintenance')).not.toBeInTheDocument();
    expect(screen.queryByText('- Internal tooling updates')).not.toBeInTheDocument();
  });
});
