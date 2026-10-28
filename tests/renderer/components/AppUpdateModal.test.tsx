import { useI18nStore, useTranslation } from '@/i18n';
import AppUpdateModal from '@/renderer/components/AppUpdateModal';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dismissMock, updateNowMock } = vi.hoisted(() => ({
  dismissMock: vi.fn(),
  updateNowMock: vi.fn(),
}));

function renderUpdateModal(releaseNotes: string) {
  function UpdateModalHarness() {
    const { t } = useTranslation();
    return (
      <AppUpdateModal
        updatePrompt={{ version: '2.0.63', releaseNotes }}
        updateProgress={null}
        updateError={null}
        updateReady={false}
        t={t}
        onDismiss={dismissMock}
        onUpdateNow={updateNowMock}
        onInstall={updateNowMock}
      />
    );
  }

  return render(<UpdateModalHarness />);
}

describe('AppUpdateModal', () => {
  beforeEach(() => {
    dismissMock.mockReset();
    updateNowMock.mockReset();
    useI18nStore.setState({ currentLocale: 'en' });
  });

  it('shows plain release notes and forwards download to the shared updater handler', () => {
    renderUpdateModal('MC-Vector v2.0.63');

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('MC-Vector v2.0.63');
    expect(dialog).toHaveAttribute('data-theme', 'dark');

    const downloadButton = screen.getByTestId('update-modal-download-button');
    expect(downloadButton).toHaveClass('bg-[#5865F2]', 'text-white');
    fireEvent.click(downloadButton);

    expect(updateNowMock).toHaveBeenCalledTimes(1);
  });
});
