import React, { useEffect, useRef, useState } from 'react';
import Ansi from 'ansi-to-react';
import { type MinecraftServer } from '../components/../shared/server declaration';
import '../../main.css';

interface ConsoleViewProps {
  server: MinecraftServer;
  logs: string[];
  ngrokUrl: string | null;
}

const ConsoleView: React.FC<ConsoleViewProps> = ({ server, logs }) => {
  const [command, setCommand] = useState('');
  const logEndRef = useRef<HTMLDivElement>(null);
  
  // アドレス切り替え用
  const [currentAddressIndex, setCurrentAddressIndex] = useState(0);
  // 独自に管理するngrok URL (ポーリングで取得)
  const [internalNgrokUrl, setInternalNgrokUrl] = useState<string | null>(null);

  // メモリ統計用
  const [memoryUsage, setMemoryUsage] = useState(0);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const removeStatsListener = window.electronAPI.onServerStats((_event: any, data: any) => {
      if (data.serverId === server.id) {
        setMemoryUsage(data.memory);
      }
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return () => { if (typeof removeStatsListener === 'function') (removeStatsListener as any)(); };
  }, [server.id]);

  // ★追加: ngrokステータスのポーリング (3秒ごと)
  useEffect(() => {
    const fetchStatus = async () => {
        try {
            const status = await window.electronAPI.getNgrokStatus(server.id);
            setInternalNgrokUrl(status.active ? status.url : null);
        } catch {
            setInternalNgrokUrl(null);
        }
    };

    fetchStatus(); // 初回
    const interval = setInterval(() => {
        fetchStatus();
        setCurrentAddressIndex(prev => (prev === 0 ? 1 : 0)); // ついでにアドレス切り替えもここで行う
    }, 3000);

    return () => clearInterval(interval);
  }, [server.id]);

  const handleSend = () => {
    if (!command.trim()) return;
    window.electronAPI.sendCommand(server.id, command);
    setCommand('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSend();
  };

  const localAddress = `localhost:${server.port}`;
  const publicAddress = internalNgrokUrl ? internalNgrokUrl.replace('tcp://', '') : localAddress;
  
  const displayAddress = (!internalNgrokUrl) 
    ? localAddress 
    : (currentAddressIndex === 0 ? localAddress : publicAddress);

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(displayAddress);
  };

  const formatMemoryDetailed = (usageBytes: number, allocatedGb: number) => {
    const usageMb = (usageBytes / 1024 / 1024).toFixed(0);
    const allocatedMb = (allocatedGb * 1024).toFixed(0);
    return `${usageMb} / ${allocatedMb} MB`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#1e1e1e' }}>
      
      {/* Top Info Bar */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr 1fr 1fr', 
        backgroundColor: '#252526', 
        borderBottom: '1px solid #3e3e42',
        padding: '12px 0',
        flexShrink: 0
      }}>
        {/* ADDRESS */}
        <div style={{ textAlign: 'center', borderRight: '1px solid #3e3e42', overflow: 'hidden' }}>
          <div style={{ fontSize: '0.75rem', color: '#8b9bb4', marginBottom: '4px', fontWeight: 'bold', letterSpacing: '0.5px' }}>ADDRESS</div>
          <div 
            key={currentAddressIndex}
            onClick={handleCopyAddress}
            title="Click to Copy"
            style={{ 
                fontWeight: 'bold', 
                color: (internalNgrokUrl && currentAddressIndex === 1) ? '#5865F2' : '#f0f0f0', 
                cursor: 'pointer',
                animation: 'slideUpFadeIn 0.5s ease-out',
                fontSize: '0.95rem'
            }}
          >
            {displayAddress}
          </div>
        </div>

        {/* STATUS */}
        <div style={{ textAlign: 'center', borderRight: '1px solid #3e3e42' }}>
          <div style={{ fontSize: '0.75rem', color: '#8b9bb4', marginBottom: '4px', fontWeight: 'bold', letterSpacing: '0.5px' }}>STATUS</div>
          <div style={{ 
            fontWeight: 'bold', 
            color: server.status === 'online' ? '#3ba55c' : server.status === 'offline' ? '#ed4245' : '#faa61a',
            fontSize: '0.95rem'
          }}>
            {server.status.toUpperCase()}
          </div>
        </div>

        {/* MEMORY */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.75rem', color: '#8b9bb4', marginBottom: '4px', fontWeight: 'bold', letterSpacing: '0.5px' }}>MEMORY</div>
          <div style={{ fontWeight: 'bold', color: '#f0f0f0', fontSize: '0.95rem' }}>
            {server.status === 'online' ? formatMemoryDetailed(memoryUsage, server.memory) : '- / - MB'}
          </div>
        </div>
      </div>

      {/* Log Area */}
      <div style={{ 
        flex: 1, 
        backgroundColor: '#121214', 
        padding: '16px', 
        overflowY: 'auto', 
        fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
        fontSize: '13px',
        color: '#d4d4d4', 
        whiteSpace: 'pre-wrap',
        lineHeight: '1.5',
      }}>
        {logs.length === 0 && (
          <div style={{ color: '#666', fontStyle: 'italic', textAlign: 'center', marginTop: '20px' }}>
            Server is marked as offline...
          </div>
        )}
        
        {logs.map((log, index) => (
          <div key={index} style={{ marginBottom: '2px', wordBreak: 'break-all' }}>
            <Ansi>{log}</Ansi>
          </div>
        ))}
        <div ref={logEndRef} />
      </div>

      {/* Input Area */}
      <div style={{ 
        height: '60px', 
        backgroundColor: '#252526', 
        borderTop: '1px solid #3e3e42', 
        display: 'flex', 
        alignItems: 'center', 
        padding: '0 20px',
        flexShrink: 0
      }}>
        <span style={{ marginRight: '12px', color: '#8b9bb4', fontWeight: 'bold' }}>&gt;</span>
        <input 
          type="text" 
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a command..."
          style={{ 
            flex: 1, 
            backgroundColor: '#18181b', 
            border: '1px solid #3f3f46',
            borderRadius: '6px',
            color: '#fff', 
            fontSize: '0.9rem',
            padding: '10px 12px',
            outline: 'none',
            fontFamily: 'Menlo, Monaco, Consolas, monospace'
          }}
        />
        <button 
          onClick={handleSend}
          style={{ 
            backgroundColor: '#5865F2', 
            color: 'white', 
            border: 'none', 
            padding: '10px 20px', 
            borderRadius: '6px', 
            cursor: 'pointer',
            marginLeft: '12px',
            fontWeight: 'bold',
            fontSize: '0.9rem',
            transition: 'background 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#4752C4'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#5865F2'}
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default ConsoleView;