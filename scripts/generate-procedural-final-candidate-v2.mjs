import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = 'data/world-catalogs/novgorod/procedural-scene-v2';
const OUTPUT = `${ROOT}/final-candidate-pack-v2/candidate.json`;
const V1 = `${ROOT}/final-candidate-pack-v1/candidate.json`;
const ALLOCATION = `${ROOT}/functional-allocation-v1/candidate.json`;
const ATTESTATION = `${ROOT}/functional-allocation-v1/approval-attestation.json`;

export async function generateProceduralFinalCandidateV2(rootDir) {
  const root = resolve(rootDir);
  const [v1, allocation, attestation] = await Promise.all([V1, ALLOCATION,
    ATTESTATION].map(async (path) => JSON.parse(await readFile(
      resolve(root, path), 'utf8'))));
  const { attestation_digest: claimed, ...attested } = attestation;
  if (digest(attested) !== claimed
      || claimed !== '692960ad7561b60a0793f1f3fb097e757f8975aa91ec42251296edc6213b552a'
      || allocation.candidate_digest !== attestation.candidate_digest
      || v1.candidate_digest !==
        attestation.source_bindings.final_assert_existing_catalog_digest)
    fail('FINAL_V2_SOURCE_ATTESTATION_INVALID');
  const appendPayload = { schema: 'rus.procedural_compiled_allocation_policy.v1',
    policy: structuredClone(allocation.policies[0]),
    approval_attestation_digest: claimed,
    authoring_status: 'approved', runtime_status:
      'pending_runtime_inventory_owner_validation' };
  const appendRecord = {
    record_id: 'policy:functional-actor-allocation-v1', version: 1,
    record_kind: 'mapping', family_candidate_ref:
      'novgorod_inland_fishing_worksite_v3@1', payload: appendPayload,
    payload_digest: digest(appendPayload),
    source_pack_digest: digest({ v1: v1.candidate_digest,
      allocation: allocation.candidate_digest, attestation: claimed }),
    status: 'approved_authoring_not_runtime_selectable'
  };
  const payload = {
    schema: 'rus.procedural_scene_final_candidate_pack.v2',
    pack_id: 'novgorod_procedural_scene_final_candidate_002', version: 2,
    status: 'sealed_candidate_not_imported',
    target_revision_id: 'procedural_scene_final_candidate_v2_001',
    supersedes_for_future_new_development_parties_only: {
      revision_id: v1.target_revision_id,
      candidate_digest: v1.candidate_digest,
      existing_party_migration_authorized: false,
      old_pin_mutation_authorized: false
    },
    inherited_closure: {
      candidate_path: V1, candidate_digest: v1.candidate_digest,
      target_catalog_digest: v1.target_catalog_digest,
      record_operations_count: v1.record_operations_by_table.length,
      records_digest: v1.append_only_import_plan.records_digest,
      v5_assert_existing_table_count: 39,
      v5_assert_existing_record_count: 3248
    },
    allocation_source: { candidate_path: ALLOCATION,
      candidate_digest: allocation.candidate_digest,
      request_digest: attestation.request_digest,
      approval_attestation_path: ATTESTATION,
      approval_attestation_digest: claimed },
    append_only_delta: {
      table_name: 'procedural_scene_compiled_records', operation_kind: 'insert',
      record: appendRecord, insert_count: 1, delete_count: 0,
      update_count: 0
    },
    target_catalog_digest: digest({ schema:
      'rus.procedural_scene_final_candidate_v2_target.v1',
    inherited_target_catalog_digest: v1.target_catalog_digest,
    inherited_records_digest: v1.append_only_import_plan.records_digest,
    appended_record: appendRecord }),
    import_authorized: false, runtime_authorized: false,
    activation_authorized: false, activation_request: null,
    production_deploy_authorized: false,
    existing_party_migration_authorized: false,
    old_save_rematerialization_authorized: false
  };
  return { ...payload, candidate_digest: digest(payload) };
}
function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function fail(code) { throw Object.assign(new Error(code), { code }); }
async function main(argv) {
  const root = resolve(argv.find((arg) => !arg.startsWith('--')) ?? '.');
  const candidate = await generateProceduralFinalCandidateV2(root);
  const target = resolve(root, OUTPUT);
  const rendered = `${JSON.stringify(candidate, null, 2)}\n`;
  if (argv.includes('--check')) {
    if (await readFile(target, 'utf8').catch(() => null) !== rendered)
      fail('FINAL_V2_GENERATED_STALE');
  } else {
    await mkdir(resolve(target, '..'), { recursive: true });
    await writeFile(target, rendered);
  }
  process.stdout.write(`${JSON.stringify({ pass: true,
    candidate_digest: candidate.candidate_digest,
    target_catalog_digest: candidate.target_catalog_digest }, null, 2)}\n`);
}
if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await main(process.argv.slice(2));
