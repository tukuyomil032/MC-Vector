import { useI18nStore } from '@/i18n';
import NgrokGuideView from '@/renderer/components/NgrokGuideView';
import ProxyHelpView from '@/renderer/components/ProxyHelpView';
import { useUiStore } from '@/store/uiStore';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { openUrlMock } = vi.hoisted(() => ({ openUrlMock: vi.fn() }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: openUrlMock }));

describe('guide views', () => {
  beforeEach(() => {
    useI18nStore.setState({ currentLocale: 'en' });
    useUiStore.setState({ currentView: 'dashboard', previousView: null });
    openUrlMock.mockReset();
  });

  it('opens the Velocity download through the opener plugin', async () => {
    openUrlMock.mockResolvedValue(undefined);
    render(<ProxyHelpView />);

    fireEvent.click(screen.getByRole('button', { name: 'Open Paper (Velocity)' }));

    await waitFor(() =>
      expect(openUrlMock).toHaveBeenCalledWith('https://papermc.io/downloads/velocity'),
    );
  });

  it('goes back to the view that opened the proxy guide', () => {
    useUiStore.setState({ currentView: 'proxy-help', previousView: 'proxy' });
    render(<ProxyHelpView />);

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(useUiStore.getState().currentView).toBe('proxy');
  });

  it('goes back to the view that opened the ngrok guide', () => {
    useUiStore.setState({ currentView: 'ngrok-guide', previousView: 'general-settings' });
    render(<NgrokGuideView />);

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(useUiStore.getState().currentView).toBe('general-settings');
  });

  it('closes the proxy guide with a success alert instead of an emoji', () => {
    render(<ProxyHelpView />);

    expect(
      screen.getByText('Setup complete. Start the proxy server and test your connections.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('proxy-help-view').textContent).not.toMatch(/\u{1F310}|\u{1F389}/u);
  });
});
