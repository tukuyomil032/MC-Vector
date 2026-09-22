import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  if (!key.startsWith('--')) throw new Error(`Unexpected argument: ${key}`);
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
  args.set(key.slice(2), value);
}

const version = args.get('version');
const sourceCommit = args.get('source-commit');
const jarPath = resolve(args.get('jar') ?? '');
const outputDirectory = resolve(args.get('output') ?? 'core-release');
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid release version');
if (!sourceCommit || !/^[0-9a-f]{40}$/.test(sourceCommit)) throw new Error('Invalid source commit');
if (basename(jarPath) !== `mc-vector-core-${version}.jar`) {
  throw new Error(`Core JAR must be named mc-vector-core-${version}.jar`);
}

const list = execFileSync('jar', ['tf', jarPath], { encoding: 'utf8' });
const entries = list.split(/\r?\n/).filter(Boolean);
const entrySet = new Set(entries);
if (!entrySet.has('plugin.yml') || !entrySet.has('com/mcvector/core/MCVectorCorePlugin.class')) {
  throw new Error('Core JAR is missing plugin.yml or MCVectorCorePlugin.class');
}
if (entries.some((entry) => /dynmap|minecraft/i.test(entry))) {
  throw new Error('Core JAR must not contain Dynmap or Minecraft user assets');
}

const pluginYaml = execFileSync('unzip', ['-p', jarPath, 'plugin.yml'], { encoding: 'utf8' });
const field = (name) => {
  const match = pluginYaml.match(new RegExp(`^${name}:\\s*["']?([^"'\\r\\n]+)["']?\\s*$`, 'm'));
  return match?.[1]?.trim();
};
if (field('name') !== 'MC-Vector-Core') throw new Error('Unexpected plugin name');
if (field('version') !== version) throw new Error('plugin.yml version does not match release');
if (field('main') !== 'com.mcvector.core.MCVectorCorePlugin')
  throw new Error('Unexpected plugin main');
if (field('protocol-version') !== '2') throw new Error('plugin.yml protocol-version must be 2');

const bytes = readFileSync(jarPath);
const sha256 = createHash('sha256').update(bytes).digest('hex');
const artifactName = basename(jarPath);
const manifest = {
  releaseTag: `v${version}`,
  appVersion: version,
  pluginVersion: version,
  artifactName,
  sha256,
  byteLength: bytes.length,
  protocolVersion: 2,
  paperCompatibility: ['1.21.10'],
  sourceCommit,
};

mkdirSync(outputDirectory, { recursive: true });
const outputJar = resolve(outputDirectory, artifactName);
writeFileSync(outputJar, bytes);
writeFileSync(`${outputJar}.sha256`, `${sha256}  ${artifactName}\n`);
writeFileSync(
  resolve(outputDirectory, `mc-vector-core-${version}.manifest.json`),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(`Prepared ${outputJar}`);
