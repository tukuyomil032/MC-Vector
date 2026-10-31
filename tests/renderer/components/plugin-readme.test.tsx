import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PluginReadme } from '@/renderer/components/plugin-browser/PluginReadme';

const FIXTURE = `# Veinminer

<center>
<img src="https://cdn.modrinth.com/data/abc/images/banner.png" alt="Banner" width="480" height="120" align="center">
</center>

<p align="center">Mine whole veins at once.</p>

<details>
<summary>Config</summary>

Edit \`config.yml\` after the first start.
</details>

| Option | Default | Notes |
| :-- | :-: | --: |
| limit | 64 | per vein |

Use <kbd>Shift</kbd> and H<sub>2</sub>O, x<sup>2</sup>.

[Modrinth](https://modrinth.com/mod/veinminer) and [Docs](https://example.com/docs).

<script>window.pwned = true</script>
<style>body { display: none }</style>
<iframe src="https://evil.example/frame"></iframe>
<a href="javascript:alert(1)">bad link</a>
<img src="data:image/svg+xml,%3Csvg%3E" alt="inline data">
<div onclick="window.pwned = true" style="color: red" align="center">clicky</div>
<img src="https://cdn.modrinth.com/x.png" onerror="window.pwned = true" alt="tracked">
`;

describe('PluginReadme sanitizer policy', () => {
  it('keeps the README layout HTML and drops script, style, iframe and event handlers', () => {
    const onOpenLink = vi.fn();
    const { container, getByText, queryByText } = render(
      <PluginReadme markdown={FIXTURE} onOpenLink={onOpenLink} />,
    );

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('style')).toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
    expect(queryByText('window.pwned = true')).toBeNull();
    expect(queryByText('body { display: none }')).toBeNull();
    expect(container.querySelector('[onclick]')).toBeNull();
    expect(container.querySelector('[onerror]')).toBeNull();

    // The raw style attribute is dropped; align survives on blocks that the schema allows it on.
    const clicky = getByText('clicky');
    expect(clicky.tagName).toBe('DIV');
    expect(clicky).not.toHaveAttribute('style');
    expect(clicky).toHaveAttribute('align', 'center');

    expect(container.querySelector('center')).not.toBeNull();
    expect(container.querySelector('p[align="center"]')).not.toBeNull();
    expect(container.querySelector('details > summary')).not.toBeNull();
    expect(container.querySelector('kbd')).toHaveTextContent('Shift');
    expect(container.querySelector('sub')).toHaveTextContent('2');
    expect(container.querySelector('sup')).toHaveTextContent('2');
    // GFM column alignment reaches the cell as text-align, not as a raw attribute.
    expect(getByText('Option').closest('th')).toHaveStyle({ textAlign: 'left' });
    expect(getByText('limit').closest('td')).toBeInTheDocument();
  });

  it('drops javascript and data URLs and keeps only https image sources', () => {
    const { container, getByText, queryByText } = render(
      <PluginReadme markdown={FIXTURE} onOpenLink={vi.fn()} />,
    );

    expect(getByText('bad link').closest('a')).toBeNull();
    expect(container.querySelector('img[src^="data:"]')).toBeNull();

    const banner = container.querySelector('img[alt="Banner"]');
    expect(banner).toHaveAttribute('src', 'https://cdn.modrinth.com/data/abc/images/banner.png');
    expect(banner).toHaveAttribute('loading', 'lazy');
    expect(banner).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(banner).toHaveAttribute('width', '480');
    expect(banner).toHaveAttribute('height', '120');
    expect(banner).toHaveAttribute('align', 'center');

    expect(queryByText('inline data')).toBeNull();
  });

  it('opens approved provider links through the opener and keeps other links as plain text', () => {
    const onOpenLink = vi.fn();
    const { getByText } = render(<PluginReadme markdown={FIXTURE} onOpenLink={onOpenLink} />);

    const modrinthLink = getByText('Modrinth').closest('a');
    expect(modrinthLink).not.toBeNull();
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    modrinthLink?.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(onOpenLink).toHaveBeenCalledWith('https://modrinth.com/mod/veinminer');

    const docsText = getByText('Docs');
    expect(docsText.closest('a')).toBeNull();
    fireEvent.click(docsText);
    expect(onOpenLink).toHaveBeenCalledTimes(1);
  });
});
