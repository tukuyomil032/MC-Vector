const phaseId = (number) => `P-${number}`;
const builtinId = (name) => `B-${name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`;
const versionId = (version, stage) => `V-${version}-${stage}`;
const versionPage = (version, stage) => `phases/versions/${version}/${stage}.md`;
const versionCommit = (version, stage) => ({
  assets: `feat: add minecraft ${version} asset profile`,
  anvil: `feat: add minecraft ${version} anvil adapter`,
  'paper-snapshot': `feat: add paper snapshot adapter for minecraft ${version}`,
  'reference-and-parity': `test: verify dynmap parity for minecraft ${version}`,
  'real-acceptance': `test: record real map acceptance for minecraft ${version}`,
})[stage];

function expandCoreDependencies(phase, { coreIds, builtinNodes, versionNodes }) {
  const dependencies = new Set();
  let remaining = phase.depends.trim();
  const specialCases = [
    {
      expression: /all-version-anvil-paper-stage/g,
      expand: () => versionNodes.filter((node) => ['anvil', 'paper-snapshot'].includes(node.stage)),
    },
    {
      expression: /every version real-acceptance child/g,
      expand: () => versionNodes.filter((node) => node.stage === 'real-acceptance'),
    },
    {
      expression: /every built-in renderer phase/g,
      expand: () => builtinNodes,
    },
    {
      expression: /all generated specialist phases/g,
      expand: () => [...builtinNodes, ...versionNodes],
    },
  ];

  for (const specialCase of specialCases) {
    if (!specialCase.expression.test(remaining)) continue;
    for (const dependency of specialCase.expand()) dependencies.add(dependency.id);
    remaining = remaining.replace(specialCase.expression, ' ');
  }

  remaining = remaining.replace(/\band\b/gi, ' ').replaceAll(',', ' ').trim();
  if (remaining === '' || remaining === 'なし' || remaining === 'none') return [...dependencies].sort();

  for (const token of remaining.split(/\s+/)) {
    const range = /^(\d{3})-(\d{3})$/.exec(token);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start > end) throw new Error(`Invalid reversed dependency range in ${phase.n}: ${token}`);
      for (let number = start; number <= end; number += 1) {
        const dependency = phaseId(String(number).padStart(3, '0'));
        if (!coreIds.has(dependency)) throw new Error(`Unknown core dependency ${dependency} in ${phase.n}`);
        dependencies.add(dependency);
      }
      continue;
    }

    if (!/^\d{3}$/.test(token)) throw new Error(`Unknown dependency token in ${phase.n}: ${token}`);
    const dependency = phaseId(token);
    if (!coreIds.has(dependency)) throw new Error(`Unknown core dependency ${dependency} in ${phase.n}`);
    dependencies.add(dependency);
  }

  return [...dependencies].sort();
}

const versionStageDependencies = (version, stage) => {
  const p = (number) => phaseId(String(number).padStart(3, '0'));
  const range = (start, end) => Array.from({ length: end - start + 1 }, (_, index) => p(start + index));
  const own = (ownStage) => versionId(version, ownStage);
  const mappings = {
    assets: [p(2), p(8), p(12), p(14), p(16), p(18)],
    anvil: [p(2), p(6), p(7), p(11)],
    'paper-snapshot': [p(2), p(6), p(7), p(24)],
    'reference-and-parity': [p(2), p(4), ...range(9, 23), own('assets'), own('anvil')],
    'real-acceptance': [
      p(2), p(23), p(24), p(25), p(26), p(27), p(28), p(29), p(30), p(31), p(32), p(33), p(34),
      own('paper-snapshot'), own('reference-and-parity'),
    ],
  };
  const dependencies = mappings[stage];
  if (!dependencies) throw new Error(`No dependency contract for version stage: ${stage}`);
  return [...new Set(dependencies)].sort();
};

