import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(import.meta.dirname, '../..');
const INDEX_PATH = 'data/world-catalogs/novgorod/spatial-v3/target-materialization-approval/index.json';
const SOURCE_INDEX_PATH = 'data/world-catalogs/novgorod/spatial-v3/source-approval/index.json';
const EXPECTED = Object.freeze({
  package_id: 'P12_TARGET_MATERIALIZATION_APPROVAL_V1',
  package_path: 'data/world-catalogs/novgorod/spatial-v3/target-materialization-approval/P12_TARGET_MATERIALIZATION_APPROVAL_V1.zip',
  sha256: 'c26077b7ed2ac2a92f8883e46ec5aa02519cf3dc9a231022d9a7d347ce2a8b67',
  approval_status: 'APPROVED_WITH_ACTIVATION_BOUNDARY',
  input_pins: Object.freeze({
    source_approval_zip_sha256: 'e3342beac492ff6433a03ecbf7c32dbffdc9dafce8e7ebd623af826b33d7bbbe',
    target_contract_spec_zip_sha256: '1833b383e5ee2568330ab88ae40c7d5b9d057dbde81aa4f43641c48ecd3eb6f3'
  }),
  blockers: Object.freeze(['P12_APPROVAL_UPSTREAM_MANIFEST_ORDER_MISMATCH', 'P12_APPROVAL_BRANCH_HEAD_UNBOUND']),
  windows_manifest_self_check: 'P12_APPROVAL_UPSTREAM_MANIFEST_ORDER_MISMATCH'
});

const digest = (value) => createHash('sha256').update(value).digest('hex');
const execFile = promisify(execFileCallback);
const issue = (code, subject_ref) => Object.freeze({ code, subject_ref });
const inside = (root, candidate) => {
  const path = relative(root, candidate);
  return !!path && path !== '..' && !path.startsWith(`..${sep}`);
};

