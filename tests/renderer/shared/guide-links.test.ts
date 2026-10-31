import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isAllowedGuideUrl, openGuideLink } from '@/renderer/shared/guide-links';

const { openUrlMock } = vi.hoisted(() => ({ openUrlMock: vi.fn() }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: openUrlMock }));

describe('guide links', () => {
  beforeEach(() => {
    openUrlMock.mockReset();
  });

  it('allows https links on the guide hosts only', () => {
    expect(isAllowedGuideUrl('https://papermc.io/downloads/velocity')).toBe(true);
    expect(isAllowedGuideUrl('https://docs.papermc.io/velocity/')).toBe(true);
    expect(isAllowedGuideUrl('https://dashboard.ngrok.com/get-started/your-authtoken')).toBe(true);

    expect(isAllowedGuideUrl('http://papermc.io/')).toBe(false);
    expect(isAllowedGuideUrl('https://evil.example/papermc.io')).toBe(false);
    expect(isAllowedGuideUrl('https://user@papermc.io/')).toBe(false);
    expect(isAllowedGuideUrl('https://papermc.io:8443/')).toBe(false);
    expect(isAllowedGuideUrl('https://papermc.io/#fragment')).toBe(false);
    expect(isAllowedGuideUrl('not a url')).toBe(false);
  });

  it('opens an allowed link through the opener plugin', async () => {
    openUrlMock.mockResolvedValue(undefined);

    await expect(openGuideLink('https://papermc.io/downloads/velocity')).resolves.toBe(true);
    expect(openUrlMock).toHaveBeenCalledWith('https://papermc.io/downloads/velocity');
  });

  it('refuses a blocked link without calling the opener', async () => {
    await expect(openGuideLink('https://evil.example/')).resolves.toBe(false);
    expect(openUrlMock).not.toHaveBeenCalled();
  });

  it('reports false when the opener fails', async () => {
    openUrlMock.mockRejectedValue(new Error('no browser available'));

    await expect(openGuideLink('https://papermc.io/')).resolves.toBe(false);
  });
});
