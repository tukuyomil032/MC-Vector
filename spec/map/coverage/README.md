# Renderer Coverage Catalogs

The catalogs in this directory are the machine-readable completion boundary.
They are not implementation notes and must not be replaced by a prose claim.

Each required row connects:

```text
pinned source symbol/resource
  -> Rust destination
  -> version scope
  -> fixture
  -> Java reference capture
  -> focused test
  -> evidence row
```

`planned`, `inventory_required`, or `pending` is not a passing state. The
coverage checker must fail if any required row remains in one of those states
at the final audit.

## Source inventory authority

[`java-ast-inventory.json.gz`](java-ast-inventory.json.gz) is the pinned-tree,
syntax-only javac inventory. It contains the Git tree identity, per-file Git
blob SHA-1 and SHA-256, every parsed declaration, and unresolved reference
candidates. It is bound to Dynmap commit
`93b454efb8802dc7406d6873434f2aeec5c636f4` and does **not** prove semantic
dependency closure.

[`source-symbols.json`](source-symbols.json) is an
older 106-file candidate map. It is not the declaration ledger and does not
cover the full pinned Java tree. Do not use its row count, symbol names, or
candidate destinations as proof of source coverage.

The source declaration disposition ledger and resolved dependency-edge ledger
must join to the AST inventory by stable `symbolId`. Until every declaration
and edge is classified with source evidence and a phase owner (or a justified
exclusion), source coverage remains open and strict readiness must fail.

[`source-dependency-candidates.json.gz`](source-dependency-candidates.json.gz)
is an open semantic-reference candidate graph, not a closed renderer call
graph. Its string-literal rows retain enclosing AST calls (resolved owner,
callee, signature, and argument position); the rows intentionally include
ordinary messages/data strings as well as possible lookups. Do not equate its
string-literal count with the number of dynamic lookups, or mark the closure
complete before reflective, registration, and resource dataflow are reviewed.

## Resource path inventory authority

[`pinned-resource-inventory.json.gz`](pinned-resource-inventory.json.gz)
records all tracked regular files whose pinned Git path contains a
`resources/` segment. Every row is verified against the pinned Git blob and
includes Git blob SHA-1, content SHA-256, byte length, resource root, and
relative path. The archive is bound to the same Git tree as the Java AST
inventory. This proves path and byte identity only; it does not prove that a
resource is renderer-relevant, that its consumer is known, or that it has been
implemented.

[`resources.json`](resources.json) now contains the exact 3,673-path pinned
resource inventory. Only 161 web paths have provisional, source-backed
exclusion candidates and 12 color-scheme paths have source-backed
renderer-runtime candidates; 3,500 paths remain unclassified and every
per-resource license remains unverified. The catalog is not a closed
disposition ledger. Strict resource gates must require a consumer-symbol/phase
owner or evidence-backed exclusion for every row.
