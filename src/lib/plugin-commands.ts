import { fetch } from '@tauri-apps/plugin-http';
import { tauriInvoke } from './tauri-api';

export interface ModrinthProject {
  slug: string;
  title: string;
  description: string;
  icon_url: string;
  downloads: number;
  project_type: string;
  [key: string]: unknown;
}

export interface HangarProject {
  name: string;
  namespace: { owner: string; slug: string };
  stats: { downloads: number };
  description: string;
  avatarUrl: string;
  [key: string]: unknown;
}

export async function searchModrinth(
  query: string,
  facets: string,
  offset: number = 0,
  limit: number = 20
): Promise<{ hits: ModrinthProject[]; total_hits: number }> {
  const url = new URL('https://api.modrinth.com/v2/search');
  url.searchParams.set('query', query);
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('limit', String(limit));
  if (facets) url.searchParams.set('facets', facets);

  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`Modrinth API error: ${response.status}`);
  return response.json() as Promise<{ hits: ModrinthProject[]; total_hits: number }>;
}

export async function getModrinthVersions(projectId: string): Promise<unknown[]> {
  const response = await fetch(`https://api.modrinth.com/v2/project/${projectId}/version`);
  if (!response.ok) throw new Error(`Modrinth API error: ${response.status}`);
  return response.json() as Promise<unknown[]>;
}

export async function searchHangar(
  query: string,
  version: string,
  offset: number = 0
): Promise<{ result: HangarProject[]; pagination: unknown }> {
  const url = new URL('https://hangar.papermc.io/api/v1/projects');
  url.searchParams.set('q', query);
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('limit', '25');
  if (version) url.searchParams.set('version', version);

  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`Hangar API error: ${response.status}`);
  return response.json() as Promise<{ result: HangarProject[]; pagination: unknown }>;
}

export async function getHangarVersions(slug: string): Promise<unknown> {
  const response = await fetch(`https://hangar.papermc.io/api/v1/projects/${slug}/versions`);
  if (!response.ok) throw new Error(`Hangar API error: ${response.status}`);
  return response.json();
}

export async function downloadPlugin(url: string, dest: string, eventId: string): Promise<void> {
  return tauriInvoke('download_file', { url, dest, eventId });
}

export async function installModrinthProject(
  versionId: string,
  fileName: string,
  destDir: string
): Promise<void> {
  // Modrinth version の詳細を取得してダウンロード URL を得る
  const response = await fetch(`https://api.modrinth.com/v2/version/${versionId}`);
  if (!response.ok) throw new Error('Failed to get Modrinth version');
  const version = (await response.json()) as { files: { url: string; filename: string }[] };
  const file = version.files[0];
  if (!file) throw new Error('No files in version');

  const destPath = `${destDir}/${file.filename || fileName}`;
  await tauriInvoke('download_file', {
    url: file.url,
    dest: destPath,
    eventId: `plugin-${versionId}`,
  });
}

export async function installHangarProject(
  downloadUrl: string,
  fileName: string,
  destDir: string
): Promise<void> {
  const destPath = `${destDir}/${fileName}`;
  await tauriInvoke('download_file', {
    url: downloadUrl,
    dest: destPath,
    eventId: `plugin-hangar`,
  });
}
