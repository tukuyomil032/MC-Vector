import { useState, useEffect } from 'react';
import { type MinecraftServer } from '../components/../shared/server declaration';

interface Props {
  server: MinecraftServer;
}

interface ProjectItem {
  id: string;
  title: string;
  description: string;
  author: string;
  icon_url?: string;
  downloads?: number;
  stars?: number;
  platform: 'Modrinth' | 'Hangar';
  source_obj: any;
}

export default function PluginBrowser({ server }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const LIMIT = 30;
  const isModServer = ['Fabric', 'Forge', 'NeoForge'].includes(server.software || '');
  const [platform, setPlatform] = useState<'Modrinth' | 'Hangar' | 'CurseForge' | 'Spigot'>(isModServer ? 'Modrinth' : 'Modrinth');
  const isPaper = ['Paper', 'LeafMC', 'Waterfall', 'Velocity'].includes(server.software || '');

  useEffect(() => {
    search();
  }, [page, platform]);

  const search = async () => {
    if (platform === 'CurseForge' || platform === 'Spigot') {
        setResults([]);
        return;
    }

    setLoading(true);
    setResults([]);

    try {
      const offset = page * LIMIT;
      let items: ProjectItem[] = [];

      if (platform === 'Modrinth') {
        const searchType = isModServer ? 'mod' : 'plugin';
        const hits = await window.electronAPI.searchModrinth(query, searchType, server.version, offset);

        items = hits.map((h: any) => ({
          id: h.project_id,
          title: h.title,
          description: h.description,
          author: h.author,
          icon_url: h.icon_url,
          downloads: h.downloads,
          platform: 'Modrinth',
          source_obj: h
        }));

      } else if (platform === 'Hangar') {
        const hits = await window.electronAPI.searchHangar(query, server.version, offset);

        items = hits.map((h: any) => ({
          id: h.name,
          title: h.name,
          description: h.description,
          author: h.namespace.owner,
          icon_url: h.avatarUrl,
          stars: h.stats.stars,
          downloads: h.stats.downloads,
          platform: 'Hangar',
          source_obj: h
        }));
      }

      setResults(items);
    } catch (e) {
      console.error(e);
      alert('データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleInstall = async (item: ProjectItem) => {
    setInstallingId(item.id);
    try {
      if (item.platform === 'Modrinth') {
        const loader = server.software.toLowerCase();
        const params = new URLSearchParams();
        params.append('loaders', `["${loader}"]`);
        params.append('game_versions', `["${server.version}"]`);

        const res = await fetch(`https://api.modrinth.com/v2/project/${item.id}/version?${params.toString()}`);
        const versions = await res.json();

        if (!versions || versions.length === 0) {
            alert('対応バージョンが見つかりませんでした');
            return;
        }
        const file = versions[0].files[0];
        const type = isModServer ? 'mod' : 'plugin';

        await window.electronAPI.installModrinthProject(item.id, versions[0].id, file.filename, file.url, server.path, type);
        alert(`インストール完了: ${item.title}`);

      } else if (item.platform === 'Hangar') {
        const author = item.source_obj.namespace.owner;
        const slug = item.source_obj.namespace.slug;
        const res = await fetch(`https://hangar.papermc.io/api/v1/projects/${author}/${slug}/versions?limit=1&platform=PAPER&platformVersion=${server.version}`);
        const data = await res.json();

        if (!data.result || data.result.length === 0) {
             alert('対応バージョンが見つかりませんでした');
             return;
        }

        const version = data.result[0];
        const downloadUrl = version.downloads.PAPER.downloadUrl;
        const fileName = `${slug}-${version.name}.jar`;

        await window.electronAPI.installHangarProject(downloadUrl, fileName, server.path);
        alert(`インストール完了: ${item.title}`);
      }
    } catch (e) {
      console.error(e);
      alert('インストールエラー');
    } finally {
      setInstallingId(null);
    }
  };

  const openExternal = (url: string) => {
      alert(`ブラウザで開いてください: ${url}`);
  };

  return (
    <div className="h-full flex flex-col p-5">

      <div className="flex justify-between items-center mb-5">
        <h2 className="m-0">{isModServer ? 'Mod' : 'Plugin'} Browser</h2>

        <div className="flex gap-2.5">
          <select
            className="input-field w-[150px]"
            value={platform}
            onChange={e => { setPlatform(e.target.value as any); setPage(0); }}
          >
            <option value="Modrinth">Modrinth</option>
            {isPaper && <option value="Hangar">Hangar (Paper)</option>}
            {isModServer && <option value="CurseForge">CurseForge (Web)</option>}
            {!isModServer && <option value="Spigot">SpigotMC (Web)</option>}
          </select>
        </div>
      </div>

      {(platform === 'Modrinth' || platform === 'Hangar') ? (
        <div className="mb-5 flex gap-2.5">
          <input
            type="text"
            className="input-field flex-1"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={`Search on ${platform}...`}
            onKeyDown={e => e.key === 'Enter' && search()}
          />
          <button className="btn-primary disabled:opacity-50" onClick={search} disabled={loading}>
            {loading ? '...' : 'Search'}
          </button>
        </div>
      ) : (
        <div className="p-10 text-center bg-[#252526] rounded-lg">
          <p>このプラットフォームはアプリ内検索に対応していません。</p>
          <button
            className="btn-primary mt-2"
            onClick={() => openExternal(platform === 'CurseForge' ? 'https://www.curseforge.com/minecraft/mc-mods' : 'https://www.spigotmc.org/resources/')}
          >
            ブラウザで {platform} を開く
          </button>
        </div>
      )}

      {(platform === 'Modrinth' || platform === 'Hangar') && (
        <>
          <div className="flex-1 overflow-y-auto grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-4 pr-1">
            {results.map(item => (
              <div key={item.id} className="p-4 flex gap-4 bg-[#252526] border border-zinc-800 rounded-lg">
                <div
                    className="w-16 h-16 rounded-lg shrink-0 bg-zinc-800"
                    style={{
                      backgroundImage: item.icon_url ? `url(${item.icon_url})` : 'none',
                      backgroundSize: 'cover',
                      backgroundPosition: 'center'
                    }}
                ></div>

                <div className="flex-1 min-w-0 flex flex-col">
                  <div className="flex justify-between items-start mb-1.5">
                    <div className="font-bold text-base whitespace-nowrap overflow-hidden text-ellipsis mr-2.5">
                      {item.title}
                    </div>
                    <button
                      onClick={() => handleInstall(item)}
                      disabled={installingId === item.id}
                      className="py-1.5 px-3.5 text-xs h-8 border-none rounded bg-gradient-to-br from-blue-500 to-cyan-500 text-white font-bold cursor-pointer shadow-[0_2px_8px_rgba(6,182,212,0.3)] disabled:opacity-70"
                    >
                      {installingId === item.id ? '...' : 'Install'}
                    </button>
                  </div>

                  <div className="text-sm text-zinc-400 mb-auto line-clamp-2 leading-snug">
                    {item.description}
                  </div>

                  <div className="mt-2.5 text-xs text-zinc-600 flex justify-between">
                    <span>By {item.author}</span>
                    <span>
                      {item.downloads ? `⬇ ${item.downloads.toLocaleString()}` : (item.stars ? `★ ${item.stars}` : '')}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            {results.length === 0 && !loading && (
              <div className="col-span-full text-center text-zinc-600 p-5">
                結果がありません。
              </div>
            )}
          </div>

          <div className="mt-5 flex justify-center gap-5 items-center">
            <button
              className="btn-secondary disabled:opacity-50"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
            >
              ← Prev
            </button>
            <span className="text-zinc-400">Page {page + 1}</span>
            <button
              className="btn-secondary disabled:opacity-50"
              onClick={() => setPage(p => p + 1)}
              disabled={results.length < LIMIT || loading}
            >
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  );
}