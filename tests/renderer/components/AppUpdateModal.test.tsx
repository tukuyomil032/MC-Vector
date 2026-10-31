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
        open
        updatePrompt={{ version: '2.0.63', releaseNotes }}
        onSkipVersion={vi.fn()}
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
    expect(dialog).toHaveTextContent('Version 2.0.63 is available');
    expect(dialog).toHaveTextContent('MC-Vector v2.0.63');

    const downloadButton = screen.getByTestId('update-modal-download-button');
    // The legacy accent button is now the Arc primary variant (CSS module class names carry the variant).
    expect(downloadButton.className).toMatch(/_primary_/);
    fireEvent.click(downloadButton);

    expect(updateNowMock).toHaveBeenCalledTimes(1);
  });
});
