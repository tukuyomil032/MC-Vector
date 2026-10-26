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

// Positive UTC leap-second dates recorded by NIST through 2016-12-31.
const UTC_LEAP_SECOND_DATES = new Set([
  '1972-06-30',
  '1972-12-31',
  '1973-12-31',
  '1974-12-31',
  '1975-12-31',
  '1976-12-31',
  '1977-12-31',
  '1978-12-31',
  '1979-12-31',
  '1981-06-30',
  '1982-06-30',
  '1983-06-30',
  '1985-06-30',
  '1987-12-31',
  '1989-12-31',
  '1990-12-31',
  '1992-06-30',
  '1993-06-30',
  '1994-06-30',
  '1995-12-31',
  '1997-06-30',
  '1998-12-31',
  '2005-12-31',
  '2008-12-31',
  '2012-06-30',
  '2015-06-30',
  '2016-12-31',
]);

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

function validateBase64Signature(value) {
  const signature = value.replace(/[\r\n]/g, '');
  if (!signature) return { error: 'empty', signature };

  const hasValidShape =
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2,3})?$/.test(
      signature,
    );
  const canonicalSignature = Buffer.from(signature, 'base64').toString('base64').replace(/=+$/, '');
  if (!hasValidShape || canonicalSignature !== signature.replace(/=+$/, '')) {
    return { error: 'invalid', signature };
  }
  return { error: null, signature };
}

function readSignature(filePath) {
  const { error, signature } = validateBase64Signature(fs.readFileSync(filePath, 'utf8'));
  if (error === 'empty') throw new Error(`Updater signature is empty: ${filePath}`);
  if (error) throw new Error(`Updater signature is not valid base64: ${filePath}`);
  return signature;
}

function isValidHttpsUrl(value) {
  if (!value.startsWith('https://')) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.length > 0;
  } catch {
    return false;
  }
}

function isValidRfc3339Timestamp(value) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/i.exec(value);
  if (!match) return false;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, offset] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth[month - 1] ||
    hour > 23 ||
    minute > 59 ||
    second > 60
  ) {
    return false;
  }
  let offsetMinutes = 0;
  if (offset.toUpperCase() !== 'Z') {
    const offsetHour = Number(offset.slice(1, 3));
    const offsetMinute = Number(offset.slice(4, 6));
    if (offsetHour > 23 || offsetMinute > 59) return false;
    const sign = offset[0] === '+' ? 1 : -1;
    offsetMinutes = sign * (offsetHour * 60 + offsetMinute);
  }

  if (second === 60) {
    const precedingSecond = Date.parse(
      `${yearText}-${monthText}-${dayText}T${hourText}:${minuteText}:59Z`,
    );
    if (Number.isNaN(precedingSecond)) return false;
    const utcPrecedingSecond = new Date(precedingSecond - offsetMinutes * 60_000);
    return (
      utcPrecedingSecond.getUTCHours() === 23 &&
      utcPrecedingSecond.getUTCMinutes() === 59 &&
      utcPrecedingSecond.getUTCSeconds() === 59 &&
      UTC_LEAP_SECOND_DATES.has(utcPrecedingSecond.toISOString().slice(0, 10))
    );
  }

  if (Number.isNaN(Date.parse(value))) return false;
  return true;
}

function prepareMissingStableFeedsFromLegacy() {
  const platforms = Object.keys(PLATFORM_TARGETS);
  const updatesDirectory = resolveWorkspacePath('gh-pages-deploy', 'updates');
  const missingPlatforms = platforms.filter(
    (platform) => !fs.existsSync(path.join(updatesDirectory, `stable-${platform}.json`)),
  );
  if (missingPlatforms.length === 0) return [];

  const latestPath = resolveWorkspacePath('gh-pages-deploy', 'latest.json');
  if (!fs.existsSync(latestPath)) {
    throw new Error('legacy latest.json is required to seed missing stable feeds');
  }

  let latest;
  try {
    latest = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`legacy latest.json is not valid JSON: ${detail}`);
  }
  if (!latest || typeof latest !== 'object' || Array.isArray(latest)) {
    throw new Error('legacy latest.json must contain a JSON object');
  }

  let version;
  try {
    version = normalizeVersion(latest.version);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`legacy latest.json has an invalid version: ${detail}`);
  }
  if (isPrerelease(version)) {
    throw new Error('legacy latest.json version must be stable without a prerelease suffix');
  }
  if (typeof latest.notes !== 'string') {
    throw new Error('legacy latest.json is missing notes');
  }
  if (typeof latest.pub_date !== 'string' || !latest.pub_date.trim()) {
    throw new Error('legacy latest.json is missing pub_date');
  }
  if (!isValidRfc3339Timestamp(latest.pub_date)) {
    throw new Error('legacy latest.json has an invalid pub_date; expected an RFC3339 timestamp');
  }
  if (
    !latest.platforms ||
    typeof latest.platforms !== 'object' ||
    Array.isArray(latest.platforms)
  ) {
    throw new Error('legacy latest.json is missing platforms');
  }

  const prepared = [];
  for (const platform of platforms) {
    const platformManifest = latest.platforms[platform];
    if (
      !platformManifest ||
      typeof platformManifest !== 'object' ||
      Array.isArray(platformManifest)
    ) {
      throw new Error(`legacy latest.json is missing the ${platform} platform manifest`);
    }
    if (typeof platformManifest.url !== 'string' || !platformManifest.url.trim()) {
      throw new Error(`legacy latest.json is missing the ${platform} URL`);
    }
    if (!isValidHttpsUrl(platformManifest.url)) {
      throw new Error(
        `legacy latest.json has an invalid ${platform} URL; expected a valid HTTPS URL`,
      );
    }
    if (typeof platformManifest.signature !== 'string' || !platformManifest.signature.trim()) {
      throw new Error(`legacy latest.json is missing the ${platform} signature`);
    }
    const { error: signatureError, signature } = validateBase64Signature(
      platformManifest.signature,
    );
    if (signatureError === 'empty') {
      throw new Error(`legacy latest.json is missing the ${platform} signature`);
    }
    if (signatureError) {
      throw new Error(`legacy latest.json has an invalid ${platform} signature`);
    }
    prepared.push({
      platform,
      manifest: createTargetManifest({
        version,
        notes: latest.notes,
        pubDate: latest.pub_date,
        url: platformManifest.url,
        signature,
      }),
    });
  }

  return prepared.filter(({ platform }) => missingPlatforms.includes(platform));
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
  const missingStableFeeds = channel === 'beta' ? prepareMissingStableFeedsFromLegacy() : [];
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

  for (const { platform, manifest } of missingStableFeeds) {
    const manifestPath = resolveWorkspacePath(
      'gh-pages-deploy',
      'updates',
      `stable-${platform}.json`,
    );
    if (!fs.existsSync(manifestPath)) writeJson(manifestPath, manifest);
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
