import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { logError } from './error-utils';
import { isRecord } from './guards/json-guards';

const MC_VECTOR_USER_AGENT = 'MC-Vector/2.0.57 (https://github.com/tukuyomil032/MC-Vector)';
const PAPER_FILL_API = 'https://fill.papermc.io/v3';
const PAPER_FALLBACK_API = 'https://api.papermc.io/v2';
const LEAF_API = 'https://api.leafmc.one/v2';
const MOJANG_MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const FABRIC_META_API = 'https://meta.fabricmc.net/v2';

type ResolveMode = 'latest' | 'requested';
export type JarResolution = { latestVersion: string; downloadUrl: string; sha256?: string };

type FetchLikeResponse = {
  ok?: boolean;
  status?: number;
  statusText?: string;
  json: () => Promise<unknown>;
};

export function getJarResolverRequestHeaders(): Record<string, string> {
  return {
    Accept: 'application/json',
    'User-Agent': MC_VECTOR_USER_AGENT,
  };
}

async function fetchJson(url: string): Promise<unknown> {
  const response = (await tauriFetch(url, {
    method: 'GET',
    headers: getJarResolverRequestHeaders(),
  })) as FetchLikeResponse;
  const status = typeof response.status === 'number' ? response.status : 0;
  const ok = typeof response.ok === 'boolean' ? response.ok : status >= 200 && status < 300;
  if (!ok) {
    const label = response.statusText ? ` ${response.statusText}` : '';
    throw new Error(`GET ${url} failed with HTTP ${status}${label}`);
  }
  return response.json();
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

function isOfficialUrl(url: string, allowedHosts: readonly string[]): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && allowedHosts.some((host) => parsed.hostname === host);
  } catch {
    return false;
  }
}

function readDownloadName(downloads: unknown): string | null {
  if (!isRecord(downloads)) return null;
  const application = isRecord(downloads.application) ? downloads.application : null;
  if (application && typeof application.name === 'string' && application.name.trim()) {
    return application.name;
  }
  const serverDefault = downloads['server:default'];
  if (
    isRecord(serverDefault) &&
    typeof serverDefault.name === 'string' &&
    serverDefault.name.trim()
  ) {
    return serverDefault.name;
  }
  return null;
}

function readDownloadUrl(downloads: unknown): string | null {
  if (!isRecord(downloads)) return null;
  const serverDefault = downloads['server:default'];
  if (
    isRecord(serverDefault) &&
    typeof serverDefault.url === 'string' &&
    serverDefault.url.trim()
  ) {
    return serverDefault.url;
  }
  const application = isRecord(downloads.application) ? downloads.application : null;
  if (application && typeof application.url === 'string' && application.url.trim()) {
    return application.url;
  }
  return null;
}

function readDownloadSha256(downloads: unknown): string | undefined {
  if (!isRecord(downloads)) return undefined;
  const candidates = [downloads['server:default'], downloads.application];
  for (const candidate of candidates) {
    if (!isRecord(candidate) || !isRecord(candidate.checksums)) continue;
    if (typeof candidate.checksums.sha256 === 'string' && candidate.checksums.sha256.trim()) {
      return candidate.checksums.sha256.trim();
    }
  }
  return undefined;
}

function isStableLikeBuild(build: Record<string, unknown>): boolean {
  if (typeof build.promoted === 'boolean' && build.promoted) return true;
  if (typeof build.channel !== 'string') return true;
  const channel = build.channel.toLowerCase();
  return channel === 'stable' || channel === 'default';
}

function selectLatestV2Build(builds: unknown, stableOnly: boolean): Record<string, unknown> | null {
  const candidates = Array.isArray(builds)
    ? builds.filter((build): build is Record<string, unknown> => isRecord(build))
    : [];
  const selected = stableOnly ? candidates.filter(isStableLikeBuild) : candidates;
  return selected.length > 0 ? selected[selected.length - 1] : null;
}

function readV2BuildNumber(build: Record<string, unknown>): number | string | null {
  if (typeof build.build === 'number' || typeof build.build === 'string') return build.build;
  if (typeof build.id === 'number' || typeof build.id === 'string') return build.id;
  return null;
}

function readVersionsFromV2Project(projectData: unknown): string[] {
  return isRecord(projectData) ? asStringArray(projectData.versions) : [];
}

