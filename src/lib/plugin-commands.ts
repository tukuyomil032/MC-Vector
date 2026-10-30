import { invokePluginMetadata } from './plugin-metadata-ipc';
import { tauriInvoke } from './tauri-api';

// Fixture metadata is exposed only by the explicit debug E2E build. A release
// build with a stray VITE_MC_VECTOR_E2E value must continue to use providers.
const isRealTauriE2E =
  import.meta.env.VITE_MC_VECTOR_E2E === '1' &&
  import.meta.env.VITE_MC_VECTOR_E2E_BUILD === 'debug';
const E2E_PLUGIN_PROJECT_ID = 'e2e-verified-plugin';
const E2E_PLUGIN_VERSION_ID = 'e2e-verified-plugin-version';
const E2E_PLUGIN_FILE_NAME = 'e2e-verified-plugin.jar';

export type PluginCompatibility = 'compatible' | 'incompatible' | 'unknown';

export interface ModrinthProject {
  slug: string;
  project_id?: string;
  title: string;
  description: string;
  author?: string;
  icon_url: string;
  downloads: number;
  project_type: string;
  compatibility: PluginCompatibility;
  supportedVersions: string[];
}

export interface ModrinthDependency {
  dependencyType: string;
  projectId: string | null;
  versionId: string | null;
  fileName: string | null;
}

export interface ModrinthVersion {
  id: string;
  fileName: string;
  gameVersions: string[];
  dependencies: ModrinthDependency[];
}

export interface ModrinthProjectIdentity {
  id: string;
  slug: string;
  title: string;
}

export interface HangarProject {
  name: string;
  namespace: { owner: string; slug: string };
  stats: { downloads: number; stars: number };
  description: string;
  avatarUrl: string;
}

export interface HangarDownloadInfo {
  downloadUrl: string | null;
  externalUrl: string | null;
  fileName: string | null;
  checksum?: PluginChecksum;
}

export interface HangarVersion {
  name: string;
  downloads: Record<string, HangarDownloadInfo>;
  platformDependencies: Record<string, string[]>;
}

export interface HangarResolvedDownload {
  versionName: string;
  fileName: string;
  downloadUrl: string | null;
  externalUrl: string | null;
  checksum?: PluginChecksum;
  compatible: boolean;
  compatibility: PluginCompatibility;
  supportedVersions: string[];
}

export interface SpigetResource {
  id: number;
  name: string;
  tag: string;
  downloads: number;
  premium: boolean;
  external: boolean;
  iconUrl?: string;
  authorName?: string;
  fileType?: string;
  latestVersionId?: number;
  supportedVersions: string[];
  compatibility: PluginCompatibility;
}

export interface PluginChecksum {
  algorithm: 'sha1' | 'sha256' | 'sha512';
  value: string;
}

export async function searchModrinth(
  query: string,
  facets: string,
  offset = 0,
  limit = 20,
  signal?: AbortSignal,
  minecraftVersion?: string,
): Promise<{ hits: ModrinthProject[]; total_hits: number }> {
  if (isRealTauriE2E) {
    return {
      hits: [
        {
          slug: 'e2e-verified-plugin',
          project_id: E2E_PLUGIN_PROJECT_ID,
          title: 'E2E Verified Plugin',
          description: 'Deterministic local artifact used by the real Tauri E2E suite.',
          author: 'MC-Vector E2E',
          icon_url: '',
          downloads: 1,
          project_type: 'plugin',
          compatibility: 'compatible',
          supportedVersions: minecraftVersion ? [minecraftVersion] : [],
        },
      ],
      total_hits: 1,
    };
  }

  return invokePluginMetadata(
    'search_plugin_modrinth',
    {
      query,
      facets,
      offset,
      limit,
      ...(minecraftVersion === undefined ? {} : { minecraftVersion }),
    },
    signal,
  );
}

export async function getModrinthVersions(projectId: string): Promise<unknown[]> {
  return tauriInvoke('get_plugin_modrinth_versions', { projectId });
}

export async function getCompatibleModrinthVersion(params: {
  projectId: string;
  loader: string;
  minecraftVersion: string;
}): Promise<ModrinthVersion | null> {
  if (isRealTauriE2E && params.projectId === E2E_PLUGIN_PROJECT_ID) {
    return {
      id: E2E_PLUGIN_VERSION_ID,
      fileName: E2E_PLUGIN_FILE_NAME,
      gameVersions: [params.minecraftVersion],
      dependencies: [],
    };
  }
  return tauriInvoke('get_plugin_modrinth_compatible_version', params);
}

export async function getModrinthVersionById(versionId: string): Promise<ModrinthVersion | null> {
  return tauriInvoke('get_plugin_modrinth_version', { versionId });
}

export async function getModrinthProjectIdentity(
  projectId: string,
): Promise<ModrinthProjectIdentity | null> {
  return tauriInvoke('get_plugin_modrinth_identity', { projectId });
}

export async function getModrinthProjectBody(projectId: string): Promise<string | null> {
  return tauriInvoke('get_plugin_modrinth_body', { projectId });
}

export async function searchHangar(
  query: string,
  offset = 0,
  signal?: AbortSignal,
): Promise<{ result: HangarProject[]; pagination: unknown }> {
  return invokePluginMetadata('search_plugin_hangar', { query, offset, limit: 25 }, signal);
}

export async function getHangarVersions(
  owner: string,
  slug: string,
  platform?: string,
): Promise<HangarVersion[]> {
  return tauriInvoke('get_plugin_hangar_versions', { owner, slug, platform });
}

export async function resolveHangarDownload(params: {
  owner: string;
  slug: string;
  software: string;
  minecraftVersion: string;
}): Promise<HangarResolvedDownload | null> {
  return tauriInvoke('resolve_plugin_hangar_download', params);
}

export async function checkHangarCompatibility(params: {
  owner: string;
  slug: string;
  software: string;
  minecraftVersion: string;
}): Promise<{
  compatible: boolean;
  compatibility: PluginCompatibility;
  supportedVersions: string[];
}> {
  return tauriInvoke('check_plugin_hangar_compatibility', params);
}

export async function getHangarProjectBody(owner: string, slug: string): Promise<string | null> {
  return tauriInvoke('get_plugin_hangar_body', { owner, slug });
}

export async function searchSpigot(
  query: string,
  page = 1,
  size = 25,
  signal?: AbortSignal,
  minecraftVersion?: string,
): Promise<SpigetResource[]> {
  return invokePluginMetadata(
    'search_plugin_spiget',
    {
      query,
      page: Math.max(1, page),
      size,
      ...(minecraftVersion === undefined ? {} : { minecraftVersion }),
    },
    signal,
  );
}

export async function getSpigotResourceBody(resourceId: number): Promise<string | null> {
  return tauriInvoke('get_plugin_spiget_body', { resourceId });
}
