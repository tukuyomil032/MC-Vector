import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  compareVersions,
  isPrerelease,
  normalizeVersion,
  parseVersion,
} from './release-version.mjs';

export const PLATFORM_TARGETS = {
  'darwin-aarch64': {
    asset: (version) => `MC-Vector_${version}_darwin-aarch64.app.tar.gz`,
  },
  'darwin-x86_64': {
    asset: (version) => `MC-Vector_${version}_darwin-x86_64.app.tar.gz`,
  },
  'windows-x86_64': {
    asset: (version) => `MC-Vector_${version}_windows-x86_64-setup.exe`,
  },
};

function resolveWorkspacePath(...segments) {
  const workspaceRoot = path.resolve(process.cwd());
  const resolvedPath = path.resolve(workspaceRoot, ...segments);
  const relativePath = path.relative(workspaceRoot, resolvedPath);
  if (
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error('Updater files must stay within the current workspace');
  }
  return resolvedPath;
}

export function feedTargetsForRelease(version, latestBetaChannelVersion) {
  const normalized = normalizeVersion(version);
  const channel = isPrerelease(normalized) ? 'beta' : 'stable';
  const targets = Object.keys(PLATFORM_TARGETS).map((platform) => `${channel}-${platform}`);
  if (
    channel === 'stable' &&
    latestBetaChannelVersion &&
    compareVersions(normalized, latestBetaChannelVersion) > 0
  ) {
    targets.push(...Object.keys(PLATFORM_TARGETS).map((platform) => `beta-${platform}`));
  }
  return { channel, targets };
}

export function createTargetManifest({ version, notes, pubDate, url, signature }) {
  return { version: normalizeVersion(version), notes, pub_date: pubDate, url, signature };
}

function readSignature(filePath) {
  const signature = fs.readFileSync(filePath, 'utf8').replace(/[\r\n]/g, '');
  if (!signature) throw new Error(`Updater signature is empty: ${filePath}`);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(signature) || signature.length % 4 === 1) {
    throw new Error(`Updater signature is not valid base64: ${filePath}`);
  }
  return signature;
}

function latestBetaChannelVersion() {
  const versions = [];
  for (const platform of Object.keys(PLATFORM_TARGETS)) {
    for (const channel of ['beta']) {
      const filePath = resolveWorkspacePath(
        'gh-pages-deploy',
        'updates',
        `${channel}-${platform}.json`,
      );
      if (!fs.existsSync(filePath)) continue;
      try {
        const manifest = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const parsed = parseVersion(manifest.version);
        versions.push(parsed.normalized);
      } catch {
        // Invalid legacy files are preserved, but never influence promotion routing.
      }
    }
  }
  return versions.sort((left, right) => compareVersions(right, left))[0] ?? null;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function applyRelease([versionArg, pubDate, baseUrl], notes) {
  if (!versionArg || !pubDate || !baseUrl) {
    throw new Error(
      'Usage: node scripts/release-manifest.mjs apply <version> <pub-date> <base-url> < <notes-file>',
    );
  }
  const version = normalizeVersion(versionArg);
  const existingBeta = latestBetaChannelVersion();
  const { channel, targets } = feedTargetsForRelease(version, existingBeta);
  const manifests = new Map();

  for (const target of targets) {
    const platform = target.replace(/^(?:stable|beta)-/, '');
    const assetName = PLATFORM_TARGETS[platform].asset(version);
    const assetPath = resolveWorkspacePath('release-assets', assetName);
    const signaturePath = resolveWorkspacePath('release-assets', `${assetName}.sig`);
    if (!fs.existsSync(assetPath) || !fs.existsSync(signaturePath)) {
      throw new Error(`Missing updater asset or signature for ${target}: ${assetName}`);
    }
    const manifest = createTargetManifest({
      version,
      notes,
      pubDate,
      url: `${baseUrl.replace(/\/$/, '')}/${assetName}`,
      signature: readSignature(signaturePath),
    });
    const manifestPath = resolveWorkspacePath('gh-pages-deploy', 'updates', `${target}.json`);
    writeJson(manifestPath, manifest);
    manifests.set(platform, manifest);
  }

  if (channel === 'stable') {
    const stableManifests = Object.fromEntries(
      Object.keys(PLATFORM_TARGETS).map((platform) => {
        const manifest = manifests.get(platform);
        return [platform, { signature: manifest.signature, url: manifest.url }];
      }),
    );
    writeJson(resolveWorkspacePath('gh-pages-deploy', 'latest.json'), {
      version,
      notes,
      pub_date: pubDate,
      platforms: stableManifests,
    });
  }
  process.stdout.write(`${channel} feeds updated: ${targets.join(', ')}\n`);
}

if (process.argv[2] === 'apply') {
  try {
    applyRelease(process.argv.slice(3), fs.readFileSync(0, 'utf8'));
  } catch (error) {
    console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
