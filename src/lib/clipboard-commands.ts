import { writeText } from '@tauri-apps/plugin-clipboard-manager';

export async function copyToClipboard(text: string): Promise<void> {
  await writeText(text);
}
