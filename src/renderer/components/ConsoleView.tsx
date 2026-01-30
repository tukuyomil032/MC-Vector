import { useEffect, useRef, useState } from 'react';
import type { FC } from 'react';
import { type MinecraftServer } from '../components/../shared/server declaration';

type AnsiStyle = {
  color?: string;
  backgroundColor?: string;
  fontWeight?: number;
};

type AnsiSegment = {
  text: string;
  style: AnsiStyle;
};

const ANSI_COLOR_MAP: Record<string, string> = {
  '30': '#000000',
  '31': '#ef4444',
  '32': '#22c55e',
  '33': '#eab308',
  '34': '#3b82f6',
  '35': '#a855f7',
  '36': '#06b6d4',
  '37': '#e5e7eb',
  '90': '#6b7280',
  '91': '#f87171',
  '92': '#4ade80',
  '93': '#facc15',
  '94': '#60a5fa',
  '95': '#c084fc',
  '96': '#22d3ee',
  '97': '#f8fafc',
};

const ANSI_BG_MAP: Record<string, string> = {
  '40': '#000000',
  '41': '#7f1d1d',
  '42': '#14532d',
  '43': '#78350f',
  '44': '#1e3a8a',
  '45': '#4c1d95',
  '46': '#0f766e',
  '47': '#374151',
  '100': '#1f2937',
  '101': '#9f1239',
  '102': '#166534',
  '103': '#854d0e',
  '104': '#1e40af',
  '105': '#581c87',
  '106': '#115e59',
  '107': '#f3f4f6',
};

const ansiToSegments = (text: string): AnsiSegment[] => {
  // eslint-disable-next-line no-control-regex
  const regex = /\x1b\[[0-9;]*m/g;
  let currentStyle: AnsiStyle = {};
  let lastIndex = 0;
  const segments: AnsiSegment[] = [];

  const pushText = (end: number) => {
    if (end <= lastIndex) return;
    segments.push({ text: text.slice(lastIndex, end), style: { ...currentStyle } });
    lastIndex = end;
  };

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    pushText(match.index);

    const codes = match[0].slice(2, -1).split(';').filter(Boolean);

    if (codes.length === 0) {
      currentStyle = {};
      lastIndex = regex.lastIndex;
      continue;
    }

    for (const code of codes) {
      if (code === '0') {
        currentStyle = {};
      } else if (code === '1') {
        currentStyle.fontWeight = 700;
      } else if (code === '22') {
        delete currentStyle.fontWeight;
      } else if (ANSI_COLOR_MAP[code]) {
        currentStyle.color = ANSI_COLOR_MAP[code];
      } else if (ANSI_BG_MAP[code]) {
        currentStyle.backgroundColor = ANSI_BG_MAP[code];
      }
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), style: { ...currentStyle } });
  }

  if (segments.length === 0) {
    return [{ text, style: {} }];
  }

  return segments;
};

const getSeverityStyle = (text: string): AnsiStyle | undefined => {
  const upper = text.toUpperCase();
  if (upper.includes('ERROR')) return { color: '#ef4444', fontWeight: 700 };
  if (upper.includes('WARN')) return { color: '#f59e0b', fontWeight: 700 };
  return undefined;
};

interface ConsoleViewProps {
  server: MinecraftServer;
  logs: string[];
  ngrokUrl: string | null;
}

const ConsoleView: FC<ConsoleViewProps> = ({ server, logs }) => {
  const [command, setCommand] = useState('');
  const logEndRef = useRef<HTMLDivElement>(null);
  const [currentAddressIndex, setCurrentAddressIndex] = useState(0);
  const [internalNgrokUrl, setInternalNgrokUrl] = useState<string | null>(null);
  const [memoryUsage, setMemoryUsage] = useState(0);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll) {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  useEffect(() => {
    const removeStatsListener = window.electronAPI.onServerStats((_event: any, data: any) => {
      if (data.serverId === server.id) {
        setMemoryUsage(data.memory);
      }
    });
    return () => {
      if (typeof removeStatsListener === 'function') (removeStatsListener as any)();
    };
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
      setCurrentAddressIndex((prev) => (prev === 0 ? 1 : 0));
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

  const displayAddress = !internalNgrokUrl
    ? localAddress
    : currentAddressIndex === 0
      ? localAddress
      : publicAddress;

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
            className={`font-bold cursor-pointer text-sm transition-all ${internalNgrokUrl && currentAddressIndex === 1 ? 'text-accent' : 'text-[#f0f0f0]'}`}
          >
            {displayAddress}
          </div>
        </div>

        <div className="text-center border-r border-[#3e3e42]">
          <div className="text-xs text-[#8b9bb4] mb-1 font-bold tracking-wider">STATUS</div>
          <div
            className={`font-bold text-sm ${
              server.status === 'online'
                ? 'text-green-500'
                : server.status === 'offline'
                  ? 'text-red-500'
                  : 'text-yellow-500'
            }`}
          >
            {server.status.toUpperCase()}
          </div>
        </div>

        <div className="text-center">
          <div className="text-xs text-[#8b9bb4] mb-1 font-bold tracking-wider">MEMORY</div>
          <div className="font-bold text-[#f0f0f0] text-sm">
            {server.status === 'online'
              ? formatMemoryDetailed(memoryUsage, server.memory)
              : '- / - MB'}
          </div>
        </div>
      </div>

      <div
        ref={logContainerRef}
        className="flex-1 bg-[#121214] p-4 overflow-y-auto font-mono text-[13px] text-[#d4d4d4] whitespace-pre-wrap leading-relaxed"
        onScroll={() => {
          const el = logContainerRef.current;
          if (!el) return;
          const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
          setAutoScroll(distanceFromBottom < 120);
        }}
      >
        {logs.map((log: string, index: number) => (
          <div key={index} className="break-words">
            {(() => {
              const severityStyle = getSeverityStyle(log);
              return ansiToSegments(log).map((seg, i) => {
                const style = { ...seg.style } as AnsiStyle;
                if (severityStyle) {
                  if (!style.color) style.color = severityStyle.color;
                  if (!style.fontWeight) style.fontWeight = severityStyle.fontWeight;
                }
                return (
                  <span key={i} style={style}>
                    {seg.text}
                  </span>
                );
              });
            })()}
          </div>
        ))}

        <div ref={logEndRef} />

        {logs.length === 0 && (
          <div className="text-zinc-600 italic text-center mt-5">Waiting for logs...</div>
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
