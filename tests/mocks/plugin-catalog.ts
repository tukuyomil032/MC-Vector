import { getE2eScenario } from '../e2e/support/e2e-runtime';
import modrinthReadme from './plugin-readme-modrinth.md?raw';

// Browser-only fixtures model the Rust command DTOs. The real Tauri smoke
// suite uses its separate explicit debug fixture and the actual artifact IPC.
export function pluginCatalogFixture(command: string): unknown {
  const incompatible = getE2eScenario() === 'incompatible-plugin';
  const hashless = getE2eScenario() === 'hashless-plugin';
  const supportedVersions = [incompatible ? '1.20.1' : '1.21.10'];
  const version = {
    id: 'version-1',
    fileName: 'VeinMiner-1.21.4.jar',
    gameVersions: supportedVersions,
    dependencies: [],
  };
  const hangarDownload = {
    downloadUrl: 'https://cdn.hangar.example/wireless-redstone.jar',
    externalUrl: null,
    fileName: 'WirelessRedstone-2.0.jar',
    ...(hashless ? {} : { checksum: { algorithm: 'sha256', value: 'a'.repeat(64) } }),
  };
  switch (command) {
    case 'search_plugin_modrinth':
      return {
        hits: [
          {
            slug: 'veinminer',
            project_id: 'veinminer-project',
            title: 'VeinMiner',
            description: incompatible
              ? 'A plugin for Minecraft 1.20.1 only.'
              : 'A plugin for Minecraft 1.21.10.',
            author: 'Example',
            icon_url: '',
            downloads: 100,
            project_type: 'plugin',
            compatibility: 'compatible',
            supportedVersions,
          },
        ],
        total_hits: 1,
      };
    case 'get_plugin_modrinth_compatible_version':
    case 'get_plugin_modrinth_version':
      return version;
    case 'get_plugin_modrinth_versions':
      return [
        {
          id: version.id,
          game_versions: supportedVersions,
          dependencies: [],
          files: [{ filename: version.fileName }],
        },
      ];
    case 'get_plugin_modrinth_identity':
      return { id: 'veinminer-project', slug: 'veinminer', title: 'VeinMiner' };
    case 'get_plugin_modrinth_body':
      return modrinthReadme;
    case 'get_plugin_modrinth_artifact':
      return {
        url: 'https://cdn.modrinth.example/veinminer.jar',
        ...(hashless ? {} : { checksum: { algorithm: 'sha512', value: 'a'.repeat(128) } }),
      };
    case 'search_plugin_hangar':
      return {
        result: [
          {
            name: 'WirelessRedstone',
            namespace: { owner: 'Example', slug: 'wireless-redstone' },
            stats: { downloads: 100, stars: 4 },
            description: 'A Paper plugin for Minecraft 1.21.10.',
            avatarUrl: '',
          },
        ],
        pagination: {},
      };
    case 'get_plugin_hangar_versions':
      return [
        {
          name: '2.0',
          downloads: { PAPER: hangarDownload },
          platformDependencies: { PAPER: supportedVersions },
        },
      ];
    case 'resolve_plugin_hangar_download':
      return {
        ...hangarDownload,
        versionName: '2.0',
        compatible: !incompatible,
        compatibility: incompatible ? 'incompatible' : 'compatible',
        supportedVersions,
      };
    case 'check_plugin_hangar_compatibility':
      return {
        compatible: !incompatible,
        compatibility: incompatible ? 'incompatible' : 'compatible',
        supportedVersions,
      };
    case 'get_plugin_hangar_body':
      return '# WirelessRedstone';
    case 'search_plugin_spiget':
      return [
        {
          id: 1,
          name: 'VeinMiner',
          tag: 'Supports Minecraft 1.21.10',
          downloads: 100,
          premium: false,
          external: false,
          authorName: 'Example',
          fileType: 'JAR',
          latestVersionId: 1,
          supportedVersions,
          compatibility: incompatible ? 'incompatible' : 'compatible',
        },
      ];
    case 'get_plugin_spiget_body':
      return '<p>VeinMiner description</p>';
    default:
      return undefined;
  }
}
