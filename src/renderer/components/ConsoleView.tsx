import React, { useEffect, useRef, useState } from 'react';
import { type MinecraftServer } from '../components/../shared/server declaration';

interface ConsoleViewProps {
  server: MinecraftServer;
  logs: string[];
  ngrokUrl: string | null;
}

const ConsoleView: React.FC<ConsoleViewProps> = ({ server, logs }) => {
  const [command, setCommand] = useState('');
  const logEndRef = useRef<HTMLDivElement>(null);
  const [currentAddressIndex, setCurrentAddressIndex] = useState(0);
  const [internalNgrokUrl, setInternalNgrokUrl] = useState<string | null>(null);
  const [memoryUsage, setMemoryUsage] = useState(0);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    const removeStatsListener = window.electronAPI.onServerStats((_event: any, data: any) => {
      if (data.serverId === server.id) {
        setMemoryUsage(data.memory);
      }
    });
    return () => { if (typeof removeStatsListener === 'function') (removeStatsListener as any)(); };
  }, [server.id]);

  useEffect(() => {
    const fetchStatus = async () => {
        try {
            const status = await window.electronAPI.getNgrokStatus(server.id);
            setInternalNgrokUrl(status.active ? status.url : null);
        } catch {
            setInternalNgrokUrl(null);
        }
    };

    fetchStatus();
    const interval = setInterval(() => {
        fetchStatus();
        setCurrentAddressIndex(prev => (prev === 0 ? 1 : 0));
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
    <div className="flex flex-col h-full bg-[#1e1e1e]">

      <div className="grid grid-cols-3 bg-[#252526] border-b border-[#3e3e42] py-3 shrink-0">
        <div className="text-center border-r border-[#3e3e42] overflow-hidden">
          <div className="text-xs text-[#8b9bb4] mb-1 font-bold tracking-wider">ADDRESS</div>
          <div
            key={currentAddressIndex}
            onClick={handleCopyAddress}
            title="Click to Copy"
            className={`font-bold cursor-pointer text-sm transition-all ${(internalNgrokUrl && currentAddressIndex === 1) ? 'text-accent' : 'text-[#f0f0f0]'}`}
          >
            {displayAddress}
          </div>
        </div>

        <div className="text-center border-r border-[#3e3e42]">
          <div className="text-xs text-[#8b9bb4] mb-1 font-bold tracking-wider">STATUS</div>
          <div className={`font-bold text-sm ${
            server.status === 'online' ? 'text-green-500' : 
            server.status === 'offline' ? 'text-red-500' : 
            'text-yellow-500'
          }`}>
            {server.status.toUpperCase()}
          </div>
        </div>

        <div className="text-center">
          <div className="text-xs text-[#8b9bb4] mb-1 font-bold tracking-wider">MEMORY</div>
          <div className="font-bold text-[#f0f0f0] text-sm">
            {server.status === 'online' ? formatMemoryDetailed(memoryUsage, server.memory) : '- / - MB'}
          </div>
        </div>
      </div>

      <div className="flex-1 bg-[#121214] p-4 overflow-y-auto font-mono text-[13px] text-[#d4d4d4] whitespace-pre-wrap leading-relaxed">
        {logs.map((log, index) => (
          <div key={index} className="break-all">
            {log}
          </div>
        ))}

        <div ref={logEndRef} />

        {logs.length === 0 && (
          <div className="text-zinc-600 italic text-center mt-5">
             Waiting for logs...
          </div>
        )}
      </div>

      <div className="h-[60px] bg-[#252526] border-t border-[#3e3e42] flex items-center px-5 shrink-0">
        <span className="mr-3 text-[#8b9bb4] font-bold">&gt;</span>
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a command..."
          className="flex-1 bg-[#18181b] border border-[#3f3f46] rounded-md text-white text-sm py-2.5 px-3 outline-none font-mono"
        />
        <button
          onClick={handleSend}
          className="bg-accent text-white border-none py-2.5 px-5 rounded-md cursor-pointer ml-3 font-bold text-sm transition-colors hover:bg-accent-hover"
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default ConsoleView;