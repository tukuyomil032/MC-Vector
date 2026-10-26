import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { compareVersions, normalizeVersion } from './release-version.mjs';

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, '..');
const CHANGELOG_PATH = path.join(REPOSITORY_ROOT, 'CHANGELOG.md');
const USER_FACING_SECTIONS = ['Breaking Changes', 'Features', 'Bug Fixes', 'Performance'];
const SECTION_ORDER = [...USER_FACING_SECTIONS, 'Maintenance', 'Other Changes'];
const CONVENTIONAL_COMMIT =
  /^(?<type>[a-z][a-z0-9-]*)(?:\((?<scope>[^)]+)\))?(?<breaking>!)?:\s*(?<subject>.+)$/i;
const MAINTENANCE_TYPES = new Set([
  'build',
  'chore',
  'ci',
  'docs',
  'ref',
  'refactor',
  'style',
  'test',
]);
const MALFORMED_MESSAGE_ARGUMENT = /\s+-m\s+["']/g;
const MANUAL_COMMIT_SUMMARIES = new Map([
  [
    '3f8e0853c7923dd26f91e39a911ad9505913ac60',
    'use pnpm exec portless in Makefile/justfile setup and update docs',
  ],
]);
const LEGACY_RELEASE_SUPPLEMENTS = new Map([
  [
    'v1.1.3',
    new Map([['Bug Fixes', ['hotfix failed updater checks reported in v1.1.1 and v1.1.2']]]),
  ],
  [
    'v1.1.1',
    new Map([['Features', ['add theme setting', 'improve app updates and automatic updates']]]),
  ],
  [
    'v1.1.0',
    new Map([
      [
        'Features',
        [
          'improve security and user interface',
          'add configurable properties tab',
          'add console warning and error colors',
          'add keyboard shortcuts',
        ],
      ],
    ]),
  ],
]);
// These historical tags were published from sibling commits; preserve their known release order.
const HISTORICAL_DIVERGED_RELEASE_PAIRS = new Set(['v2.0.1..v2.0.2']);

function fail(message) {
  throw new Error(message);
}

function runGit(args) {
  const result = spawnSync('git', args, {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) fail(`Unable to run git ${args[0]}: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = result.stderr.trim();
    fail(`git ${args.join(' ')} failed${detail ? `: ${detail}` : '.'}`);
  }
  return result.stdout;
}

function escapeMarkdown(value) {
  return value.replace(/[\\`*_<>|]|\[|\]/g, '\\$&').trim();
}

function assertSafeCommitSubject(commit) {
  if (MANUAL_COMMIT_SUMMARIES.has(commit.hash)) return;
  const fragments = [...commit.subject.matchAll(MALFORMED_MESSAGE_ARGUMENT)];
  if (fragments.length >= 2) {
    fail(`Malformed commit subject contains repeated shell message arguments: ${commit.hash}.`);
  }
}

function isReleaseAutomation(subject) {
  if (/^merge\s+(?:pull request|branch|remote-tracking branch)\b/i.test(subject.trim())) {
    return true;
  }
  const conventional = CONVENTIONAL_COMMIT.exec(subject.trim());
  if (
    conventional?.groups?.type?.toLowerCase() === 'chore' &&
    conventional.groups.scope === 'release'
  ) {
    return true;
  }
  return /^(?:chore(?::|\([^)]*\):)\s*)?(?:prepare\s+release|release(?:\s|:)|bump(?:ing)?\s+version|version\s+bump|update\s+version(?:\s|$)|release-please\b)/i.test(
    subject.trim(),
  );
}

function parseGitLog(range) {
  const args = ['log', '--no-merges', '--format=%H%x1f%s%x1f%b%x1e'];
  if (range) args.push(range);
  const output = runGit(args);
  return output
    .split('\x1e')
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [hash, subject, ...bodyLines] = record.split('\x1f');
      return { body: bodyLines.join('\x1f').trim(), hash, subject: subject.trim() };
    });
}

function classifyCommit(commit) {
  if (isReleaseAutomation(commit.subject)) return null;
  assertSafeCommitSubject(commit);

  const conventional = CONVENTIONAL_COMMIT.exec(commit.subject);
  const breakingFooter = /^BREAKING CHANGE:\s*(.+)$/im.exec(commit.body)?.[1]?.trim();
  const isBreaking = Boolean(conventional?.groups?.breaking || breakingFooter);
  const type = conventional?.groups?.type?.toLowerCase();
  let section = 'Other Changes';
  if (isBreaking) section = 'Breaking Changes';
  else if (type === 'feat') section = 'Features';
  else if (type === 'fix') section = 'Bug Fixes';
  else if (type === 'perf') section = 'Performance';
  else if (type && MAINTENANCE_TYPES.has(type)) section = 'Maintenance';

  let summary =
    MANUAL_COMMIT_SUMMARIES.get(commit.hash) ?? conventional?.groups?.subject ?? commit.subject;
  if (isBreaking && breakingFooter) summary = breakingFooter;
  if (!summary) summary = commit.subject;
  return { section, summary };
}

