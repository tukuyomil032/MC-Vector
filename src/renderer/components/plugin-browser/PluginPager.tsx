import { Button } from '@/components/arc/button/button';
import { Input } from '@/components/arc/input/input';
import { Pagination } from '@/components/arc/pagination/pagination';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { FormEvent } from 'react';
import { useTranslation } from '../../../i18n';
import styles from './plugin-browser.module.css';

interface PluginPagerProps {
  /** Zero-based page index. */
  page: number;
  /** Known page count. Null when the provider does not report one. */
  totalPages: number | null;
  hasNextPage: boolean;
  loading: boolean;
  pageInput: string;
  onPageInputChange: (value: string) => void;
  onJump: () => void;
  onPageChange: (page: number) => void;
}

export function PluginPager({
  page,
  totalPages,
  hasNextPage,
  loading,
  pageInput,
  onPageInputChange,
  onJump,
  onPageChange,
}: PluginPagerProps) {
  const { t } = useTranslation();
  const submitJump = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onJump();
  };

  return (
    <div className={styles.pager}>
      {totalPages ? (
        <Pagination
          page={page + 1}
          pageCount={totalPages}
          onPageChange={(next) => onPageChange(next - 1)}
          label={t('plugins.browser.pagerLabel')}
        />
      ) : (
        <div className={styles.pagerSimple}>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            data-testid="plugin-prev-page"
            disabled={page === 0 || loading}
            onClick={() => onPageChange(Math.max(0, page - 1))}
          >
            <ArrowLeft size={14} strokeWidth={1.75} aria-hidden="true" />
            <span>{t('plugins.browser.prev')}</span>
          </Button>
          <span className={styles.pageLabel}>
            {t('plugins.browser.pageLabel', { current: page + 1 })}
          </span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            data-testid="plugin-next-page"
            disabled={!hasNextPage || loading}
            onClick={() => onPageChange(page + 1)}
          >
            <span>{t('plugins.browser.next')}</span>
            <ArrowRight size={14} strokeWidth={1.75} aria-hidden="true" />
          </Button>
        </div>
      )}

      <form className={styles.pagerJump} onSubmit={submitJump}>
        <div className={styles.pagerInput}>
          <Input
            type="number"
            min={1}
            max={totalPages ?? undefined}
            label={t('plugins.browser.pageNumberAriaLabel')}
            value={pageInput}
            onChange={(event) => onPageInputChange(event.target.value)}
            data-testid="plugin-page-input"
          />
        </div>
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          data-testid="plugin-page-go"
          disabled={loading}
        >
          {t('plugins.browser.go')}
        </Button>
      </form>
    </div>
  );
}
