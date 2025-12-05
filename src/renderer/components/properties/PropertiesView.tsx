import { useState, useEffect } from 'react';
import { type MinecraftServer } from '../../shared/server declaration';
import '../../../main.css';

interface Props {
  server: MinecraftServer;
}

// 設定値の型定義 (文字列も許容するように緩和)
interface ServerProperties {
  'server-port': number | string;
  'max-players': number | string;
  'gamemode': string;
  'difficulty': string;
  'pvp': boolean | string;
  'online-mode': boolean | string;
  'enable-command-block': boolean | string;
  'allow-flight': boolean | string;
  'white-list': boolean | string;
  'motd': string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export default function PropertiesView({ server }: Props) {
  // 初期値 (読み込み完了まではデフォルト値または空)
  const [props, setProps] = useState<ServerProperties>({
    'server-port': server.port || 25565,
    'max-players': 20,
    'gamemode': 'survival',
    'difficulty': 'normal',
    'pvp': true,
    'online-mode': true,
    'enable-command-block': false,
    'allow-flight': false,
    'white-list': false,
    'motd': 'A Minecraft Server'
  });

  const [hasChanges, setHasChanges] = useState(false);
  const [loading, setLoading] = useState(true);

  // パス解決
  const sep = server.path.includes('\\') ? '\\' : '/';
  const propFilePath = `${server.path}${sep}server.properties`;

  // ★ファイル読み込み (マウント時 & サーバー変更時)
  useEffect(() => {
    const loadProperties = async () => {
      setLoading(true);
      try {
        const content = await window.electronAPI.readFile(propFilePath);
        const lines = content.split('\n');
        const newProps: any = {};

        lines.forEach(line => {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const [key, ...vals] = trimmed.split('=');
            if (key) {
              const value = vals.join('=').trim();
              // Boolean/Number変換
              if (value === 'true') newProps[key.trim()] = true;
              else if (value === 'false') newProps[key.trim()] = false;
              else if (!isNaN(Number(value)) && value !== '') newProps[key.trim()] = Number(value);
              else newProps[key.trim()] = value;
            }
          }
        });

        // 読み込んだ値でstateを更新（既存のデフォルト値とマージ）
        setProps(prev => ({ ...prev, ...newProps }));
        setHasChanges(false);
      } catch (e) {
        console.error("Failed to load properties:", e);
      } finally {
        setLoading(false);
      }
    };

    loadProperties();
  }, [propFilePath]);