export function buildPhaseGraph({ corePhases, builtinEntries, versionEntries, stageNames }) {
  const builtinNodes = builtinEntries.map((entry) => ({
    id: entry.phaseId ?? builtinId(entry.class),
    kind: 'builtin',
    document: entry.phaseDocument ?? `phases/builtins/${entry.class.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}.md`,
    dependsOn: [],
    sourcePath: entry.sourcePath,
    commitMessage: `feat: port dynmap builtin ${entry.class}`,
  }));
  const versionNodes = versionEntries.flatMap((entry) => stageNames.map((stage) => ({
    id: versionId(entry.minecraftVersion, stage),
    kind: 'version',
    minecraftVersion: entry.minecraftVersion,
    stage,
    document: versionPage(entry.minecraftVersion, stage),
    dependsOn: versionStageDependencies(entry.minecraftVersion, stage),
    commitMessage: versionCommit(entry.minecraftVersion, stage),
  })));
  const coreIds = new Set(corePhases.map((phase) => phaseId(phase.n)));

  for (const node of builtinNodes) {
    node.dependsOn = [
      phaseId('000'), phaseId('004'), phaseId('006'),
      ...Array.from({ length: 11 }, (_, index) => phaseId(String(index + 9).padStart(3, '0'))),
      phaseId('020'),
    ];
  }
  const coreNodes = corePhases.map((phase) => ({
    id: phaseId(phase.n),
    kind: 'common',
    document: `phases/phase-${phase.n}-${phase.file}.md`,
    dependsOn: expandCoreDependencies(phase, { coreIds, builtinNodes, versionNodes }),
    commitMessage: phase.commit,
  }));

  return {
    schemaVersion: 1,
    rootIds: [phaseId('000')],
    nodes: [...coreNodes, ...builtinNodes, ...versionNodes],
  };
}

