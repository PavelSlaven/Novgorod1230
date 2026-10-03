#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="$(cd "$here/../.." && pwd)"
validator="$out/validate-s1-candidate.mjs"
if [ ! -f "$here/expected-list.txt" ]; then node "$here/make-fixtures.mjs"; fi
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_if_present() { if [ -e "$1" ]; then cp -a "$1" "$1.$stamp.bak"; fi; }
backup_if_present "$here/baseline.log"
backup_if_present "$here/baseline-exit-status.txt"
set +e
timeout 30s node "$validator" > "$here/baseline.log" 2>&1
baseline_status=$?
set -e
printf '%s\n' "$baseline_status" > "$here/baseline-exit-status.txt"
if [ "$baseline_status" -ne 0 ]; then cat "$here/baseline.log"; exit 1; fi
while IFS='|' read -r case_id expected_code; do
  fixture="$here/fixtures/$case_id"
  backup_if_present "$fixture/cli.log"
  backup_if_present "$fixture/exit-status.txt"
  set +e
  timeout 30s node "$validator" --input-dir "$fixture" > "$fixture/cli.log" 2>&1
  status=$?
  set -e
  printf '%s\n' "$status" > "$fixture/exit-status.txt"
  if [ "$status" -eq 0 ] || ! grep -Fq "S1_VALIDATION_ERROR[$expected_code]" "$fixture/cli.log"; then
    printf 'FAIL %s expected rejection %s; exit=%s\n' "$case_id" "$expected_code" "$status"
    cat "$fixture/cli.log"
    exit 1
  fi
  printf 'PASS %s -> %s\n' "$case_id" "$expected_code"
done < "$here/expected-list.txt"
backup_if_present "$here/ambiguity.log"
backup_if_present "$here/ambiguity-exit-status.txt"
set +e
node "$here/test-resolver-ambiguity.mjs" > "$here/ambiguity.log" 2>&1
ambiguity_status=$?
set -e
printf '%s\n' "$ambiguity_status" > "$here/ambiguity-exit-status.txt"
if [ "$ambiguity_status" -ne 0 ]; then cat "$here/ambiguity.log"; exit 1; fi
node "$here/summarize.mjs"
