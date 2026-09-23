import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { materializeResourceInventory } from '../materialize-resource-inventory.mjs';

const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

async function createPinnedFixture() {
  const root = await mkdtemp(join(tmpdir(), 'map-resource-inventory-'));
  await mkdir(join(root, 'module/src/main/resources/assets/minecraft/test'), { recursive: true });
  await mkdir(join(root, 'module/src/main/java/example'), { recursive: true });
  await writeFile(join(root, 'module/src/main/resources/assets/minecraft/test/block.json'), '{"parent":"block/cube"}\n');
  await writeFile(join(root, 'module/src/main/resources/shaders.txt'), 'default:default\n');
  await writeFile(join(root, 'module/src/main/java/example/NotAResource.java'), 'final class NotAResource {}\n');
  git(root, ['init', '-q']);
  git(root, ['config', 'user.email', 'fixture@example.invalid']);
  git(root, ['config', 'user.name', 'Fixture']);
  git(root, ['add', '.']);
  git(root, ['commit', '-q', '-m', 'fixture']);
  const revision = git(root, ['rev-parse', 'HEAD']);
  return { root, revision };
}

test('materializes every pinned resources path with Git and content digests', async () => {
  const fixture = await createPinnedFixture();
  try {
    const { inventory } = await materializeResourceInventory({
      sourceRoot: fixture.root,
      gitDirectory: join(fixture.root, '.git'),
      expectedRevision: fixture.revision,
    });
    assert.equal(inventory.counts.resources, 2);
    assert.deepEqual(inventory.entries.map((entry) => entry.relativePath), [
      'assets/minecraft/test/block.json',
      'shaders.txt',
    ]);
    assert.ok(inventory.entries.every((entry) => /^[0-9a-f]{40}$/.test(entry.gitBlobSha1)));
    assert.ok(inventory.entries.every((entry) => /^[0-9a-f]{64}$/.test(entry.contentSha256)));
    assert.equal(inventory.consumerClosureComplete, false);
    assert.equal(inventory.classificationComplete, false);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('rejects working-tree resource bytes that differ from the pinned Git blob', async () => {
  const fixture = await createPinnedFixture();
  try {
    await writeFile(join(fixture.root, 'module/src/main/resources/shaders.txt'), 'changed\n');
    await assert.rejects(
      materializeResourceInventory({
        sourceRoot: fixture.root,
        gitDirectory: join(fixture.root, '.git'),
        expectedRevision: fixture.revision,
      }),
      /Resource bytes do not match pinned Git blob/,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
