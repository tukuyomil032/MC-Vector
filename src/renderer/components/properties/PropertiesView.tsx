import { useState, useEffect } from 'react';
import { type MinecraftServer } from '../../shared/server declaration';

interface Props {
  server: MinecraftServer;
}

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
  [key: string]: any;
}

export default function PropertiesView({ server }: Props) {
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
  const sep = server.path.includes('\\') ? '\\' : '/';
  const propFilePath = `${server.path}${sep}server.properties`;

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
              if (value === 'true') newProps[key.trim()] = true;
              else if (value === 'false') newProps[key.trim()] = false;
              else if (!isNaN(Number(value)) && value !== '') newProps[key.trim()] = Number(value);
              else newProps[key.trim()] = value;
            }
          }
        });

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

  useEffect(() => {
    if (window.electronAPI) {
      const removeListener = window.electronAPI.onSettingsSavedInWindow((_event, newSettings: any) => {
        setProps((prev: ServerProperties) => ({ ...prev, ...newSettings }));
        setHasChanges(true);
        alert('詳細設定ウィンドウでの変更を適用しました。\n反映するには右上の「変更を保存」を押してください。');
      });
      return () => (removeListener as any)?.();
    }
  }, []);

  const handleChange = (key: string, value: unknown) => {
    setProps(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

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
    return <div className="p-5 text-zinc-400">Loading properties...</div>;
  }

  return (
    <div className="h-full overflow-y-auto relative">
      <div className="p-10 max-w-4xl mx-auto">

        <div className="flex justify-between items-center mb-5">
          <h3>サーバー設定 (server.properties)</h3>
          <div className="flex gap-2.5">
            <button
              className="btn-secondary"
              onClick={openAdvancedWindow}
            >
              🛠️ 詳細設定を開く (別窓)
            </button>

            <button
              className="btn-primary disabled:opacity-50"
              onClick={handleSave}
              disabled={!hasChanges}
            >
              変更を保存
            </button>
          </div>
        </div>

        <div className="bg-bg-secondary rounded-lg p-5 mb-5 border border-border-color">
          <div className="text-lg font-bold mb-4 text-accent pb-2.5 border-b border-border-color">基本設定</div>

          <div className="flex justify-between items-center py-3 border-b border-white/5 last:border-b-0">
            <div className="flex flex-col">
              <span>MOTD</span>
              <span className="text-xs text-text-secondary mt-0.5">サーバーリストに表示される説明文</span>
            </div>
            <input
              type="text"
              className="input-field w-[300px]"
              value={props['motd']}
              onChange={(e) => handleChange('motd', e.target.value)}
            />
          </div>

          <div className="flex justify-between items-center py-3 border-b border-white/5 last:border-b-0">
            <div className="flex flex-col">
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

          <div className="flex justify-between items-center py-3 border-b border-white/5 last:border-b-0">
            <div className="flex flex-col">
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

        <div className="bg-bg-secondary rounded-lg p-5 mb-5 border border-border-color">
          <div className="text-lg font-bold mb-4 text-accent pb-2.5 border-b border-border-color">ゲームプレイ</div>
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

        <div className="bg-bg-secondary rounded-lg p-5 mb-5 border border-border-color">
          <div className="text-lg font-bold mb-4 text-accent pb-2.5 border-b border-border-color">接続・ネットワーク</div>

          <div className="flex justify-between items-center py-3 border-b border-white/5 last:border-b-0">
            <div className="flex flex-col">
              <span>最大プレイヤー数</span>
            </div>
            <input
              type="number"
              className="input-field w-[100px]"
              value={props['max-players']}
              onChange={(e) => handleChange('max-players', e.target.value)}
            />
          </div>

          <div className="flex justify-between items-center py-3 border-b border-white/5 last:border-b-0">
            <div className="flex flex-col">
              <span>サーバーポート</span>
            </div>
            <input
              type="number"
              className="input-field w-[120px]"
              value={props['server-port']}
              onChange={(e) => handleChange('server-port', e.target.value)}
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

function ToggleItem({ label, desc, checked, onChange }: {
  label: string, desc: string, checked: boolean, onChange: (val: boolean) => void
}) {
  return (
    <div className="flex justify-between items-center py-3 border-b border-white/5 last:border-b-0">
      <div className="flex flex-col">
        <span>{label}</span>
        <span className="text-xs text-text-secondary mt-0.5">{desc}</span>
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