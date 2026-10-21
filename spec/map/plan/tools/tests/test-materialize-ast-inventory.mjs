import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';
import { materializeAstInventory } from '../materialize-ast-inventory.mjs';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

async function fixtureRepository() {
  const root = await mkdtemp(join(tmpdir(), 'map-ast-ledger-'));
  const sourcePath = 'src/Foo.java';
  const source = Buffer.from('package src; public final class Foo { public int value() { return 1; } }\n');
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, sourcePath), source);
  git(root, 'init', '-q');
  git(root, 'config', 'user.name', 'Plan Test');
  git(root, 'config', 'user.email', 'plan-test@example.invalid');
  git(root, 'add', sourcePath);
  git(root, 'commit', '-q', '-m', 'fixture');
  const revision = git(root, 'rev-parse', 'HEAD');
  const inventory = {
    sourceRevision: revision,
    parser: 'javac test fixture',
    sourceFileCount: 1,
    parsedFileCount: 1,
    declarationCount: 1,
    referenceCandidateCount: 0,
    parseErrorCount: 0,
    duplicateSymbolIdCount: 0,
    duplicateSymbolIds: [],
    semanticDependencyClosureComplete: false,
    sourceFiles: [{ sourcePath, contentSha256: sha256(source) }],
    declarations: [{ symbolId: 'type:src.Foo', signature: 'src.Foo', sourcePath, startLine: 1, endLine: 1 }],
    referenceCandidates: [],
    parseErrors: [],
  };
  return { root, sourcePath, source, revision, inventory };
}

test('binds syntax inventory to the exact Git tree and blob bytes', async (context) => {
  const fixture = await fixtureRepository();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  const result = await materializeAstInventory({
    sourceRoot: fixture.root,
    gitDirectory: join(fixture.root, '.git'),
    rawInventory: fixture.inventory,
    expectedRevision: fixture.revision,
  });

  assert.equal(result.canonical.sourceRevision, fixture.revision);
  assert.equal(result.canonical.sourceTreeSha1, git(fixture.root, 'rev-parse', 'HEAD^{tree}'));
  assert.equal(result.canonical.counts.sourceFiles, 1);
  assert.equal(result.canonical.semanticDependencyClosureComplete, false);
  assert.deepEqual(JSON.parse(gunzipSync(result.compressed).toString('utf8')).sourceFiles, result.canonical.sourceFiles);
});

test('rejects a SHA-256 mismatch even when the claimed revision is correct', async (context) => {
  const fixture = await fixtureRepository();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  const invalid = structuredClone(fixture.inventory);
  invalid.sourceFiles[0].contentSha256 = '0'.repeat(64);

  await assert.rejects(
    materializeAstInventory({
      sourceRoot: fixture.root,
      gitDirectory: join(fixture.root, '.git'),
      rawInventory: invalid,
      expectedRevision: fixture.revision,
    }),
    /AST SHA-256/,
  );
});

test('rejects parse errors, duplicate declarations, and claimed semantic closure', async (context) => {
  const fixture = await fixtureRepository();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  const options = {
    sourceRoot: fixture.root,
    gitDirectory: join(fixture.root, '.git'),
    expectedRevision: fixture.revision,
  };

  await assert.rejects(materializeAstInventory({
    ...options,
    rawInventory: { ...fixture.inventory, parseErrorCount: 1, parseErrors: [{ line: 1 }] },
  }), /parse errors/);
  await assert.rejects(materializeAstInventory({
    ...options,
    rawInventory: { ...fixture.inventory, duplicateSymbolIdCount: 1, duplicateSymbolIds: ['type:src.Foo'] },
  }), /duplicate declaration IDs/);
  await assert.rejects(materializeAstInventory({
    ...options,
    rawInventory: { ...fixture.inventory, semanticDependencyClosureComplete: true },
  }), /must not claim semantic dependency closure/);
});
