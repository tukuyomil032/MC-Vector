#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../../../../.." && pwd)
tool="$repo_root/spec/map/plan/tools/DynmapAstInventory.java"
temp_root=$(mktemp -d "${TMPDIR:-/tmp}/dynmap-ast-test.XXXXXX")
trap 'rm -rf "$temp_root"' EXIT HUP INT TERM

source_root="$temp_root/fixture-source"
mkdir -p "$source_root"
fixture_file="$source_root/InventoryFixture.java"
printf '%s\n' \
  'package fixture;' \
  'class InventoryFixture {' \
  '    static int initialized = init("static-field");' \
  '    int instanceInitialized = init("instance-field");' \
  '    Runnable anonymous = new Runnable() {' \
  '        public void run() { invoke("anonymous-field"); }' \
  '    };' \
  '    static { invoke("static-initializer"); }' \
  '    { invoke("instance-initializer"); }' \
  '    void first() {' \
  '        class Repeated {' \
  '            Object supplier = init("first-local");' \
  '            void member() { invoke("first-member"); }' \
  '        }' \
  '        new Repeated();' \
  '    }' \
  '    void second() {' \
  '        class Repeated {' \
  '            Object supplier = init("second-local");' \
  '            void member() { invoke("second-member"); }' \
  '        }' \
  '        new Repeated();' \
  '    }' \
  '    void overloaded(int value) { invoke(value); }' \
  '    void overloaded(String value) { invoke(value); }' \
  '    class Nested {' \
  '        class Deep {}' \
  '        Object nestedInitialized = init("nested-field");' \
  '    }' \
  '}' \
  'enum FixtureState {' \
  '    FIRST("first;"),' \
  '    // This comment contains a ; before the constant separator.' \
  '    SECOND("second;") { void constantSpecific() { invoke("enum-anonymous"); } };' \
  '    private final String label;' \
  '    FixtureState(String label) { this.label = label; }' \
  '    int regularField = init("enum-field");' \
  '    String marker = "field;still-field";' \
  '}' > "$fixture_file"

revision=0123456789abcdef0123456789abcdef01234567
first_output="$temp_root/first.json"
second_output="$temp_root/second.json"
java "$tool" "$source_root" "$first_output" "$revision"
java "$tool" "$source_root" "$second_output" "$revision"
cmp "$first_output" "$second_output"

python3 - "$first_output" "$source_root" "$fixture_file" "$revision" <<'PY'
import hashlib
import json
import pathlib
import sys

output_path = pathlib.Path(sys.argv[1])
source_root = pathlib.Path(sys.argv[2])
fixture_file = pathlib.Path(sys.argv[3])
revision = sys.argv[4]
data = json.loads(output_path.read_text())
declarations = data["declarations"]
references = data["referenceCandidates"]
ids = [row["symbolId"] for row in declarations]
assert len(ids) == len(set(ids)), "declaration IDs must occur exactly once"
assert len(declarations) == 28, f"unexpected declaration coverage: {len(declarations)}"
assert data["duplicateSymbolIdCount"] == 0, data["duplicateSymbolIds"]
assert data["parseErrorCount"] == 0
assert data["sourceRevision"] == revision
assert data["sourceRevisionProvenance"].startswith("command_line_argument")
assert data["sourceRoot"] == str(source_root.resolve())
assert data["semanticDependencyClosureComplete"] is False
assert "candidates" in data["referenceEdgeSemantics"]
assert "do not prove" in data["referenceEdgeSemantics"]

manifest = {row["sourcePath"]: row["contentSha256"] for row in data["sourceFiles"]}
relative_fixture = pathlib.Path(fixture_file).relative_to(source_root).as_posix()
assert manifest == {relative_fixture: hashlib.sha256(pathlib.Path(fixture_file).read_bytes()).hexdigest()}

overloads = [row for row in declarations if row["kind"] == "method" and "#overloaded(" in row["signature"]]
assert len(overloads) == 2, [row["signature"] for row in overloads]
assert len({row["symbolId"] for row in overloads}) == 2

