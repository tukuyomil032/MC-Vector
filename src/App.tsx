import { useState, useEffect, useRef } from 'react';
import './main.css';
import { type MinecraftServer, type AppView } from './renderer/shared/server declaration';
import DashboardView from './renderer/components/DashboardView';
import ConsoleView from './renderer/components/ConsoleView';
import ServerSettings from './renderer/components/properties/ServerSettings';
import PropertiesView from './renderer/components/properties/PropertiesView';
import FilesView from './renderer/components/FilesView';
import PluginBrowser from './renderer/components/PluginBrowser';
import BackupsView from './renderer/components/BackupsView';
import ProxySetupView, { type ProxyNetworkConfig } from './renderer/components/ProxySetupView';
import AddServerModal from './renderer/components/AddServerModal';
import Toast from './renderer/components/Toast';

function App() {
  const [servers, setServers] = useState<MinecraftServer[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string>('');
  const [currentView, setCurrentView] = useState<AppView>('dashboard');
  const [showAddServerModal, setShowAddServerModal] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, serverId: string } | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<{ id: string, progress: number, msg: string } | null>(null);
  const [toast, setToast] = useState<{ msg: string, type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ msg, type });
  };

  const [serverLogs, setServerLogs] = useState<Record<string, string[]>>({});
  const selectedServerIdRef = useRef(selectedServerId);

  useEffect(() => {
    selectedServerIdRef.current = selectedServerId;
  }, [selectedServerId]);

  useEffect(() => {
    const loadServers = async () => {
      try {
        const loadedServers = await window.electronAPI.getServers();
        setServers(loadedServers);
        if (loadedServers.length > 0 && !selectedServerId) {
          setSelectedServerId(loadedServers[0].id);
        }
      } catch (e) {
        showToast("サーバーリスト読み込みエラー", 'error');
      }
    };
    loadServers();

    // ログリスナー
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const removeLogListener = window.electronAPI.onServerLog((_event: any, data: any) => {
      if (!data || !data.serverId) return;
      const formattedLog = data.log.replace(/\n/g, '\r\n');
      setServerLogs(prev => {
        const currentLogs = prev[data.serverId] || [];
        const newLogs = [...currentLogs, formattedLog];
        if (newLogs.length > 2000) newLogs.shift();
        return { ...prev, [data.serverId]: newLogs };
      });
    });

    // DL進捗リスナー
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    window.electronAPI.onDownloadProgress((_event: any, data: any) => {
      if (data.progress === 100) {
        setDownloadStatus(null);
        showToast(`ダウンロード完了: ${data.status}`, 'success');
      } else {
        setDownloadStatus({ id: data.serverId, progress: data.progress, msg: data.status });
      }
    });

    // ★追加: ステータス更新リスナー
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const removeStatusListener = window.electronAPI.onServerStatusUpdate((_event: any, data: any) => {
      setServers(prev => prev.map(s =>
        s.id === data.serverId ? { ...s, status: data.status } : s
      ));
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return () => {
      if (typeof removeLogListener === 'function') (removeLogListener as any)();
      if (typeof removeStatusListener === 'function') (removeStatusListener as any)();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeServer = servers.find(s => s.id === selectedServerId);

  const handleStart = () => { if (selectedServerId) window.electronAPI.startServer(selectedServerId); };
  const handleStop = () => { if (selectedServerId) window.electronAPI.stopServer(selectedServerId); };

  // ★修正: 再起動処理 (手動でステータス変更)
  const handleRestart = async () => {
    if (!selectedServerId) return;

    // UIをRestarting...にする
    setServers(prev => prev.map(s => s.id === selectedServerId ? { ...s, status: 'restarting' } : s));

    await window.electronAPI.stopServer(selectedServerId);

    // 停止処理待ち (簡易的に3秒)
    setTimeout(() => {
      window.electronAPI.startServer(selectedServerId);
    }, 3000);
  };

  const handleUpdateServer = async (updatedServer: MinecraftServer) => {
    setServers(prev => prev.map(s => s.id === updatedServer.id ? updatedServer : s));
    await window.electronAPI.updateServer(updatedServer);
    showToast('設定を保存しました', 'success');
  };

  const handleAddServer = async (serverData: any) => {
    try {
      const newServer = await window.electronAPI.addServer(serverData);
      setServers(prev => [...prev, newServer]);
      setSelectedServerId(newServer.id);
      setShowAddServerModal(false);
      showToast('サーバーを作成しました', 'success');

      if (['Forge', 'Fabric', 'LeafMC', 'Paper', 'Vanilla', 'Velocity', 'Waterfall'].includes(serverData.software)) {
         setDownloadStatus({ id: newServer.id, progress: 0, msg: 'ダウンロード開始...' });
         await window.electronAPI.downloadServerJar(newServer.id);
      }
    } catch (e) {
      showToast('サーバー作成に失敗しました', 'error');
    }
  };

  const handleBuildProxyNetwork = async (config: ProxyNetworkConfig) => {
    if (!window.confirm(`構成を開始しますか？`)) return;
    try {
      const result = await window.electronAPI.setupProxy(config);
      showToast(result.message, result.success ? 'success' : 'error');
    } catch (error) {
      showToast('エラーが発生しました', 'error');
    }
  };

  const handleContextMenu = (e: React.MouseEvent, serverId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.pageX, y: e.pageY, serverId });
  };

  const handleDeleteServer = async () => {
    if (!contextMenu) return;
    const { serverId } = contextMenu;
    const target = servers.find(s => s.id === serverId);
    if (!window.confirm(`本当に「${target?.name}」を削除しますか？`)) { setContextMenu(null); return; }
    try {
      const success = await window.electronAPI.deleteServer(serverId);
      if (success) {
        const newServers = servers.filter(s => s.id !== serverId);
        setServers(newServers);
        setServerLogs(prev => { const n = {...prev}; delete n[serverId]; return n; });
        if (selectedServerId === serverId) setSelectedServerId(newServers.length > 0 ? newServers[0].id : '');
        showToast('サーバーを削除しました', 'success');
      } else { showToast('削除に失敗しました', 'error'); }
    } catch (e) { showToast('削除エラー', 'error'); }
    setContextMenu(null);
  };

  const handleClickOutside = () => { if (contextMenu) setContextMenu(null); };

  const renderContent = () => {
    if (currentView === 'proxy') return <ProxySetupView servers={servers} onBuildNetwork={handleBuildProxyNetwork} />;
    if (!activeServer) return <div style={{padding: 40, textAlign: 'center', color: '#666', fontSize: '1.2rem'}}>サーバーを選択するか、作成してください</div>;

    const contentKey = `${activeServer.id}-${currentView}`;

    switch (currentView) {
      case 'dashboard': return <DashboardView key={contentKey} server={activeServer} />;
      case 'console': return <ConsoleView key={contentKey} server={activeServer} logs={serverLogs[activeServer.id] || []} />;
      case 'properties': return <PropertiesView key={contentKey} server={activeServer} />;
      case 'files': return <FilesView key={contentKey} server={activeServer} />;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      case 'plugins' as any: return <PluginBrowser key={contentKey} server={activeServer} />;
      case 'backups': return <BackupsView key={contentKey} server={activeServer} />;
      case 'general-settings': return <ServerSettings key={contentKey} server={activeServer} onSave={handleUpdateServer} />;
      case 'sftp': return <div style={{padding: 40, textAlign: 'center', color: '#666'}}>SFTP機能は実装検討中...</div>;
      case 'users': return <div style={{padding: 40, textAlign: 'center', color: '#666'}}>サブユーザー機能は実装検討中...</div>;
      default: return <div>Unknown View</div>;
    }
  };

  return (
    <div className="app-container" onClick={handleClickOutside}>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <aside className="sidebar">
        <div className="sidebar-header">MC-Vector</div>
        <div className="sidebar-nav">
          <NavItem label="Dashboard" view="dashboard" current={currentView} set={setCurrentView} icon="📊" />
          <NavItem label="Console" view="console" current={currentView} set={setCurrentView} icon="💻" />
          <NavItem label="Properties" view="properties" current={currentView} set={setCurrentView} icon="⚙️" />
          <NavItem label="Files" view="files" current={currentView} set={setCurrentView} icon="📁" />
          <NavItem label="Plugins / Mods" view="plugins" current={currentView} set={setCurrentView} icon="🧩" />
          <NavItem label="Backups" view="backups" current={currentView} set={setCurrentView} icon="📦" />
          <NavItem label="General Settings" view="general-settings" current={currentView} set={setCurrentView} icon="🔧" />
          <hr style={{width: '90%', borderColor: 'rgba(255,255,255,0.1)', margin: '10px auto'}} />
          <NavItem label="Proxy Network" view="proxy" current={currentView} set={setCurrentView} icon="🔗" />
          <NavItem label="SFTP" view="sftp" current={currentView} set={setCurrentView} icon="🌐" />
          <NavItem label="Users" view="users" current={currentView} set={setCurrentView} icon="👥" />
        </div>
        <div className="sidebar-footer-list">
          <div style={{ padding: '5px 10px', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 'bold', letterSpacing: '1px' }}>SERVERS</div>
          <div className="server-list-container">
            {servers.map((server) => (
              <div key={server.id} className={`server-item ${server.id === selectedServerId ? 'active' : ''}`} onClick={() => setSelectedServerId(server.id)} onContextMenu={(e) => handleContextMenu(e, server.id)}>
                <div className={`status-indicator ${server.status}`}></div>
                <div className="server-info"><div className="server-name">{server.name}</div></div>
              </div>
            ))}
          </div>
          <button className="add-server-btn" onClick={() => setShowAddServerModal(true)}>+ Add Server</button>
        </div>
      </aside>

      <main className="main-content">
        <header className="top-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 style={{fontSize: '1.2rem', fontWeight: '700', color: '#fff'}}>{currentView === 'proxy' ? 'Network' : activeServer?.name}</h2>
            <span style={{color: 'var(--text-secondary)', fontSize: '0.9rem', opacity: 0.7}}> / {currentView}</span>
          </div>
          <div className="actions">
            {currentView !== 'proxy' && (
              <>
                <button className="btn-start" onClick={handleStart} title="Start Server">▶ Start</button>
                <button className="btn-restart btn-secondary" onClick={handleRestart} title="Restart Server">↻ Restart</button>
                <button className="btn-stop" onClick={handleStop} title="Stop Server">■ Stop</button>
              </>
            )}
          </div>
        </header>
        <div className="content-area">{renderContent()}</div>
      </main>

      {/* 以下モーダル等は前回と同じ */}
      {downloadStatus && ( <div style={{ position: 'fixed', bottom: 20, right: 20, background: '#2c2c30', padding: '15px', borderRadius: '8px', boxShadow: '0 8px 30px rgba(0,0,0,0.5)', zIndex: 10000, color: '#fff', minWidth: '280px', border: '1px solid var(--border-color)' }}> <div style={{ fontWeight: 'bold', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}> <span>Downloading...</span> <span style={{color: 'var(--accent-color)'}}>{downloadStatus.progress}%</span> </div> <div style={{ fontSize: '0.85rem', marginBottom: '8px', color: '#ccc' }}>{downloadStatus.msg}</div> <div style={{ width: '100%', height: '4px', background: '#444', borderRadius: '2px', overflow: 'hidden' }}> <div style={{ width: `${downloadStatus.progress}%`, height: '100%', background: 'var(--accent-color)', borderRadius: '2px', transition: 'width 0.2s' }}></div> </div> </div> )}
      {showAddServerModal && <AddServerModal onClose={() => setShowAddServerModal(false)} onAdd={handleAddServer} />}
      {contextMenu && ( <div style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, background: '#252526', border: '1px solid var(--border-color)', borderRadius: '6px', boxShadow: '0 4px 20px rgba(0,0,0,0.4)', zIndex: 9999, padding: '4px', minWidth: '140px' }}> <div onClick={(e) => { e.stopPropagation(); handleDeleteServer(); }} style={{ padding: '8px 12px', cursor: 'pointer', color: '#ff6b6b', fontSize: '14px', borderRadius: '4px', transition: 'background 0.2s', display: 'flex', alignItems: 'center', gap: '8px' }} onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 107, 107, 0.1)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}> 🗑️ 削除 </div> </div> )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function NavItem({ label, view, current, set, icon }: any) {
  return (
    <div className={`nav-item ${current === view ? 'active' : ''}`} onClick={() => set(view)}>
      <span style={{ fontSize: '1.2em' }}>{icon}</span> {label}
    </div>
  );
}

export default App;