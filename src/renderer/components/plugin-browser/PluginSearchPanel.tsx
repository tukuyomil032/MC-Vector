import { Alert } from '@/components/arc/alert/alert';
import { Button } from '@/components/arc/button/button';
import { EmptyState } from '@/components/arc/empty-state/empty-state';
import { RadioCards, type RadioCardOption } from '@/components/arc/radio-cards/radio-cards';
import { SearchField } from '@/components/arc/search-field/search-field';
import { Select, type SelectOption } from '@/components/arc/select/select';
import { Skeleton } from '@/components/arc/skeleton/skeleton';
import { ExternalLink, type LucideIcon, Search } from 'lucide-react';
import type { FormEvent, ReactNode } from 'react';
import { useTranslation } from '../../../i18n';
import { useArcMessages } from '../../shared/arc-messages';
import { PluginPager } from './PluginPager';
import { PluginResultCard, type PluginResultCardState } from './PluginResultCard';
import type { BrowserPlatform, ProjectItem, SortMode } from './plugin-model';
import styles from './plugin-browser.module.css';

export interface PlatformOption {
  key: BrowserPlatform;
  label: string;
  hint: string;
  inApp: boolean;
  icon: LucideIcon;
  logoUrl: string;
}

export interface PluginSearchPanelProps {
  platform: BrowserPlatform;
  platformOptions: PlatformOption[];
  logoFailed: Record<string, boolean>;
  onPlatformChange: (platform: BrowserPlatform) => void;
  onLogoFailed: (platform: BrowserPlatform) => void;
  selectedPlatformLabel: string;
  isInAppSearch: boolean;
  searchPlatformLabel: string;
  query: string;
  onQueryChange: (value: string) => void;
  onSubmitSearch: () => void;
  loading: boolean;
  searchFailed: boolean;
  onRetrySearch: () => void;
  sortMode: SortMode;
  onSortModeChange: (mode: SortMode) => void;
  folderName: string;
  onOpenCurseForge: () => void;
  updateAvailableCount: number;
  results: ProjectItem[];
  resolveCard: (item: ProjectItem) => PluginResultCardState;
  onInstall: (item: ProjectItem) => void;
  onDetails: (item: ProjectItem) => void;
  onRetryInstall: (item: ProjectItem) => void;
  page: number;
  totalPages: number | null;
  hasNextPage: boolean;
  pageInput: string;
  onPageInputChange: (value: string) => void;
  onJumpToPage: () => void;
  onPageChange: (page: number) => void;
}

const SKELETON_CARD_COUNT = 4;

