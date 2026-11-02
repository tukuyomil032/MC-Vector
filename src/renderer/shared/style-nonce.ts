/** Name of the meta tag in index.html whose content Tauri replaces with the style-src nonce. */
export const STYLE_NONCE_META_NAME = 'mcv-style-nonce';

/**
 * The CSP nonce for `<style>` tags created at runtime, or undefined when the page has none.
 * Outside a Tauri build (vite dev, tests) the token is left as is, and there is no CSP to satisfy.
 */
export function readStyleNonce(doc: Document = document): string | undefined {
  const content = doc
    .querySelector(`meta[name="${STYLE_NONCE_META_NAME}"]`)
    ?.getAttribute('content')
    ?.trim();
  if (!content || content.startsWith('__TAURI_')) {
    return undefined;
  }
  return content;
}
