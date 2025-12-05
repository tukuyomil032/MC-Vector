import { useState, useEffect } from 'react';
import '../../main.css';

interface JavaRuntime {
  name: string;
  path: string;
  version: number;
}

interface Props {
  onClose: () => void;
}

export default function JavaManagerModal({ onClose }: Props) {
  const [installed, setInstalled] = useState<JavaRuntime[]>([]);
  const [downloading, setDownloading] = useState<number | null>(null);

  // 利用可能なJavaバージョン
  const availableVersions = [8, 17, 21];

  useEffect(() => {
    loadInstalled();
  }, []);

  const loadInstalled = async () => {
    const list = await window.electronAPI.getJavaVersions();
    setInstalled(list);
  };

  const handleDownload = async (ver: number) => {
    setDownloading(ver);
    try {
      await window.electronAPI.downloadJava(ver);
      await loadInstalled();
      alert(`Java ${ver} downloaded!`);
    } catch {
      alert('Download failed');
    } finally {
      setDownloading(null);
    }
  };

  const handleDelete = async (ver: number) => {
    if (!window.confirm(`Uninstall Java ${ver}?`)) return;
    await window.electronAPI.deleteJava(ver);
    loadInstalled();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '600px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0 }}>Java Runtime Manager</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ marginBottom: '30px' }}>
          <h3 style={{ borderBottom: '1px solid #444', paddingBottom: '5px', marginBottom: '15px' }}>Available Versions (Adoptium)</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px' }}>
            {availableVersions.map(v => {
              const isInstalled = installed.some(i => i.version === v);
              return (
                <div key={v} style={{ background: '#252526', padding: '15px', borderRadius: '8px', textAlign: 'center', border: '1px solid #444' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '10px' }}>Java {v}</div>
                  {isInstalled ? (
                    <div style={{ color: '#10b981', fontWeight: 'bold' }}>Installed</div>
                  ) : (
                    <button
                      className="btn-primary"
                      onClick={() => handleDownload(v)}
                      disabled={downloading !== null}
                      style={{ width: '100%' }}
                    >
                      {downloading === v ? 'Downloading...' : 'Download'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h3 style={{ borderBottom: '1px solid #444', paddingBottom: '5px', marginBottom: '15px' }}>Installed Runtimes</h3>
          {installed.length === 0 ? (
            <div style={{ color: '#aaa', fontStyle: 'italic' }}>No runtimes managed by MC-Vector.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {installed.map(java => (
                <div key={java.path} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#252526', padding: '10px 15px', borderRadius: '6px' }}>
                  <div>
                    <div style={{ fontWeight: 'bold' }}>{java.name}</div>
                    <div style={{ fontSize: '0.8rem', color: '#888', wordBreak: 'break-all' }}>{java.path}</div>
                  </div>
                  <button
                    className="btn-stop"
                    onClick={() => handleDelete(java.version)}
                    style={{ padding: '5px 10px', fontSize: '0.8rem', minWidth: 'auto' }}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}