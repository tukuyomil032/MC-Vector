import { appDataDir } from '@tauri-apps/api/path';
import React, { useEffect, useRef, useState } from 'react';
import { getJavaVersions, type JavaVersion } from '../../../lib/java-commands';
import {
  clearNgrokToken,
  getNgrokToken,
  hasNgrokToken,
  onNgrokStatusChange,
  setNgrokToken,
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
  onOpenNgrokGuide: () => void;
}

const WEEKDAY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: '日曜' },
  { value: 1, label: '月曜' },
  { value: 2, label: '火曜' },
  { value: 3, label: '水曜' },
  { value: 4, label: '木曜' },
  { value: 5, label: '金曜' },
  { value: 6, label: '土曜' },
];

const ServerSettings: React.FC<ServerSettingsProps> = ({ server, onSave, onOpenNgrokGuide }) => {
  const [name, setName] = useState(server.name);
  const [profileName, setProfileName] = useState(server.profileName || '');
  const [groupName, setGroupName] = useState(server.groupName || '');
  const [software, setSoftware] = useState(server.software || 'Paper');
  const [version, setVersion] = useState(server.version);
  const [memory, setMemory] = useState(server.memory);
  const [port, setPort] = useState(server.port);
  const [path, setPath] = useState(server.path);
  const [javaPath, setJavaPath] = useState(server.javaPath || '');
  const [autoRestartOnCrash, setAutoRestartOnCrash] = useState(Boolean(server.autoRestartOnCrash));
  const [maxAutoRestarts, setMaxAutoRestarts] = useState(server.maxAutoRestarts ?? 3);
  const [autoRestartDelaySec, setAutoRestartDelaySec] = useState(server.autoRestartDelaySec ?? 5);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(Boolean(server.autoBackupEnabled));
  const [autoBackupIntervalMin, setAutoBackupIntervalMin] = useState(
    server.autoBackupIntervalMin ?? 60,
  );
  const [autoBackupScheduleType, setAutoBackupScheduleType] = useState<
    'interval' | 'daily' | 'weekly'
  >(server.autoBackupScheduleType ?? 'interval');
  const [autoBackupTime, setAutoBackupTime] = useState(server.autoBackupTime ?? '03:00');
  const [autoBackupWeekday, setAutoBackupWeekday] = useState(server.autoBackupWeekday ?? 0);

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
    setProfileName(server.profileName || '');
    setGroupName(server.groupName || '');
    setVersion(server.version);
    setMemory(server.memory);
    setPort(server.port);
    setPath(server.path);
    if (server.software) {
      setSoftware(server.software);
    }
    if (server.javaPath) {
      setJavaPath(server.javaPath);
    } else {
      setJavaPath('');
    }
    setAutoRestartOnCrash(Boolean(server.autoRestartOnCrash));
    setMaxAutoRestarts(server.maxAutoRestarts ?? 3);
    setAutoRestartDelaySec(server.autoRestartDelaySec ?? 5);
    setAutoBackupEnabled(Boolean(server.autoBackupEnabled));
    setAutoBackupIntervalMin(server.autoBackupIntervalMin ?? 60);
    setAutoBackupScheduleType(server.autoBackupScheduleType ?? 'interval');
    setAutoBackupTime(server.autoBackupTime ?? '03:00');
    setAutoBackupWeekday(server.autoBackupWeekday ?? 0);

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
    const normalizedRestartLimit = Math.min(20, Math.max(0, Math.floor(maxAutoRestarts || 0)));
    const normalizedRestartDelay = Math.min(300, Math.max(1, Math.floor(autoRestartDelaySec || 1)));
    const normalizedBackupInterval = Math.min(
      1440,
      Math.max(1, Math.floor(autoBackupIntervalMin || 1)),
    );
    const normalizedScheduleType: 'interval' | 'daily' | 'weekly' =
      autoBackupScheduleType === 'daily' || autoBackupScheduleType === 'weekly'
        ? autoBackupScheduleType
        : 'interval';
    const normalizedBackupTime = /^([01]\d|2[0-3]):([0-5]\d)$/.test(autoBackupTime.trim())
      ? autoBackupTime.trim()
      : '03:00';
    const normalizedBackupWeekday = Math.min(6, Math.max(0, Math.floor(autoBackupWeekday || 0)));

    onSave({
      ...server,
      name,
      profileName: profileName.trim() || undefined,
      groupName: groupName.trim() || undefined,
      version,
      memory,
      port,
      path,
      software,
      javaPath: javaPath || undefined,
      autoRestartOnCrash,
      maxAutoRestarts: normalizedRestartLimit,
      autoRestartDelaySec: normalizedRestartDelay,
      autoBackupEnabled,
      autoBackupIntervalMin: normalizedBackupInterval,
      autoBackupScheduleType: normalizedScheduleType,
      autoBackupTime: normalizedBackupTime,
      autoBackupWeekday: normalizedBackupWeekday,
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
      const tokenToUse = inputToken || (await getNgrokToken()) || '';
      if (!tokenToUse) {
        setShowTokenModal(true);
        return;
      }
      setTunnelLog((prev) => [...prev, '--- Initializing ngrok ---']);
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
    await setNgrokToken(inputToken);
    setShowTokenModal(false);
    setTunnelLog(['--- Initializing ngrok with new token ---']);
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
    onOpenNgrokGuide();
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
              <label className="server-settings__label">プロファイル名</label>
              <input
                type="text"
                value={profileName}
                onChange={(event) => setProfileName(event.target.value)}
                placeholder="例: Survival"
                className="input-field"
              />
            </div>

            <div className="server-settings__col">
              <label className="server-settings__label">グループ名</label>
              <input
                type="text"
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                placeholder="例: Production"
                className="input-field"
              />
            </div>
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

          <div className="server-settings__field-block">
            <label className="server-settings__label">クラッシュ時の自動再起動</label>
            <label className="server-settings__java-row">
              <input
                type="checkbox"
                checked={autoRestartOnCrash}
                onChange={(event) => setAutoRestartOnCrash(event.target.checked)}
              />
              <span>異常終了を検知したら自動再起動する</span>
            </label>

            <div className="server-settings__row">
              <div className="server-settings__col">
                <label className="server-settings__label">最大再試行回数</label>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={maxAutoRestarts}
                  onChange={(event) => setMaxAutoRestarts(Number(event.target.value))}
                  className="input-field"
                />
              </div>

              <div className="server-settings__col">
                <label className="server-settings__label">再起動待機秒数</label>
                <input
                  type="number"
                  min={1}
                  max={300}
                  value={autoRestartDelaySec}
                  onChange={(event) => setAutoRestartDelaySec(Number(event.target.value))}
                  className="input-field"
                />
              </div>
            </div>
          </div>

          <div className="server-settings__field-block">
            <label className="server-settings__label">自動バックアップ</label>
            <label className="server-settings__java-row">
              <input
                type="checkbox"
                checked={autoBackupEnabled}
                onChange={(event) => setAutoBackupEnabled(event.target.checked)}
              />
              <span>定期的にバックアップを作成する</span>
            </label>

            <div className="server-settings__row">
              <div className="server-settings__col">
                <label className="server-settings__label">スケジュール方式</label>
                <select
                  value={autoBackupScheduleType}
                  onChange={(event) =>
                    setAutoBackupScheduleType(event.target.value as 'interval' | 'daily' | 'weekly')
                  }
                  className="input-field"
                >
                  <option value="interval">一定間隔</option>
                  <option value="daily">毎日指定時刻</option>
                  <option value="weekly">毎週指定時刻</option>
                </select>
              </div>

              {autoBackupScheduleType === 'interval' ? (
                <div className="server-settings__col">
                  <label className="server-settings__label">実行間隔（分）</label>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={autoBackupIntervalMin}
                    onChange={(event) => setAutoBackupIntervalMin(Number(event.target.value))}
                    className="input-field"
                  />
                </div>
              ) : (
                <div className="server-settings__col">
                  <label className="server-settings__label">実行時刻</label>
                  <input
                    type="time"
                    value={autoBackupTime}
                    onChange={(event) => setAutoBackupTime(event.target.value)}
                    className="input-field"
                  />
                </div>
              )}

              {autoBackupScheduleType === 'weekly' && (
                <div className="server-settings__col">
                  <label className="server-settings__label">曜日</label>
                  <select
                    value={autoBackupWeekday}
                    onChange={(event) => setAutoBackupWeekday(Number(event.target.value))}
                    className="input-field"
                  >
                    {WEEKDAY_OPTIONS.map((weekday) => (
                      <option key={weekday.value} value={weekday.value}>
                        {weekday.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
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
              className="input-field server-settings__token-input"
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
                className="btn-primary server-settings__token-save disabled:opacity-50"
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
