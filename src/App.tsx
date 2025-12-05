import { useState, useEffect, useRef } from 'react';
import './main.css';
import { type MinecraftServer, type AppView } from './renderer/shared/server declaration';
import ConsoleView from './renderer/components/ConsoleView';
import ServerSettings from './renderer/components/properties/ServerSettings';
import PropertiesView from './renderer/components/properties/PropertiesView';
import FilesView from './renderer/components/FilesView';
import BackupsView from './renderer/components/BackupsView';
import ProxySetupView, { type ProxyNetworkConfig } from './renderer/components/ProxySetupView';
import AddServerModal from './renderer/components/AddServerModal';

function App() {
  const [servers, setServers] = useState<MinecraftServer[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string>('');
  const [currentView, setCurrentView] = useState<AppView>('console');
  const [showAddServerModal, setShowAddServerModal] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, serverId: string } | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<{ id: string, progress: number, msg: string } | null>(null);

  // ログを一元管理するState
  const [serverLogs, setServerLogs] = useState<Record<string, string[]>>({});

  // ★重要: イベントリスナー内で最新の selectedServerId を参照するための Ref
  const selectedServerIdRef = useRef(selectedServerId);

  // selectedServerId が変わるたびに Ref を更新
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
        console.error("Failed to load servers", e);
      }
    };
    loadServers();

    // ★ログ受信リスナー (App全体で1回だけ登録)
    // 戻り値の型修正により、この removeLogListener は正しく関数として認識されます
    const removeLogListener = window.electronAPI.onServerLog((_event, log) => {
      const formattedLog = log.replace(/\n/g, '\r\n');
      
      // 現在選択されているサーバーIDを取得
      const currentId = selectedServerIdRef.current;

      if (currentId) {
        setServerLogs(prev => {
          const currentLogs = prev[currentId] || [];
          // ログを追加 (最大2000行)
          const newLogs = [...currentLogs, formattedLog];
          if (newLogs.length > 2000) newLogs.shift();
          
          return {
            ...prev,
            [currentId]: newLogs
          };
        });
      }
    });

    // ダウンロード進捗
    window.electronAPI.onDownloadProgress((_event, data) => {
      if (data.progress === 100) {
        setDownloadStatus(null);
        alert(`ダウンロード完了: サーバー ${data.serverId} の準備ができました！`);
      } else {
        setDownloadStatus({ id: data.serverId, progress: data.progress, msg: data.status });
      }
    });

    return () => {
      // クリーンアップ (ここでのエラーは global.d.ts の修正で消えます)
      if (removeLogListener) removeLogListener();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  const activeServer = servers.find(s => s.id === selectedServerId);

  const handleStart = () => { if (selectedServerId) window.electronAPI.startServer(selectedServerId); };
  const handleStop = () => { if (selectedServerId) window.electronAPI.stopServer(selectedServerId); };
  
  const handleUpdateServer = async (updatedServer: MinecraftServer) => {
    setServers(prev => prev.map(s => s.id === updatedServer.id ? updatedServer : s));
    await window.electronAPI.updateServer(updatedServer);
  };

  const handleAddServer = async (serverData: any) => {
    try {
      const newServer = await window.electronAPI.addServer(serverData);
      setServers(prev => [...prev, newServer]);
      setSelectedServerId(newServer.id);
      setShowAddServerModal(false);
      
      if (['Forge', 'Fabric', 'LeafMC', 'Paper', 'Vanilla', 'Velocity', 'Waterfall'].includes(serverData.software)) {
         setDownloadStatus({ id: newServer.id, progress: 0, msg: 'ダウンロード開始...' });
         await window.electronAPI.downloadServerJar(newServer.id);
      } else {
         alert(`${serverData.software} の自動ダウンロードは現在サポートされていません。`);
      }
    } catch (e) {
      alert('サーバー作成に失敗しました');
    }
  };

  const handleBuildProxyNetwork = async (config: ProxyNetworkConfig) => {
    if (!window.confirm(`構成を開始しますか？`)) return;
    try {
      const result = await window.electronAPI.setupProxy(config);
      alert(result.message);
    } catch (error) {
      alert('エラーが発生しました。');
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
        // ログデータも削除（メモリ節約）
        setServerLogs(prev => {
          const newLogs = { ...prev };
          delete newLogs[serverId];
          return newLogs;
        });
        if (selectedServerId === serverId) setSelectedServerId(newServers.length > 0 ? newServers[0].id : '');
      }
    } catch (e) { alert('削除エラー'); }
    setContextMenu(null);
  };

  const handleClickOutside = () => { if (contextMenu) setContextMenu(null); };

  const renderContent = () => {
    if (currentView === 'proxy') return <ProxySetupView servers={servers} onBuildNetwork={handleBuildProxyNetwork} />;
    if (!activeServer) return <div style={{padding: 20}}>サーバーを選択してください</div>;

    switch (currentView) {
      case 'console': 
        return <ConsoleView server={activeServer} logs={serverLogs[activeServer.id] || []} />;
      case 'properties': return <PropertiesView server={activeServer} />;
      case 'files': return <FilesView server={activeServer} />;
      case 'backups': return <BackupsView server={activeServer} />;
      case 'general-settings': return <ServerSettings server={activeServer} onSave={handleUpdateServer} />;
      case 'sftp': return <div style={{padding: 40, textAlign: 'center', color: '#666'}}>SFTP機能は実装検討中...</div>;
      case 'users': return <div style={{padding: 40, textAlign: 'center', color: '#666'}}>サブユーザー機能は実装検討中...</div>;
      default: return <div>Unknown View</div>;
    }
  };

  return (
    <div className="app-container" onClick={handleClickOutside}>
      <aside className="sidebar">
        <div className="sidebar-header">MC-Vector</div>
        <div className="sidebar-nav">
          <NavItem label="Console" view="console" current={currentView} set={setCurrentView} icon="💻" />
          <NavItem label="Properties" view="properties" current={currentView} set={setCurrentView} icon="⚙️" />
          <NavItem label="Files" view="files" current={currentView} set={setCurrentView} icon="📁" />
          <NavItem label="Backups" view="backups" current={currentView} set={setCurrentView} icon="📦" />
          <NavItem label="General Settings" view="general-settings" current={currentView} set={setCurrentView} icon="🔧" />
          <hr style={{width: '100%', borderColor: 'var(--border-color)', margin: '5px 0', opacity: 0.3}} />
          <NavItem label="Proxy Network" view="proxy" current={currentView} set={setCurrentView} icon="🔗" />
          <NavItem label="SFTP" view="sftp" current={currentView} set={setCurrentView} icon="🌐" />
          <NavItem label="Users" view="users" current={currentView} set={setCurrentView} icon="👥" />
        </div>
        <div className="sidebar-footer-list">
          <div style={{ padding: '5px 10px', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>SERVERS</div>
          <div className="server-list-container">
            {servers.map((server) => (
              <div 
                key={server.id} 
                className={`server-item ${server.id === selectedServerId ? 'active' : ''}`}
                onClick={() => setSelectedServerId(server.id)}
                onContextMenu={(e) => handleContextMenu(e, server.id)}
              >
                <div className={`status-indicator ${server.status}`}></div>
                <div className="server-info"><div className="server-name">{server.name}</div></div>
              </div>
            ))}
          </div>
          <button className="add-server-btn" onClick={() => setShowAddServerModal(true)}>+ サーバー追加</button>
        </div>
      </aside>

      <main className="main-content">
        <header className="top-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2>{currentView === 'proxy' ? 'Network Configuration' : activeServer?.name}</h2>
            <span style={{color: 'var(--text-secondary)', fontSize: '0.9rem'}}> / {currentView}</span>
          </div>
          <div className="actions">
            {currentView !== 'proxy' && (
              <>
                <button className="btn-start" onClick={handleStart}>起動</button>
                <button className="btn-stop" onClick={handleStop}>停止</button>
              </>
            )}
          </div>
        </header>
        <div className="content-area">{renderContent()}</div>
      </main>

      {downloadStatus && (
        <div style={{
          position: 'fixed', bottom: 20, right: 20, 
          background: '#2c3e50', padding: '15px', borderRadius: '8px', 
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)', zIndex: 10000, color: '#fff', minWidth: '250px'
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>Downloading...</div>
          <div style={{ fontSize: '0.9rem', marginBottom: '8px' }}>{downloadStatus.msg}</div>
          <div style={{ width: '100%', height: '6px', background: '#555', borderRadius: '3px' }}>
            <div style={{ width: `${downloadStatus.progress}%`, height: '100%', background: '#27ae60', borderRadius: '3px' }}></div>
          </div>
        </div>
      )}

      {showAddServerModal && <AddServerModal onClose={() => setShowAddServerModal(false)} onAdd={handleAddServer} />}
      
      {contextMenu && (
        <div style={{
          position: 'fixed', top: contextMenu.y, left: contextMenu.x,
          background: '#2c2c2c', border: '1px solid #444', borderRadius: '4px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.5)', zIndex: 9999, padding: '5px 0', minWidth: '120px'
        }}>
          <div onClick={(e) => { e.stopPropagation(); handleDeleteServer(); }}
            style={{ padding: '8px 15px', cursor: 'pointer', color: '#ff6b6b', fontSize: '14px' }}>
            🗑️ サーバーを削除
          </div>
        </div>
      )}
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