// The approval ZIP is an immutable external artifact.  Its own Python checks
// are therefore run only in a fresh, path-validated temporary extraction.
// This intentionally executes the archived scripts rather than restating
// their manifest ordering conclusion in this repository.
const UPSTREAM_REPRODUCER = String.raw`
import hashlib, json, re, subprocess, sys, tempfile
from pathlib import Path, PurePosixPath
from zipfile import ZipFile

zip_path = Path(sys.argv[1]).resolve()
package_name = sys.argv[2]
def completed(command, cwd):
    result = subprocess.run(command, cwd=cwd, text=True, capture_output=True)
    return {"exit_code": result.returncode, "stdout": result.stdout, "stderr": result.stderr}

with tempfile.TemporaryDirectory(prefix="p12-approval-upstream-") as temporary:
    extraction_root = Path(temporary).resolve()
    seen = set()
    with ZipFile(zip_path) as archive:
        for info in archive.infolist():
            parts = PurePosixPath(info.filename).parts
            if (not parts or parts[0] != package_name or PurePosixPath(info.filename).is_absolute()
                    or any(part in ("", ".", "..") for part in parts)
                    or info.filename in seen
                    or ((info.external_attr >> 16) & 0o170000) == 0o120000):
                raise SystemExit("unsafe approval archive member")
            seen.add(info.filename)
            destination = extraction_root.joinpath(*parts).resolve()
            if not destination.is_relative_to(extraction_root):
                raise SystemExit("approval archive member escapes extraction root")
            if info.is_dir():
                destination.mkdir(parents=True, exist_ok=True)
            else:
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(archive.read(info))

    package_root = extraction_root / package_name
    run_all = completed([sys.executable, str(package_root / "scripts" / "run_all_checks.py")], package_root)
    manifest_run = completed([sys.executable, str(package_root / "scripts" / "verify_manifest.py")], package_root)
    branch_run = completed([sys.executable, str(package_root / "scripts" / "verify_repository_branch_binding.py")], package_root)
    manifest = json.loads((package_root / "manifest.json").read_text(encoding="utf-8"))
    def manifest_entries(order):
        paths = [path for path in package_root.rglob("*")
                 if path.is_file() and path.name not in ("manifest.json", "manifest.sha256")]
        if order == "windows":
            # pathlib.WindowsPath compares path components case-insensitively.
            # Reproduce that ordering explicitly on every host; do not let the
            # host filesystem decide the outcome of this archived self-check.
            paths.sort(key=lambda path: (path.relative_to(package_root).as_posix().casefold(),
                                         path.relative_to(package_root).as_posix()))
        else:
            paths.sort(key=lambda path: path.relative_to(package_root).as_posix())
        return [{"path": path.relative_to(package_root).as_posix(), "bytes": path.stat().st_size,
                 "sha256": hashlib.sha256(path.read_bytes()).hexdigest()} for path in paths]
    def profile(order):
        actual = manifest_entries(order)
        first_mismatch = next(({"index": index, "actual": actual[index] if index < len(actual) else None,
                                "expected": manifest["files"][index] if index < len(manifest["files"]) else None}
                               for index in range(max(len(actual), len(manifest["files"])))
                               if index >= len(actual) or index >= len(manifest["files"]) or actual[index] != manifest["files"][index]), None)
        return {"files_equal": actual == manifest["files"], "first_mismatch": first_mismatch}
    ordering_profiles = {"posix": profile("posix"), "windows": profile("windows")}
    runtime_order = "windows" if sys.platform.startswith("win") else "posix"
    binding = json.loads((package_root / "templates" / "repository-branch-binding.template.json").read_text(encoding="utf-8"))
    exact_binding = (binding.get("status") == "BOUND_FOR_REPOSITORY_APPLY"
                     and isinstance(binding.get("branch_name"), str) and bool(binding["branch_name"])
                     and bool(re.fullmatch(r"[0-9a-f]{40}", binding.get("head_sha") or ""))
                     and bool(re.fullmatch(r"[0-9a-f]{64}", binding.get("approval_bundle_sha256") or "")))
    print(json.dumps({"runtime_platform": runtime_order, "run_all_checks": run_all, "manifest": {"run": manifest_run,
                         **ordering_profiles[runtime_order], "ordering_profiles": ordering_profiles}, "branch_binding": {"run": branch_run,
                         "exact_branch_head_binding": exact_binding}}, ensure_ascii=False))
`;

export async function reproduceP12ApprovalUpstreamChecks(zipPath) {
  try {
    const { stdout } = await execFile('python', ['-c', UPSTREAM_REPRODUCER, zipPath, EXPECTED.package_id], {
      encoding: 'utf8', maxBuffer: 1024 * 1024, windowsHide: true
    });
    return Object.freeze(JSON.parse(stdout));
  } catch (error) {
    const stdout = error?.stdout?.trim();
    try { return Object.freeze(JSON.parse(stdout)); }
    catch { return Object.freeze({ reproduction_error: String(error?.message ?? error) }); }
  }
}

