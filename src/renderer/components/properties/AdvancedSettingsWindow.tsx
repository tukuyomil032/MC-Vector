import { Button } from '@/components/arc/button/button';
import { Input } from '@/components/arc/input/input';
import { NumberField } from '@/components/arc/number-field/number-field';
import { PasswordField } from '@/components/arc/password-field/password-field';
import { Select } from '@/components/arc/select/select';
import { Switch } from '@/components/arc/switch/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/arc/tabs/tabs';
import { useMemo, useState, useEffect } from 'react';
import { useTranslation } from '../../../i18n';
import { useArcMessages } from '../../shared/arc-messages';
import {
  type PropertyCategory,
  type PropertyDefinition,
  serverPropertiesList,
} from '../../shared/propertiesData';
import styles from './AdvancedSettingsWindow.module.css';

const CATEGORY_ORDER: PropertyCategory[] = [
  'General',
  'Gameplay',
  'World',
  'Network',
  'Security',
  'Advanced',
];

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

export default function AdvancedSettingsWindow({
  initialData,
  onSave,
  onCancel,
}: {
  initialData?: Record<string, unknown>;
  onSave?: (data: Record<string, unknown>) => void;
  onCancel?: () => void;
}) {
  const { t, locale } = useTranslation();
  const arc = useArcMessages();
  const [activeTab, setActiveTab] = useState<PropertyCategory>('General');
  const [formData, setFormData] = useState<Record<string, unknown>>(initialData ?? {});
  const [isLoaded, setIsLoaded] = useState(!!initialData);

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
      setIsLoaded(true);
    }
  }, [initialData]);

  const handleChange = (key: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    onSave?.(formData);
  };

  const handleCancel = () => {
    onCancel?.();
  };

  const inferredDefinitions = useMemo<PropertyDefinition[]>(() => {
    const known = new Set(serverPropertiesList.map((p) => p.key));
    const inferred: PropertyDefinition[] = [];
    Object.entries(formData).forEach(([key, value]) => {
      if (known.has(key)) {
        return;
      }
      const valueType =
        typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : 'string';
      inferred.push({
        key,
        label: key,
        description: t('advancedSettings.inferredDescription'),
        type: valueType as PropertyDefinition['type'],
        category: 'Advanced',
        default: String(value ?? ''),
      });
    });
    return inferred;
  }, [formData, t]);

  const allDefinitions = useMemo(
    () => [...serverPropertiesList, ...inferredDefinitions],
    [inferredDefinitions],
  );

  const categories = useMemo(() => {
    const defined = Array.from(new Set(allDefinitions.map((p) => p.category)));
    return CATEGORY_ORDER.filter((c) => defined.includes(c)).concat(
      defined.filter((c) => !CATEGORY_ORDER.includes(c)),
    );
  }, [allDefinitions]);

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

  const getPropertyLabel = (prop: PropertyDefinition): string => {
    if (locale === 'ja' || !JAPANESE_TEXT_PATTERN.test(prop.label)) {
      return prop.label;
    }
    return humanizePropertyKey(prop.key);
  };

  const getPropertyDescription = (prop: PropertyDefinition): string => {
    if (locale === 'ja' || !JAPANESE_TEXT_PATTERN.test(prop.description)) {
      return prop.description;
    }
    return t('advancedSettings.propertyDescriptionFallback', { key: prop.key });
  };

  /** The key sits in the description so the visible text stays a plain sentence with the real property name. */
  const fieldDescription = (prop: PropertyDefinition): string =>
    `${getPropertyDescription(prop)} (${prop.key})`;

  const renderField = (prop: PropertyDefinition, currentValue: unknown) => {
    const label = getPropertyLabel(prop);
    if (prop.type === 'number') {
      const limits = NUMBER_LIMITS[prop.key] ?? {};
      return (
        <NumberField
          label={label}
          description={fieldDescription(prop)}
          min={limits.min}
          max={limits.max}
          // Server properties are plain integers, so digits are shown without thousands separators.
          formatOptions={{ useGrouping: false }}
          value={Number(currentValue ?? 0)}
          onValueChange={(value) => handleChange(prop.key, value)}
        />
      );
    }
    if (prop.type === 'select' && prop.options) {
      return (
        <Select
          label={label}
          placeholder={arc.select.placeholder}
          description={fieldDescription(prop)}
          value={String(currentValue ?? '')}
          onValueChange={(value) => handleChange(prop.key, value)}
          options={prop.options.map((option) => ({ value: option, label: option }))}
        />
      );
    }
    if (SECRET_KEYS.has(prop.key)) {
      return (
        <PasswordField
          label={label}
          description={fieldDescription(prop)}
          autoComplete="new-password"
          value={String(currentValue ?? '')}
          onChange={(e) => handleChange(prop.key, e.target.value)}
        />
      );
    }
    return (
      <Input
        label={label}
        description={fieldDescription(prop)}
        type="text"
        value={String(currentValue ?? '')}
        onChange={(e) => handleChange(prop.key, e.target.value)}
      />
    );
  };

  const renderToggle = (prop: PropertyDefinition, currentValue: unknown) => {
    const labelId = `advanced-${prop.key}-label`;
    return (
      <div className={styles.toggleCard}>
        <div className={styles.toggleText}>
          <span id={labelId} className={styles.toggleLabel}>
            {getPropertyLabel(prop)}
          </span>
          <span className={styles.key}>{prop.key}</span>
          <span className={styles.toggleDescription}>{getPropertyDescription(prop)}</span>
        </div>
        <Switch
          aria-labelledby={labelId}
          checked={Boolean(currentValue)}
          onCheckedChange={(checked) => handleChange(prop.key, checked)}
        />
      </div>
    );
  };

  if (!isLoaded) {
    return (
      <div className={styles.loading} role="status">
        {t('advancedSettings.loading')}
      </div>
    );
  }

  return (
    <div className={styles.page} data-testid="advanced-settings-window">
      <header className={styles.header}>
        <h2 className={styles.title}>{t('advancedSettings.title')}</h2>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={handleCancel}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={handleSave}>
            {t('advancedSettings.applyAndClose')}
          </Button>
        </div>
      </header>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as PropertyCategory)}
        className={styles.body}
      >
        <TabsList className={styles.categories} aria-label={t('advancedSettings.categoriesLabel')}>
          {categories.map((cat) => (
            <TabsTrigger key={cat} value={cat}>
              {getCategoryLabel(cat)}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className={styles.panel}>
          {categories.map((cat) => {
            const catProps = allDefinitions.filter((p) => p.category === cat);
            return (
              <TabsContent key={cat} value={cat} className={styles.content}>
                <h3 className={styles.sectionTitle}>{getCategoryLabel(cat)}</h3>
                <div className={styles.grid}>
                  {catProps.map((prop) => {
                    const currentValue = formData[prop.key] ?? prop.default;
                    return (
                      <div key={prop.key} className={styles.cell}>
                        {prop.type === 'boolean'
                          ? renderToggle(prop, currentValue)
                          : renderField(prop, currentValue)}
                      </div>
                    );
                  })}
                </div>
              </TabsContent>
            );
          })}
        </div>
      </Tabs>
    </div>
  );
}
