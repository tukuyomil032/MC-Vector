import React, { useState, useEffect, useRef } from 'react';
import { type MinecraftServer } from '../../components/../shared/server declaration';
import JavaManagerModal from '../JavaManagerModal';
import { useToast } from '../ToastProvider';
import { getJavaVersions, type JavaVersion } from '../../../lib/java-commands';
import { startNgrok, stopNgrok, hasNgrokToken, clearNgrokToken } from '../../../lib/ngrok-commands';
import { onNgrokStatusChange } from '../../../lib/ngrok-commands';

interface ServerSettingsProps {
  server: MinecraftServer;
  onSave: (updatedServer: MinecraftServer) => void;
}

const ServerSettings: React.FC<ServerSettingsProps> = ({ server, onSave }) => {
  const [name, setName] = useState(server.name);
  const [software, setSoftware] = useState((server as any).software || 'Paper');
  const [version, setVersion] = useState(server.version);
  const [memory, setMemory] = useState(server.memory);
  const [port, setPort] = useState(server.port);
  const [path, setPath] = useState(server.path);
  const [javaPath, setJavaPath] = useState((server as any).javaPath || '');

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
    if ((server as any).software) setSoftware((server as any).software);
    if ((server as any).javaPath) setJavaPath((server as any).javaPath);

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
        if (data.status === 'connecting' || data.status === 'connected') setIsTunneling(true);
        if (data.status === 'stopped' || data.status === 'error') {
          setIsTunneling(false);
          setTunnelUrl(null);
        }
        if (data.url) setTunnelUrl(data.url);
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

  const versionOptions = [
    '1.21.10',
    '1.21.9',
    '1.21.8',
    '1.21.7',
    '1.21.6',
    '1.21.5',
    '1.21.4',
    '1.21.3',
    '1.21.2',
    '1.21.1',
    '1.21',
    '1.20.6',
    '1.20.5',
    '1.20.4',
    '1.20.3',
    '1.20.2',
    '1.20.1',
    '1.20',
    '1.19.4',
    '1.19.3',
    '1.19.2',
    '1.19.1',
    '1.19',
    '1.18.2',
    '1.18.1',
    '1.18',
    '1.17.1',
    '1.17',
    '1.16.5',
    '1.16.4',
    '1.16.3',
    '1.16.2',
    '1.16.1',
    '1.16',
    '1.15.2',
    '1.15.1',
    '1.15',
    '1.14.4',
    '1.14.3',
    '1.14.2',
    '1.14.1',
    '1.14',
    '1.13.2',
    '1.13.1',
    '1.13',
    '1.12.2',
    '1.12.1',
    '1.12',
    '1.11.2',
    '1.11.1',
    '1.11',
    '1.10.2',
    '1.10.1',
    '1.10',
    '1.9.4',
    '1.9.3',
    '1.9.2',
    '1.9.1',
    '1.9',
    '1.8.9',
  ];

  const handleSubmit = () => {
    onSave({
      ...server,
      name,
      version,
      memory,
      port,
      path,
      ...({ software, javaPath } as any),
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
    if (!inputToken) return;
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
    <div className="h-full overflow-y-auto p-10 text-[#ecf0f1] box-border block">
      <div className="max-w-4xl pb-12">
        <h2 className="mt-0 mb-8 border-b border-zinc-700 pb-2.5">General Settings</h2>

        <div className="mb-8 p-6 bg-[#252526] rounded-lg border border-border-color">
          <h3 className="mt-0 mb-5 text-zinc-300 text-lg">Basic Configuration</h3>

          <div className="mb-5 flex flex-col gap-2">
            <label className="block mb-2 text-zinc-400">サーバー名</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
            />
          </div>

          <div className="flex gap-5 mb-5">
            <div className="flex-1">
              <label className="block mb-2 text-zinc-400">サーバーソフトウェア</label>
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

            <div className="flex-1">
              <label className="block mb-2 text-zinc-400">バージョン</label>
              <select
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                className="input-field"
              >
                {versionOptions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mb-5 flex flex-col gap-2">
            <label className="block mb-2 text-zinc-400">Java Runtime</label>
            <div className="flex gap-2.5">
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

          <div className="flex gap-5 mb-8">
            <div className="flex-1">
              <label className="block mb-2 text-zinc-400">メモリ (MB)</label>
              <input
                type="number"
                value={memory}
                onChange={(e) => setMemory(Number(e.target.value))}
                className="input-field"
              />
            </div>
            <div className="flex-1">
              <label className="block mb-2 text-zinc-400">ポート</label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                className="input-field"
              />
            </div>
          </div>

          <div className="mb-5 flex flex-col gap-2">
            <label className="block mb-2 text-zinc-400">保存先パス</label>
            <div className="flex gap-2.5">
              <input
                type="text"
                value={path}
                readOnly
                className="input-field flex-1 text-zinc-500 bg-[#222]"
              />
            </div>
          </div>

          <div className="text-right mt-5">
            <button onClick={handleSubmit} className="btn-start py-2.5 px-6 text-sm">
              設定を保存
            </button>
          </div>
        </div>

        <div
          className={`p-6 bg-[#252526] rounded-lg border ${isTunneling ? 'border-accent' : 'border-zinc-700'}`}
        >
          <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
            <div className="min-w-[200px]">
              <h3 className="m-0 flex items-center gap-2.5 text-lg text-zinc-300">
                🌐 Public Access (ngrok)
                {isTunneling && (
                  <span className="text-xs bg-success text-white px-2 py-0.5 rounded">ONLINE</span>
                )}
              </h3>
              <div className="text-zinc-400 text-sm mt-1.5">
                ポート開放なしで外部から接続できるようにします。
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5"
                onClick={handleOpenGuide}
                title="接続手順のガイドを開きます"
              >
                <span>❓</span> 接続ガイド
              </button>

              <button
                className="btn-secondary text-xs px-3 py-1.5"
                onClick={handleResetToken}
                title="認証トークンを変更・修正します"
              >
                Change Token
              </button>

              <label className="relative inline-block w-12 h-7 shrink-0">
                <input
                  type="checkbox"
                  checked={isTunneling}
                  onChange={handleToggleTunnel}
                  className="opacity-0 w-0 h-0"
                />
                <span
                  className={`absolute cursor-pointer top-0 left-0 right-0 bottom-0 transition-all rounded-full ${isTunneling ? 'bg-accent' : 'bg-zinc-700'}`}
                >
                  <span
                    className={`absolute h-5 w-5 left-0.5 bottom-0.5 bg-white transition-all rounded-full ${isTunneling ? 'translate-x-6' : ''}`}
                  ></span>
                </span>
              </label>
            </div>
          </div>

          {(isTunneling || tunnelLog.length > 0) && (
            <>
              {tunnelUrl && (
                <div className="bg-[#1e1e1e] p-4 rounded-md mb-4">
                  <div className="text-sm text-zinc-500 mb-1.5">
                    公開アドレス (友人にこれを共有):
                  </div>
                  <div className="flex gap-2.5 items-center">
                    <code className="text-xl text-white font-mono bg-zinc-800 px-2.5 py-1.5 rounded">
                      {tunnelUrl.replace('tcp://', '')}
                    </code>
                    <button className="btn-secondary py-1.5 px-2.5" onClick={handleCopyUrl}>
                      Copy
                    </button>
                  </div>
                </div>
              )}

              <div className="bg-[#111] text-zinc-400 p-2.5 rounded h-[150px] overflow-y-auto text-xs font-mono border border-zinc-800">
                {tunnelLog.length === 0 && <div>Ready to start...</div>}
                {tunnelLog.map((line, i) => (
                  <div key={i} className="border-b border-zinc-900 pb-0.5 mb-0.5">
                    {line}
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </>
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
        <div className="fixed inset-0 bg-black/70 z-10000 flex justify-center items-center">
          <div className="bg-[#2c2c2c] p-6 rounded-lg w-[450px] border border-zinc-700 text-white shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
            <h3 className="mt-0">ngrok AuthToken Required</h3>
            <p className="text-zinc-400 text-sm">
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
            <div className="text-right">
              <button onClick={() => setShowTokenModal(false)} className="btn-secondary mr-2.5">
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