function renderSection(version, range) {
  const buckets = new Map(SECTION_ORDER.map((section) => [section, []]));
  const seenSummaries = new Map(SECTION_ORDER.map((section) => [section, new Set()]));
  const addEntry = (section, summary) => {
    const escapedSummary = escapeMarkdown(summary);
    if (seenSummaries.get(section).has(escapedSummary)) return;
    seenSummaries.get(section).add(escapedSummary);
    buckets.get(section).push({ section, summary: escapedSummary });
  };
  for (const commit of parseGitLog(range)) {
    const entry = classifyCommit(commit);
    if (entry) addEntry(entry.section, entry.summary);
  }
  for (const [section, summaries] of LEGACY_RELEASE_SUPPLEMENTS.get(`v${version}`) ?? []) {
    for (const summary of summaries) addEntry(section, summary);
  }

  const lines = [`## v${version}`];
  for (const section of SECTION_ORDER) {
    const entries = buckets.get(section);
    if (entries.length === 0) continue;
    lines.push('', `### ${section}`);
    for (const { summary } of entries) {
      lines.push(`- ${summary}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function readChangelog() {
  try {
    return fs.readFileSync(CHANGELOG_PATH, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return '# Changelog\n\n';
    fail(`Unable to read CHANGELOG.md: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function getReleaseSection(changelog, version) {
  const heading = `## v${version}`;
  const start = changelog.split('\n').findIndex((line) => line.trim() === heading);
  if (start === -1) fail(`CHANGELOG.md does not contain ${heading}.`);
  const lines = changelog.split('\n');
  let end = start + 1;
  while (end < lines.length && !/^##\s+/.test(lines[end])) end += 1;
  return `${lines.slice(start, end).join('\n').trimEnd()}\n`;
}

function filterUpdaterNotes(section) {
  const lines = section.trimEnd().split('\n');
  const result = [lines[0]];
  let include = false;
  let found = false;
  for (const line of lines.slice(1)) {
    const subsection = /^###\s+(.+?)\s*$/.exec(line);
    if (subsection) {
      include = USER_FACING_SECTIONS.includes(subsection[1]);
      if (include) {
        found = true;
        result.push('', line);
      }
      continue;
    }
    if (include) result.push(line);
  }
  return found
    ? `${result
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trimEnd()}\n`
    : `${result[0]}\n`;
}

function resolveCommit(ref) {
  return runGit(['rev-parse', '--verify', `${ref}^{commit}`]).trim();
}

function isStrictAncestor(previousCommit, currentCommit) {
  const result = spawnSync('git', ['merge-base', '--is-ancestor', previousCommit, currentCommit], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
  });
  if (result.error) fail(`Unable to validate commit ancestry: ${result.error.message}`);
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  const detail = result.stderr.trim();
  fail(`Unable to validate commit ancestry${detail ? `: ${detail}` : '.'}`);
}

function validateTagChronology(tags) {
  for (let index = 1; index < tags.length; index += 1) {
    const previous = tags[index - 1];
    const current = tags[index];
    if (!isStrictAncestor(previous.commit, current.commit)) {
      if (HISTORICAL_DIVERGED_RELEASE_PAIRS.has(`${previous.tag}..${current.tag}`)) continue;
      fail(
        `Release tags must be ordered from oldest to newest with each tag a strict ancestor ` +
          `of the next: ${previous.tag} must precede ${current.tag}.`,
      );
    }
  }
}

function writeChangelog(content) {
  const temporaryPath = path.join(
    path.dirname(CHANGELOG_PATH),
    `.${path.basename(CHANGELOG_PATH)}.${process.pid}.${Date.now()}.${Math.random()
      .toString(16)
      .slice(2)}.tmp`,
  );
  try {
    fs.writeFileSync(temporaryPath, content, 'utf8');
    fs.renameSync(temporaryPath, CHANGELOG_PATH);
  } catch (error) {
    try {
      fs.rmSync(temporaryPath, { force: true });
    } catch {
      // Preserve the original error while best-effort cleaning the temporary file.
    }
    fail(
      `Unable to write CHANGELOG.md atomically: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function generate(versionArg, previousTag) {
  if (!versionArg || !previousTag) {
    fail(
      'Usage: node scripts/changelog.mjs generate <X.Y.Z|X.Y.Z-beta.N> <previous-published-tag>',
    );
  }
  const version = normalizeVersion(versionArg);
  const previousCommit = resolveCommit(previousTag);
  const headCommit = resolveCommit('HEAD');
  if (previousCommit === headCommit) {
    fail(`Cannot generate ${version}: ${previousTag} points to HEAD and has no new commits.`);
  }
  if (!isStrictAncestor(previousCommit, headCommit)) {
    fail(`Cannot generate ${version}: ${previousTag} is not an ancestor of HEAD.`);
  }
  const changelog = readChangelog();
  if (new RegExp(`^## v${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm').test(changelog)) {
    fail(`CHANGELOG.md already contains version ${version}.`);
  }
  const release = renderSection(version, `${previousTag}..HEAD`);
  const updated = `${changelog.startsWith('# Changelog') ? changelog : '# Changelog\n\n'}${release}\n${changelog.replace(/^# Changelog\s*/m, '').trimStart()}`;
  writeChangelog(updated);
  process.stdout.write(release);
}

function backfill(tagArgs) {
  const replace = tagArgs[0] === '--replace';
  const releaseArgs = replace ? tagArgs.slice(1) : tagArgs;
  if (releaseArgs.length === 0) {
    fail(
      'Usage: node scripts/changelog.mjs backfill [--replace] <oldest-published-tag> [... <newest-published-tag>]',
    );
  }
  const tags = releaseArgs.map((tag) => ({ tag, version: normalizeVersion(tag) }));
  const seenTags = new Set();
  const seenVersions = new Set();
  const seenCommits = new Map();
  for (const release of tags) {
    if (seenTags.has(release.tag)) fail(`Duplicate release tag: ${release.tag}.`);
    seenTags.add(release.tag);
    if (seenVersions.has(release.version)) {
      fail(`Duplicate normalized release version: ${release.version}.`);
    }
    seenVersions.add(release.version);
    release.commit = resolveCommit(release.tag);
    const previousTag = seenCommits.get(release.commit);
    if (previousTag) {
      fail(`Release tags ${previousTag} and ${release.tag} point to the same commit.`);
    }
    seenCommits.set(release.commit, release.tag);
  }
  for (let index = 1; index < tags.length; index += 1) {
    if (compareVersions(tags[index - 1].version, tags[index].version) >= 0) {
      fail(
        `Release tags must be in strictly increasing SemVer order: ${tags[index - 1].tag} must precede ${tags[index].tag}.`,
      );
    }
  }
  validateTagChronology(tags);
  const sections = tags.map(({ tag, version }, index) => {
    const range = index === 0 ? tag : `${tags[index - 1].tag}..${tag}`;
    return renderSection(version, range);
  });
  const existing = readChangelog();
  if (!replace) {
    const headings = new Set(
      [
        ...existing.matchAll(
          /^## v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-beta\.[1-9]\d*)?)$/gm,
        ),
      ].map((match) => match[1]),
    );
    const collisions = tags
      .map(({ version }) => version)
      .filter((version) => headings.has(version));
    if (collisions.length > 0) fail(`CHANGELOG.md already contains: ${collisions.join(', ')}.`);
  }
  const header = '# Changelog\n\n';
  const content = replace
    ? `${header}${sections.reverse().join('\n')}`
    : `${header}${sections.reverse().join('\n')}${existing.replace(/^# Changelog\s*/m, '').trimStart()}`;
  writeChangelog(content);
  process.stdout.write(
    `${replace ? 'Replaced' : 'Backfilled'} ${tags.length} published releases into CHANGELOG.md.\n`,
  );
}

function printSection(command, versionArg) {
  if (!versionArg) fail(`Usage: node scripts/changelog.mjs ${command} <X.Y.Z|X.Y.Z-beta.N>`);
  const version = normalizeVersion(versionArg);
  const release = getReleaseSection(readChangelog(), version);
  process.stdout.write(command === 'notes' ? filterUpdaterNotes(release) : release);
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'generate') generate(args[0], args[1]);
  else if (command === 'backfill') backfill(args);
  else if (command === 'section' || command === 'notes') printSection(command, args[0]);
  else {
    fail(
      'Usage: node scripts/changelog.mjs <generate|backfill|section|notes> ...\n' +
        '  generate <X.Y.Z|X.Y.Z-beta.N> <previous-published-tag>\n' +
        '  backfill [--replace] <oldest-published-tag> [... <newest-published-tag>]\n' +
        '  section <X.Y.Z|X.Y.Z-beta.N>\n' +
        '  notes <X.Y.Z|X.Y.Z-beta.N>',
    );
  }
}

try {
  main();
} catch (error) {
  console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