async function resolveV2StyleJarUrl(params: {
  apiBase: string;
  project: string;
  version: string;
  mode: ResolveMode;
  filePrefix: string;
  stableOnly: boolean;
}): Promise<JarResolution | null> {
  const requestedVersion = params.version.trim();
  let versions = requestedVersion ? [requestedVersion] : [];
  if (params.mode === 'latest' || versions.length === 0) {
    const projectData = await fetchJson(`${params.apiBase}/projects/${params.project}`);
    const apiVersions = readVersionsFromV2Project(projectData);
    versions = params.mode === 'latest' ? [...apiVersions].reverse() : versions;
  }

  for (const version of versions) {
    const buildData = await fetchJson(
      `${params.apiBase}/projects/${params.project}/versions/${encodePathSegment(version)}/builds`,
    );
    const builds = Array.isArray(buildData)
      ? buildData
      : isRecord(buildData)
        ? buildData.builds
        : null;
    const latestBuild = selectLatestV2Build(builds, params.stableOnly);
    if (!latestBuild) continue;
    const buildNumber = readV2BuildNumber(latestBuild);
    if (buildNumber === null) continue;

    const fileName =
      readDownloadName(latestBuild.downloads) ||
      `${params.filePrefix}-${version}-${String(buildNumber)}.jar`;
    return {
      latestVersion: version,
      downloadUrl: `${params.apiBase}/projects/${params.project}/versions/${encodePathSegment(
        version,
      )}/builds/${encodePathSegment(String(buildNumber))}/downloads/${encodePathSegment(fileName)}`,
      sha256: readDownloadSha256(latestBuild.downloads),
    };
  }
  return null;
}

function readPaperFillVersions(projectData: unknown): string[] {
  if (!isRecord(projectData)) return [];
  if (Array.isArray(projectData.versions)) return asStringArray(projectData.versions);
  if (!isRecord(projectData.versions)) return [];
  return Object.values(projectData.versions).flatMap((group) => asStringArray(group));
}

function selectLatestStableFillBuild(buildsData: unknown): Record<string, unknown> | null {
  const builds = Array.isArray(buildsData)
    ? buildsData
    : isRecord(buildsData) && Array.isArray(buildsData.builds)
      ? buildsData.builds
      : [];
  return (
    builds.find(
      (build): build is Record<string, unknown> =>
        isRecord(build) && typeof build.channel === 'string' && build.channel === 'STABLE',
    ) ?? null
  );
}

async function resolvePaperFromFill(
  version: string,
  mode: ResolveMode,
): Promise<JarResolution | null> {
  const requestedVersion = version.trim();
  let versions = requestedVersion ? [requestedVersion] : [];
  if (mode === 'latest' || versions.length === 0) {
    const projectData = await fetchJson(`${PAPER_FILL_API}/projects/paper`);
    versions = readPaperFillVersions(projectData);
  }

  for (const candidateVersion of versions) {
    const buildsData = await fetchJson(
      `${PAPER_FILL_API}/projects/paper/versions/${encodePathSegment(candidateVersion)}/builds`,
    );
    const build = selectLatestStableFillBuild(buildsData);
    if (!build) continue;
    const downloadUrl = readDownloadUrl(build.downloads);
    if (downloadUrl && isOfficialUrl(downloadUrl, ['fill.papermc.io', 'fill-data.papermc.io'])) {
      return {
        latestVersion: candidateVersion,
        downloadUrl,
        sha256: readDownloadSha256(build.downloads),
      };
    }
  }
  return null;
}

async function resolvePaperJarUrl(
  version: string,
  mode: ResolveMode,
): Promise<JarResolution | null> {
  try {
    const fillResult = await resolvePaperFromFill(version, mode);
    if (fillResult) return fillResult;
    return null;
  } catch (error) {
    logError('Paper Fill API resolution failed; trying PaperMC v2 fallback', error, {
      software: 'Paper',
      version,
      mode,
    });
  }
  return resolveV2StyleJarUrl({
    apiBase: PAPER_FALLBACK_API,
    project: 'paper',
    version,
    mode,
    filePrefix: 'paper',
    stableOnly: true,
  });
}

function resolveLeafJarUrl(version: string, mode: ResolveMode): Promise<JarResolution | null> {
  return resolveV2StyleJarUrl({
    apiBase: LEAF_API,
    project: 'leaf',
    version,
    mode,
    filePrefix: 'leaf',
    stableOnly: false,
  });
}