local_types = [row for row in declarations if row["kind"] == "class" and "/local:Repeated@" in row["symbolId"]]
assert len(local_types) == 2, [row["symbolId"] for row in local_types]
assert len({row["symbolId"] for row in local_types}) == 2
local_owners = {row["symbolId"] for row in local_types}
local_supplier_fields = [row for row in declarations if row["kind"] == "field" and row["signature"].endswith("#supplier:Object")]
assert len(local_supplier_fields) == 2, [row["signature"] for row in local_supplier_fields]
assert {row["ownerSymbolId"] for row in local_supplier_fields} == local_owners

nested_types = [row for row in declarations if row["kind"] == "class" and ("$Nested" in row["symbolId"] or "$Deep" in row["symbolId"])]
assert {row["kind"] for row in nested_types} == {"class"}
assert any("$Nested" in row["symbolId"] for row in nested_types)
assert any("$Deep" in row["symbolId"] for row in nested_types)
anonymous_types = [row for row in declarations if "/anonymous@" in row["symbolId"]]
assert len(anonymous_types) == 4, [row["symbolId"] for row in anonymous_types]

enum_constants = [row for row in declarations if row["kind"] == "enum_constant"]
ordinary_enum_fields = [row for row in declarations if row["kind"] == "field" and row["owner"] == "fixture.FixtureState"]
assert {row["signature"].split("#", 1)[1].split(":", 1)[0] for row in enum_constants} == {"FIRST", "SECOND"}, [(row["kind"], row["signature"], row["resultOrFieldType"]) for row in declarations if row["owner"] == "fixture.FixtureState"]
assert {row["signature"].split("#", 1)[1].split(":", 1)[0] for row in ordinary_enum_fields} == {"label", "regularField", "marker"}

initialized_id = next(row["symbolId"] for row in declarations if row["kind"] == "field" and row["signature"].endswith("#initialized:int"))
assert any(row["contextSymbolId"] == initialized_id and row["kind"] == "method_call_candidate" and row["target"] == "init" for row in references)
assert any(row["contextSymbolId"].startswith("initializer:") and row["kind"] == "method_call_candidate" and row["target"] == "invoke" for row in references)
print(f"fixture assertions passed: declarations={len(declarations)} references={len(references)} anonymousTypes={len(anonymous_types)}")
PY

error_root="$temp_root/parse-failure"
mkdir -p "$error_root"
printf '%s\n' 'class Broken { void broken( { }' > "$error_root/Broken.java"
parse_output="$temp_root/parse-error.json"
if java "$tool" "$error_root" "$parse_output" "$revision"; then
  printf '%s\n' 'expected malformed Java input to fail closed' >&2
  exit 1
fi
python3 - "$parse_output" <<'PY'
import json
import pathlib
import sys

data = json.loads(pathlib.Path(sys.argv[1]).read_text())
assert data["parseErrorCount"] > 0, data
assert data["parseErrors"], data
print(f"parse failure assertion passed: parseErrors={data['parseErrorCount']}")
PY

probe_source="$temp_root/DuplicateIdProbe.java"
printf '%s\n' \
  'import java.util.ArrayList;' \
  'import java.util.LinkedHashMap;' \
  'import java.util.List;' \
  'import java.util.Map;' \
  'final class DuplicateIdProbe {' \
  '  public static void main(String[] args) {' \
  '    List<Map<String, Object>> rows = new ArrayList<>();' \
  '    for (int i = 0; i < 2; i++) {' \
  '      Map<String, Object> row = new LinkedHashMap<>();' \
  '      row.put("symbolId", "type:duplicate");' \
  '      rows.add(row);' \
  '    }' \
  '    List<String> duplicates = DynmapAstInventory.findDuplicateSymbolIds(rows);' \
  '    if (!duplicates.equals(List.of("type:duplicate"))) throw new AssertionError(duplicates);' \
  '    if (DynmapAstInventory.inventoryExitCode(1, 1, List.of(), duplicates) == 0) throw new AssertionError("duplicate IDs passed");' \
  '  }' \
  '}' > "$probe_source"
classes="$temp_root/probe-classes"
mkdir -p "$classes"
javac -d "$classes" "$tool" "$probe_source"
java -cp "$classes" DuplicateIdProbe

printf '%s\n' 'duplicate-ID failure assertion passed' 'Dynmap AST inventory tests passed'
