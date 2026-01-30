import { useState, useEffect, useMemo } from 'react';
import {
  serverPropertiesList,
  type PropertyCategory,
  type PropertyDefinition,
} from '../../shared/propertiesData';

const CATEGORY_ORDER: PropertyCategory[] = [
  'General',
  'Gameplay',
  'World',
  'Network',
  'Security',
  'Advanced',
];

export default function AdvancedSettingsWindow() {
  const [activeTab, setActiveTab] = useState<PropertyCategory>('General');
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const removeListener = window.electronAPI.onSettingsData((data: any) => {
      setFormData(data ?? {});
      setIsLoaded(true);
    });

    window.electronAPI.settingsWindowReady();

    return () => {
      if (removeListener) removeListener();
    };
  }, []);

  const handleChange = (key: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    window.electronAPI.saveSettingsFromWindow(formData);
    window.close();
  };

  const handleCancel = () => {
    window.close();
  };

  const inferredDefinitions = useMemo<PropertyDefinition[]>(() => {
    const known = new Set(serverPropertiesList.map((p) => p.key));
    const inferred: PropertyDefinition[] = [];
    Object.entries(formData).forEach(([key, value]) => {
      if (known.has(key)) return;
      const valueType =
        typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : 'string';
      inferred.push({
        key,
        label: key,
        description: 'server.properties に存在する項目です。',
        type: valueType as PropertyDefinition['type'],
        category: 'Advanced',
        default: (value as any) ?? '',
      });
    });
    return inferred;
  }, [formData]);

  const allDefinitions = useMemo(
    () => [...serverPropertiesList, ...inferredDefinitions],
    [inferredDefinitions]
  );

  const categories = useMemo(() => {
    const defined = Array.from(new Set(allDefinitions.map((p) => p.category)));
    return CATEGORY_ORDER.filter((c) => defined.includes(c)).concat(
      defined.filter((c) => !CATEGORY_ORDER.includes(c))
    );
  }, [allDefinitions]);

  const filteredProps = allDefinitions.filter((p) => p.category === activeTab);

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
          className="setting-input w-full px-2 py-2 bg-bg-secondary border border-border-color text-text-primary rounded focus:outline-none focus:border-accent"
          value={Number(currentValue ?? 0)}
          onChange={(e) => handleChange(prop.key, Number(e.target.value))}
        />
      );
    }
    if (prop.type === 'select' && prop.options) {
      return (
        <select
          className="setting-input w-full px-2 py-2 bg-bg-secondary border border-border-color text-text-primary rounded focus:outline-none focus:border-accent"
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
        className="setting-input w-full px-2 py-2 bg-bg-secondary border border-border-color text-text-primary rounded focus:outline-none focus:border-accent"
        value={String(currentValue ?? '')}
        onChange={(e) => handleChange(prop.key, e.target.value)}
      />
    );
  };

  if (!isLoaded) return <div className="p-5 text-white">Loading settings...</div>;

  return (
    <div className="fixed inset-0 bg-bg-primary z-2000 flex flex-col animate-fadeIn">
      <header className="px-8 py-4 bg-bg-secondary border-b border-border-color flex justify-between items-center">
        <div className="text-xl font-bold text-text-primary flex items-center gap-2.5">
          <span>🛠️ 詳細サーバー設定 (server.properties)</span>
        </div>
        <div className="flex gap-2.5">
          <button className="btn-secondary" onClick={handleCancel}>
            キャンセル
          </button>
          <button className="btn-primary" onClick={handleSave}>
            適用して閉じる
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-[220px] bg-bg-secondary border-r border-border-color py-5 flex flex-col">
          {categories.map((cat) => (
            <div
              key={cat}
              className={`px-6 py-3 cursor-pointer text-text-secondary transition-all border-l-[3px] ${activeTab === cat ? 'bg-bg-tertiary text-accent border-l-accent font-bold' : 'border-l-transparent hover:bg-white/5 hover:text-text-primary'}`}
              onClick={() => setActiveTab(cat)}
            >
              {cat}
            </div>
          ))}
        </aside>

        <div className="flex-1 p-8 overflow-y-auto bg-bg-primary">
          <h3 className="mt-0 mb-5 border-b border-zinc-700 pb-2.5">{activeTab}</h3>

          <div className="grid grid-cols-[repeat(auto-fill,minmax(360px,1fr))] gap-5">
            {filteredProps.map((prop) => {
              const currentValue = formData[prop.key] ?? prop.default;

              return (
                <div
                  key={prop.key}
                  className="bg-bg-tertiary border border-border-color rounded-lg p-4 flex flex-col gap-3 relative overflow-visible"
                >
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex flex-col gap-1 relative group overflow-visible">
                      <div className="text-sm font-bold text-text-primary flex items-center gap-1.5">
                        <span>{prop.label}</span>
                        <span className="text-xs text-accent">({prop.key})</span>
                      </div>
                      <div className="text-xs text-text-secondary leading-relaxed">
                        {prop.description}
                      </div>
                      <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 bg-zinc-800 text-white rounded-md p-2.5 shadow-xl border border-accent absolute top-full left-0 mt-2 text-xs w-[min(320px,90vw)] whitespace-normal break-words transition-opacity z-20">
                        {prop.description}
                      </div>
                    </div>

                    {prop.type === 'boolean' && (
                      <div className="shrink-0">{renderInput(prop, currentValue)}</div>
                    )}
                  </div>

                  {prop.type !== 'boolean' && (
                    <div className="w-full">{renderInput(prop, currentValue)}</div>
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
