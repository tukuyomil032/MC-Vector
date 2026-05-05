import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { isRecord } from './guards/json-guards';

export async function resolveLatestJarUrl(
  software: string,
  version: string,
): Promise<{ latestVersion: string; downloadUrl: string } | null> {
  try {
    if (software === 'Paper' || software === 'LeafMC') {
      const project = software === 'Paper' ? 'paper' : 'leafmc';
      // 最新バージョン一覧を取得
      const versRes = await tauriFetch(`https://api.papermc.io/v2/projects/${project}`);
      const versData = await versRes.json();
      if (
        !isRecord(versData) ||
        !Array.isArray(versData.versions) ||
        versData.versions.length === 0
      )
        return null;
      const latestVersion = versData.versions[versData.versions.length - 1] as string;
      // 最新ビルドを取得
      const buildRes = await tauriFetch(
        `https://api.papermc.io/v2/projects/${project}/versions/${latestVersion}/builds`,
      );
      const buildData = await buildRes.json();
      if (!isRecord(buildData) || !Array.isArray(buildData.builds) || buildData.builds.length === 0)
        return null;
      const latestBuild = buildData.builds[buildData.builds.length - 1];
      if (!isRecord(latestBuild) || typeof latestBuild.build !== 'number') return null;
      const buildNumber = latestBuild.build;
      const appDownloads =
        isRecord(latestBuild.downloads) && isRecord(latestBuild.downloads.application)
          ? latestBuild.downloads.application
          : {};
      const fileName =
        typeof appDownloads.name === 'string'
          ? appDownloads.name
          : `${project}-${latestVersion}-${buildNumber}.jar`;
      const downloadUrl = `https://api.papermc.io/v2/projects/${project}/versions/${latestVersion}/builds/${buildNumber}/downloads/${fileName}`;
      return { latestVersion, downloadUrl };
    } else if (software === 'Vanilla') {
      const manifestRes = await tauriFetch(
        'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json',
      );
      const manifest = await manifestRes.json();
      if (!isRecord(manifest) || !Array.isArray(manifest.versions)) return null;
      // 最新リリース
      const latestEntry = manifest.versions.find(
        (v): v is Record<string, unknown> => isRecord(v) && v.type === 'release',
      );
      if (!latestEntry || typeof latestEntry.id !== 'string' || typeof latestEntry.url !== 'string')
        return null;
      const latestVersion = latestEntry.id;
      // バージョン詳細から server JAR URL
      const detailRes = await tauriFetch(latestEntry.url);
      const detail = await detailRes.json();
      if (!isRecord(detail) || !isRecord(detail.downloads) || !isRecord(detail.downloads.server))
        return null;
      const serverUrl = detail.downloads.server.url;
      if (typeof serverUrl !== 'string' || !serverUrl) return null;
      return { latestVersion, downloadUrl: serverUrl };
    } else if (software === 'Fabric') {
      const loaderRes = await tauriFetch('https://meta.fabricmc.net/v2/versions/loader');
      const loaders = await loaderRes.json();
      if (!Array.isArray(loaders) || loaders.length === 0) return null;
      const firstLoader = loaders[0];
      if (!isRecord(firstLoader) || typeof firstLoader.version !== 'string') return null;
      const latestLoader = firstLoader.version;
      // Fabric の最新 game version は version で指定（現バージョンの最新ビルドを返す）
      const downloadUrl = `https://meta.fabricmc.net/v2/versions/loader/${version}/${latestLoader}/1.0.1/server/jar`;
      return { latestVersion: version, downloadUrl };
    }
    // Spigot, Forge, Velocity, Waterfall, BungeeCord — 非対応
    return null;
  } catch {
    return null;
  }
}
