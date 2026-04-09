import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../../../i18n';
import {
  type PropertyCategory,
  type PropertyDefinition,
  serverPropertiesList,
} from '../../shared/propertiesData';

const CATEGORY_ORDER: PropertyCategory[] = [
  'General',
  'Gameplay',
  'World',
  'Network',
  'Security',
  'Advanced',
];

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
  }, [formData]);

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

  const filteredProps = allDefinitions.filter((p) => p.category === activeTab);

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

  const renderInput = (prop: PropertyDefinition, currentValue: unknown) => {
    if (prop.type === 'boolean') {
      return (
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={Boolean(currentValue)}
            onChange={(e) => handleChange(prop.key, e.target.checked)}
          />
          <span className="slider"></span>
        </label>
      );
    }
    if (prop.type === 'number') {
      return (
        <input
          type="number"
          className="advanced-settings-window__input"
          value={Number(currentValue ?? 0)}
          onChange={(e) => handleChange(prop.key, Number(e.target.value))}
        />
      );
    }
    if (prop.type === 'select' && prop.options) {
      return (
        <select
          className="advanced-settings-window__input"
          value={String(currentValue ?? '')}
          onChange={(e) => handleChange(prop.key, e.target.value)}
        >
          {prop.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    }
    return (
      <input
        type="text"
        className="advanced-settings-window__input"
        value={String(currentValue ?? '')}
        onChange={(e) => handleChange(prop.key, e.target.value)}
      />
    );
  };

  if (!isLoaded) {
    return <div className="advanced-settings-window__loading">{t('advancedSettings.loading')}</div>;
  }

  return (
    <div className="advanced-settings-window">
      <header className="advanced-settings-window__header">
        <div className="advanced-settings-window__title">
          <span>🛠️ {t('advancedSettings.title')}</span>
        </div>
        <div className="advanced-settings-window__header-actions">
          <button className="btn-secondary" onClick={handleCancel}>
            {t('common.cancel')}
          </button>
          <button className="btn-primary" onClick={handleSave}>
            {t('advancedSettings.applyAndClose')}
          </button>
        </div>
      </header>

      <div className="advanced-settings-window__body">
        <aside className="advanced-settings-window__sidebar">
          {categories.map((cat) => (
            <div
              key={cat}
              className={`advanced-settings-window__tab ${activeTab === cat ? 'is-active' : 'is-idle'}`}
              onClick={() => setActiveTab(cat)}
            >
              {getCategoryLabel(cat)}
            </div>
          ))}
        </aside>

        <div className="advanced-settings-window__content">
          <h3 className="advanced-settings-window__section-title">{getCategoryLabel(activeTab)}</h3>

          <div className="advanced-settings-window__grid">
            {filteredProps.map((prop) => {
              const currentValue = formData[prop.key] ?? prop.default;
              const label = getPropertyLabel(prop);
              const description = getPropertyDescription(prop);

              return (
                <div key={prop.key} className="advanced-settings-window__card">
                  <div className="advanced-settings-window__card-head">
                    <div className="advanced-settings-window__card-info group">
                      <div className="advanced-settings-window__card-label">
                        <span>{label}</span>
                        <span className="advanced-settings-window__card-key">({prop.key})</span>
                      </div>
                      <div className="advanced-settings-window__card-description">
                        {description}
                      </div>
                      <div className="advanced-settings-window__tooltip">{description}</div>
                    </div>

                    {prop.type === 'boolean' && (
                      <div className="advanced-settings-window__toggle-wrap">
                        {renderInput(prop, currentValue)}
                      </div>
                    )}
                  </div>

                  {prop.type !== 'boolean' && (
                    <div className="advanced-settings-window__input-wrap">
                      {renderInput(prop, currentValue)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
