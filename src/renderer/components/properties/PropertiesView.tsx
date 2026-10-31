import { Alert } from '@/components/arc/alert/alert';
import { Button } from '@/components/arc/button/button';
import { Input } from '@/components/arc/input/input';
import { NumberField } from '@/components/arc/number-field/number-field';
import { SearchField } from '@/components/arc/search-field/search-field';
import { Select } from '@/components/arc/select/select';
import { useMediaQuery } from '@/renderer/hooks/use-media-query';
import { Gamepad2, Network, SlidersHorizontal } from 'lucide-react';
import {
  Fragment,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from '../../../i18n';
import { EmptyLine } from '../ui/EmptyLine';
import { SectionTitle } from '../ui/IconTile';
import { useArcMessages } from '../../shared/arc-messages';
import { logError } from '../../../lib/error-utils';
import {
  getServerProperties,
  saveServerProperties,
  type PropertyValue,
} from '../../../lib/properties-commands';
import { notify } from '../../shared/notify';
import {
  type PropertyType,
  serverPropertiesList,
  serverPropertyEnglish,
} from '../../shared/propertiesData';
import type { MinecraftServer } from '../../shared/server declaration';
import {
  type AdvancedField,
  type AdvancedGroup,
  AdvancedInlineFields,
  AdvancedPropertyCard,
  countFieldTypes,
  countGroupFields,
  estimateCardHeight,
  getVisibleAdvancedGroups,
  type PropertyGroupId,
} from './AdvancedPropertyCards';
import cardStyles from './PropertyCards.module.css';
import { PropertyToggleRow } from './PropertyToggleRow';
import styles from './PropertiesView.module.css';
import { useUnsavedChangesGuard } from './use-unsaved-changes-guard';

interface Props {
  server: MinecraftServer;
  onServerPortChanged?: (serverId: string, port: number) => void;
}

type ServerProperties = Record<string, PropertyValue>;

/** The keys the basic, gameplay and network cards show. The advanced cards skip them so nothing appears twice. */
const BASIC_PROPERTY_KEYS: readonly string[] = [
  'motd',
  'gamemode',
  'difficulty',
  'pvp',
  'allow-flight',
  'enable-command-block',
  'max-players',
  'server-port',
  'online-mode',
  'white-list',
];

/** The field type of each basic property, so a basic card's height estimate counts only the fields the search shows. */
const BASIC_FIELD_TYPES: Record<string, PropertyType> = {
  motd: 'string',
  gamemode: 'select',
  difficulty: 'select',
  pvp: 'boolean',
  'allow-flight': 'boolean',
  'enable-command-block': 'boolean',
  'max-players': 'number',
  'server-port': 'number',
  'online-mode': 'boolean',
  'white-list': 'boolean',
};

/** Two columns from this width up, one below it. */
const WIDE_QUERY = '(min-width: 1024px)';

/** The cards after the basic ones, in placement order. The columns are balanced from this order. */
const ADVANCED_CARD_ORDER: readonly PropertyGroupId[] = [
  'Remote',
  'World',
  'General',
  'Security',
  'ResourcePack',
  'Management',
  'Advanced',
];

interface LayoutCard {
  id: string;
  height: number;
  node: ReactNode;
}

/**
 * Assigns each card, in order, to the column with the smaller estimated height so far. Ties go to the left.
 * Returns the card indexes of each column, in the order they were placed.
 */
export function splitIntoColumns(heights: readonly number[], columnCount: number): number[][] {
  const columns: number[][] = Array.from({ length: columnCount }, () => []);
  const totals: number[] = Array.from({ length: columnCount }, () => 0);
  heights.forEach((height, index) => {
    let target = 0;
    for (let column = 1; column < columnCount; column++) {
      if (totals[column] < totals[target]) {
        target = column;
      }
    }
    columns[target].push(index);
    totals[target] += height;
  });
  return columns;
}

export default function PropertiesView({ server, onServerPortChanged }: Props) {
  const { t } = useTranslation();
  const arc = useArcMessages();
  const currentServerIdRef = useRef(server.id);
  const serverViewGenerationRef = useRef(0);
  const propertiesLoadGenerationRef = useRef(0);
  const [props, setProps] = useState<ServerProperties>({
    'server-port': server.port || 25565,
    'max-players': 20,
    gamemode: 'survival',
    difficulty: 'easy',
    pvp: true,
    'online-mode': true,
    'enable-command-block': false,
    'allow-flight': false,
    'white-list': false,
    motd: 'A Minecraft Server',
  });
  const [hasChanges, setHasChanges] = useState(false);
  const [loading, setLoading] = useState(true);
  // A failed read leaves the defaults above on screen. While this is set, the form is hidden and saving is blocked,
  // so the defaults can never overwrite the real server.properties file.
  const [loadError, setLoadError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const isWide = useMediaQuery(WIDE_QUERY);
  useUnsavedChangesGuard(hasChanges);
  useLayoutEffect(() => {
    currentServerIdRef.current = server.id;
    const generation = ++serverViewGenerationRef.current;
    return () => {
      if (serverViewGenerationRef.current === generation) {
        serverViewGenerationRef.current += 1;
      }
      if (currentServerIdRef.current === server.id) {
        currentServerIdRef.current = '';
      }
    };
  }, [server.id]);

  useEffect(() => {
    const serverId = server.id;
    const generation = ++propertiesLoadGenerationRef.current;
    const isCurrentLoad = () => propertiesLoadGenerationRef.current === generation;
    const loadProperties = async () => {
      setLoading(true);
      setLoadError(false);
      try {
        const newProps = await getServerProperties(serverId);
        if (!isCurrentLoad()) return;

        setProps((prev) => ({
          ...prev,
          ...newProps,
          'server-port': newProps['server-port'] ?? prev['server-port'],
        }));
        setHasChanges(false);
      } catch (e) {
        if (!isCurrentLoad()) return;
        logError('Failed to load server properties', e, { serverId });
        setLoadError(true);
        setHasChanges(false);
      } finally {
        if (isCurrentLoad()) {
          setLoading(false);
        }
      }
    };

    void loadProperties();
    return () => {
      if (propertiesLoadGenerationRef.current === generation) {
        propertiesLoadGenerationRef.current += 1;
      }
    };
  }, [server.id, reloadToken, t]);

  const definitions = useMemo(() => new Map(serverPropertiesList.map((d) => [d.key, d])), []);

  const matchesSearch = useMemo(() => {
    if (!searchQuery.trim()) return (_key: string) => true;
    const q = searchQuery.toLowerCase();
    return (key: string) => {
      const def = definitions.get(key);
      const english = serverPropertyEnglish[key];
      return (
        key.toLowerCase().includes(q) ||
        (def?.label ?? '').toLowerCase().includes(q) ||
        (english?.label ?? '').toLowerCase().includes(q) ||
        (def?.description ?? '').toLowerCase().includes(q)
      );
    };
  }, [searchQuery, definitions]);

  const handleChange = (key: string, value: PropertyValue) => {
    setProps((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    // Defaults shown after a failed read must never be written back to the file.
    if (loadError) return;
    const serverId = server.id;
    const viewGeneration = serverViewGenerationRef.current;
    const isCurrentServerView = () =>
      currentServerIdRef.current === serverId && serverViewGenerationRef.current === viewGeneration;
    try {
      // The whole map goes to the backend, so basic and advanced changes are saved together.
      const savedPort = await saveServerProperties(serverId, props);
      if (savedPort !== null) {
        onServerPortChanged?.(serverId, savedPort);
      }
      if (!isCurrentServerView()) return;
      setHasChanges(false);
      notify.success(t('properties.saveSuccess'));
    } catch (e) {
      if (!isCurrentServerView()) return;
      logError('Failed to save server properties', e, { serverId });
      notify.error(t('properties.saveFailed'));
    }
  };

  if (loading) {
    return (
      <div className={styles.loading} role="status" data-testid="properties-loading">
        {t('properties.loading')}
      </div>
    );
  }

  const basicVisible = ['motd', 'gamemode', 'difficulty'].some(matchesSearch);
  const advancedGroups = getVisibleAdvancedGroups(props, BASIC_PROPERTY_KEYS, matchesSearch);
  const findGroup = (id: PropertyGroupId): AdvancedGroup | undefined =>
    advancedGroups.find((group) => group.id === id);
  const gameplayGroup = findGroup('Gameplay');
  const networkGroup = findGroup('Network');
  const gameplayVisible =
    ['pvp', 'allow-flight', 'enable-command-block'].some(matchesSearch) ||
    gameplayGroup !== undefined;
  const networkVisible =
    ['max-players', 'server-port', 'online-mode', 'white-list'].some(matchesSearch) ||
    networkGroup !== undefined;
  const anyVisible = basicVisible || gameplayVisible || networkVisible || advancedGroups.length > 0;

  /** The field types of the visible basic keys, for a card's height estimate. */
  const visibleBasicTypes = (keys: readonly string[]): PropertyType[] =>
    keys.filter((key) => matchesSearch(key)).map((key) => BASIC_FIELD_TYPES[key]);
  const groupTypes = (group: AdvancedGroup | undefined): PropertyType[] =>
    (group?.fields ?? []).map((field: AdvancedField) => field.definition.type);

  const cards: LayoutCard[] = [];
  if (basicVisible) {
    cards.push({
      id: 'basic',
      height: estimateCardHeight(
        countFieldTypes(visibleBasicTypes(['motd', 'gamemode', 'difficulty'])),
      ),
      node: (
        <section className={cardStyles.card} aria-labelledby="properties-basic-title">
          <SectionTitle
            icon={SlidersHorizontal}
            as="h3"
            id="properties-basic-title"
            title={t('properties.sections.basic')}
          />
          <div className={cardStyles.grid}>
            {matchesSearch('motd') && (
              <div className={cardStyles.wide}>
                <Input
                  label={t('properties.motd.label')}
                  hint={t('properties.motd.description')}
                  type="text"
                  value={props.motd as string}
                  onChange={(e) => handleChange('motd', e.target.value)}
                />
              </div>
            )}
            {matchesSearch('gamemode') && (
              <Select
                label={t('properties.gameMode.label')}
                placeholder={arc.select.placeholder}
                value={props.gamemode as string}
                onValueChange={(value) => handleChange('gamemode', value)}
                options={[
                  { value: 'survival', label: t('properties.gameMode.options.survival') },
                  { value: 'creative', label: t('properties.gameMode.options.creative') },
                  { value: 'adventure', label: t('properties.gameMode.options.adventure') },
                  { value: 'spectator', label: t('properties.gameMode.options.spectator') },
                ]}
              />
            )}
            {matchesSearch('difficulty') && (
              <Select
                label={t('properties.difficulty.label')}
                placeholder={arc.select.placeholder}
                value={props.difficulty as string}
                onValueChange={(value) => handleChange('difficulty', value)}
                options={[
                  { value: 'peaceful', label: t('properties.difficulty.options.peaceful') },
                  { value: 'easy', label: t('properties.difficulty.options.easy') },
                  { value: 'normal', label: t('properties.difficulty.options.normal') },
                  { value: 'hard', label: t('properties.difficulty.options.hard') },
                ]}
              />
            )}
          </div>
        </section>
      ),
    });
  }

  if (gameplayVisible) {
    cards.push({
      id: 'gameplay',
      height: estimateCardHeight(
        countFieldTypes([
          ...visibleBasicTypes(['pvp', 'allow-flight', 'enable-command-block']),
          ...groupTypes(gameplayGroup),
        ]),
      ),
      node: (
        <section className={cardStyles.card} aria-labelledby="properties-gameplay-title">
          <SectionTitle
            icon={Gamepad2}
            as="h3"
            id="properties-gameplay-title"
            title={t('properties.sections.gameplay')}
          />
          {matchesSearch('pvp') && (
            <PropertyToggleRow
              id="pvp"
              label={t('properties.toggles.pvp.label')}
              description={t('properties.toggles.pvp.description')}
              checked={Boolean(props.pvp)}
              onChange={(v) => handleChange('pvp', v)}
            />
          )}
          {matchesSearch('allow-flight') && (
            <PropertyToggleRow
              id="allow-flight"
              label={t('properties.toggles.allowFlight.label')}
              description={t('properties.toggles.allowFlight.description')}
              checked={Boolean(props['allow-flight'])}
              onChange={(v) => handleChange('allow-flight', v)}
            />
          )}
          {matchesSearch('enable-command-block') && (
            <PropertyToggleRow
              id="enable-command-block"
              label={t('properties.toggles.commandBlock.label')}
              description={t('properties.toggles.commandBlock.description')}
              checked={Boolean(props['enable-command-block'])}
              onChange={(v) => handleChange('enable-command-block', v)}
            />
          )}
          <AdvancedInlineFields fields={gameplayGroup?.fields ?? []} onChange={handleChange} />
        </section>
      ),
    });
  }

  if (networkVisible) {
    cards.push({
      id: 'network',
      height: estimateCardHeight(
        countFieldTypes([
          ...visibleBasicTypes(['max-players', 'server-port', 'online-mode', 'white-list']),
          ...groupTypes(networkGroup),
        ]),
      ),
      node: (
        <section className={cardStyles.card} aria-labelledby="properties-network-title">
          <SectionTitle
            icon={Network}
            as="h3"
            id="properties-network-title"
            title={t('properties.sections.network')}
          />
          <div className={cardStyles.grid}>
            {matchesSearch('max-players') && (
              <NumberField
                label={t('properties.maxPlayers')}
                min={0}
                value={props['max-players'] as number}
                onValueChange={(value) => handleChange('max-players', value)}
              />
            )}
            {matchesSearch('server-port') && (
              <NumberField
                label={t('properties.serverPort')}
                min={1}
                max={65535}
                formatOptions={{ useGrouping: false }}
                value={props['server-port'] as number}
                onValueChange={(value) => handleChange('server-port', value)}
              />
            )}
          </div>
          {matchesSearch('online-mode') && (
            <PropertyToggleRow
              id="online-mode"
              label={t('properties.toggles.onlineMode.label')}
              description={t('properties.toggles.onlineMode.description')}
              checked={Boolean(props['online-mode'])}
              onChange={(v) => handleChange('online-mode', v)}
            />
          )}
          {matchesSearch('white-list') && (
            <PropertyToggleRow
              id="white-list"
              label={t('properties.toggles.whitelist.label')}
              description={t('properties.toggles.whitelist.description')}
              checked={Boolean(props['white-list'])}
              onChange={(v) => handleChange('white-list', v)}
            />
          )}
          <AdvancedInlineFields fields={networkGroup?.fields ?? []} onChange={handleChange} />
        </section>
      ),
    });
  }

  for (const id of ADVANCED_CARD_ORDER) {
    const group = findGroup(id);
    if (group) {
      cards.push({
        id,
        height: estimateCardHeight(countGroupFields(group.fields)),
        node: <AdvancedPropertyCard group={group} onChange={handleChange} />,
      });
    }
  }

  const header = (
    <header className={styles.header}>
      <div className={styles.titleGroup}>
        <h2 className={styles.title}>{t('properties.title')}</h2>
        {!loadError && (
          <div className={styles.search}>
            <SearchField
              label={t('properties.search.label')}
              clearLabel={arc.search.clear}
              placeholder={t('properties.search.placeholder')}
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
          </div>
        )}
      </div>
      <div className={styles.actions}>
        {hasChanges && (
          <span className={styles.unsaved} role="status">
            {t('properties.unsavedChanges')}
          </span>
        )}
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={!hasChanges || loadError}
          data-testid="properties-save-button"
        >
          {t('properties.saveChanges')}
        </Button>
      </div>
    </header>
  );

  if (loadError) {
    return (
      <div className={styles.page} data-testid="properties-view">
        {header}
        <Alert tone="danger" open title={t('properties.loadFailed')}>
          <p>{t('properties.loadFailedDescription')}</p>
        </Alert>
        <div>
          <Button
            variant="secondary"
            onClick={() => setReloadToken((value) => value + 1)}
            data-testid="properties-retry-button"
          >
            {t('properties.retry')}
          </Button>
        </div>
      </div>
    );
  }

  // Narrow layouts use one column, so every card lands in `left` in placement order.
  const [left = [], right = []] = splitIntoColumns(
    cards.map((card) => card.height),
    isWide ? 2 : 1,
  );
  const renderCards = (indexes: readonly number[]) =>
    indexes.map((index) => <Fragment key={cards[index].id}>{cards[index].node}</Fragment>);

  return (
    <div className={styles.page} data-testid="properties-view">
      {header}

      {!anyVisible && (
        <EmptyLine className={styles.empty} title={t('properties.search.emptyTitle')} />
      )}

      <div className={isWide ? styles.columns : styles.stack}>
        <div className={styles.column}>{renderCards(left)}</div>
        {isWide && <div className={styles.column}>{renderCards(right)}</div>}
      </div>
    </div>
  );
}