function selectVanillaVersion(
  manifest: unknown,
  version: string,
  mode: ResolveMode,
): Record<string, unknown> | null {
  if (!isRecord(manifest) || !Array.isArray(manifest.versions)) return null;
  const requestedVersion = version.trim();
  const entries = manifest.versions.filter((entry): entry is Record<string, unknown> =>
    isRecord(entry),
  );
  if (mode === 'requested' && requestedVersion) {
    return entries.find((entry) => entry.id === requestedVersion) ?? null;
  }
  return entries.find((entry) => entry.type === 'release') ?? null;
}

async function resolveVanillaJarUrl(
  version: string,
  mode: ResolveMode,
): Promise<JarResolution | null> {
  const manifest = await fetchJson(MOJANG_MANIFEST_URL);
  const entry = selectVanillaVersion(manifest, version, mode);
  if (!entry || typeof entry.id !== 'string' || typeof entry.url !== 'string') return null;
  if (!isOfficialUrl(entry.url, ['piston-meta.mojang.com'])) return null;
  const detail = await fetchJson(entry.url);
  if (!isRecord(detail) || !isRecord(detail.downloads) || !isRecord(detail.downloads.server))
    return null;
  const serverUrl = detail.downloads.server.url;
  if (typeof serverUrl !== 'string' || !isOfficialUrl(serverUrl, ['piston-data.mojang.com'])) {
    return null;
  }
  return { latestVersion: entry.id, downloadUrl: serverUrl };
}

function selectFabricLoader(loaders: unknown): string | null {
  if (!Array.isArray(loaders)) return null;
  const entries = loaders.filter((entry): entry is Record<string, unknown> => isRecord(entry));
  const stableEntry =
    entries.find((entry) => isRecord(entry.loader) && entry.loader.stable === true) ?? entries[0];
  if (!stableEntry || !isRecord(stableEntry.loader)) return null;
  return typeof stableEntry.loader.version === 'string' ? stableEntry.loader.version : null;
}

function selectFabricInstaller(installers: unknown): string | null {
  if (!Array.isArray(installers)) return null;
  const entries = installers.filter((entry): entry is Record<string, unknown> => isRecord(entry));
  const stableEntry = entries.find((entry) => entry.stable === true) ?? entries[0];
  return stableEntry && typeof stableEntry.version === 'string' ? stableEntry.version : null;
}

async function resolveFabricJarUrl(version: string): Promise<JarResolution | null> {
  const requestedVersion = version.trim();
  if (!requestedVersion) return null;
  const loaders = await fetchJson(
    `${FABRIC_META_API}/versions/loader/${encodePathSegment(requestedVersion)}`,
  );
  const loaderVersion = selectFabricLoader(loaders);
  if (!loaderVersion) return null;
  const installerVersion = selectFabricInstaller(
    await fetchJson(`${FABRIC_META_API}/versions/installer`),
  );
  if (!installerVersion) return null;
  return {
    latestVersion: requestedVersion,
    downloadUrl: `${FABRIC_META_API}/versions/loader/${encodePathSegment(
      requestedVersion,
    )}/${encodePathSegment(loaderVersion)}/${encodePathSegment(installerVersion)}/server/jar`,
  };
}

async function resolveJarUrl(
  software: string,
  version: string,
  mode: ResolveMode,
): Promise<JarResolution | null> {
  if (software === 'Paper') return resolvePaperJarUrl(version, mode);
  if (software === 'LeafMC') return resolveLeafJarUrl(version, mode);
  if (software === 'Vanilla') return resolveVanillaJarUrl(version, mode);
  if (software === 'Fabric') return resolveFabricJarUrl(version);
  return null;
}

export async function resolveLatestJarUrl(
  software: string,
  version: string,
): Promise<JarResolution | null> {
  try {
    return await resolveJarUrl(software, version, 'latest');
  } catch (error) {
    logError('Failed to resolve latest jar URL', error, { software, version });
    throw error;
  }
}

export async function resolveRequestedJarUrl(
  software: string,
  version: string,
): Promise<JarResolution | null> {
  try {
    return await resolveJarUrl(software, version, 'requested');
  } catch (error) {
    logError('Failed to resolve requested jar URL', error, { software, version });
    throw error;
  }
}
