import { useState, useEffect } from 'react';
import { serverPropertiesList, type PropertyCategory } from '../../shared/propertiesData';

const CATEGORIES: PropertyCategory[] = ['General', 'Gameplay', 'World', 'Network', 'Security'];

export default function AdvancedSettingsWindow() {
  const [activeTab, setActiveTab] = useState<PropertyCategory>('General');
  const [formData, setFormData] = useState<any>({});
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const removeListener = window.electronAPI.onSettingsData((data: any) => {
      setFormData(data);
      setIsLoaded(true);
    });

    window.electronAPI.settingsWindowReady();

    return () => {
      if (removeListener) removeListener();
    };
  }, []);

  const handleChange = (key: string, value: unknown) => {
    setFormData((prev: typeof formData) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    window.electronAPI.saveSettingsFromWindow(formData);
    window.close();
  };

  const handleCancel = () => {
    window.close();
  };

  if (!isLoaded) return <div className="p-5 text-white">Loading settings...</div>;

  const filteredProps = serverPropertiesList.filter(p => p.category === activeTab);

  return (
    <div className="fixed inset-0 bg-bg-primary z-2000 flex flex-col animate-fadeIn">
      <header className="px-8 py-4 bg-bg-secondary border-b border-border-color flex justify-between items-center">
        <div className="text-xl font-bold text-text-primary flex items-center gap-2.5">
          <span>🛠️ 詳細サーバー設定 (server.properties)</span>
        </div>
        <div className="flex gap-2.5">
          <button className="btn-secondary" onClick={handleCancel}>キャンセル</button>
          <button className="btn-primary" onClick={handleSave}>適用して閉じる</button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-[200px] bg-bg-secondary border-r border-border-color py-5 flex flex-col">
          {CATEGORIES.map(cat => (
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
          <h3 className="mt-0 mb-5 border-b border-zinc-700 pb-2.5">
            {activeTab}
          </h3>

          <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-5">
            {filteredProps.map((prop) => {
              const currentValue = formData[prop.key] ?? prop.default;

              return (
                <div key={prop.key} className="bg-bg-tertiary border border-border-color rounded-lg p-4 flex flex-col gap-2.5 relative">
                  <div className="flex justify-between items-start">
                    <label className="text-sm font-bold text-text-primary cursor-help underline decoration-dotted decoration-text-secondary relative group">
                      {prop.label}
                      <span className="text-xs text-accent ml-1.5">?</span>
                      <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 w-[220px] bg-zinc-800 text-white text-left rounded-md p-2.5 absolute z-10 bottom-full left-1/2 -translate-x-1/2 mb-2 transition-opacity text-xs font-normal shadow-lg border border-accent pointer-events-none leading-relaxed">
                        <strong>{prop.key}</strong><br/>
                        {prop.description}
                      </div>
                    </label>

                    {prop.type === 'boolean' && (
                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          checked={Boolean(currentValue)}
                          onChange={(e) => handleChange(prop.key, e.target.checked)}
                        />
                        <span className="slider"></span>
                      </label>
                    )}
                  </div>

                  <div className="mt-1.5">
                    {prop.type === 'string' && (
                      <input
                        type="text"
                        className="setting-input w-full px-2 py-2 bg-bg-secondary border border-border-color text-text-primary rounded focus:outline-none focus:border-accent"
                        value={String(currentValue)}
                        onChange={(e) => handleChange(prop.key, e.target.value)}
                      />
                    )}
                    {prop.type === 'number' && (
                      <input
                        type="number"
                        className="setting-input w-full px-2 py-2 bg-bg-secondary border border-border-color text-text-primary rounded focus:outline-none focus:border-accent"
                        value={Number(currentValue)}
                        onChange={(e) => handleChange(prop.key, Number(e.target.value))}
                      />
                    )}
                    {prop.type === 'select' && prop.options && (
                      <select
                        className="setting-input w-full px-2 py-2 bg-bg-secondary border border-border-color text-text-primary rounded focus:outline-none focus:border-accent"
                        value={String(currentValue)}
                        onChange={(e) => handleChange(prop.key, e.target.value)}
                      >
                        {prop.options.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}