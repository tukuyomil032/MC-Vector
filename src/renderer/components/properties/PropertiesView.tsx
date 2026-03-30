import { useEffect, useState } from 'react';
import { readFileContent, saveFileContent } from '../../../lib/file-commands';
import { type MinecraftServer } from '../../shared/server declaration';
import { useToast } from '../ToastProvider';
import AdvancedSettingsWindow from './AdvancedSettingsWindow';

interface Props {
  server: MinecraftServer;
}

type PropertyValue = string | number | boolean;
type ServerProperties = Record<string, PropertyValue>;

export default function PropertiesView({ server }: Props) {
  const [props, setProps] = useState<ServerProperties>({
    'server-port': server.port || 25565,
    'max-players': 20,
    gamemode: 'survival',
    difficulty: 'easy',
    pvp: true,
    'online-mode': true,
    'enable-command-block': false,
    'allow-flight': false,
    'white-list': false,
    motd: 'A Minecraft Server',
  });
  const [hasChanges, setHasChanges] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const sep = server.path.includes('\\') ? '\\' : '/';
  const propFilePath = `${server.path}${sep}server.properties`;
  const { showToast } = useToast();

  useEffect(() => {
    const loadProperties = async () => {
      setLoading(true);
      try {
        const content = await readFileContent(propFilePath);
        const lines = content.split('\n');
        const newProps: ServerProperties = {};

        lines.forEach((line) => {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const [key, ...vals] = trimmed.split('=');
            if (key) {
              const value = vals.join('=');
              const cleaned = value.trim();
              if (cleaned === 'true') {
                newProps[key.trim()] = true;
              } else if (cleaned === 'false') {
                newProps[key.trim()] = false;
              } else if (!isNaN(Number(cleaned)) && cleaned !== '') {
                newProps[key.trim()] = Number(cleaned);
              } else {
                newProps[key.trim()] = cleaned;
              }
            }
          }
        });

        setProps((prev) => ({
          ...prev,
          ...newProps,
          'server-port': newProps['server-port'] ?? prev['server-port'],
        }));
        setHasChanges(false);
      } catch (e) {
        console.error('Failed to load properties:', e);
      } finally {
        setLoading(false);
      }
    };

    loadProperties();
  }, [propFilePath, server.port]);

  useEffect(() => {
    // Advanced settings changes are now handled inline, no separate window IPC needed
  }, [showToast]);

  const handleChange = (key: string, value: PropertyValue) => {
    setProps((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    let content = '#Minecraft server properties\n#Edited by MC-Vector\n';
    Object.entries(props).forEach(([key, value]) => {
      content += `${key}=${value}\n`;
    });

    try {
      await saveFileContent(propFilePath, content);
      setHasChanges(false);
      showToast('設定を保存しました', 'success');
    } catch (e) {
      console.error(e);
      showToast('保存に失敗しました', 'error');
    }
  };

  const openAdvancedWindow = () => {
    setShowAdvanced(true);
  };

  const handleAdvancedSave = async (data: Record<string, unknown>) => {
    let content = '#Minecraft server properties\n#Edited by MC-Vector\n';
    Object.entries(data).forEach(([key, value]) => {
      content += `${key}=${value}\n`;
    });
    try {
      await saveFileContent(propFilePath, content);
      // Sync local props state with advanced changes
      const newProps: ServerProperties = {};
      Object.entries(data).forEach(([key, value]) => {
        if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
          newProps[key] = value;
        } else {
          newProps[key] = String(value);
        }
      });
      setProps((prev) => ({ ...prev, ...newProps }));
      setShowAdvanced(false);
      setHasChanges(false);
      showToast('詳細設定を保存しました', 'success');
    } catch (e) {
      console.error(e);
      showToast('保存に失敗しました', 'error');
    }
  };

  if (loading) {
    return <div className="properties-view__loading">Loading properties...</div>;
  }

  if (showAdvanced) {
    return (
      <AdvancedSettingsWindow
        initialData={props as Record<string, unknown>}
        onSave={handleAdvancedSave}
        onCancel={() => setShowAdvanced(false)}
      />
    );
  }

  return (
    <div className="properties-view">
      <div className="properties-view__container">
        <div className="properties-view__header">
          <h3>サーバー設定 (server.properties)</h3>
          <div className="properties-view__actions">
            <button className="btn-secondary" onClick={openAdvancedWindow}>
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

        <div className="properties-view__section">
          <div className="properties-view__section-title">基本設定</div>

          <div className="properties-view__row">
            <div className="properties-view__row-info">
              <span>MOTD</span>
              <span className="properties-view__row-description">
                サーバーリストに表示される説明文
              </span>
            </div>
            <input
              type="text"
              className="input-field properties-view__motd-input"
              value={props['motd'] as string}
              onChange={(e) => handleChange('motd', e.target.value)}
            />
          </div>

          <div className="properties-view__row">
            <div className="properties-view__row-info">
              <span>ゲームモード</span>
            </div>
            <select
              className="input-field"
              value={props['gamemode'] as string}
              onChange={(e) => handleChange('gamemode', e.target.value)}
            >
              <option value="survival">サバイバル</option>
              <option value="creative">クリエイティブ</option>
              <option value="adventure">アドベンチャー</option>
              <option value="spectator">スペクテイター</option>
            </select>
          </div>

          <div className="properties-view__row">
            <div className="properties-view__row-info">
              <span>難易度</span>
            </div>
            <select
              className="input-field"
              value={props['difficulty'] as string}
              onChange={(e) => handleChange('difficulty', e.target.value)}
            >
              <option value="peaceful">ピースフル</option>
              <option value="easy">イージー</option>
              <option value="normal">ノーマル</option>
              <option value="hard">ハード</option>
            </select>
          </div>
        </div>

        <div className="properties-view__section">
          <div className="properties-view__section-title">ゲームプレイ</div>
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

        <div className="properties-view__section">
          <div className="properties-view__section-title">接続・ネットワーク</div>

          <div className="properties-view__row">
            <div className="properties-view__row-info">
              <span>最大プレイヤー数</span>
            </div>
            <input
              type="number"
              className="input-field properties-view__number-input properties-view__number-input--sm"
              value={props['max-players'] as number}
              onChange={(e) => handleChange('max-players', Number(e.target.value))}
            />
          </div>

          <div className="properties-view__row">
            <div className="properties-view__row-info">
              <span>サーバーポート</span>
            </div>
            <input
              type="number"
              className="input-field properties-view__number-input properties-view__number-input--md"
              value={props['server-port'] as number}
              onChange={(e) => handleChange('server-port', Number(e.target.value))}
            />
          </div>

          <ToggleItem
            label="オンラインモード"
            desc="正規アカウント認証 (OFFでオフライン許可)"
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

function ToggleItem({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <div className="properties-view__row">
      <div className="properties-view__row-info">
        <span>{label}</span>
        <span className="properties-view__row-description">{desc}</span>
      </div>
      <label className="toggle-switch">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="slider"></span>
      </label>
    </div>
  );
}
