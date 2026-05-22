import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';

const API_DIR = new URL('../src/content/docs/api/typescript', import.meta.url).pathname;

function toTitle(filename) {
  return basename(filename, extname(filename))
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.name.endsWith('.md')) {
      yield full;
    }
  }
}

async function ensureFrontmatter(filePath) {
  const content = await readFile(filePath, 'utf8');
  if (content.startsWith('---')) return;

  const title = toTitle(filePath);
  const frontmatter = `---\ntitle: ${title}\ndescription: API reference for ${title}\n---\n\n`;
  await writeFile(filePath, frontmatter + content, 'utf8');
}

let count = 0;
for await (const file of walk(API_DIR)) {
  await ensureFrontmatter(file);
  count++;
}
console.log(`[generate-api-docs] Processed ${count} files.`);
