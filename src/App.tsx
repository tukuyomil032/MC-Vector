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
import UsersView from './renderer/components/UsersView';
import ProxySetupView, { type ProxyNetworkConfig } from './renderer/components/ProxySetupView';
import ProxyHelpView from './renderer/components/ProxyHelpView';
import AddServerModal from './renderer/components/AddServerModal';
import Toast from './renderer/components/Toast';

import iconMenu from './assets/icons/menu.svg';
import iconDashboard from './assets/icons/dashboard.svg';
import iconConsole from './assets/icons/console.svg';
import iconUsers from './assets/icons/users.svg';
import iconFiles from './assets/icons/files.svg';
import iconPlugins from './assets/icons/plugins.svg';
import iconBackups from './assets/icons/backups.svg';
import iconProperties from './assets/icons/properties.svg';
import iconSettings from './assets/icons/settings.svg';
import iconProxy from './assets/icons/proxy.svg';

function App() {
  const [servers, setServers] = useState<MinecraftServer[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string>('');
  const [currentView, setCurrentView] = useState<AppView>('dashboard');
  const [showAddServerModal, setShowAddServerModal] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, serverId: string } | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<{ id: string, progress: number, msg: string } | null>(null);
  const [toast, setToast] = useState<{ msg: string, type: 'success' | 'error' | 'info' } | null>(null);
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [currentHash, setCurrentHash] = useState(window.location.hash);

  // ★追加: ngrokの情報をグローバルで管理
  const [ngrokData, setNgrokData] = useState<Record<string, string | null>>({});

  useEffect(() => {
    const handleHashChange = () => setCurrentHash(window.location.hash);
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  if (currentHash === '#proxy-help') {
    return <ProxyHelpView />;
  }

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

    window.electronAPI.onDownloadProgress((_event: any, data: any) => {
      if (data.progress === 100) {
        setDownloadStatus(null);
        showToast(`ダウンロード完了: ${data.status}`, 'success');
      } else {
        setDownloadStatus({ id: data.serverId, progress: data.progress, msg: data.status });
      }
    });

    const removeStatusListener = window.electronAPI.onServerStatusUpdate((_event: any, data: any) => {
      setServers(prev => prev.map(s => 
        s.id === data.serverId ? { ...s, status: data.status } : s
      ));
    });

    // ★追加: グローバルでngrok情報をリッスン
    const removeNgrokListener = window.electronAPI.onNgrokInfo((_event: any, data: any) => {
      if (data.status === 'stopped' || data.status === 'error') {
        setNgrokData(prev => ({ ...prev, [data.serverId]: null }));
      } else if (data.url) {
        setNgrokData(prev => ({ ...prev, [data.serverId]: data.url }));
      }
    });

    return () => { 
      if (typeof removeLogListener === 'function') (removeLogListener as any)();
      if (typeof removeStatusListener === 'function') (removeStatusListener as any)();
      if (typeof removeNgrokListener === 'function') (removeNgrokListener as any)();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  // サーバー選択変更時にngrok状態を確認
  useEffect(() => {
    const checkNgrok = async () => {
      if (!selectedServerId) return;
      try {
        const status = await window.electronAPI.getNgrokStatus(selectedServerId);
        setNgrokData(prev => ({ ...prev, [selectedServerId]: status.active ? status.url : null }));
      } catch (e) {
        console.error(e);
      }
    };
    checkNgrok();
  }, [selectedServerId]);

  const activeServer = servers.find(s => s.id === selectedServerId);

  const handleStart = () => { if (selectedServerId) window.electronAPI.startServer(selectedServerId); };
  const handleStop = () => { if (selectedServerId) window.electronAPI.stopServer(selectedServerId); };
  
  const handleRestart = async () => {
    if (!selectedServerId) return;
    setServers(prev => prev.map(s => s.id === selectedServerId ? { ...s, status: 'restarting' } : s));
    await window.electronAPI.stopServer(selectedServerId);
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
      
      if (['Forge', 'Fabric', 'LeafMC', 'Paper', 'Vanilla', 'Waterfall'].includes(serverData.software)) {
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
      const loadedServers = await window.electronAPI.getServers();
      setServers(loadedServers);
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
      case 'console': 
        return <ConsoleView 
          key={contentKey} 
          server={activeServer} 
          logs={serverLogs[activeServer.id] || []} 
          ngrokUrl={ngrokData[activeServer.id] || null} // ★追加: ngrokURLを渡す
        />;
      case 'properties': return <PropertiesView key={contentKey} server={activeServer} />;
      case 'files': return <FilesView key={contentKey} server={activeServer} />;
      case 'plugins' as any: return <PluginBrowser key={contentKey} server={activeServer} />;
      case 'backups': return <BackupsView key={contentKey} server={activeServer} />;
      case 'general-settings': return <ServerSettings key={contentKey} server={activeServer} onSave={handleUpdateServer} />;
      case 'users': return <UsersView key={contentKey} server={activeServer} />;
      default: return <div>Unknown View</div>;
    }
  };

  return (
    <div className="app-container" onClick={handleClickOutside}>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <aside className="sidebar" style={{ width: isSidebarOpen ? '260px' : '60px', transition: 'width 0.2s' }}>
        <div className="sidebar-header" style={{ 
          display: 'flex', 
          justifyContent: isSidebarOpen ? 'space-between' : 'center', 
          alignItems: 'center', 
          padding: '20px 15px',
          backgroundColor: 'transparent', 
        }}>
          {isSidebarOpen && <span style={{ 
            fontWeight: 'bold', 
            fontSize: '1.2rem', 
            color: '#ffffff',
            textShadow: '0 2px 4px rgba(0,0,0,0.3)' 
          }}>MC-Vector</span>}
          
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '5px' }}
          >
            <img src={iconMenu} alt="Menu" style={{ width: '20px', height: '20px', opacity: 0.8 }} />
          </button>
        </div>
        
        <div className="sidebar-nav">
          <NavItem label={isSidebarOpen ? "Dashboard" : ""} view="dashboard" current={currentView} set={setCurrentView} iconSrc={iconDashboard} />
          <NavItem label={isSidebarOpen ? "Console" : ""} view="console" current={currentView} set={setCurrentView} iconSrc={iconConsole} />
          <NavItem label={isSidebarOpen ? "Users" : ""} view="users" current={currentView} set={setCurrentView} iconSrc={iconUsers} />
          <NavItem label={isSidebarOpen ? "Files" : ""} view="files" current={currentView} set={setCurrentView} iconSrc={iconFiles} />
          <NavItem label={isSidebarOpen ? "Plugins / Mods" : ""} view="plugins" current={currentView} set={setCurrentView} iconSrc={iconPlugins} />
          <NavItem label={isSidebarOpen ? "Backups" : ""} view="backups" current={currentView} set={setCurrentView} iconSrc={iconBackups} />
          <NavItem label={isSidebarOpen ? "Properties" : ""} view="properties" current={currentView} set={setCurrentView} iconSrc={iconProperties} />
          <NavItem label={isSidebarOpen ? "General Settings" : ""} view="general-settings" current={currentView} set={setCurrentView} iconSrc={iconSettings} />
          
          <hr style={{width: '90%', borderColor: 'rgba(255,255,255,0.1)', margin: '10px auto'}} />
          
          <NavItem label={isSidebarOpen ? "Proxy Network" : ""} view="proxy" current={currentView} set={setCurrentView} iconSrc={iconProxy} />
        </div>

        {isSidebarOpen && (
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
        )}
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

      {downloadStatus && ( <div style={{ position: 'fixed', bottom: 20, right: 20, background: '#2c2c30', padding: '15px', borderRadius: '8px', boxShadow: '0 8px 30px rgba(0,0,0,0.5)', zIndex: 10000, color: '#fff', minWidth: '280px', border: '1px solid var(--border-color)' }}> <div style={{ fontWeight: 'bold', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}> <span>Downloading...</span> <span style={{color: 'var(--accent-color)'}}>{downloadStatus.progress}%</span> </div> <div style={{ fontSize: '0.85rem', marginBottom: '8px', color: '#ccc' }}>{downloadStatus.msg}</div> <div style={{ width: '100%', height: '4px', background: '#444', borderRadius: '2px', overflow: 'hidden' }}> <div style={{ width: `${downloadStatus.progress}%`, height: '100%', background: 'var(--accent-color)', borderRadius: '2px', transition: 'width 0.2s' }}></div> </div> </div> )}
      {showAddServerModal && <AddServerModal onClose={() => setShowAddServerModal(false)} onAdd={handleAddServer} />}
      {contextMenu && ( <div style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, background: '#252526', border: '1px solid var(--border-color)', borderRadius: '6px', boxShadow: '0 4px 20px rgba(0,0,0,0.4)', zIndex: 9999, padding: '4px', minWidth: '140px' }}> <div onClick={(e) => { e.stopPropagation(); handleDeleteServer(); }} style={{ padding: '8px 12px', cursor: 'pointer', color: '#ff6b6b', fontSize: '14px', borderRadius: '4px', transition: 'background 0.2s', display: 'flex', alignItems: 'center', gap: '8px' }} onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 107, 107, 0.1)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}> 🗑️ 削除 </div> </div> )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function NavItem({ label, view, current, set, iconSrc }: any) {
  return (
    <div className={`nav-item ${current === view ? 'active' : ''}`} onClick={() => set(view)} title={label ? '' : view}>
      <img 
        src={iconSrc} 
        alt={view} 
        style={{ 
          width: '20px', 
          height: '20px', 
          marginRight: label ? '12px' : '0',
          filter: current === view ? 'invert(1)' : 'invert(0.7)' 
        }} 
      />
      {label}
    </div>
  );
}

export default App;