export function validatePhaseGraph(graph, { expectedNodeIds = null } = {}) {
  const errors = [];
  const add = (condition, message) => { if (!condition) errors.push(message); };
  add(graph?.schemaVersion === 1, 'phase graph schemaVersion must be 1');
  add(Array.isArray(graph?.nodes) && graph.nodes.length > 0, 'phase graph must contain nodes');
  if (!Array.isArray(graph?.nodes)) return errors;

  const ids = graph.nodes.map((node) => node.id);
  add(new Set(ids).size === ids.length, 'phase graph contains duplicate node IDs');
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const documents = graph.nodes.map((node) => node.document);
  add(new Set(documents).size === documents.length, 'phase graph maps multiple phase IDs to one document');
  for (const node of graph.nodes) {
    add(typeof node.id === 'string' && node.id.length > 0, 'phase graph node has no ID');
    add(['common', 'builtin', 'version'].includes(node.kind), `phase graph node has invalid kind: ${node.id}`);
    add(typeof node.document === 'string' && node.document.endsWith('.md'), `phase graph node has invalid document path: ${node.id}`);
    add(typeof node.document === 'string' && !node.document.startsWith('/') && !node.document.split('/').includes('..'), `phase graph document path escapes its root: ${node.id}`);
    add(typeof node.commitMessage === 'string' && node.commitMessage.trim().length > 0 && !/[\r\n]/.test(node.commitMessage), `phase graph node has no single-line commit message: ${node.id}`);
    if (node.kind === 'common') add(/^P-\d{3}$/.test(node.id), `common phase ID is malformed: ${node.id}`);
    if (node.kind === 'builtin') {
      add(/^B-[a-z0-9-]+$/.test(node.id), `built-in phase ID is malformed: ${node.id}`);
      add(typeof node.sourcePath === 'string' && node.sourcePath.length > 0, `built-in source path is missing: ${node.id}`);
    }
    if (node.kind === 'version') {
      add(typeof node.minecraftVersion === 'string' && node.minecraftVersion.length > 0, `version phase release ID is missing: ${node.id}`);
      add(typeof node.stage === 'string' && node.stage.length > 0, `version phase stage is missing: ${node.id}`);
      add(node.id === versionId(node.minecraftVersion, node.stage), `version phase ID does not match release/stage: ${node.id}`);
    }
    add(Array.isArray(node.dependsOn), `phase graph dependencies must be an array: ${node.id}`);
    add(new Set(node.dependsOn ?? []).size === (node.dependsOn ?? []).length, `phase graph has duplicate dependencies: ${node.id}`);
    for (const dependency of node.dependsOn ?? []) {
      add(byId.has(dependency), `phase graph has unknown dependency ${dependency} from ${node.id}`);
      add(dependency !== node.id, `phase graph node depends on itself: ${node.id}`);
    }
  }

  const state = new Map();
  const stack = [];
  const visit = (id) => {
    if (!byId.has(id)) return;
    if (state.get(id) === 1) {
      const first = stack.indexOf(id);
      errors.push(`phase dependency cycle: ${[...stack.slice(first), id].join(' -> ')}`);
      return;
    }
    if (state.get(id) === 2) return;
    state.set(id, 1);
    stack.push(id);
    for (const dependency of byId.get(id).dependsOn ?? []) visit(dependency);
    stack.pop();
    state.set(id, 2);
  };
  for (const id of ids) visit(id);

  const roots = graph.nodes.filter((node) => (node.dependsOn ?? []).length === 0).map((node) => node.id).sort();
  add(JSON.stringify(roots) === JSON.stringify([...(graph.rootIds ?? [])].sort()), 'phase graph rootIds do not match nodes without dependencies');
  const rootIds = graph.rootIds ?? [];
  for (const root of rootIds) add(byId.has(root), `phase graph root does not exist: ${root}`);
  const children = new Map(ids.map((id) => [id, []]));
  for (const node of graph.nodes) for (const dependency of node.dependsOn ?? []) {
    if (children.has(dependency)) children.get(dependency).push(node.id);
  }
  const reachable = new Set();
  const queue = [...rootIds];
  while (queue.length > 0) {
    const current = queue.shift();
    if (reachable.has(current)) continue;
    reachable.add(current);
    for (const child of children.get(current) ?? []) queue.push(child);
  }
  for (const id of ids) add(reachable.has(id), `phase graph node is unreachable from root: ${id}`);

  if (expectedNodeIds) {
    const expected = [...expectedNodeIds].sort();
    add(JSON.stringify([...ids].sort()) === JSON.stringify(expected), 'phase graph node IDs do not match the expected source/built-in/version phase set');
  }
  return errors;
}

export function phaseContractBlock(node) {
  return [
    '## Machine-checked dependency contract',
    '',
    '```json',
    JSON.stringify({
      schemaVersion: 1,
      phaseId: node.id,
      kind: node.kind,
      document: node.document,
      dependsOn: node.dependsOn,
      commitMessage: node.commitMessage,
    }, null, 2),
    '```',
  ].join('\n');
}

