import { useState, useEffect } from 'react';
import { type MinecraftServer } from '../components/../shared/server declaration';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Props {
  server: MinecraftServer;
}

export default function DashboardView({ server }: Props) {
  const [stats, setStats] = useState<{ time: string, cpu: number, memory: number }[]>([]);
  const [currentCpu, setCurrentCpu] = useState(0);
  const [currentMem, setCurrentMem] = useState(0);

  useEffect(() => {
    const removeListener = window.electronAPI.onServerStats((_event: any, data: any) => {
      if (data.serverId !== server.id) return;

      const now = new Date().toLocaleTimeString();
      const cpuVal = Math.round(data.cpu * 10) / 10;
      const memVal = Math.round(data.memory / 1024 / 1024);

      setCurrentCpu(cpuVal);
      setCurrentMem(memVal);

      setStats(prev => {
        const newData = [...prev, { time: now, cpu: cpuVal, memory: memVal }];
        if (newData.length > 20) newData.shift();
        return newData;
      });
    });

    return () => (removeListener as any)?.();
  }, [server.id]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return '#10b981';
      case 'offline': return '#ef4444';
      case 'starting': return '#eab308';
      case 'stopping': return '#f97316';
      case 'restarting': return '#3b82f6';
      default: return '#aaa';
    }
  };

  return (
    <div className="h-full p-5 overflow-y-auto">
      <h2 className="mt-0 mb-5 border-b border-zinc-700 pb-2.5">
        Dashboard: {server.name}
      </h2>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-5 mb-8">
        <div className="p-5 text-center bg-[#252526] rounded-lg border border-border-color">
          <div className="text-sm text-zinc-400 mb-1.5">Status</div>
          <div className="text-2xl font-bold" style={{ color: getStatusColor(server.status) }}>
            {server.status.toUpperCase()}
          </div>
        </div>
        <div className="p-5 text-center bg-[#252526] rounded-lg border border-border-color">
          <div className="text-sm text-zinc-400 mb-1.5">Software</div>
          <div className="text-2xl font-bold">{server.software}</div>
          <div className="text-xs text-zinc-600">{server.version}</div>
        </div>
        <div className="p-5 text-center bg-[#252526] rounded-lg border border-border-color">
          <div className="text-sm text-zinc-400 mb-1.5">Current CPU</div>
          <div className="text-2xl font-bold text-blue-500">{currentCpu}%</div>
        </div>
        <div className="p-5 text-center bg-[#252526] rounded-lg border border-border-color">
          <div className="text-sm text-zinc-400 mb-1.5">Current Memory</div>
          <div className="text-2xl font-bold text-purple-500">{currentMem} MB</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5 h-[300px]">
        <div className="p-4 bg-[#1e1e24] rounded-lg border border-border-color flex flex-col">
          <h3 className="m-0 mb-2.5 text-base text-zinc-400">CPU Usage (%)</h3>
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="time" stroke="#666" tick={{fontSize: 10}} />
                <YAxis stroke="#666" tick={{fontSize: 10}} />
                <Tooltip contentStyle={{ backgroundColor: '#333', border: 'none' }} />
                <Area type="monotone" dataKey="cpu" stroke="#3b82f6" fill="rgba(59, 130, 246, 0.3)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="p-4 bg-[#1e1e24] rounded-lg border border-border-color flex flex-col">
          <h3 className="m-0 mb-2.5 text-base text-zinc-400">Memory Usage (MB)</h3>
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="time" stroke="#666" tick={{fontSize: 10}} />
                <YAxis stroke="#666" tick={{fontSize: 10}} />
                <Tooltip contentStyle={{ backgroundColor: '#333', border: 'none' }} />
                <Area type="monotone" dataKey="memory" stroke="#a855f7" fill="rgba(168, 85, 247, 0.3)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}