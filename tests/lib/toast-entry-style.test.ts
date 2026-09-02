import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('toast entry styling', () => {
  it('statically imports Sonner CSS from the app entrypoint', async () => {
    const mainEntryPath = resolve(process.cwd(), 'src/main.tsx');
    const mainEntrySource = await readFile(mainEntryPath, 'utf8');

    expect(mainEntrySource).toContain("import 'sonner/dist/styles.css';");
  });
});
