import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const repositoryRoot = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const tauriRoot = join(repositoryRoot, 'src-tauri');
const rendererRoot = join(tauriRoot, 'crates', 'map-renderer-core', 'src');

function rustFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return rustFiles(path);
    return entry.name.endsWith('.rs') ? [path] : [];
  });
}

const forbidden = /#\[allow\s*\(\s*(?:dead_code|unused(?:_.*)?)\s*\)\]/;
for (const file of rustFiles(rendererRoot)) {
  if (forbidden.test(readFileSync(file, 'utf8'))) {
    console.error(`Renderer warning suppression is forbidden: ${relative(repositoryRoot, file)}`);
    process.exit(1);
  }
}

const commands = [
  ['cargo', ['fmt', '--all', '--', '--check']],
  ['cargo', ['check', '-p', 'map-renderer-core']],
  ['cargo', ['clippy', '-p', 'map-renderer-core', '--', '-D', 'warnings']],
  ['cargo', ['test', '-p', 'map-renderer-core']],
];

for (const [command, args] of commands) {
  console.log(`$ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { cwd: tauriRoot, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
