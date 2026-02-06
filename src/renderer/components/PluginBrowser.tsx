import { useEffect, useState } from 'react';
import { type MinecraftServer } from '../components/../shared/server declaration';
import { useToast } from './ToastProvider';
import { listFiles, deleteItem } from '../../lib/file-commands';
import {
  searchModrinth,
  searchHangar,
  installModrinthProject,
  installHangarProject,
} from '../../lib/plugin-commands';

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
  platform: 'Modrinth' | 'Hangar' | 'Spigot';
  slug?: string;
  source_obj: any;
}

export default function PluginBrowser({ server }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [installedFiles, setInstalledFiles] = useState<string[]>([]);
  const [dupDialog, setDupDialog] = useState<{ item: ProjectItem; installedFile: string } | null>(
    null
  );
  const [page, setPage] = useState(0);
  const LIMIT = 30;
  const isModServer = ['Fabric', 'Forge', 'NeoForge'].includes(server.software || '');
  const [platform, setPlatform] = useState<'Modrinth' | 'Hangar' | 'CurseForge' | 'Spigot'>(
    isModServer ? 'Modrinth' : 'Modrinth'
  );
  const isPaper = ['Paper', 'LeafMC', 'Waterfall', 'Velocity'].includes(server.software || '');
  const { showToast } = useToast();
  const folderName = isModServer ? 'mods' : 'plugins';

  const refreshInstalled = async () => {
    try {
      const dirPath = `${server.path}/${folderName}`;
      const entries = await listFiles(dirPath);
      setInstalledFiles(entries.filter((e) => !e.isDirectory).map((e) => e.name));
    } catch (e) {
      console.error(e);
      setInstalledFiles([]);
    }
  };

  useEffect(() => {
    search();
  }, [page, platform]);

  useEffect(() => {
    refreshInstalled();
  }, [server.id, server.path, isModServer]);

  const normalize = (text?: string) =>
    (text || '')
      .toLowerCase()
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-z0-9]/g, '');

  const findInstalledMatch = (item: ProjectItem) => {
    // Strategy 1: normalized slug/title/id matching
    const candidates = [
      item.slug,
      item.title,
      item.id,
      item.source_obj?.slug,
      item.source_obj?.project_id,
    ]
      .map(normalize)
      .filter(Boolean);

    // Strategy 2: case-insensitive plain name matching (less aggressive)
    const plainCandidates = [item.slug, item.title, item.source_obj?.slug]
      .filter(Boolean)
      .map((s: string) => s.toLowerCase());

    return (
      installedFiles.find((file) => {
        const base = normalize(file);
        const fileLower = file.toLowerCase();
        // Remove extension and version number for loose matching
        const fileBase = fileLower.replace(/\.[^.]+$/, '').replace(/-[\d.]+$/, '');

        // Normalized match (existing logic)
        if (candidates.some((c) => base.includes(c) || c.includes(base))) return true;
        // Plain case-insensitive match on filename
        if (plainCandidates.some((c) => fileLower.includes(c) || fileBase === c)) return true;
        return false;
      }) || null
    );
  };

  const search = async () => {
    setLoading(true);
    setResults([]);

    try {
      const offset = page * LIMIT;
      let items: ProjectItem[] = [];

      if (platform === 'Modrinth') {
        const searchType = isModServer ? 'mod' : 'plugin';
        const facets = `[["project_type:${searchType}"],["versions:${server.version}"]]`;
        const result = await searchModrinth(query, facets, offset);
        const hits = result.hits;

        items = hits.map((h: any) => ({
          id: h.project_id,
          title: h.title,
          description: h.description,
          author: h.author,
          icon_url: h.icon_url,
          downloads: h.downloads,
          slug: h.slug || h.project_id,
          platform: 'Modrinth',
          source_obj: h,
        }));
      } else if (platform === 'Hangar') {
        const data = await searchHangar(query, server.version, offset);
        const hits = data.result;

        items = hits.map((h: any) => ({
          id: h.name,
          title: h.name,
          description: h.description,
          author: h.namespace.owner,
          icon_url: h.avatarUrl,
          stars: h.stats.stars,
          downloads: h.stats.downloads,
          slug: h.namespace?.slug || h.name,
          platform: 'Hangar',
          source_obj: h,
        }));
      }

      setResults(items);
    } catch (e) {
      console.error(e);
      showToast('データの取得に失敗しました', 'error');
    } finally {
      setLoading(false);
    }
  };

  const performInstall = async (
    item: ProjectItem,
    mode: 'fresh' | 'overwrite' | 'update',
    installedFile?: string
  ) => {
    if (installedFile) {
      const targetPath = `${server.path}/${folderName}/${installedFile}`;
      try {
        await deleteItem(targetPath);
      } catch (err) {
        console.error(err);
        showToast('既存ファイルの削除に失敗しました', 'error');
        return;
      }
    }

    setInstallingId(item.id);
    try {
      if (item.platform === 'Modrinth') {
        const loader = server.software.toLowerCase();
        const params = new URLSearchParams();
        params.append('loaders', `["${loader}"]`);
        params.append('game_versions', `["${server.version}"]`);

        const res = await fetch(
          `https://api.modrinth.com/v2/project/${item.id}/version?${params.toString()}`
        );
        const versions = await res.json();

        if (!versions || versions.length === 0) {
          showToast('対応バージョンが見つかりませんでした', 'error');
          return;
        }
        const file = versions[0].files[0];

        await installModrinthProject(versions[0].id, file.filename, `${server.path}/${folderName}`);
        showToast(
          `${mode === 'fresh' ? 'インストール完了' : mode === 'overwrite' ? '上書き完了' : 'アップデート完了'}: ${item.title}`,
          'success'
        );
      } else if (item.platform === 'Hangar') {
        const author = item.source_obj.namespace.owner;
        const slug = item.source_obj.namespace.slug;
        const res = await fetch(
          `https://hangar.papermc.io/api/v1/projects/${author}/${slug}/versions?limit=1&platform=PAPER&platformVersion=${server.version}`
        );
        const data = await res.json();

        if (!data.result || data.result.length === 0) {
          showToast('対応バージョンが見つかりませんでした', 'error');
          return;
        }

        const version = data.result[0];
        const downloadUrl = version.downloads.PAPER.downloadUrl;
        const fileName = `${slug}-${version.name}.jar`;

        await installHangarProject(downloadUrl, fileName, `${server.path}/${folderName}`);
        showToast(
          `${mode === 'fresh' ? 'インストール完了' : mode === 'overwrite' ? '上書き完了' : 'アップデート完了'}: ${item.title}`,
          'success'
        );
      }
    } catch (e) {
      console.error(e);
      showToast('インストールエラー', 'error');
    } finally {
      setInstallingId(null);
      refreshInstalled();
    }
  };

  const handleInstall = (item: ProjectItem) => {
    const installedMatch = findInstalledMatch(item);
    if (installedMatch) {
      setDupDialog({ item, installedFile: installedMatch });
      return;
    }

    void performInstall(item, 'fresh');
  };

  const openExternal = async (url: string) => {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  };

  return (
    <div className="h-full flex flex-col p-5">
      <div className="flex justify-between items-center mb-5">
        <h2 className="m-0">{isModServer ? 'Mod' : 'Plugin'} Browser</h2>

        <div className="flex gap-2.5">
          <select
            className="input-field w-[150px]"
            value={platform}
            onChange={(e) => {
              setPlatform(e.target.value as any);
              setPage(0);
            }}
          >
            <option value="Modrinth">Modrinth</option>
            {isPaper && <option value="Hangar">Hangar (Paper)</option>}
            {isModServer && <option value="CurseForge">CurseForge (Web)</option>}
            {!isModServer && <option value="Spigot">SpigotMC (Web)</option>}
          </select>
        </div>
      </div>

      {platform === 'Modrinth' || platform === 'Hangar' ? (
        <div className="mb-5 flex gap-2.5">
          <input
            type="text"
            className="input-field flex-1"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search on ${platform}...`}
            onKeyDown={(e) => e.key === 'Enter' && search()}
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
            onClick={() =>
              openExternal(
                platform === 'CurseForge'
                  ? 'https://www.curseforge.com/minecraft/mc-mods'
                  : 'https://www.spigotmc.org/resources/'
              )
            }
          >
            ブラウザで {platform} を開く
          </button>
          <p className="text-xs text-zinc-500 mt-3">
            ダウンロードした.jarは Files から plugins フォルダへ配置してください。
          </p>
        </div>
      )}

      {(platform === 'Modrinth' || platform === 'Hangar') && (
        <>
          <div className="flex-1 overflow-y-auto grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-4 pr-1">
            {results.map((item) => (
              <div
                key={item.id}
                className="p-4 flex gap-4 bg-[#252526] border border-zinc-800 rounded-lg"
              >
                <div
                  className="w-16 h-16 rounded-lg shrink-0 bg-zinc-800"
                  style={{
                    backgroundImage: item.icon_url ? `url(${item.icon_url})` : 'none',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                ></div>

                <div className="flex-1 min-w-0 flex flex-col">
                  <div className="flex justify-between items-start mb-1.5">
                    <div className="font-bold text-base whitespace-nowrap overflow-hidden text-ellipsis mr-2.5">
                      {item.title}
                    </div>
                    <div className="flex items-center gap-2">
                      {findInstalledMatch(item) && (
                        <span className="text-xs font-semibold text-emerald-400">Installed</span>
                      )}
                      <button
                        onClick={() => handleInstall(item)}
                        disabled={installingId === item.id}
                        className="py-1.5 px-3.5 text-xs h-8 border-none rounded bg-gradient-to-br from-blue-500 to-cyan-500 text-white font-bold cursor-pointer shadow-[0_2px_8px_rgba(6,182,212,0.3)] disabled:opacity-70"
                      >
                        {installingId === item.id ? '...' : 'Install'}
                      </button>
                    </div>
                  </div>

                  <div className="text-sm text-zinc-400 mb-auto line-clamp-2 leading-snug">
                    {item.description}
                  </div>

                  <div className="mt-2.5 text-xs text-zinc-600 flex justify-between">
                    <span>By {item.author}</span>
                    <span>
                      {item.downloads
                        ? `⬇ ${item.downloads.toLocaleString()}`
                        : item.stars
                          ? `★ ${item.stars}`
                          : ''}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            {results.length === 0 && !loading && (
              <div className="col-span-full text-center text-zinc-600 p-5">結果がありません。</div>
            )}
          </div>

          <div className="mt-5 flex justify-center gap-5 items-center">
            <button
              className="btn-secondary disabled:opacity-50"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
            >
              ← Prev
            </button>
            <span className="text-zinc-400">Page {page + 1}</span>
            <button
              className="btn-secondary disabled:opacity-50"
              onClick={() => setPage((p) => p + 1)}
              disabled={results.length < LIMIT || loading}
            >
              Next →
            </button>
          </div>
        </>
      )}

      {dupDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[1200] flex items-center justify-center px-4 modal-backdrop">
          <div className="bg-[#1f1f22] text-white w-full max-w-md rounded-xl border border-zinc-700 shadow-2xl p-6 modal-panel">
            <h3 className="text-lg font-bold mb-2">既にインストール済みです</h3>
            <p className="text-sm text-zinc-300 mb-4 leading-relaxed">
              {dupDialog.item.title} は既に {folderName} フォルダに存在します。どうしますか？
            </p>

            <div className="bg-[#26262a] border border-zinc-700 rounded-lg p-3 mb-4 text-xs text-zinc-400 font-mono break-all">
              既存ファイル: {dupDialog.installedFile}
            </div>

            <div className="flex flex-col gap-2 mb-4 text-xs text-zinc-400">
              <div>・上書き: そのまま置き換えます。</div>
              <div>・アップデート: サーバーバージョンに合う最新ビルドを入れ直します。</div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                className="px-4 py-2 text-sm rounded border border-zinc-700 text-zinc-300 hover:bg-white/5"
                onClick={() => setDupDialog(null)}
              >
                キャンセル
              </button>
              <button
                className="px-4 py-2 text-sm rounded bg-amber-500 hover:bg-amber-600 text-white font-semibold"
                onClick={() => {
                  const target = dupDialog;
                  setDupDialog(null);
                  if (target) void performInstall(target.item, 'overwrite', target.installedFile);
                }}
              >
                上書き
              </button>
              <button
                className="px-4 py-2 text-sm rounded bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white font-semibold"
                onClick={() => {
                  const target = dupDialog;
                  setDupDialog(null);
                  if (target) void performInstall(target.item, 'update', target.installedFile);
                }}
              >
                アップデート
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
