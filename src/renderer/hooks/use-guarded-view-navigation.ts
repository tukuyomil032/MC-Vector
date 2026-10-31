import { useCallback } from 'react';
import { useTranslation } from '../../i18n';
import { useUiStore } from '../../store/uiStore';
import { useAppFeedback } from '../components/AppFeedbackProvider';
import { hasUnsavedViewChanges } from '../components/properties/use-unsaved-changes-guard';
import type { AppView } from '../shared/server declaration';
import { requestViewChange } from '../shared/view-navigation';

/** Returns the navigation function every entry point uses. It asks before leaving a view with unsaved edits. */
export function useGuardedViewNavigation() {
  const { confirm } = useAppFeedback();
  const { t } = useTranslation();

  return useCallback(
    (view: AppView) =>
      requestViewChange({
        view,
        currentView: useUiStore.getState().currentView,
        hasUnsavedChanges: hasUnsavedViewChanges,
        confirmDiscard: () =>
          confirm({
            title: t('unsavedChanges.title'),
            description: t('unsavedChanges.description'),
            confirmLabel: t('unsavedChanges.confirm'),
            tone: 'danger',
          }),
        apply: (next) => useUiStore.getState().setCurrentView(next),
      }).then(() => undefined),
    [confirm, t],
  );
}
