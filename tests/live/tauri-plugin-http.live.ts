/**
 * Node's built-in fetch is sufficient for read-only provider canaries. The
 * production adapters remain untouched; this is only their Tauri HTTP bridge
 * replacement for the isolated live-test runner.
 */
export const fetch = globalThis.fetch;
