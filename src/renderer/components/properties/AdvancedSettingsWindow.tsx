import { useState, useEffect } from 'react';
import { serverPropertiesList, type PropertyCategory } from '../../shared/propertiesData';
import '../../style/advanced-settings.css';

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

  if (!isLoaded) return <div style={{ padding: 20, color: '#fff' }}>Loading settings...</div>;

  const filteredProps = serverPropertiesList.filter(p => p.category === activeTab);

  return (
    <div className="advanced-modal">
      <header className="advanced-header">
        <div className="advanced-title">
          <span>🛠️ 詳細サーバー設定 (server.properties)</span>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn-secondary" onClick={handleCancel}>キャンセル</button>
          <button className="btn-primary" onClick={handleSave}>適用して閉じる</button>
        </div>
      </header>

      <div className="advanced-body">
        <aside className="category-sidebar">
          {CATEGORIES.map(cat => (
            <div
              key={cat}
              className={`category-tab ${activeTab === cat ? 'active' : ''}`}
              onClick={() => setActiveTab(cat)}
            >
              {cat}
            </div>
          ))}
        </aside>

        <div className="settings-list-container">
          <h3 style={{ marginTop: 0, marginBottom: '20px', borderBottom: '1px solid #444', paddingBottom: '10px' }}>
            {activeTab}
          </h3>

          <div className="settings-grid">
            {filteredProps.map((prop) => {
              const currentValue = formData[prop.key] ?? prop.default;

              return (
                <div key={prop.key} className="setting-card">
                  <div className="setting-header">
                    <label className="setting-key">
                      {prop.label}
                      <span className="help-icon">?</span>
                      <div className="tooltip-box">
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

                  <div style={{ marginTop: '5px' }}>
                    {prop.type === 'string' && (
                      <input
                        type="text"
                        className="setting-input"
                        value={String(currentValue)}
                        onChange={(e) => handleChange(prop.key, e.target.value)}
                      />
                    )}
                    {prop.type === 'number' && (
                      <input
                        type="number"
                        className="setting-input"
                        value={Number(currentValue)}
                        onChange={(e) => handleChange(prop.key, Number(e.target.value))}
                      />
                    )}
                    {prop.type === 'select' && prop.options && (
                      <select
                        className="setting-input"
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