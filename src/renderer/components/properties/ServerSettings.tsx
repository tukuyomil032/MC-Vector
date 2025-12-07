import React, { useState, useEffect, useRef } from 'react';
import { type MinecraftServer } from '../../shared/server declaration';
import JavaManagerModal from '../JavaManagerModal';
import '../../../main.css';

interface ServerSettingsProps {
  server: MinecraftServer;
  onSave: (updatedServer: MinecraftServer) => void;
}

const ServerSettings: React.FC<ServerSettingsProps> = ({ server, onSave }) => {
  // --- 一般設定 State ---
  const [name, setName] = useState(server.name);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [software, setSoftware] = useState((server as any).software || 'Paper');
  const [version, setVersion] = useState(server.version);
  const [memory, setMemory] = useState(server.memory);
  const [port, setPort] = useState(server.port);
  const [path, setPath] = useState(server.path);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [javaPath, setJavaPath] = useState((server as any).javaPath || '');

  // Java管理用ステート
  const [showJavaManager, setShowJavaManager] = useState(false);
  const [installedJava, setInstalledJava] = useState<{ name: string, path: string }[]>([]);

  // --- ngrok State ---
  const [isTunneling, setIsTunneling] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [tunnelLog, setTunnelLog] = useState<string[]>([]);

  // トークン入力モーダル用
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [inputToken, setInputToken] = useState('');

  const logEndRef = useRef<HTMLDivElement>(null);

  // --- Effects ---

  useEffect(() => {
    setName(server.name);
    setVersion(server.version);
    setMemory(server.memory);
    setPort(server.port);
    setPath(server.path);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((server as any).software) setSoftware((server as any).software);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((server as any).javaPath) setJavaPath((server as any).javaPath);

    loadJavaList();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server]);

  // ngrokイベントリスナー
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const removeNgrokListener = window.electronAPI.onNgrokInfo((_event: any, data: any) => {
      if (data.serverId === server.id) {
        if (data.status === 'running') setIsTunneling(true);

        // 停止またはエラー時はスイッチをOFFにする
        if (data.status === 'stopped' || data.status === 'error') {
            setIsTunneling(false);
            setTunnelUrl(null);
        }

        if (data.status === 'downloading') {
            setTunnelLog(prev => [...prev, "Downloading ngrok binary..."]);
        }

        if (data.url) setTunnelUrl(data.url);

        if (data.log) {
            setTunnelLog(prev => [...prev, data.log].slice(-50));
        }
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return () => { if (typeof removeNgrokListener === 'function') (removeNgrokListener as any)(); };
  }, [server.id]);

  // ログ自動スクロール
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [tunnelLog]);

  const loadJavaList = async () => {
    const list = await window.electronAPI.getJavaVersions();
    setInstalledJava(list);
  };

  // バージョンリスト
  const versionOptions = [
    '1.21.10', '1.21.9', '1.21.8', '1.21.7', '1.21.6', '1.21.5', '1.21.4', '1.21.3', '1.21.2', '1.21.1', '1.21',
    '1.20.6', '1.20.5', '1.20.4', '1.20.3', '1.20.2', '1.20.1', '1.20',
    '1.19.4', '1.19.3', '1.19.2', '1.19.1', '1.19',
    '1.18.2', '1.18.1', '1.18',
    '1.17.1', '1.17',
    '1.16.5', '1.16.4', '1.16.3', '1.16.2', '1.16.1', '1.16',
    '1.15.2', '1.15.1', '1.15',
    '1.14.4', '1.14.3', '1.14.2', '1.14.1', '1.14',
    '1.13.2', '1.13.1', '1.13',
    '1.12.2', '1.12.1', '1.12',
    '1.11.2', '1.11.1', '1.11',
    '1.10.2', '1.10.1', '1.10',
    '1.9.4', '1.9.3', '1.9.2', '1.9.1', '1.9',
    '1.8.9'
  ];

  const handleSubmit = () => {
    onSave({
      ...server,
      name,
      version,
      memory,
      port,
      path,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...({ software, javaPath } as any)
    });
  };

  // --- ngrok 操作 ---
  const handleToggleTunnel = async () => {
    const nextState = !isTunneling;

    if (nextState) {
        // トークンチェック
        const token = await window.electronAPI.getNgrokToken();
        if (!token) {
            setShowTokenModal(true);
            return;
        }
        setTunnelLog(prev => [...prev, '--- Initializing ngrok ---']);
        await window.electronAPI.toggleNgrok(server.id, true, token);
    } else {
        await window.electronAPI.toggleNgrok(server.id, false);
    }
  };

  // ★追加: トークン再設定ボタン用
  const handleResetToken = () => {
    setInputToken(''); // 入力を空にしておく
    setShowTokenModal(true);
  };

  const handleTokenSubmit = async () => {
    if (!inputToken) return;
    setShowTokenModal(false);
    setTunnelLog(['--- Initializing ngrok with new token ---']);
    // 新しいトークンで起動を試みる (configも更新される)
    await window.electronAPI.toggleNgrok(server.id, true, inputToken);
  };

  const handleCopyUrl = () => {
    if (tunnelUrl) {
        navigator.clipboard.writeText(tunnelUrl);
        alert('アドレスをコピーしました！');
    }
  };

  return (
    <div className="properties-container" style={{
      height: '100%',
      overflowY: 'auto',
      padding: '40px',
      color: '#ecf0f1',
      boxSizing: 'border-box',
      display: 'block'
    }}>
      <div style={{ maxWidth: '800px', paddingBottom: '50px' }}>
        <h2 style={{ marginTop: 0, marginBottom: '30px', borderBottom: '1px solid #444', paddingBottom: '10px' }}>
          General Settings
        </h2>

        {/* Basic Configuration Card */}
        <div className="setting-card" style={{ marginBottom: '30px', padding: '25px', backgroundColor: '#252526', borderRadius: '8px' }}>
          <h3 style={{ marginTop: 0, marginBottom: '20px', color: '#ccc', fontSize: '1.1rem' }}>Basic Configuration</h3>

          <div className="form-group" style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', color: '#aaa' }}>サーバー名</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
            />
          </div>

          <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '8px', color: '#aaa' }}>サーバーソフトウェア</label>
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

            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '8px', color: '#aaa' }}>バージョン</label>
              <select
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                className="input-field"
              >
                {versionOptions.map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', color: '#aaa' }}>Java Runtime</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <select
                value={javaPath}
                onChange={(e) => setJavaPath(e.target.value)}
                className="input-field"
                style={{ flex: 1 }}
              >
                <option value="">System Default (Path環境変数)</option>
                {installedJava.map(j => (
                  <option key={j.path} value={j.path}>{j.name} ({j.path})</option>
                ))}
              </select>
              <button
                className="btn-secondary"
                onClick={() => { setShowJavaManager(true); loadJavaList(); }}
                style={{ whiteSpace: 'nowrap' }}
              >
                Manage Java...
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '20px', marginBottom: '30px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '8px', color: '#aaa' }}>メモリ (GB)</label>
              <input
                type="number"
                value={memory}
                onChange={(e) => setMemory(Number(e.target.value))}
                className="input-field"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '8px', color: '#aaa' }}>ポート</label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                className="input-field"
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', color: '#aaa' }}>保存先パス</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="text"
                value={path}
                readOnly
                className="input-field"
                style={{ flex: 1, color: '#888', background: '#222' }}
              />
            </div>
          </div>

          <div style={{ textAlign: 'right', marginTop: '20px' }}>
            <button
              onClick={handleSubmit}
              className="btn-start"
              style={{ padding: '10px 24px', fontSize: '14px' }}
            >
              設定を保存
            </button>
          </div>
        </div>

        {/* Public Access (ngrok) Card */}
        <div className="setting-card" style={{ padding: '25px', backgroundColor: '#252526', borderRadius: '8px', border: isTunneling ? '1px solid #5865F2' : '1px solid #444' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <div>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.1rem', color: '#ccc' }}>
                🌐 Public Access (ngrok)
                {isTunneling && <span style={{ fontSize: '0.8rem', background: '#3ba55c', color: '#fff', padding: '2px 8px', borderRadius: '4px' }}>ONLINE</span>}
              </h3>
              <div style={{ color: '#aaa', fontSize: '0.9rem', marginTop: '5px' }}>
                ポート開放なしで外部から接続できるようにします。
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                {/* ★追加: トークン再設定ボタン */}
                <button
                    className="btn-secondary"
                    onClick={handleResetToken}
                    style={{ fontSize: '0.8rem', padding: '6px 12px' }}
                    title="認証トークンを変更・修正します"
                >
                    Change Token
                </button>

                <label className="switch">
                  <input type="checkbox" checked={isTunneling} onChange={handleToggleTunnel} />
                  <span className="slider round"></span>
                </label>
            </div>
          </div>

          {/* 接続情報表示 */}
          {isTunneling && tunnelUrl && (
            <div style={{ background: '#1e1e1e', padding: '15px', borderRadius: '6px', marginBottom: '15px' }}>
              <div style={{ fontSize: '0.9rem', color: '#888', marginBottom: '5px' }}>公開アドレス (友人にこれを共有):</div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <code style={{ fontSize: '1.2rem', color: '#fff', fontFamily: 'monospace', background: '#333', padding: '5px 10px', borderRadius: '4px' }}>
                  {tunnelUrl.replace('tcp://', '')}
                </code>
                <button className="btn-secondary" onClick={handleCopyUrl} style={{ padding: '5px 10px' }}>Copy</button>
              </div>
            </div>
          )}

          {/* ログ表示 (常時表示) */}
          {(isTunneling || tunnelLog.length > 0) && (
            <div style={{
              background: '#111', color: '#aaa', padding: '10px', borderRadius: '4px',
              height: '150px', overflowY: 'auto', fontSize: '0.8rem', fontFamily: 'monospace', border: '1px solid #333'
            }}>
                {tunnelLog.length === 0 && <div>Ready to start...</div>}
                {tunnelLog.map((line, i) => <div key={i} style={{ borderBottom: '1px solid #222', paddingBottom: '2px', marginBottom: '2px' }}>{line}</div>)}
                <div ref={logEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* Java管理モーダル */}
      {showJavaManager && <JavaManagerModal onClose={() => { setShowJavaManager(false); loadJavaList(); }} />}

      {/* ngrokトークン入力モーダル */}
      {showTokenModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 10000,
          display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}>
          <div style={{
            background: '#2c2c2c', padding: '25px', borderRadius: '8px',
            width: '450px', border: '1px solid #444', color: '#fff',
            boxShadow: '0 8px 30px rgba(0,0,0,0.5)'
          }}>
            <h3 style={{ marginTop: 0 }}>ngrok AuthToken Required</h3>
            <p style={{ color: '#aaa', fontSize: '0.9rem' }}>
              ngrokを使用するには認証トークンが必要です。<br/>
              公式サイト (<a href="https://dashboard.ngrok.com/get-started/your-authtoken" target="_blank" style={{color: '#5865F2'}}>dashboard.ngrok.com</a>) からトークンを取得して貼り付けてください。
            </p>
            <input
              type="text"
              className="input-field"
              placeholder="Ex: 2A..."
              value={inputToken}
              onChange={(e) => setInputToken(e.target.value)}
              style={{ width: '100%', marginBottom: '20px' }}
            />
            <div style={{ textAlign: 'right' }}>
              <button
                onClick={() => setShowTokenModal(false)}
                className="btn-secondary"
                style={{ marginRight: '10px' }}
              >
                キャンセル
              </button>
              <button
                onClick={handleTokenSubmit}
                className="btn-primary"
                disabled={!inputToken}
              >
                保存して接続
              </button>
            </div>
          </div>
        </div>
      )}

      {/* スタイル定義 */}
      <style>{`
        .switch { position: relative; display: inline-block; width: 50px; height: 26px; }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #444; transition: .4s; border-radius: 34px; }
        .slider:before { position: absolute; content: ""; height: 20px; width: 20px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; }
        input:checked + .slider { background-color: #5865F2; }
        input:checked + .slider:before { transform: translateX(24px); }
      `}</style>
    </div>
  );
};

export default ServerSettings;