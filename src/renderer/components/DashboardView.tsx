import { useState, useEffect } from 'react';
import { type MinecraftServer } from '../components/../shared/server declaration';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import '../../main.css';

interface Props {
  server: MinecraftServer;
}

export default function DashboardView({ server }: Props) {
  const [stats, setStats] = useState<{ time: string, cpu: number, memory: number }[]>([]);
  const [currentCpu, setCurrentCpu] = useState(0);
  const [currentMem, setCurrentMem] = useState(0);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return () => (removeListener as any)?.();
  }, [server.id]);

  // ステータスに応じた色
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return '#10b981'; // Green
      case 'offline': return '#ef4444'; // Red
      case 'starting': return '#eab308'; // Yellow
      case 'stopping': return '#f97316'; // Orange
      case 'restarting': return '#3b82f6'; // Blue
      default: return '#aaa';
    }
  };

  return (
    <div style={{ height: '100%', padding: '20px', overflowY: 'auto' }}>
      <h2 style={{ marginTop: 0, marginBottom: '20px', borderBottom: '1px solid #444', paddingBottom: '10px' }}>
        Dashboard: {server.name}
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '30px' }}>
        <div className="setting-card" style={{ padding: '20px', textAlign: 'center', background: '#252526' }}>
          <div style={{ fontSize: '0.9rem', color: '#aaa', marginBottom: '5px' }}>Status</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: getStatusColor(server.status) }}>
            {server.status.toUpperCase()}
          </div>
        </div>
        <div className="setting-card" style={{ padding: '20px', textAlign: 'center', background: '#252526' }}>
          <div style={{ fontSize: '0.9rem', color: '#aaa', marginBottom: '5px' }}>Software</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{server.software}</div>
          <div style={{ fontSize: '0.8rem', color: '#666' }}>{server.version}</div>
        </div>
        <div className="setting-card" style={{ padding: '20px', textAlign: 'center', background: '#252526' }}>
          <div style={{ fontSize: '0.9rem', color: '#aaa', marginBottom: '5px' }}>Current CPU</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#3b82f6' }}>{currentCpu}%</div>
        </div>
        <div className="setting-card" style={{ padding: '20px', textAlign: 'center', background: '#252526' }}>
          <div style={{ fontSize: '0.9rem', color: '#aaa', marginBottom: '5px' }}>Current Memory</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#a855f7' }}>{currentMem} MB</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', height: '300px' }}>
        <div className="setting-card" style={{ padding: '15px', background: '#1e1e24', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '1rem', color: '#aaa' }}>CPU Usage (%)</h3>
          <div style={{ flex: 1 }}>
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

        <div className="setting-card" style={{ padding: '15px', background: '#1e1e24', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '1rem', color: '#aaa' }}>Memory Usage (MB)</h3>
          <div style={{ flex: 1 }}>
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