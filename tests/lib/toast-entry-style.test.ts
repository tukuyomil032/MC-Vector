import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('toast entry wiring', () => {
  it('mounts the Arc toast stack and its notify bridge through the app feedback provider', async () => {
    const mainEntrySource = await readFile(resolve(process.cwd(), 'src/main.tsx'), 'utf8');
    const providerSource = await readFile(
      resolve(process.cwd(), 'src/renderer/components/AppFeedbackProvider.tsx'),
      'utf8',
    );

    expect(mainEntrySource).toContain(
      "import { AppFeedbackProvider } from './renderer/components/AppFeedbackProvider';",
    );
    expect(mainEntrySource).not.toContain('sonner');
    expect(providerSource).toContain(
      "import { ToastStack, ToastStackProvider } from '@/components/arc/toast-stack/toast-stack';",
    );
    expect(providerSource).toContain('<ToastStackProvider>');
    expect(providerSource).toContain('<NotifyBridge />');
    expect(providerSource).toContain('<ToastStack label={t(');
  });
});