/** Records the byte-pinned intake but deliberately cannot promote it. */
export async function validateP12TargetMaterializationApproval({ root = ROOT, indexPath = INDEX_PATH } = {}) {
  const projectRoot = resolve(root);
  const errors = [];
  let index;
  try { index = JSON.parse(await readFile(resolve(projectRoot, indexPath), 'utf8')); }
  catch { return Object.freeze({ ok: false, materialization_authorized: false, errors: Object.freeze([issue('P12_APPROVAL_INDEX_MISSING', indexPath)]) }); }
  for (const key of ['package_id', 'package_path', 'sha256', 'approval_status']) if (index?.[key] !== EXPECTED[key]) errors.push(issue('P12_APPROVAL_IDENTITY_MISMATCH', key));
  for (const [key, value] of Object.entries(EXPECTED.input_pins)) if (index?.input_pins?.[key] !== value) errors.push(issue('P12_APPROVAL_INPUT_PIN_MISMATCH', key));
  if (index?.intake_status !== 'blocked_fail_closed' || index?.materialization_authorized !== false || index?.production_activation !== 'not_authorized') errors.push(issue('P12_APPROVAL_BOUNDARY_INVALID', 'intake_status'));
  if (!Array.isArray(index?.blockers) || EXPECTED.blockers.some((code) => !index.blockers.includes(code))) errors.push(issue('P12_APPROVAL_BLOCKER_LEDGER_INVALID', 'blockers'));
  const zip = resolve(projectRoot, index?.package_path ?? '');
  if (!inside(projectRoot, zip)) errors.push(issue('P12_APPROVAL_PATH_ESCAPE', index?.package_path ?? 'unknown'));
  else {
    try {
      if (digest(await readFile(zip)) !== EXPECTED.sha256) errors.push(issue('P12_APPROVAL_DIGEST_MISMATCH', index.package_path));
      else {
        const upstream = await reproduceP12ApprovalUpstreamChecks(zip);
        const ordering = upstream?.manifest?.ordering_profiles;
        const portableOrderingEvidence = ordering?.posix?.files_equal === true
          && ordering?.posix?.first_mismatch === null
          && ordering?.windows?.files_equal === false
          && ordering?.windows?.first_mismatch?.actual
          && ordering?.windows?.first_mismatch?.expected;
        const runtimeIsWindows = upstream?.runtime_platform === 'windows';
        const runtimeManifestOutcome = runtimeIsWindows
          ? upstream?.run_all_checks?.exit_code === 1
            && /FAIL manifest mismatch/.test(upstream?.run_all_checks?.stdout ?? '')
            && upstream?.manifest?.run?.exit_code === 1
            && upstream?.manifest?.files_equal === false
          : upstream?.run_all_checks?.exit_code === 0
            && /PASS run_all_checks/.test(upstream?.run_all_checks?.stdout ?? '')
            && upstream?.manifest?.run?.exit_code === 0
            && upstream?.manifest?.files_equal === true;
        const branchUnbound = upstream?.branch_binding?.run?.exit_code === 2
          && /BLOCKED repository branch binding is not active/.test(upstream?.branch_binding?.run?.stdout ?? '')
          && upstream?.branch_binding?.exact_branch_head_binding === false;
        if (!portableOrderingEvidence || !runtimeManifestOutcome) errors.push(issue('P12_APPROVAL_UPSTREAM_MANIFEST_NOT_REPRODUCED', index.package_path));
        if (!branchUnbound) errors.push(issue('P12_APPROVAL_BRANCH_HEAD_EVIDENCE_INVALID', index.package_path));
        index = { ...index, upstream_evidence: upstream };
      }
    }
    catch { errors.push(issue('P12_APPROVAL_PACKAGE_MISSING', index?.package_path ?? 'unknown')); }
  }
  try {
    const sourceIndex = JSON.parse(await readFile(resolve(projectRoot, SOURCE_INDEX_PATH), 'utf8'));
    const spec = sourceIndex?.target_contract_specification;
    if (spec?.bound_source_zip_sha256 !== EXPECTED.input_pins.source_approval_zip_sha256 || spec?.sha256 !== EXPECTED.input_pins.target_contract_spec_zip_sha256) errors.push(issue('P12_APPROVAL_INSTALLED_INPUT_PIN_MISMATCH', SOURCE_INDEX_PATH));
  } catch { errors.push(issue('P12_APPROVAL_SOURCE_INDEX_MISSING', SOURCE_INDEX_PATH)); }
  return Object.freeze({ ok: errors.length === 0, package_id: EXPECTED.package_id, approval_status: EXPECTED.approval_status, materialization_authorized: false, p12_operational_gaps_closed: false, p28_activation: 'not_authorized', blockers: Object.freeze([...EXPECTED.blockers]), platform_self_checks: Object.freeze({ windows: EXPECTED.windows_manifest_self_check, posix: 'P12_APPROVAL_MANIFEST_ORDER_COMPATIBLE' }), upstream_evidence: index?.upstream_evidence, errors: Object.freeze(errors) });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await validateP12TargetMaterializationApproval();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok || result.materialization_authorized) process.exitCode = 1;
}
