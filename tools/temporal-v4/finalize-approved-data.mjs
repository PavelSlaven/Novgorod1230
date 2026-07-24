import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  TEMPORAL_DATA_READINESS_PATH,
  TEMPORAL_REQUIRED_DATA_FAMILIES
} from '../spatial-v3/temporal-data-readiness.mjs';

const DATA_ROOT = 'data/world-catalogs/novgorod/temporal-v4';
const IMPORTER_PATH = 'tools/temporal-v4/import-approved-data.mjs';
const SCHEMA_PATH = 'infra/world-base/SCHEMA_REFERENCE.md';
const UNIT_TEST_PATH = 'test/spatial-v3/temporal-approved-data-import.test.js';
const POSTGRES_TEST_PATH =
  'test/spatial-v3/temporal-approved-data-postgres.test.js';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function encode(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

async function bytes(root, path) {
  return readFile(resolve(root, path));
}

async function json(root, path) {
  return JSON.parse(await readFile(resolve(root, path), 'utf8'));
}

function unique(items) {
  return [...new Set(items)];
}

export async function buildFinalizedTemporalData({
  root = process.cwd()
} = {}) {
  const readiness = await json(root, TEMPORAL_DATA_READINESS_PATH);
  const familyById = new Map(readiness.families.map((family) => [family.id, family]));
  const sharedHashes = {
    deterministic_import: sha256(await bytes(root, IMPORTER_PATH)),
    generated_schema: sha256(await bytes(root, SCHEMA_PATH))
  };
  const approvals = [];
  const families = [];

  for (const required of TEMPORAL_REQUIRED_DATA_FAMILIES) {
    const familyId = required.id;
    const currentFamily = familyById.get(familyId);
    if (!currentFamily) throw new Error(`Missing readiness family: ${familyId}`);
    const approvalPath = `${DATA_ROOT}/approvals/${familyId}.json`;
    const currentApproval = await json(root, approvalPath);
    const decisionPath =
      `docs/work/temporal-world-v4/external-data-audit/decisions/${familyId}.decision.json`;
    const decisionBytes = await bytes(root, decisionPath);
    const decision = JSON.parse(decisionBytes.toString('utf8'));
    if (decision.family_id !== familyId ||
        decision.verdict !== 'approved' ||
        decision.data_gaps?.length !== 0) {
      throw new Error(`External audit decision is not approved: ${familyId}`);
    }

    const artifacts = {};
    for (const [kind, artifact] of Object.entries(currentApproval.artifacts)) {
      artifacts[kind] = {
        path: artifact.path,
        sha256: kind in sharedHashes
          ? sharedHashes[kind]
          : sha256(await bytes(root, artifact.path))
      };
    }
    const approval = {
      ...currentApproval,
      external_audit_decision: {
        path: decisionPath,
        sha256: sha256(decisionBytes),
        decision_id: decision.decision_id
      },
      artifacts
    };
    const approvalBytes = encode(approval);
    approvals.push({ path: approvalPath, bytes: approvalBytes });

    families.push({
      ...currentFamily,
      existing_status: 'complete',
      approved: true,
      import_paths: [IMPORTER_PATH],
      tests: unique([
        ...currentFamily.tests,
        UNIT_TEST_PATH,
        POSTGRES_TEST_PATH
      ]),
      evidence_paths: unique([
        ...currentFamily.evidence_paths,
        artifacts.dataset.path,
        artifacts.provenance.path,
        artifacts.normalized_references.path,
        artifacts.source_history.path,
        decisionPath,
        approvalPath,
        IMPORTER_PATH,
        SCHEMA_PATH
      ]),
      approval: {
        status: 'approved',
        version: currentApproval.record_version,
        applicability: currentApproval.applicability,
        manifest_path: approvalPath,
        manifest_sha256: sha256(approvalBytes)
      },
      blockers: []
    });
  }

  return Object.freeze({
    approvals: Object.freeze(approvals),
    readiness: Object.freeze({
      path: TEMPORAL_DATA_READINESS_PATH,
      bytes: encode({
        ...readiness,
        activation_status: 'ready',
        families
      })
    })
  });
}

export async function writeFinalizedTemporalData(options) {
  const result = await buildFinalizedTemporalData(options);
  const root = options?.root ?? process.cwd();
  await Promise.all(result.approvals.map((approval) =>
    writeFile(resolve(root, approval.path), approval.bytes)
  ));
  await writeFile(resolve(root, result.readiness.path), result.readiness.bytes);
  return Object.freeze({
    approval_count: result.approvals.length,
    readiness_path: result.readiness.path
  });
}

export async function checkFinalizedTemporalData(options) {
  const result = await buildFinalizedTemporalData(options);
  const root = options?.root ?? process.cwd();
  const stale = [];
  for (const artifact of [...result.approvals, result.readiness]) {
    const current = await bytes(root, artifact.path).catch(() => null);
    if (!current || !current.equals(artifact.bytes)) stale.push(artifact.path);
  }
  if (stale.length > 0) {
    throw new Error(
      `Temporal approved data is stale; run npm run temporal-v4:finalize-data:\n- ${stale.join('\n- ')}`
    );
  }
  return Object.freeze({
    approval_count: result.approvals.length,
    readiness_path: result.readiness.path
  });
}

const isCli = process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isCli) {
  const command = process.argv[2] ?? '--check';
  const action = command === '--write'
    ? writeFinalizedTemporalData
    : command === '--check'
      ? checkFinalizedTemporalData
      : null;
  if (!action) {
    process.stderr.write(`Unknown command: ${command}\n`);
    process.exitCode = 2;
  } else {
    action({ root: process.cwd() })
      .then((result) => process.stdout.write(
        `Temporal approved data: OK (${result.approval_count} approvals; ${result.readiness_path})\n`
      ))
      .catch((error) => {
        process.stderr.write(`${error.stack ?? error.message}\n`);
        process.exitCode = 1;
      });
  }
}
