import {
  Gamepad2,
  Globe,
  Network,
  Settings,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { useMemo } from 'react';
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

const CATEGORY_ORDER: PropertyCategory[] = [
  'General',
  'Gameplay',
  'World',
  'Network',
  'Security',
  'Advanced',
];

const CATEGORY_ICONS: Record<PropertyCategory, LucideIcon> = {
  General: Settings,
  Gameplay: Gamepad2,
  World: Globe,
  Network,
  Security: ShieldCheck,
  Advanced: Wrench,
};

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
  category: PropertyCategory;
  fields: AdvancedField[];
}

/**
 * The advanced fields to show: every known property outside excludeKeys that matches the search, plus
 * the unknown keys from the file. Categories with no visible field are left out.
 */
function getVisibleAdvancedGroups(
  values: Record<string, PropertyValue>,
  excludeKeys: readonly string[],
  matchesSearch: (key: string) => boolean,
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
  return CATEGORY_ORDER.map((category) => ({
    category,
    fields: fields.filter(
      ({ definition }) =>
        definition.category === category &&
        !excluded.has(definition.key) &&
        matchesSearch(definition.key),
    ),
  })).filter((group) => group.fields.length > 0);
}

/** Whether any advanced field is visible, so the page can decide whether to show its empty line. */
export function hasVisibleAdvancedProperties(
  values: Record<string, PropertyValue>,
  excludeKeys: readonly string[],
  matchesSearch: (key: string) => boolean,
): boolean {
  return getVisibleAdvancedGroups(values, excludeKeys, matchesSearch).length > 0;
}

export interface AdvancedPropertyCardsProps {
  values: Record<string, PropertyValue>;
  onChange: (key: string, value: PropertyValue) => void;
  /** Keys the page already shows in its basic cards. They are skipped here so nothing appears twice. */
  excludeKeys: readonly string[];
  /** Search filter by key. The caller matches the labels, since it knows the locale. */
  matchesSearch: (key: string) => boolean;
}

/** The advanced server properties as one card per category, placed after the basic cards on the same page. */
export function AdvancedPropertyCards({
  values,
  onChange,
  excludeKeys,
  matchesSearch,
}: AdvancedPropertyCardsProps) {
  const { t, locale } = useTranslation();
  const arc = useArcMessages();
  const groups = useMemo(
    () => getVisibleAdvancedGroups(values, excludeKeys, matchesSearch),
    [values, excludeKeys, matchesSearch],
  );

  const getCategoryLabel = (category: PropertyCategory): string => {
    switch (category) {
      case 'General':
        return t('advancedSettings.categories.general');
      case 'Gameplay':
        return t('advancedSettings.categories.gameplay');
      case 'World':
        return t('advancedSettings.categories.world');
      case 'Network':
        return t('advancedSettings.categories.network');
      case 'Security':
        return t('advancedSettings.categories.security');
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
      {groups.map(({ category, fields }) => {
        const titleId = `properties-advanced-${category.toLowerCase()}-title`;
        const formFields = fields.filter((field) => field.definition.type !== 'boolean');
        const toggles = fields.filter((field) => field.definition.type === 'boolean');
        return (
          <section key={category} className={styles.card} aria-labelledby={titleId}>
            <SectionTitle
              icon={CATEGORY_ICONS[category]}
              as="h3"
              id={titleId}
              title={getCategoryLabel(category)}
            />
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
          </section>
        );
      })}
    </>
  );
}
