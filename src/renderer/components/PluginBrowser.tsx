import { useState, useEffect } from 'react';
import { type MinecraftServer } from '../components/../shared/server declaration';
import '../../main.css';

interface Props {
  server: MinecraftServer;
}

// 統一されたプロジェクト型
interface ProjectItem {
  id: string;
  title: string;
  description: string;
  author: string;
  icon_url?: string;
  downloads?: number;
  stars?: number;
  platform: 'Modrinth' | 'Hangar';
  source_obj: any; // 元データ保持用
}

export default function PluginBrowser({ server }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);

  // ページング
  const [page, setPage] = useState(0);
  const LIMIT = 30;

  // プラットフォーム選択
  const isModServer = ['Fabric', 'Forge', 'NeoForge'].includes(server.software || '');
  const [platform, setPlatform] = useState<'Modrinth' | 'Hangar' | 'CurseForge' | 'Spigot'>(isModServer ? 'Modrinth' : 'Modrinth');

  // Paper系サーバーならHangarも選択肢に出す
  const isPaper = ['Paper', 'LeafMC', 'Waterfall', 'Velocity'].includes(server.software || '');

  // 初回ロード & 検索実行
  useEffect(() => {
    search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, platform]); // ページやプラットフォームが変わったら再検索

  const search = async () => {
    // CurseForge/SpigotはAPIがないのでスキップ
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
          id: h.name, // Hangarは名前がID代わり
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

  // インストール処理
  const handleInstall = async (item: ProjectItem) => {
    setInstallingId(item.id);
    try {
      if (item.platform === 'Modrinth') {
        // Modrinthのバージョン解決ロジック
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
        // Hangarのバージョン解決
        const author = item.source_obj.namespace.owner;
        const slug = item.source_obj.namespace.slug;
        const res = await fetch(`https://hangar.papermc.io/api/v1/projects/${author}/${slug}/versions?limit=1&platform=PAPER&platformVersion=${server.version}`);
        const data = await res.json();

        if (!data.result || data.result.length === 0) {
             alert('対応バージョンが見つかりませんでした');
             return;
        }

        const version = data.result[0];
        // HangarのダウンロードURL取得 (外部URLの場合は注意が必要だが今回は簡易実装)
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
      // 本来は window.electronAPI.openExternal(url) などが必要
      alert(`ブラウザで開いてください: ${url}`);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '20px' }}>

      {/* ヘッダー: タイトル & プラットフォーム選択 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0 }}>{isModServer ? 'Mod' : 'Plugin'} Browser</h2>

        <div style={{ display: 'flex', gap: '10px' }}>
          <select
            className="input-field"
            value={platform}
            onChange={e => { setPlatform(e.target.value as any); setPage(0); }}
            style={{ width: '150px' }}
          >
            <option value="Modrinth">Modrinth</option>
            {isPaper && <option value="Hangar">Hangar (Paper)</option>}
            {isModServer && <option value="CurseForge">CurseForge (Web)</option>}
            {!isModServer && <option value="Spigot">SpigotMC (Web)</option>}
          </select>
        </div>
      </div>

      {/* 検索バー */}
      {(platform === 'Modrinth' || platform === 'Hangar') ? (
        <div style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
          <input
            type="text"
            className="input-field"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={`Search on ${platform}...`}
            onKeyDown={e => e.key === 'Enter' && search()}
            style={{ flex: 1 }}
          />
          <button className="btn-primary" onClick={search} disabled={loading}>
            {loading ? '...' : 'Search'}
          </button>
        </div>
      ) : (
        <div style={{ padding: '40px', textAlign: 'center', background: '#252526', borderRadius: '8px' }}>
          <p>このプラットフォームはアプリ内検索に対応していません。</p>
          <button
            className="btn-primary"
            onClick={() => openExternal(platform === 'CurseForge' ? 'https://www.curseforge.com/minecraft/mc-mods' : 'https://www.spigotmc.org/resources/')}
          >
            ブラウザで {platform} を開く
          </button>
        </div>
      )}

      {/* リスト表示 */}
      {(platform === 'Modrinth' || platform === 'Hangar') && (
        <>
          <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '15px', paddingRight: '5px' }}>
            {results.map(item => (
              <div key={item.id} className="setting-card" style={{ padding: '15px', display: 'flex', gap: '15px', background: '#252526', border: '1px solid #333' }}>
                <div style={{
                    width: '64px', height: '64px', borderRadius: '10px',
                    background: item.icon_url ? `url(${item.icon_url}) center/cover` : '#333',
                    flexShrink: 0
                }}></div>

                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '5px' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginRight: '10px' }}>
                      {item.title}
                    </div>
                    {/* ★修正: インストールボタン (青→アクアのグラデーション) */}
                    <button
                      onClick={() => handleInstall(item)}
                      disabled={installingId === item.id}
                      style={{
                        padding: '6px 14px', fontSize: '0.8rem', height: '30px', border: 'none', borderRadius: '4px',
                        background: 'linear-gradient(135deg, #3b82f6, #06b6d4)', // Blue to Cyan
                        color: 'white', fontWeight: 'bold', cursor: 'pointer',
                        boxShadow: '0 2px 8px rgba(6, 182, 212, 0.3)',
                        opacity: installingId === item.id ? 0.7 : 1
                      }}
                    >
                      {installingId === item.id ? '...' : 'Install'}
                    </button>
                  </div>

                  <div style={{ fontSize: '0.85rem', color: '#aaa', marginBottom: 'auto', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: '1.4' }}>
                    {item.description}
                  </div>

                  <div style={{ marginTop: '10px', fontSize: '0.75rem', color: '#666', display: 'flex', justifyContent: 'space-between' }}>
                    <span>By {item.author}</span>
                    <span>
                      {item.downloads ? `⬇ ${item.downloads.toLocaleString()}` : (item.stars ? `★ ${item.stars}` : '')}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            {results.length === 0 && !loading && (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#666', padding: '20px' }}>
                結果がありません。
              </div>
            )}
          </div>

          {/* ページネーション */}
          <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'center', gap: '20px', alignItems: 'center' }}>
            <button
              className="btn-secondary"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
            >
              ← Prev
            </button>
            <span style={{ color: '#aaa' }}>Page {page + 1}</span>
            <button
              className="btn-secondary"
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