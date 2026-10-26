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
});
