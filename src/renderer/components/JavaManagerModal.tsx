import { useState, useEffect } from 'react';

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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-1000 animate-fadeIn" onClick={onClose}>
      <div className="bg-bg-secondary p-6 rounded-xl w-[600px] border border-border-color shadow-[0_20px_50px_rgba(0,0,0,0.5)] animate-scaleIn" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h2 className="m-0">Java Runtime Manager</h2>
          <button onClick={onClose} className="bg-transparent border-none text-white text-2xl cursor-pointer hover:opacity-70">×</button>
        </div>

        <div className="mb-8">
          <h3 className="border-b border-zinc-700 pb-1.5 mb-4">Available Versions (Adoptium)</h3>
          <div className="grid grid-cols-3 gap-4">
            {availableVersions.map(v => {
              const isInstalled = installed.some(i => i.version === v);
              return (
                <div key={v} className="bg-[#252526] p-4 rounded-lg text-center border border-zinc-700">
                  <div className="text-xl font-bold mb-2.5">Java {v}</div>
                  {isInstalled ? (
                    <div className="text-success font-bold">Installed</div>
                  ) : (
                    <button
                      className="btn-primary w-full disabled:opacity-50"
                      onClick={() => handleDownload(v)}
                      disabled={downloading !== null}
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
          <h3 className="border-b border-zinc-700 pb-1.5 mb-4">Installed Runtimes</h3>
          {installed.length === 0 ? (
            <div className="text-zinc-400 italic">No runtimes managed by MC-Vector.</div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {installed.map(java => (
                <div key={java.path} className="flex items-center justify-between bg-[#252526] px-4 py-2.5 rounded-md">
                  <div>
                    <div className="font-bold">{java.name}</div>
                    <div className="text-xs text-zinc-500 break-all">{java.path}</div>
                  </div>
                  <button
                    className="btn-stop py-1.5 px-2.5 text-xs min-w-0"
                    onClick={() => handleDelete(java.version)}
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