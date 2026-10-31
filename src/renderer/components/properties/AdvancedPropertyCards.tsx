import {
  Gamepad2,
  Globe,
  Network,
  Package,
  ServerCog,
  Settings,
  ShieldCheck,
  SquareTerminal,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { Fragment, useMemo } from 'react';
import { Input } from '@/components/arc/input/input';
import { NumberField } from '@/components/arc/number-field/number-field';
import { PasswordField } from '@/components/arc/password-field/password-field';
import { Select } from '@/components/arc/select/select';
import { useTranslation } from '../../../i18n';
import type { PropertyValue } from '../../../lib/properties-commands';
import { useArcMessages } from '../../shared/arc-messages';
import { Phrase } from '../../shared/japanese-phrase';
import {
  type PropertyCategory,
  type PropertyDefinition,
  serverPropertiesList,
  serverPropertyEnglish,
} from '../../shared/propertiesData';
import { SectionTitle } from '../ui/IconTile';
import { PropertyToggleRow } from './PropertyToggleRow';
import styles from './PropertyCards.module.css';

/**
 * A card group. Most groups are a property category. The RCON and Query, resource pack and management
 * server properties are pulled out of their categories, so each of those gets a card of its own.
 */
export type PropertyGroupId = PropertyCategory | 'Remote' | 'ResourcePack' | 'Management';

const GROUP_ORDER: readonly PropertyGroupId[] = [
  'General',
  'Gameplay',
  'World',
  'Network',
  'Remote',
  'Security',
  'ResourcePack',
  'Management',
  'Advanced',
];

const GROUP_ICONS: Record<PropertyGroupId, LucideIcon> = {
  General: Settings,
  Gameplay: Gamepad2,
  World: Globe,
  Network,
  Remote: SquareTerminal,
  Security: ShieldCheck,
  ResourcePack: Package,
  Management: ServerCog,
  Advanced: Wrench,
};

const REMOTE_KEYS = new Set([
  'enable-rcon',
  'rcon.port',
  'rcon.password',
  'enable-query',
  'query.port',
]);

/** The card group a property belongs to. Anything not pulled out keeps its category. */
function groupOf(definition: PropertyDefinition): PropertyGroupId {
  const { key } = definition;
  if (REMOTE_KEYS.has(key)) return 'Remote';
  if (key.startsWith('resource-pack') || key === 'require-resource-pack') return 'ResourcePack';
  if (key.startsWith('management-server')) return 'Management';
  return definition.category;
}

/** Properties whose values are secrets. They use a masked field with a reveal toggle. */
const SECRET_KEYS = new Set([
  'rcon.password',
  'management-server-secret',
  'management-server-tls-keystore-password',
]);

/** Known bounds for numeric properties, so the field clamps values the server would reject. */
const NUMBER_LIMITS: Record<string, { min?: number; max?: number }> = {
  'server-port': { min: 1, max: 65535 },
  'rcon.port': { min: 1, max: 65535 },
  'query.port': { min: 1, max: 65535 },
  'max-players': { min: 0 },
  'view-distance': { min: 3, max: 32 },
  'simulation-distance': { min: 3, max: 32 },
  'spawn-protection': { min: 0 },
  'player-idle-timeout': { min: 0 },
  'function-permission-level': { min: 1, max: 4 },
  'op-permission-level': { min: 1, max: 4 },
  'entity-broadcast-range-percentage': { min: 10, max: 1000 },
};

const JAPANESE_TEXT_PATTERN = /[ぁ-んァ-ン一-龯]/;
const ACRONYM_SEGMENTS: Record<string, string> = {
  ip: 'IP',
  op: 'OP',
  rcon: 'RCON',
  motd: 'MOTD',
  jmx: 'JMX',
  tls: 'TLS',
  sha1: 'SHA1',
  url: 'URL',
};

function humanizePropertyKey(key: string): string {
  return key
    .split(/[._-]/)
    .filter(Boolean)
    .map((segment) => {
      const lower = segment.toLowerCase();
      const acronym = ACRONYM_SEGMENTS[lower];
      if (acronym) {
        return acronym;
      }
      if (/^\d+$/.test(segment)) {
        return segment;
      }
      return segment.charAt(0).toUpperCase() + segment.slice(1);
    })
    .join(' ');
}

/** A key the server.properties file has that the app does not define. It is shown under Advanced with its raw key as the label. */
function inferDefinition(key: string, value: PropertyValue): PropertyDefinition {
  const type =
    typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : 'string';
  return { key, label: key, description: '', type, category: 'Advanced', default: value };
}

interface AdvancedField {
  definition: PropertyDefinition;
  inferred: boolean;
  value: PropertyValue;
}

interface AdvancedGroup {
  id: PropertyGroupId;
  fields: AdvancedField[];
}

/**
 * The advanced fields to show: every known property outside excludeKeys that matches the search, plus
 * the unknown keys from the file. Groups with no visible field are left out.
 */
function getVisibleAdvancedGroups(
  values: Record<string, PropertyValue>,
  excludeKeys: readonly string[],
  matchesSearch: (key: string) => boolean,
  groupIds: readonly PropertyGroupId[] = GROUP_ORDER,
): AdvancedGroup[] {
  const excluded = new Set(excludeKeys);
  const known = new Set(serverPropertiesList.map((definition) => definition.key));
  const fields: AdvancedField[] = [
    ...serverPropertiesList.map((definition) => ({
      definition,
      inferred: false,
      value: values[definition.key] ?? definition.default,
    })),
    ...Object.entries(values)
      .filter(([key]) => !known.has(key))
      .map(([key, value]) => ({
        definition: inferDefinition(key, value),
        inferred: true,
        value,
      })),
  ];
  return GROUP_ORDER.filter((id) => groupIds.includes(id))
    .map((id) => ({
      id,
      fields: fields.filter(
        ({ definition }) =>
          groupOf(definition) === id &&
          !excluded.has(definition.key) &&
          matchesSearch(definition.key),
      ),
    }))
    .filter((group) => group.fields.length > 0);
}

/** Whether any advanced field is visible, so the page can decide whether to show its empty line. */
export function hasVisibleAdvancedProperties(
  values: Record<string, PropertyValue>,
  excludeKeys: readonly string[],
  matchesSearch: (key: string) => boolean,
  groupIds?: readonly PropertyGroupId[],
): boolean {
  return getVisibleAdvancedGroups(values, excludeKeys, matchesSearch, groupIds).length > 0;
}

/** The groups whose fields join a basic card instead of getting a card of their own, so no heading appears twice. */
export const MERGED_ADVANCED_CATEGORIES: readonly PropertyGroupId[] = ['Gameplay', 'Network'];
const STANDALONE_ADVANCED_CATEGORIES = GROUP_ORDER.filter(
  (group) => !MERGED_ADVANCED_CATEGORIES.includes(group),
);

export interface AdvancedPropertyCardsProps {
  values: Record<string, PropertyValue>;
  onChange: (key: string, value: PropertyValue) => void;
  /** Keys the page already shows in its basic cards. They are skipped here so nothing appears twice. */
  excludeKeys: readonly string[];
  /** Search filter by key. The caller matches the labels, since it knows the locale. */
  matchesSearch: (key: string) => boolean;
  /**
   * Render only this group's fields, with no card or heading, inside a basic card of the same name.
   * Without it, every group outside MERGED_ADVANCED_CATEGORIES gets its own card.
   */
  inline?: PropertyGroupId;
}

/** The advanced server properties as one card per group, placed after the basic cards on the same page. */
export function AdvancedPropertyCards({
  values,
  onChange,
  excludeKeys,
  matchesSearch,
  inline,
}: AdvancedPropertyCardsProps) {
  const { t, locale } = useTranslation();
  const arc = useArcMessages();
  const groups = useMemo(
    () =>
      getVisibleAdvancedGroups(
        values,
        excludeKeys,
        matchesSearch,
        inline ? [inline] : STANDALONE_ADVANCED_CATEGORIES,
      ),
    [values, excludeKeys, matchesSearch, inline],
  );

  const getGroupLabel = (group: PropertyGroupId): string => {
    switch (group) {
      case 'General':
        return t('advancedSettings.categories.general');
      case 'Gameplay':
        return t('advancedSettings.categories.gameplay');
      case 'World':
        return t('advancedSettings.categories.world');
      case 'Network':
        return t('advancedSettings.categories.network');
      case 'Remote':
        return t('advancedSettings.categories.remote');
      case 'Security':
        return t('advancedSettings.categories.security');
      case 'ResourcePack':
        return t('advancedSettings.categories.resourcePack');
      case 'Management':
        return t('advancedSettings.categories.management');
      case 'Advanced':
        return t('advancedSettings.categories.advanced');
    }
  };

  const getPropertyLabel = (definition: PropertyDefinition): string => {
    if (locale === 'ja' || !JAPANESE_TEXT_PATTERN.test(definition.label)) {
      return definition.label;
    }
    return serverPropertyEnglish[definition.key]?.label ?? humanizePropertyKey(definition.key);
  };

  const getPropertyDescription = ({ definition, inferred }: AdvancedField): string => {
    if (inferred) {
      return t('advancedSettings.inferredDescription');
    }
    if (locale === 'ja' || !JAPANESE_TEXT_PATTERN.test(definition.description)) {
      return definition.description;
    }
    return (
      serverPropertyEnglish[definition.key]?.description ??
      t('advancedSettings.propertyDescriptionFallback', { key: definition.key })
    );
  };

  /** The key sits in the description so the visible text stays a plain sentence with the real property name. */
  const fieldDescription = (field: AdvancedField): string =>
    `${getPropertyDescription(field)} (${field.definition.key})`;

  const renderField = (field: AdvancedField) => {
    const { definition, value } = field;
    const key = definition.key;
    const label = getPropertyLabel(definition);
    const hint = fieldDescription(field);
    if (definition.type === 'number') {
      const limits = NUMBER_LIMITS[key] ?? {};
      return (
        <NumberField
          label={label}
          hint={hint}
          min={limits.min}
          max={limits.max}
          // Server properties are plain integers, so digits are shown without thousands separators.
          formatOptions={{ useGrouping: false }}
          value={Number(value)}
          onValueChange={(next) => onChange(key, next)}
        />
      );
    }
    if (definition.type === 'select' && definition.options) {
      return (
        <Select
          label={label}
          placeholder={arc.select.placeholder}
          hint={hint}
          value={String(value)}
          onValueChange={(next) => onChange(key, next)}
          options={definition.options.map((option) => ({ value: option, label: option }))}
        />
      );
    }
    if (SECRET_KEYS.has(key)) {
      return (
        <PasswordField
          label={label}
          hint={hint}
          autoComplete="new-password"
          value={String(value)}
          onChange={(e) => onChange(key, e.target.value)}
        />
      );
    }
    return (
      <Input
        label={label}
        hint={hint}
        type="text"
        value={String(value)}
        onChange={(e) => onChange(key, e.target.value)}
      />
    );
  };

  return (
    <>
      {groups.map(({ id, fields }) => {
        const titleId = `properties-advanced-${id.toLowerCase()}-title`;
        const formFields = fields.filter((field) => field.definition.type !== 'boolean');
        const toggles = fields.filter((field) => field.definition.type === 'boolean');
        const body = (
          <>
            {formFields.length > 0 && (
              <div className={styles.grid}>
                {formFields.map((field) => (
                  <div
                    key={field.definition.key}
                    // Text fields take a full row, since URLs and lists run long.
                    className={
                      field.definition.type === 'string'
                        ? `${styles.field} ${styles.wide}`
                        : styles.field
                    }
                  >
                    {renderField(field)}
                  </div>
                ))}
              </div>
            )}
            {toggles.map((field) => (
              <PropertyToggleRow
                key={field.definition.key}
                id={field.definition.key}
                label={getPropertyLabel(field.definition)}
                description={<Phrase text={fieldDescription(field)} />}
                checked={Boolean(field.value)}
                onChange={(checked) => onChange(field.definition.key, checked)}
              />
            ))}
          </>
        );
        if (inline) {
          return <Fragment key={id}>{body}</Fragment>;
        }
        return (
          <section key={id} className={styles.card} aria-labelledby={titleId}>
            <SectionTitle icon={GROUP_ICONS[id]} as="h3" id={titleId} title={getGroupLabel(id)} />
            {body}
          </section>
        );
      })}
    </>
  );
}
