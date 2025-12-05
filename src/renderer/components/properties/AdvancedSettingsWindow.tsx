import { useState, useEffect } from 'react';
import { serverPropertiesList, type PropertyCategory } from '../../shared/propertiesData';
import '../../style/advanced-settings.css';

const CATEGORIES: PropertyCategory[] = ['General', 'Gameplay', 'World', 'Network', 'Security'];

export default function AdvancedSettingsWindow() {
  const [activeTab, setActiveTab] = useState<PropertyCategory>('General');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [formData, setFormData] = useState<any>({});
  const [isLoaded, setIsLoaded] = useState(false);

  // ウィンドウが開いた瞬間に、メインウィンドウから送られてきたデータを受け取る
  useEffect(() => {
    // データ受信待機
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const removeListener = window.electronAPI.onSettingsData((data: any) => {
      setFormData(data);
      setIsLoaded(true);
    });

    // 準備完了をメインプロセスに伝える
    window.electronAPI.settingsWindowReady();

    return () => {
      if (removeListener) removeListener();
    };
  }, []);

  const handleChange = (key: string, value: unknown) => {
    setFormData((prev: typeof formData) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    // メインプロセス経由でメインウィンドウにデータを送り返す
    window.electronAPI.saveSettingsFromWindow(formData);
    window.close(); // 保存したら閉じる
  };

  const handleCancel = () => {
    window.close();
  };

  if (!isLoaded) return <div style={{ padding: 20, color: '#fff' }}>Loading settings...</div>;

  const filteredProps = serverPropertiesList.filter(p => p.category === activeTab);

  return (
    <div className="advanced-modal">
      {/* ヘッダー */}
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
        {/* 左サイドバー */}
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

        {/* 右メインエリア */}
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
                      {/* ツールチップ */}
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