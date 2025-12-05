import { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { type MinecraftServer } from '../shared/server declaration';

interface ConsoleViewProps {
  server: MinecraftServer;
  logs: string[]; 
}

export default function ConsoleView({ server, logs }: ConsoleViewProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [command, setCommand] = useState('');
  
  const lastLogIndex = useRef(0);

  const stats = {
    address: `localhost:${server.port}`,
    uptime: 'Running...', 
    cpu: '---', 
    memory: `--- / ${server.memory}GB`,
  };

  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      lineHeight: 1.2,
      fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
      theme: { background: '#1e1e2e', foreground: '#cdd6f4', cursor: '#89b4fa' },
      disableStdin: true,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    fitAddonRef.current = fitAddon;

    term.open(terminalRef.current);
    xtermRef.current = term;

    term.writeln(`\x1b[32m[INFO]\x1b[0m Console connected to ${server.name}`);
    
    logs.forEach(log => term.write(log));
    lastLogIndex.current = logs.length;

    // 安全なFit処理
    const safeFit = () => {
      try {
        // DOMにサイズがある場合のみfitを実行
        if (terminalRef.current && terminalRef.current.clientWidth > 0) {
          fitAddon.fit();
        }
      } catch (e) {
        console.warn('Fit error:', e);
      }
    };

    setTimeout(safeFit, 100);

    const handleResize = () => safeFit();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      xtermRef.current?.dispose();
      xtermRef.current = null;
      lastLogIndex.current = 0;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  useEffect(() => {
    if (!xtermRef.current) return;
    if (logs.length > lastLogIndex.current) {
      const newLogs = logs.slice(lastLogIndex.current);
      newLogs.forEach(log => {
        xtermRef.current?.write(log);
      });
      lastLogIndex.current = logs.length;
    }
  }, [logs]);

  const handleSendCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim()) return;
    window.electronAPI.sendCommand(server.id, command);
    setCommand('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="console-dashboard">
        <StatCard label="Address" value={stats.address} />
        <StatCard label="Status" value={server.status.toUpperCase()} />
        <StatCard label="Memory" value={stats.memory} />
      </div>

      <div style={{ flex: 1, position: 'relative', minHeight: 0, padding: '5px', backgroundColor: '#1e1e2e' }}>
        <div ref={terminalRef} style={{ width: '100%', height: '100%' }} />
      </div>

      <form className="console-input-area" onSubmit={handleSendCommand} style={{ display: 'flex', borderTop: '1px solid #444', background: '#252526' }}>
        <span style={{ alignSelf: 'center', padding: '0 10px', color: '#89b4fa', fontWeight: 'bold' }}>&gt;</span>
        <input 
          className="console-input" 
          placeholder="Type a command..." 
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          style={{ flex: 1, border: 'none', background: 'transparent', color: '#fff', padding: '12px 0', outline: 'none', fontFamily: 'monospace' }}
        />
        <button type="submit" className="btn-primary" style={{ borderRadius: 0, padding: '0 20px' }}>Send</button>
      </form>
    </div>
  );
}

function StatCard({ label, value }: { label: string, value: string }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" title={value}>{value}</div>
    </div>
  );
}