export function PluginSearchPanel({
  platform,
  platformOptions,
  logoFailed,
  onPlatformChange,
  onLogoFailed,
  selectedPlatformLabel,
  isInAppSearch,
  searchPlatformLabel,
  query,
  onQueryChange,
  onSubmitSearch,
  loading,
  searchFailed,
  onRetrySearch,
  sortMode,
  onSortModeChange,
  folderName,
  onOpenCurseForge,
  updateAvailableCount,
  results,
  resolveCard,
  onInstall,
  onDetails,
  onRetryInstall,
  page,
  totalPages,
  hasNextPage,
  pageInput,
  onPageInputChange,
  onJumpToPage,
  onPageChange,
}: PluginSearchPanelProps) {
  const { t } = useTranslation();
  const arc = useArcMessages();

  const platformCards: RadioCardOption[] = platformOptions.map((option) => {
    const Icon = option.icon;
    const showLogo = option.logoUrl.length > 0 && !logoFailed[option.key];
    return {
      value: option.key,
      label: option.label,
      description: option.hint,
      testId: `plugin-provider-${option.key.toLowerCase()}`,
      icon: showLogo ? (
        <img
          src={option.logoUrl}
          alt=""
          width={18}
          height={18}
          loading="lazy"
          className={styles.platformLogo}
          onError={() => onLogoFailed(option.key)}
        />
      ) : (
        <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
      ),
    };
  });

  const sortOptions: SelectOption[] = [
    { value: 'relevance', label: t('plugins.browser.sortRelevance') },
    { value: 'downloads', label: t('plugins.browser.sortDownloads') },
    { value: 'name', label: t('plugins.browser.sortName') },
    { value: 'compatibility', label: t('plugins.browser.sortCompatibility') },
  ];

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmitSearch();
  };

  let body: ReactNode = null;
  if (!isInAppSearch) {
    body = (
      <EmptyState
        icon={<ExternalLink size={20} strokeWidth={1.75} aria-hidden="true" />}
        title={t('plugins.browser.unsupportedPlatform')}
        description={t('plugins.browser.downloadInstructions', { folder: folderName })}
        action={
          <Button type="button" variant="secondary" onClick={onOpenCurseForge}>
            <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" />
            <span>{t('plugins.browser.openInBrowser', { platform: selectedPlatformLabel })}</span>
          </Button>
        }
      />
    );
  } else {
    const showSkeleton = loading && results.length === 0;
    body = (
      <>
        {updateAvailableCount > 0 ? (
          <Alert
            tone="info"
            title={t('plugins.browser.updateSummary', { count: updateAvailableCount })}
          >
            {t('plugins.browser.updateSummaryNote')}
          </Alert>
        ) : null}

        <div className={styles.grid} aria-busy={loading || undefined}>
          {showSkeleton
            ? Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
                <div key={index} className={styles.skeletonCard}>
                  <Skeleton label={t('plugins.browser.loading')} lines={3} avatar />
                </div>
              ))
            : null}
          {results.map((item) => (
            <PluginResultCard
              key={`${item.platform}-${item.id}`}
              item={item}
              {...resolveCard(item)}
              onInstall={onInstall}
              onDetails={onDetails}
              onRetry={onRetryInstall}
            />
          ))}
          {results.length === 0 && !loading && !searchFailed ? (
            <div className={styles.empty}>
              <EmptyState
                icon={<Search size={20} strokeWidth={1.75} aria-hidden="true" />}
                title={t('plugins.browser.noResults')}
                description={t('plugins.browser.noResultsHint')}
              />
            </div>
          ) : null}
        </div>

        <PluginPager
          page={page}
          totalPages={totalPages}
          hasNextPage={hasNextPage}
          loading={loading}
          pageInput={pageInput}
          onPageInputChange={onPageInputChange}
          onJump={onJumpToPage}
          onPageChange={onPageChange}
        />
      </>
    );
  }

  return (
    <div className={styles.panel}>
      <RadioCards
        aria-label={t('plugins.browser.platformLabel')}
        layout="grid"
        minColumnWidth={200}
        options={platformCards}
        value={platform}
        onValueChange={(value) => onPlatformChange(value as BrowserPlatform)}
      />

      {isInAppSearch ? (
        <>
          <form className={styles.searchRow} role="search" onSubmit={submitSearch}>
            <div className={styles.searchField}>
              <SearchField
                label={t('plugins.browser.searchLabel')}
                clearLabel={arc.search.clear}
                placeholder={t('plugins.browser.searchOn', { platform: searchPlatformLabel })}
                value={query}
                onValueChange={onQueryChange}
                data-testid="plugin-search-input"
              />
            </div>
            <Button
              type="submit"
              variant="secondary"
              loading={loading}
              data-testid="plugin-search-submit"
            >
              {loading ? t('plugins.browser.searching') : t('common.search')}
            </Button>
          </form>

          <div className={styles.sortRow}>
            <Select
              label={t('plugins.browser.sortLabel')}
              placeholder={arc.select.placeholder}
              className={styles.sortSelect}
              testId="plugin-sort-select"
              options={sortOptions}
              value={sortMode}
              onValueChange={(value) => onSortModeChange(value as SortMode)}
            />
          </div>

          {searchFailed ? (
            <Alert
              tone="danger"
              title={t('plugins.browser.searchError')}
              data-testid="plugin-search-error"
            >
              <Button type="button" variant="secondary" size="sm" onClick={onRetrySearch}>
                {t('plugins.browser.retry')}
              </Button>
            </Alert>
          ) : null}
        </>
      ) : null}

      {body}
    </div>
  );
}
