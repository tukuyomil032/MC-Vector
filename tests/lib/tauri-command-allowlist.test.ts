import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ALLOWED_TAURI_COMMANDS } from '@/lib/tauri-command-allowlist';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

/** Command names registered in the Rust `generate_handler!` list (last path segment of each entry). */
function registeredCommands(): Set<string> {
  const lib = readFileSync(resolve(repoRoot, 'src-tauri/src/lib.rs'), 'utf8');
  const start = lib.indexOf('generate_handler![');
  expect(start, 'generate_handler! not found in src-tauri/src/lib.rs').toBeGreaterThan(-1);
  const body = lib
    .slice(start, lib.indexOf(']', start))
    // Drop line comments such as `// ngrok` so section labels are not read as commands.
    .replace(/\/\/[^\n]*/g, '');
  const names = [...body.matchAll(/(?:\w+::)*(\w+)\s*,?/g)]
    .map((match) => match[1])
    .filter((name) => name !== 'generate_handler');
  return new Set(names);
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

describe('Tauri command allowlist', () => {
  it('only allows commands that the Rust side registers', () => {
    const registered = registeredCommands();
    const unknown = [...ALLOWED_TAURI_COMMANDS].filter((name) => !registered.has(name));
    expect(unknown).toEqual([]);
  });

  it('allows every registered command that the renderer refers to', () => {
    // A registered command that the renderer names but the allowlist omits is rejected at runtime
    // by tauriInvoke ("Blocked tauri command"), so the feature fails in every build.
    const registered = registeredCommands();
    const allowlistFile = resolve(repoRoot, 'src/lib/tauri-command-allowlist.ts');
    const referenced = new Set<string>();
    for (const file of sourceFiles(resolve(repoRoot, 'src'))) {
      if (file === allowlistFile) continue;
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/['"`]([a-z][a-z0-9_]*)['"`]/g)) {
        if (registered.has(match[1])) referenced.add(match[1]);
      }
    }
    const blocked = [...referenced].filter((name) => !ALLOWED_TAURI_COMMANDS.has(name)).sort();
    expect(blocked).toEqual([]);
  });
});
