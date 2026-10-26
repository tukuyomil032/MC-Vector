import process from 'node:process';

const CORE_NUMBER = '(?:0|[1-9]\\d*)';
const BETA_NUMBER = '(?:[1-9]\\d*)';
export const VERSION_PATTERN = new RegExp(
  `^v?${CORE_NUMBER}\\.${CORE_NUMBER}\\.${CORE_NUMBER}(?:-beta\\.${BETA_NUMBER})?$`,
);

function fail(message) {
  throw new Error(message);
}

export function parseVersion(value) {
  if (typeof value !== 'string') fail(`Invalid version "${String(value)}".`);
  const candidate = value.trim();
  if (!VERSION_PATTERN.test(candidate)) {
    fail(`Invalid version "${candidate}". Use X.Y.Z, X.Y.Z-beta.N, or the same with a v prefix.`);
  }

  const normalized = candidate.startsWith('v') ? candidate.slice(1) : candidate;
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$/.exec(normalized);
  if (!match) fail(`Invalid version "${candidate}".`);
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    beta: match[4] === undefined ? null : Number(match[4]),
    normalized,
    tag: `v${normalized}`,
  };
}

export function normalizeVersion(value) {
  return parseVersion(value).normalized;
}

export function compareVersions(left, right) {
  const a = typeof left === 'string' ? parseVersion(left) : left;
  const b = typeof right === 'string' ? parseVersion(right) : right;
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] > b[key] ? 1 : -1;
  }
  if (a.beta === b.beta) return 0;
  if (a.beta === null) return 1;
  if (b.beta === null) return -1;
  return a.beta > b.beta ? 1 : -1;
}

export function isPrerelease(value) {
  return (typeof value === 'string' ? parseVersion(value) : value).beta !== null;
}

export function coreVersion(value) {
  const parsed = typeof value === 'string' ? parseVersion(value) : value;
  return `${parsed.major}.${parsed.minor}.${parsed.patch}`;
}

export function assertGreaterVersion(target, current) {
  if (compareVersions(target, current) <= 0) {
    fail(
      `Target version ${normalizeVersion(target)} must be greater than current version ${normalizeVersion(current)}.`,
    );
  }
}

export function releasePrerelease(version) {
  return isPrerelease(version);
}

function publishedAtValue(release) {
  const value = Date.parse(release.published_at ?? '');
  return Number.isNaN(value) ? Number.NEGATIVE_INFINITY : value;
}

function releaseVersion(release) {
  try {
    return parseVersion(release.tag_name);
  } catch {
    return null;
  }
}

function newestPublishedStable(releases) {
  const stable = releases
    .filter((release) => !release.draft && !release.prerelease)
    .map((release) => ({ release, version: releaseVersion(release) }))
    .filter(({ version }) => version !== null)
    .sort((left, right) => {
      const published = publishedAtValue(right.release) - publishedAtValue(left.release);
      return published || compareVersions(right.version, left.version);
    });
  return stable[0]?.release.tag_name ?? null;
}

/** Select the published release used as the changelog range base. */
export function selectChangelogBase(version, releases) {
  const target = typeof version === 'string' ? parseVersion(version) : version;
  const published = Array.isArray(releases) ? releases : [];
  if (target.beta !== null) {
    const sameCoreBeta = published
      .filter((release) => !release.draft && release.prerelease)
      .map((release) => ({ release, version: releaseVersion(release) }))
      .filter(
        ({ version: candidate }) =>
          candidate && candidate.beta !== null && coreVersion(candidate) === coreVersion(target),
      )
      .filter(({ version: candidate }) => compareVersions(candidate, target) < 0)
      .sort((left, right) => compareVersions(right.version, left.version));
    if (sameCoreBeta.length > 0) return sameCoreBeta[0].release.tag_name;
  }
  return newestPublishedStable(published);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

if (process.argv[2] === 'normalize') {
  try {
    const version = normalizeVersion(process.argv[3] ?? '');
    process.stdout.write(
      `version=${version}\nprerelease=${releasePrerelease(version) ? 'true' : 'false'}\n`,
    );
  } catch (error) {
    console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
} else if (process.argv[2] === 'validate') {
  try {
    const target = normalizeVersion(process.argv[3] ?? '');
    const current = normalizeVersion(process.argv[4] ?? '');
    assertGreaterVersion(target, current);
    process.stdout.write(
      `version=${target}\nprerelease=${releasePrerelease(target) ? 'true' : 'false'}\n`,
    );
  } catch (error) {
    console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
} else if (process.argv[2] === 'base') {
  try {
    const version = process.argv[3];
    const releases = JSON.parse(await readStdin());
    const tag = selectChangelogBase(version, releases);
    if (!tag) fail('No published stable release was found; cannot choose a changelog range.');
    process.stdout.write(`${tag}\n`);
  } catch (error) {
    console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