  // ★別ウィンドウからの保存データを受け取るリスナー
  useEffect(() => {
    if (window.electronAPI) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const removeListener = window.electronAPI.onSettingsSavedInWindow((_event, newSettings: any) => {
        setProps((prev: ServerProperties) => ({ ...prev, ...newSettings }));
        setHasChanges(true);
        alert('詳細設定ウィンドウでの変更を適用しました。\n反映するには右上の「変更を保存」を押してください。');
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return () => (removeListener as any)?.();
    }
  }, []);

  const handleChange = (key: string, value: unknown) => {
    setProps(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  // ★保存処理 (実際にファイルに書き込む)
  const handleSave = async () => {
    let content = "#Minecraft server properties\n#Edited by MC-Vector\n";
    Object.entries(props).forEach(([key, value]) => {
      content += `${key}=${value}\n`;
    });

    try {
      await window.electronAPI.saveFile(propFilePath, content);
      setHasChanges(false);
      alert('設定を保存しました');
    } catch (e) {
      console.error(e);
      alert('保存に失敗しました');
    }
  };

  const openAdvancedWindow = () => {
    window.electronAPI.openSettingsWindow(props);
  };

  if (loading) {
    return <div style={{ padding: 20, color: '#aaa' }}>Loading properties...</div>;
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', position: 'relative' }}>
      <div className="properties-container">

        {/* ヘッダー部分 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3>サーバー設定 (server.properties)</h3>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              className="btn-secondary"
              onClick={openAdvancedWindow}
            >
              🛠️ 詳細設定を開く (別窓)
            </button>

            <button
              className="btn-primary"
              onClick={handleSave}
              disabled={!hasChanges}
              style={{ opacity: hasChanges ? 1 : 0.5 }}
            >
              変更を保存
            </button>
          </div>
        </div>

        {/* 基本設定セクション */}
        <div className="property-section">
          <div className="section-title">基本設定</div>

          <div className="property-item">
            <div className="property-label">
              <span>MOTD</span>
              <span className="property-desc">サーバーリストに表示される説明文</span>
            </div>
            <input
              type="text"
              className="input-field"
              value={props['motd']}
              onChange={(e) => handleChange('motd', e.target.value)}
              style={{ width: '300px' }}
            />
          </div>

          <div className="property-item">
            <div className="property-label">
              <span>ゲームモード</span>
            </div>
            <select
              className="input-field"
              value={props['gamemode']}
              onChange={(e) => handleChange('gamemode', e.target.value)}
            >
              <option value="survival">サバイバル</option>
              <option value="creative">クリエイティブ</option>
              <option value="adventure">アドベンチャー</option>
              <option value="spectator">スペクテイター</option>
            </select>
          </div>

          <div className="property-item">
            <div className="property-label">
              <span>難易度</span>
            </div>
            <select
              className="input-field"
              value={props['difficulty']}
              onChange={(e) => handleChange('difficulty', e.target.value)}
            >
              <option value="peaceful">ピースフル</option>
              <option value="easy">イージー</option>
              <option value="normal">ノーマル</option>
              <option value="hard">ハード</option>
            </select>
          </div>
        </div>

        {/* ゲームプレイルール */}
        <div className="property-section">
          <div className="section-title">ゲームプレイ</div>
          <ToggleItem
            label="PvP"
            desc="プレイヤー同士の攻撃を許可"
            checked={Boolean(props['pvp'])}
            onChange={(v) => handleChange('pvp', v)}
          />
          <ToggleItem
            label="飛行を許可"
            desc="サバイバルでの飛行(allow-flight)"
            checked={Boolean(props['allow-flight'])}
            onChange={(v) => handleChange('allow-flight', v)}
          />
          <ToggleItem
            label="コマンドブロック"
            desc="コマンドブロックの使用許可"
            checked={Boolean(props['enable-command-block'])}
            onChange={(v) => handleChange('enable-command-block', v)}
          />
        </div>

        {/* 接続・ネットワーク */}
        <div className="property-section">
          <div className="section-title">接続・ネットワーク</div>

          <div className="property-item">
            <div className="property-label">
              <span>最大プレイヤー数</span>
            </div>
            <input
              type="number"
              className="input-field"
              value={props['max-players']}
              onChange={(e) => handleChange('max-players', e.target.value)}
              style={{ width: '100px' }}
            />
          </div>

          <div className="property-item">
            <div className="property-label">
              <span>サーバーポート</span>
            </div>
            <input
              type="number"
              className="input-field"
              value={props['server-port']}
              onChange={(e) => handleChange('server-port', e.target.value)}
              style={{ width: '120px' }}
            />
          </div>

          <ToggleItem
            label="オンラインモード"
            desc="正規アカウント認証 (OFFで割れサーバー化)"
            checked={Boolean(props['online-mode'])}
            onChange={(v) => handleChange('online-mode', v)}
          />

          <ToggleItem
            label="ホワイトリスト"
            desc="許可されたプレイヤーのみ参加可能"
            checked={Boolean(props['white-list'])}
            onChange={(v) => handleChange('white-list', v)}
          />
        </div>

      </div>
    </div>
  );
}

// 小部品: トグルスイッチ付きの項目
function ToggleItem({ label, desc, checked, onChange }: {
  label: string, desc: string, checked: boolean, onChange: (val: boolean) => void
}) {
  return (
    <div className="property-item">
      <div className="property-label">
        <span>{label}</span>
        <span className="property-desc">{desc}</span>
      </div>
      <label className="toggle-switch">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="slider"></span>
      </label>
    </div>
  );
}