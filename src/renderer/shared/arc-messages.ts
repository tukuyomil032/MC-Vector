import { useMemo } from 'react';
import type { CodeBlockMessages } from '@/components/arc/code-block/code-block';
import type { CopyButtonMessages } from '@/components/arc/copy-button/copy-button';
import type { LineChartMessages } from '@/components/arc/line-chart/line-chart';
import { useTranslation } from '../../i18n';

/**
 * Translated copy for shared Arc parts. The Arc components keep English defaults for
 * stand-alone use; app call sites pass these objects so every visible or spoken word follows the locale.
 */
export function useArcMessages() {
  const { t } = useTranslation();

  return useMemo(() => {
    const copy: CopyButtonMessages = {
      copied: t('arcUi.copy.copied'),
      failed: t('arcUi.copy.failed'),
    };

    const codeBlock: CodeBlockMessages = {
      copyCode: t('arcUi.codeBlock.copyCode'),
      copied: copy.copied,
      failed: copy.failed,
      sourceLabel: (name) => t('arcUi.codeBlock.sourceLabel', { name }),
      untitled: t('arcUi.codeBlock.untitled'),
      selectable: t('arcUi.codeBlock.selectable'),
      showAll: (count) => t('arcUi.codeBlock.showAll', { count }),
      showFewer: t('arcUi.codeBlock.showFewer'),
    };

    const lineChart: LineChartMessages = {
      chooseSeries: t('arcUi.lineChart.chooseSeries'),
      seriesShown: (shown, total) => t('arcUi.lineChart.seriesShown', { shown, total }),
      seriesGroup: (label) => t('arcUi.lineChart.seriesGroup', { label }),
      exploreBy: (label, category) => t('arcUi.lineChart.exploreBy', { label, category }),
      summaryEmpty: (label, empty) => t('arcUi.lineChart.summaryEmpty', { label, empty }),
      summaryRange: (label, from, to) => t('arcUi.lineChart.summaryRange', { label, from, to }),
      summaryLatest: (name, value) => t('arcUi.lineChart.summaryLatest', { name, value }),
      reading: (time, values) => t('arcUi.lineChart.reading', { time, values }),
      loading: t('arcUi.lineChart.loading'),
    };

    return {
      copy,
      codeBlock,
      lineChart,
      search: { clear: t('arcUi.search.clear') },
      select: { placeholder: t('arcUi.select.placeholder') },
      checkbox: { fallback: t('arcUi.checkbox.fallback') },
    };
  }, [t]);
}
