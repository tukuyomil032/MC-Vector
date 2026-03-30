import React, { useEffect, useRef, useState } from 'react';
import { getJavaVersions, type JavaVersion } from '../../../lib/java-commands';
import {
  clearNgrokToken,
  hasNgrokToken,
  onNgrokStatusChange,
  startNgrok,
  stopNgrok,
} from '../../../lib/ngrok-commands';
import { type MinecraftServer } from '../../components/../shared/server declaration';
import { VERSION_OPTIONS } from '../../constants/versionOptions';
import JavaManagerModal from '../JavaManagerModal';
import { useToast } from '../ToastProvider';

interface ServerSettingsProps {
  server: MinecraftServer;
  onSave: (updatedServer: MinecraftServer) => void;
}

const ServerSettings: React.FC<ServerSettingsProps> = ({ server, onSave }) => {
  const [name, setName] = useState(server.name);
  const [software, setSoftware] = useState(server.software || 'Paper');
  const [version, setVersion] = useState(server.version);
  const [memory, setMemory] = useState(server.memory);
  const [port, setPort] = useState(server.port);
  const [path, setPath] = useState(server.path);
  const [javaPath, setJavaPath] = useState(server.javaPath || '');

  const [showJavaManager, setShowJavaManager] = useState(false);
  const [installedJava, setInstalledJava] = useState<JavaVersion[]>([]);

  const [isTunneling, setIsTunneling] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [tunnelLog, setTunnelLog] = useState<string[]>([]);

  const [showTokenModal, setShowTokenModal] = useState(false);
  const [inputToken, setInputToken] = useState('');

  const { showToast } = useToast();

  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setName(server.name);
    setVersion(server.version);
    setMemory(server.memory);
    setPort(server.port);
    setPath(server.path);
    if (server.software) {
      setSoftware(server.software);
    }
    if (server.javaPath) {
      setJavaPath(server.javaPath);
    }

    loadJavaList();

    checkNgrokStatus();
  }, [server]);

  const checkNgrokStatus = async () => {
    // Ngrok status is now event-driven via onNgrokStatusChange
  };

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    onNgrokStatusChange((data) => {
      if (data.serverId === server.id) {
        if (data.status === 'connecting' || data.status === 'connected') {
          setIsTunneling(true);
        }
        if (data.status === 'stopped' || data.status === 'error') {
          setIsTunneling(false);
          setTunnelUrl(null);
        }
        if (data.url) {
          setTunnelUrl(data.url);
        }
      }
    }).then((u) => {
      unlisten = u;
    });

    return () => {
      unlisten?.();
    };
  }, [server.id]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [tunnelLog]);

  const loadJavaList = async () => {
    const list = await getJavaVersions();
    setInstalledJava(list);
  };

  const handleSubmit = () => {
    onSave({
      ...server,
      name,
      version,
      memory,
      port,
      path,
      software,
      javaPath: javaPath || undefined,
    });
  };

  const handleToggleTunnel = async () => {
    const nextState = !isTunneling;

    if (nextState) {
      const hasToken = await hasNgrokToken();
      if (!hasToken && !inputToken) {
        setShowTokenModal(true);
        return;
      }
      const { getNgrokToken } = await import('../../../lib/ngrok-commands');
      const tokenToUse = inputToken || (await getNgrokToken()) || '';
      if (!tokenToUse) {
        setShowTokenModal(true);
        return;
      }
      setTunnelLog((prev) => [...prev, '--- Initializing ngrok ---']);
      const { appDataDir } = await import('@tauri-apps/api/path');
      const ngrokPath = `${await appDataDir()}/ngrok`;
      await startNgrok(ngrokPath, 'tcp', server.port, tokenToUse, server.id);
      setInputToken('');
    } else {
      await stopNgrok();
    }
  };

  const handleResetToken = async () => {
    await clearNgrokToken();
    setInputToken('');
    setShowTokenModal(true);
  };

  const handleTokenSubmit = async () => {
    if (!inputToken) {
      return;
    }
    const { setNgrokToken } = await import('../../../lib/ngrok-commands');
    await setNgrokToken(inputToken);
    setShowTokenModal(false);
    setTunnelLog(['--- Initializing ngrok with new token ---']);
    const { appDataDir } = await import('@tauri-apps/api/path');
    const ngrokPath = `${await appDataDir()}/ngrok`;
    await startNgrok(ngrokPath, 'tcp', server.port, inputToken, server.id);
    setInputToken('');
  };

  const handleCopyUrl = () => {
    if (tunnelUrl) {
      navigator.clipboard.writeText(tunnelUrl);
      showToast('アドレスをコピーしました！', 'success');
    }
  };

  const handleOpenGuide = async () => {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl('https://dashboard.ngrok.com/get-started/setup');
  };

  return (
    <div className="server-settings">
      <div className="server-settings__inner">
        <h2 className="server-settings__title">General Settings</h2>

        <div className="server-settings__panel">
          <h3 className="server-settings__panel-title">Basic Configuration</h3>

          <div className="server-settings__field-block">
            <label className="server-settings__label">サーバー名</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
            />
          </div>

          <div className="server-settings__row">
            <div className="server-settings__col">
              <label className="server-settings__label">サーバーソフトウェア</label>
              <select
                value={software}
                onChange={(e) => setSoftware(e.target.value)}
                className="input-field"
              >
                <optgroup label="Standard">
                  <option value="Vanilla">Vanilla (公式)</option>
                  <option value="Paper">Paper (推奨)</option>
                  <option value="LeafMC">LeafMC (Paper Fork)</option>
                  <option value="Spigot">Spigot</option>
                </optgroup>
                <optgroup label="Modded">
                  <option value="Fabric">Fabric</option>
                  <option value="Forge">Forge</option>
                </optgroup>
                <optgroup label="Proxy">
                  <option value="Velocity">Velocity</option>
                  <option value="Waterfall">Waterfall</option>
                  <option value="BungeeCord">BungeeCord</option>
                </optgroup>
              </select>
            </div>

            <div className="server-settings__col">
              <label className="server-settings__label">バージョン</label>
              <select
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                className="input-field"
              >
                {VERSION_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="server-settings__field-block">
            <label className="server-settings__label">Java Runtime</label>
            <div className="server-settings__java-row">
              <select
                value={javaPath}
                onChange={(e) => setJavaPath(e.target.value)}
                className="input-field flex-1"
              >
                <option value="">System Default (Path環境変数)</option>
                {installedJava.map((j) => (
                  <option key={j.path} value={j.path}>
                    {j.name} ({j.path})
                  </option>
                ))}
              </select>
              <button
                className="btn-secondary whitespace-nowrap"
                onClick={() => {
                  setShowJavaManager(true);
                  loadJavaList();
                }}
              >
                Manage Java...
              </button>
            </div>
          </div>

          <div className="server-settings__row server-settings__row--spaced">
            <div className="server-settings__col">
              <label className="server-settings__label">メモリ (MB)</label>
              <input
                type="number"
                value={memory}
                onChange={(e) => setMemory(Number(e.target.value))}
                className="input-field"
              />
            </div>
            <div className="server-settings__col">
              <label className="server-settings__label">ポート</label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                className="input-field"
              />
            </div>
          </div>

          <div className="server-settings__field-block">
            <label className="server-settings__label">保存先パス</label>
            <div className="server-settings__java-row">
              <input
                type="text"
                value={path}
                readOnly
                className="input-field server-settings__path-input"
              />
            </div>
          </div>

          <div className="server-settings__actions">
            <button onClick={handleSubmit} className="btn-start server-settings__save-btn">
              設定を保存
            </button>
          </div>
        </div>

        <div className={`server-settings__ngrok-panel ${isTunneling ? 'is-active' : ''}`}>
          <div className="server-settings__ngrok-header">
            <div className="server-settings__ngrok-title-wrap">
              <h3 className="server-settings__ngrok-title">
                🌐 Public Access (ngrok)
                {isTunneling && <span className="server-settings__online-badge">ONLINE</span>}
              </h3>
              <div className="server-settings__ngrok-description">
                ポート開放なしで外部から接続できるようにします。
              </div>
            </div>

            <div className="server-settings__ngrok-controls">
              <button
                className="btn-secondary server-settings__ngrok-btn server-settings__ngrok-btn--with-icon"
                onClick={handleOpenGuide}
                title="接続手順のガイドを開きます"
              >
                <span>❓</span> 接続ガイド
              </button>

              <button
                className="btn-secondary server-settings__ngrok-btn"
                onClick={handleResetToken}
                title="認証トークンを変更・修正します"
              >
                Change Token
              </button>

              <label className="server-settings__ngrok-switch">
                <input
                  type="checkbox"
                  checked={isTunneling}
                  onChange={handleToggleTunnel}
                  className="server-settings__ngrok-switch-input"
                />
                <span
                  className={`server-settings__ngrok-switch-track ${isTunneling ? 'is-on' : 'is-off'}`}
                >
                  <span
                    className={`server-settings__ngrok-switch-thumb ${isTunneling ? 'is-on' : ''}`}
                  ></span>
                </span>
              </label>
            </div>
          </div>

          {(isTunneling || tunnelLog.length > 0) && (
            <div className="server-settings__ngrok-status">
              {tunnelUrl && (
                <div className="server-settings__address-card">
                  <div className="server-settings__address-label">
                    公開アドレス (友人にこれを共有):
                  </div>
                  <div className="server-settings__address-row">
                    <code className="server-settings__address-code">
                      {tunnelUrl.replace('tcp://', '')}
                    </code>
                    <button
                      className="btn-secondary server-settings__copy-btn"
                      onClick={handleCopyUrl}
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}

              <div className="server-settings__log-panel">
                {tunnelLog.length === 0 && <div>Ready to start...</div>}
                {tunnelLog.map((line, i) => (
                  <div key={i} className="server-settings__log-line">
                    {line}
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>
          )}
        </div>
      </div>

      {showJavaManager && (
        <JavaManagerModal
          onClose={() => {
            setShowJavaManager(false);
            loadJavaList();
          }}
        />
      )}

      {showTokenModal && (
        <div className="server-settings__token-overlay modal-backdrop">
          <div className="server-settings__token-panel modal-panel">
            <h3 className="server-settings__token-title">ngrok AuthToken Required</h3>
            <p className="server-settings__token-text">
              ngrokを使用するには認証トークンが必要です。
              <br />
              公式サイト (
              <a
                href="https://dashboard.ngrok.com/get-started/your-authtoken"
                target="_blank"
                rel="noreferrer"
                className="text-accent"
              >
                dashboard.ngrok.com
              </a>
              ) からトークンを取得して貼り付けてください。
            </p>
            <input
              type="text"
              className="input-field w-full mb-5"
              placeholder="Ex: 2A..."
              value={inputToken}
              onChange={(e) => setInputToken(e.target.value)}
            />
            <div className="server-settings__token-actions">
              <button
                onClick={() => setShowTokenModal(false)}
                className="btn-secondary server-settings__token-cancel"
              >
                キャンセル
              </button>
              <button
                onClick={handleTokenSubmit}
                className="btn-primary disabled:opacity-50"
                disabled={!inputToken}
              >
                保存して接続
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServerSettings;
