import { listFiles, readFileContent } from './file-commands';

export interface ServerFolderAnalysis {
  folderPath: string;
  detectedVersion: string;
  detectedSoftware: string;
  eulaAccepted: boolean;
  hasServerJar: boolean;
}

const SOFTWARE_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /paper/i, name: 'Paper' },
  { pattern: /purpur/i, name: 'Purpur' },
  { pattern: /spigot/i, name: 'Spigot' },
  { pattern: /craftbukkit/i, name: 'CraftBukkit' },
  { pattern: /fabric/i, name: 'Fabric' },
  { pattern: /forge/i, name: 'Forge' },
  { pattern: /neoforge/i, name: 'NeoForge' },
  { pattern: /velocity/i, name: 'Velocity' },
  { pattern: /waterfall/i, name: 'Waterfall' },
  { pattern: /vanilla|minecraft_server/i, name: 'Vanilla' },
];

function detectSoftwareFromJarName(jarName: string): string {
  for (const { pattern, name } of SOFTWARE_PATTERNS) {
    if (pattern.test(jarName)) return name;
  }
  return 'Paper';
}

function parseVersionFromJarName(jarName: string): string {
  const match = jarName.match(/1\.\d+(?:\.\d+)?/);
  return match ? match[0] : '';
}

function parseVersionFromProperties(content: string): string {
  const match = content.match(/motd=.*?(1\.\d+(?:\.\d+)?)/);
  if (match) return match[1];
  const versionMatch = content.match(/^#.*?(1\.\d+(?:\.\d+)?)/m);
  return versionMatch ? versionMatch[1] : '';
}

export async function analyzeServerFolder(folderPath: string): Promise<ServerFolderAnalysis> {
  const entries = await listFiles(folderPath);

  const jarEntry = entries.find(
    (e) => !e.isDirectory && e.name.endsWith('.jar') && e.name !== 'bundler.jar',
  );
  const hasServerJar = Boolean(jarEntry);

  let detectedSoftware = 'Paper';
  let detectedVersion = '';

  if (jarEntry) {
    detectedSoftware = detectSoftwareFromJarName(jarEntry.name);
    detectedVersion = parseVersionFromJarName(jarEntry.name);
  }

  const propertiesEntry = entries.find((e) => !e.isDirectory && e.name === 'server.properties');
  if (propertiesEntry && !detectedVersion) {
    try {
      const content = await readFileContent(`${folderPath}/${propertiesEntry.name}`);
      const parsed = parseVersionFromProperties(content);
      if (parsed) detectedVersion = parsed;
    } catch {
      // ignore
    }
  }

  let eulaAccepted = false;
  const eulaEntry = entries.find((e) => !e.isDirectory && e.name === 'eula.txt');
  if (eulaEntry) {
    try {
      const content = await readFileContent(`${folderPath}/${eulaEntry.name}`);
      eulaAccepted = /eula\s*=\s*true/i.test(content);
    } catch {
      // ignore
    }
  }

  return {
    folderPath,
    detectedVersion,
    detectedSoftware,
    eulaAccepted,
    hasServerJar,
  };
}
