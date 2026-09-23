import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPhaseGraph,
  phaseContractBlock,
  validatePhaseDocument,
  validatePhaseGraph,
} from '../phase-graph.mjs';

const fixtureGraph = () => {
  const corePhases = Array.from({ length: 37 }, (_, index) => {
    const n = String(index).padStart(3, '0');
    return { n, file: `phase-${n}`, depends: index === 0 ? 'なし' : String(index - 1).padStart(3, '0'), commit: `chore: phase ${n}` };
  });
  corePhases.find((phase) => phase.n === '021').depends = '020 and every built-in renderer phase';
  corePhases.find((phase) => phase.n === '025').depends = '024,all-version-anvil-paper-stage';
  corePhases.find((phase) => phase.n === '035').depends = '034 and every version real-acceptance child';
  corePhases.find((phase) => phase.n === '036').depends = '035 and all generated specialist phases';
  const builtinEntries = [{ class: 'ExampleRenderer', sourcePath: 'renderer/ExampleRenderer.java' }];
  const versionEntries = [{ minecraftVersion: '1.14' }];
  const stageNames = ['assets', 'anvil', 'paper-snapshot', 'reference-and-parity', 'real-acceptance'];
  return { graph: buildPhaseGraph({ corePhases, builtinEntries, versionEntries, stageNames }), corePhases, builtinEntries, versionEntries, stageNames };
};

test('builds a closed acyclic dependency graph for common, built-in, and exact-version phases', () => {
  const { graph, corePhases, builtinEntries, versionEntries, stageNames } = fixtureGraph();
  assert.deepEqual(validatePhaseGraph(graph), []);
  assert.deepEqual(graph.rootIds, ['P-000']);
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  assert.ok(nodes.get('P-021').dependsOn.includes('B-example-renderer'));
  assert.ok(nodes.get('P-025').dependsOn.includes('V-1.14-anvil'));
  assert.ok(nodes.get('P-025').dependsOn.includes('V-1.14-paper-snapshot'));
  assert.ok(nodes.get('P-035').dependsOn.includes('V-1.14-real-acceptance'));
  assert.ok(nodes.get('P-036').dependsOn.includes('V-1.14-assets'));
  assert.equal(graph.nodes.length, corePhases.length + builtinEntries.length + versionEntries.length * stageNames.length);
});

test('rejects missing dependency IDs, cycles, incorrect roots, and unreachable phases', () => {
  const graph = {
    schemaVersion: 1,
    rootIds: ['P-000'],
    nodes: [
      { id: 'P-000', kind: 'common', document: 'phases/p0.md', dependsOn: [] },
      { id: 'P-001', kind: 'common', document: 'phases/p1.md', dependsOn: ['P-002'] },
      { id: 'P-002', kind: 'common', document: 'phases/p2.md', dependsOn: ['P-001', 'P-404'] },
      { id: 'P-003', kind: 'common', document: 'phases/p3.md', dependsOn: [] },
    ],
  };
  const errors = validatePhaseGraph(graph);
  assert.ok(errors.some((error) => error.includes('unknown dependency P-404')));
  assert.ok(errors.some((error) => error.includes('dependency cycle')));
  assert.ok(errors.some((error) => error.includes('rootIds do not match')));
  assert.ok(errors.some((error) => error.includes('unreachable from root: P-003')));
});

test('rejects phase nodes without explicit single-line commit boundaries or valid typed identity', () => {
  const graph = {
    schemaVersion: 1,
    rootIds: ['P-000'],
    nodes: [
      { id: 'P-000', kind: 'common', document: 'phases/p0.md', dependsOn: [], commitMessage: '' },
      { id: 'V-1.14-assets', kind: 'version', minecraftVersion: '1.14', stage: 'anvil', document: 'phases/v.md', dependsOn: ['P-000'], commitMessage: 'feat: one\nfeat: two' },
    ],
  };
  const errors = validatePhaseGraph(graph);
  assert.ok(errors.some((error) => error.includes('single-line commit message: P-000')));
  assert.ok(errors.some((error) => error.includes('single-line commit message: V-1.14-assets')));
  assert.ok(errors.some((error) => error.includes('ID does not match release/stage: V-1.14-assets')));
});

test('requires each phase document to embed the canonical dependency contract', () => {
  const { graph } = fixtureGraph();
  const node = graph.nodes.find((candidate) => candidate.id === 'P-000');
  const valid = [
    '# P-000: fixture',
    '',
    phaseContractBlock(node),
    '',
    '## 目的と固定対象',
    '## 入力・failure contract',
    '## 実装作業',
    '対象source/symbol: fixture',
    'Rust destination / output: fixture',
    '依存phase: なし',
    '固定fixture / reference: fixture',
    '## 検証gate',
    '合格条件: fixture',
    '```bash',
    'bun test',
    '```',
    '## 完了状態の記録',
    '## Commit',
  ].join('\n');
  assert.deepEqual(validatePhaseDocument(valid, node), []);
  const staleEdges = valid.replace('"dependsOn": []', '"dependsOn": ["P-404"]');
  assert.ok(validatePhaseDocument(staleEdges, node).some((error) => error.includes('edges differ')));
  const staleCommit = valid.replace('"commitMessage": "chore: phase 000"', '"commitMessage": "chore: wrong task"');
  assert.ok(validatePhaseDocument(staleCommit, node).some((error) => error.includes('commit message differs')));
});

test('rejects version pages that omit concrete per-release renderer data delta work', () => {
  const { graph } = fixtureGraph();
  const node = graph.nodes.find((candidate) => candidate.id === 'V-1.14-assets');
  const incomplete = [
    '# V-1.14-assets: release assets',
    phaseContractBlock(node),
    '## exact version identity',
    '1.14 Required delta reports: artifact digest blocked bun scripts/run-map-version-phase.mjs',
    '## 目的と依存',
    '## 個別作業',
    '## 失敗と検証',
    '## Commit',
  ].join('\n');
  const errors = validatePhaseDocument(incomplete, node);
  assert.ok(errors.some((error) => error.includes('block registry ID')));
  assert.ok(errors.some((error) => error.includes('resolved model graph')));
  assert.ok(errors.some((error) => error.includes('texture pixel/alpha digest')));
});
