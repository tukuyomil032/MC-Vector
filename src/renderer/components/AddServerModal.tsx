import { useState, useEffect } from 'react';
import type { FC } from 'react';
import { getServerRoot } from '../../lib/config-commands';
import { VERSION_OPTIONS } from '../constants/versionOptions';

interface AddServerModalProps {
  onClose: () => void;
  onAdd: (serverData: any) => void;
}

const AddServerModal: FC<AddServerModalProps> = ({ onClose, onAdd }) => {
  const [name, setName] = useState('');
  const [software, setSoftware] = useState('Paper');
  const [version, setVersion] = useState('1.21.10');
  const [port, setPort] = useState(25565);
  const [memory, setMemory] = useState(4);
  const [rootPath, setRootPath] = useState<string>('');

  useEffect(() => {
    const fetchRoot = async () => {
      try {
        const path = await getServerRoot();
        setRootPath(path);
      } catch (e) {
        console.error(e);
      }
    };
    fetchRoot();
  }, []);

  const previewPath = rootPath
    ? `${rootPath}/${name || 'server-id'}`.replace(/\\/g, '/')
    : 'Loading...';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const sanitizedName = name.trim().replace(/[^a-zA-Z0-9_-]/g, '-') || 'server';
    const serverPath = rootPath ? `${rootPath}/${sanitizedName}` : '';
    onAdd({ name, software, version, port, memory, path: serverPath });
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-1000 modal-backdrop">
      <div className="bg-[#2c2c2c] p-5 rounded-lg w-[450px] text-white border border-zinc-700 shadow-[0_4px_15px_rgba(0,0,0,0.5)] modal-panel">
        <h3 className="mt-0 mb-5">新しいサーバーを追加</h3>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block mb-1.5 text-sm text-zinc-300">サーバー名</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: Survival Server"
              className="w-full p-2.5 bg-zinc-700 border border-zinc-600 rounded text-white text-base"
            />
            <div className="mt-1.5 text-xs font-mono text-zinc-500 bg-[#1a1a1a] px-2 py-1 rounded break-all">
              保存先: {previewPath}
            </div>
          </div>

          <div className="flex gap-4 mb-4">
            <div className="flex-1">
              <label className="block mb-1.5 text-sm text-zinc-300">ソフトウェア</label>
              <select
                value={software}
                onChange={(e) => setSoftware(e.target.value)}
                className="w-full p-2.5 bg-zinc-700 border border-zinc-600 rounded text-white"
              >
                <optgroup label="Standard">
                  <option value="Vanilla">Vanilla (公式)</option>
                  <option value="Paper">Paper (推奨)</option>
                  <option value="LeafMC">LeafMC (Paper Fork)</option>
                  <option value="Spigot">Spigot</option>
                </optgroup>
                <optgroup label="Modded">
                  <option value="Fabric">Fabric</option>
                  <option value="Forge">Forge</option>
                </optgroup>
                <optgroup label="Proxy">
                  <option value="Velocity">Velocity</option>
                  <option value="Waterfall">Waterfall</option>
                  <option value="BungeeCord">BungeeCord</option>
                </optgroup>
              </select>
            </div>

            <div className="flex-1">
              <label className="block mb-1.5 text-sm text-zinc-300">バージョン</label>
              <select
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                className="w-full p-2.5 bg-zinc-700 border border-zinc-600 rounded text-white"
              >
                {VERSION_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-4 mb-6">
            <div className="flex-1">
              <label className="block mb-1.5 text-sm text-zinc-300">ポート</label>
              <input
                type="number"
                required
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                className="w-full p-2.5 bg-zinc-700 border border-zinc-600 rounded text-white"
              />
            </div>
            <div className="flex-1">
              <label className="block mb-1.5 text-sm text-zinc-300">メモリ(GB)</label>
              <input
                type="number"
                required
                value={memory}
                onChange={(e) => setMemory(Number(e.target.value))}
                className="w-full p-2.5 bg-zinc-700 border border-zinc-600 rounded text-white"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2.5 border-t border-zinc-700 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-transparent border border-zinc-600 text-zinc-300 rounded cursor-pointer hover:bg-white/5"
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-accent border-none text-white rounded cursor-pointer font-bold hover:bg-accent-hover"
            >
              作成
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddServerModal;
