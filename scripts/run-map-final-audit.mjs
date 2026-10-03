#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const requireComplete = !process.argv.includes('--report-only');
const commands = [
  {
    label: 'source/resource/builtin/version coverage',
    command: 'bun',
    args: [
      'scripts/check-map-renderer-coverage.mjs',
      '--require-all-symbols',
      '--require-all-resources',
      '--require-all-builtins',
      '--require-all-versions',
    ],
  },
  {
    label: 'real acceptance evidence',
    command: 'node',
    args: ['scripts/check-map-acceptance-evidence.mjs', '--require-complete'],
  },
  {
    label: 'renderer quality',
    command: 'bun',
    args: ['run', 'test:map:renderer:quality'],
  },
  { label: 'frontend checks', command: 'bun', args: ['run', 'check'] },
  { label: 'frontend tests', command: 'bun', args: ['run', 'test'] },
  { label: 'test typecheck', command: 'bun', args: ['run', 'typecheck:tests'] },
  { label: 'frontend build', command: 'bun', args: ['run', 'build'] },
  {
    label: 'Rust formatting',
    command: 'cargo',
    args: ['fmt', '--all', '--manifest-path', 'src-tauri/Cargo.toml', '--', '--check'],
  },
  {
    label: 'Rust library tests',
    command: 'cargo',
    args: ['test', '--manifest-path', 'src-tauri/Cargo.toml', '--lib'],
  },
  { label: 'working tree whitespace', command: 'git', args: ['diff', '--check'] },
];

const failures = [];
for (const item of commands) {
  const result = spawnSync(item.command, item.args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status === 0) {
    console.log(`PASS ${item.label}`);
    continue;
  }

  failures.push(item.label);
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
    .trim()
    .split(/\r?\n/)
    .slice(-20)
    .join('\n');
  console.error(`FAIL ${item.label}`);
  if (output) console.error(output);
}

if (failures.length > 0 && requireComplete) {
  console.error(`Map final audit failed: ${failures.join(', ')}`);
  process.exitCode = 1;
} else if (failures.length > 0) {
  console.log(`Map final audit report: ${failures.length} gate(s) unresolved`);
} else {
  console.log('Map final audit passed: all required gates are verified');
}
