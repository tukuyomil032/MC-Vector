import { readFileSync } from 'node:fs';
import { readStyleNonce, STYLE_NONCE_META_NAME } from '@/renderer/shared/style-nonce';
import { describe, expect, it } from 'vitest';

function documentWith(content?: string): Document {
  const doc = document.implementation.createHTMLDocument('nonce');
  if (content !== undefined) {
    const meta = doc.createElement('meta');
    meta.name = STYLE_NONCE_META_NAME;
    meta.content = content;
    doc.head.append(meta);
  }
  return doc;
}

describe('readStyleNonce', () => {
  it('returns the nonce Tauri wrote into the meta tag', () => {
    expect(readStyleNonce(documentWith('8237461923'))).toBe('8237461923');
  });

  it('ignores the token left in place outside a Tauri build', () => {
    expect(readStyleNonce(documentWith('__TAURI_STYLE_NONCE__'))).toBeUndefined();
  });

  it('returns undefined when the meta tag is missing or empty', () => {
    expect(readStyleNonce(documentWith())).toBeUndefined();
    expect(readStyleNonce(documentWith('  '))).toBeUndefined();
  });

  it('is wired into index.html with the token Tauri replaces', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toContain(
      `<meta name="${STYLE_NONCE_META_NAME}" content="__TAURI_STYLE_NONCE__" />`,
    );
  });
});