export function validatePhaseDocument(markdown, node) {
  const errors = [];
  const add = (condition, message) => { if (!condition) errors.push(message); };
  add(typeof markdown === 'string' && markdown.startsWith(`# ${node.id}:`), `${node.id}: document title does not match its phase ID`);
  const contractMatch = markdown.match(/## Machine-checked dependency contract\s+```json\s+([\s\S]*?)\s+```/);
  add(Boolean(contractMatch), `${node.id}: machine-checked dependency contract block is missing`);
  if (contractMatch) {
    try {
      const contract = JSON.parse(contractMatch[1]);
      add(contract.schemaVersion === 1, `${node.id}: dependency contract schemaVersion must be 1`);
      add(contract.phaseId === node.id, `${node.id}: dependency contract phase ID mismatch`);
      add(contract.kind === node.kind, `${node.id}: dependency contract kind mismatch`);
      add(contract.document === node.document, `${node.id}: dependency contract document path mismatch`);
      add(JSON.stringify(contract.dependsOn) === JSON.stringify(node.dependsOn), `${node.id}: dependency contract edges differ from the canonical graph`);
      add(contract.commitMessage === node.commitMessage, `${node.id}: dependency contract commit message differs from the canonical graph`);
    } catch {
      errors.push(`${node.id}: dependency contract is invalid JSON`);
    }
  }

  const requiredByKind = {
    common: ['## 目的と固定対象', '## 入力・failure contract', '## 実装作業', '## 検証gate', '## 完了状態の記録', '## Commit'],
    builtin: ['## 固定範囲とowner', '## 実装タスク', '## 失敗条件と検証', '## Commit'],
    version: ['## exact version identity', '## 目的と依存', '## 個別作業', '## 失敗と検証', '## Commit'],
  };
  for (const heading of requiredByKind[node.kind] ?? []) add(markdown.includes(heading), `${node.id}: required heading missing: ${heading}`);

  if (node.kind === 'common') {
    for (const term of ['対象source/symbol:', 'Rust destination / output:', '依存phase:', '固定fixture / reference:', '合格条件:', '```bash']) {
      add(markdown.includes(term), `${node.id}: required phase field missing: ${term}`);
    }
  }
  if (node.kind === 'builtin') {
    for (const term of ['Pinned Java source:', 'Rust destination:', '依存:', 'fixture/reference trace/pixel golden', 'Gate:']) {
      add(markdown.includes(term), `${node.id}: required built-in field missing: ${term}`);
    }
  }
  if (node.kind === 'version') {
    add(markdown.includes(node.minecraftVersion), `${node.id}: exact version ID is missing from document`);
    add(markdown.includes('Required delta reports:'), `${node.id}: exact artifact delta report paths are missing`);
    add(markdown.includes('artifact digest'), `${node.id}: evidence must be bound to exact artifact digests`);
    add(markdown.includes('blocked'), `${node.id}: blocked/unavailable state policy is missing`);
    add(markdown.includes('bun scripts/run-map-version-phase.mjs'), `${node.id}: exact-version execution command is missing`);
    if (node.stage === 'assets') {
      for (const term of ['block registry ID', 'full state property/value', 'client JAR ZIP entry', 'asset-index object mapping', 'canonical logical-resource map', 'deterministic precedence', 'resolved model graph', 'texture pixel/alpha digest', 'fixture→exact-version Dynmap trace→Rust pixel comparison']) {
        add(markdown.includes(term), `${node.id}: concrete renderer data-delta requirement is missing: ${term}`);
      }
    }
    if (node.stage === 'anvil') {
      for (const term of ['DataVersion', 'dimension別min/max Y', 'chunk NBT fields', 'block/biome palette', 'sky/block light', 'schema fingerprint']) {
        add(markdown.includes(term), `${node.id}: concrete Anvil schema-delta requirement is missing: ${term}`);
      }
    }
    if (node.stage === 'paper-snapshot') {
      for (const term of ['build number', 'download SHA-256', 'loaded/not_loaded', 'liveCompatibility=unavailable']) {
        add(markdown.includes(term), `${node.id}: exact Paper runtime delta requirement is missing: ${term}`);
      }
    }
    if (node.stage === 'reference-and-parity') {
      for (const term of ['selected exact-version Dynmap source revision', 'dynmap-source-delta.json', 'normalized RGBA', 'pixel単位比較']) {
        add(markdown.includes(term), `${node.id}: exact-version Dynmap/reference parity requirement is missing: ${term}`);
      }
    }
    if (node.stage === 'real-acceptance') {
      for (const term of ['実Paper環境', 'Java process', 'port 25565']) {
        add(markdown.includes(term), `${node.id}: real environment acceptance evidence requirement is missing: ${term}`);
      }
    }
  }
  return errors;
}
