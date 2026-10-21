#!/bin/sh
set -eu

if ! bun scripts/check-map-renderer-coverage.mjs --require-source-ast; then
  echo "Expected the Git-bound syntax AST gate to pass." >&2
  exit 1
fi

if ! bun scripts/check-map-renderer-coverage.mjs --require-resource-inventory; then
  echo "Expected the Git-bound resource path inventory gate to pass." >&2
  exit 1
fi

if bun scripts/check-map-renderer-coverage.mjs --require-closed-dependencies >/dev/null 2>&1; then
  echo "Open semantic dependency closure must fail the strict gate." >&2
  exit 1
fi

if bun scripts/check-map-renderer-coverage.mjs --require-complete >/dev/null 2>&1; then
  echo "Seed catalogs must not pass the complete coverage gate." >&2
  exit 1
fi

if bun scripts/check-map-renderer-coverage.mjs --require-version-deltas >/dev/null 2>&1; then
  echo "Official metadata and phase pages must not pass without exact-release data delta reports." >&2
  exit 1
fi

if bun scripts/check-map-renderer-coverage.mjs --require-dynmap-oracle >/dev/null 2>&1; then
  echo "A pinned Dynmap baseline must not pass without per-release source and behavior evidence." >&2
  exit 1
fi

if bun scripts/check-map-renderer-coverage.mjs --require-all-resources >/dev/null 2>&1; then
  echo "The partial resource candidate catalog must not pass the full resource gate." >&2
  exit 1
fi

set +e
plan_validation_output=$(bun spec/map/plan/tools/validate-plan.mjs --require-plan-complete 2>&1)
plan_validation_status=$?
set -e
if [ "$plan_validation_status" -eq 0 ]; then
  echo "The seed catalogs must not pass plan completeness." >&2
  exit 1
fi
case "$plan_validation_output" in
  *"Map renderer plan is not complete"*"dependency edge ledger"*) ;;
  *)
    echo "The plan-completeness flag must run the strict semantic/source/resource gate." >&2
    printf '%s\n' "$plan_validation_output" >&2
    exit 1
    ;;
esac

if bun spec/map/plan/tools/validate-plan.mjs --require-renderer-complete >/dev/null 2>&1; then
  echo "The current renderer must not pass implementation/reference/acceptance completeness." >&2
  exit 1
fi

if bun spec/map/plan/tools/validate-plan.mjs --require-dynmap-oracle >/dev/null 2>&1; then
  echo "Pending per-release Dynmap source reports must not pass the oracle gate." >&2
  exit 1
fi

set +e
bun spec/map/plan/tools/validate-plan.mjs --not-a-real-option >/dev/null 2>&1
result=$?
set -e
if [ "$result" -ne 2 ]; then
  echo "Unknown plan validator flags must fail with exit code 2 (got $result)." >&2
  exit 1
fi

set +e
bun scripts/check-map-renderer-coverage.mjs --not-a-real-gate >/dev/null 2>&1
result=$?
set -e
if [ "$result" -ne 2 ]; then
  echo "Unknown flags must fail with exit code 2 (got $result)." >&2
  exit 1
fi

echo "Coverage checker fail-closed smoke tests passed."
