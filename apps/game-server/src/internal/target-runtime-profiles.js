import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { canonicalDigest } from '@rus/materialization';
import { serverError } from '../errors.js';
import { validNeutralActionProductionProfile } from './lower-dvina-trace-a1-bundle.js';
import { validateLowerDvinaTraceOrdinaryStageBEval } from './lower-dvina-trace-ordinary-stage-b-eval.js';

/** The separate mapped-data approval owns applicability; absent owners stay absent. */
export async function loadTargetRuntimeProfiles({ rootDir = process.cwd(), worldRevisionId, verifiedCatalog } = {}) {
  const root = 'data/world-catalogs/novgorod/live-world-runtime-v17';
  const approval = JSON.parse(await readFile(resolve(rootDir,
    'data/world-catalogs/novgorod/m2c-expansion-repin-data-approval.json'), 'utf8'));
  const pin = approval.target_runtime_profiles_mapped_approval;
  if (approval.schema !== 'rus.m2c_supplemental_data_approval.v1'
    || approval.decision !== 'APPROVE_DATA_ONLY' || !pin?.manifest_sha256
    || pin.source_candidate_sha256 !== approval.target_runtime_profiles_candidate_approval?.candidate_sha256) gap();
  const manifestBytes = await readFile(resolve(rootDir, root, 'target-runtime-profiles-manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  if (hash(manifestBytes) !== pin.manifest_sha256
    || manifest.source_candidate_sha256 !== approval.target_runtime_profiles_candidate_approval?.candidate_sha256
    || manifest.world_revision_id !== worldRevisionId
    || manifest.dataset?.path !== 'target-runtime-profiles-approved.json') gap();
  const bytes = await readFile(resolve(rootDir, root, manifest.dataset.path));
  if (hash(bytes) !== manifest.dataset.sha256 || hash(bytes) !== pin.dataset_sha256) gap();
  const data = JSON.parse(bytes);
  if (data.status !== 'approved' || data.target?.world_revision_id !== worldRevisionId
    || data.profiles?.turn_step?.status !== 'approved'
    || !validNeutralActionProductionProfile(data.profiles.action_production)) gap();
  const turn = data.profiles.turn_step;
  const turnPin = { artifact_id: turn.profile_set_id, revision: turn.revision, digest: canonicalDigest(turn) };
  const finiteFirstEntry = verifiedCatalog == null ? null
    : await loadTargetFiniteFirstEntryProfile({ rootDir, worldRevisionId, verifiedCatalog });
  return freeze({ schema: 'rus.live_world_runtime.target_runtime_profiles_loaded.v1',
    world_revision_id: worldRevisionId, candidate_sha256: manifest.source_candidate_sha256,
    manifest_sha256: pin.manifest_sha256,
    finite_first_entry: finiteFirstEntry,
    // Supplied only after the release-selected mapped approval has been checked.
    turn_profile: Object.freeze({ profile: turn, pin: turnPin, selected_profile_pin: { ...turnPin } }),
    ordinary_profiles: Object.freeze({ s1: null, n1: { ...data.profiles.n1,
      participant_binding_kind: 'approved_source_binding',
      target_applicability: { world_revision_id: worldRevisionId, applicability: data.applicability,
        n1_binding_basis: data.n1_binding_basis } } }),
    materialization_profiles: Object.freeze({ ordinaryMaterializationProfile: null,
      ordinaryContainerContentsProfile: null, localFireProfile: null,
      actionProductionProfile: Object.freeze({ schema: 'rus.live_world_runtime.a1_loaded_profile.v1',
        artifact_digest: manifest.dataset.sha256, profile: data.profiles.action_production,
        target_applicability: { world_revision_id: worldRevisionId, applicability: data.applicability } }) }),
    capability_gaps: [...data.capability_gaps, ...data.consumer_gaps.filter((entry) =>
      !['M2C_TARGET_A1_PROFILE_CONSUMER_GAP', 'M2C_TARGET_N1_PROFILE_BINDING_CONSUMER_GAP'].includes(entry.code))],
    applicability: data.applicability });
}

/** Finite-only policy stays separate from generic ordinary/Stage B admission. */
export async function loadTargetFiniteFirstEntryProfile({ rootDir = process.cwd(), worldRevisionId, verifiedCatalog } = {}) {
  const read = (path) => readFile(resolve(rootDir, path), 'utf8');
  const root = 'data/world-catalogs/novgorod';
  const approval = JSON.parse(await read(`${root}/m2c-sol-data-approval.json`));
  if (verifiedCatalog?.schema !== 'rus.verified_item_catalog.v2' || verifiedCatalog.verified !== true
    || verifiedCatalog.pin?.catalog_scope !== 'item_container_materialization_v2'
    || verifiedCatalog.pin?.compatible_world_revision_id !== worldRevisionId
    || !verifiedCatalog.pin?.activation_event_id) finiteGap();
  const manifestBytes = await read(`${root}/live-world-runtime-v17/m2c-finite-only-ordinary-base-manifest.json`);
  const mappedBytes = await read(`${root}/live-world-runtime-v17/m2c-finite-only-ordinary-base-approved.json`);
  const manifest = JSON.parse(manifestBytes); const mapped = JSON.parse(mappedBytes);
  if (hash(manifestBytes) !== approval.finite_only_ordinary_base_mapped_approval?.manifest_sha256
    || hash(mappedBytes) !== manifest.dataset?.sha256
    || manifest.dataset.path !== 'm2c-finite-only-ordinary-base-approved.json'
    || manifest.source_candidate_sha256 !== approval.finite_only_ordinary_base_candidate_approval?.candidate_sha256
    || mapped.status !== 'approved' || mapped.schema !== 'rus.m2c_finite_only_ordinary_base.v1'
    || mapped.source_candidate_sha256 !== manifest.source_candidate_sha256
    || mapped.world_revision_id !== worldRevisionId || manifest.world_revision_id !== worldRevisionId) finiteGap();
  const rows = verifiedCatalog.records_by_table?.procedural_scene_compiled_records?.filter((row) =>
    row.record_id === `profile:${mapped.profile.profile_id}` && Number(row.version) === mapped.profile.revision) ?? [];
  if (rows.length !== 1 || rows[0].record_kind !== 'profile'
    || rows[0].status !== 'approved_authoring_not_runtime_selectable'
    || rows[0].payload_digest !== canonicalDigest(mapped)
    || canonicalDigest(rows[0].payload) !== canonicalDigest(mapped)) finiteGap();
  const baseBytes = await read(`${root}/live-world-runtime-v17/m2c-finite-only-ordinary-base-candidate.json`);
  const finiteBytes = await read(`${root}/live-world-runtime-v17/m2c-finite-source-capability-candidate.json`);
  const itemBytes = await read(`${root}/m2c-items/candidate.json`);
  const propertyBytes = await read(`${root}/m2c-items/property-context-candidate.json`);
  const base = JSON.parse(baseBytes); const finite = JSON.parse(finiteBytes);
  const items = JSON.parse(itemBytes); const property = JSON.parse(propertyBytes);
  if (approval.schema !== 'rus.m2c_supplemental_data_approval.v1' || approval.decision !== 'APPROVE_DATA_ONLY'
    || hash(baseBytes) !== approval.finite_only_ordinary_base_candidate_approval?.candidate_sha256
    || hash(finiteBytes) !== approval.finite_source_capability_candidate_approval?.candidate_sha256
    || hash(itemBytes) !== approval.approved_exact_candidates?.finite_items_sha256
    || hash(propertyBytes) !== approval.approved_exact_candidates?.property_context_sha256
    || base.target_world_revision_id !== worldRevisionId
    || [finite, items, property].some((entry) => entry.target?.world_revision_id !== worldRevisionId)) finiteGap();
  const sources = new Map();
  for (const pin of [...base.provenance.source_refs, ...finite.source_set, ...property.source_set]) {
    const bytes = sources.get(pin.path) ?? await read(pin.path);
    if (hash(bytes) !== pin.sha256) finiteGap();
    sources.set(pin.path, bytes);
  }
  const stageB = await loadTargetFiniteStageB({ read, worldRevisionId, baseProfile: rows[0].payload.profile });
  return freeze({ schema: 'rus.live_world_runtime.target_finite_first_entry_profile.v1',
    world_revision_id: worldRevisionId, candidate_sha256: hash(baseBytes),
    catalog_pin: verifiedCatalog.pin, profile: stageB.profile,
    stage_b_approval: stageB.receipt,
    naturalSourceAuthoring: { candidateBytes: itemBytes,
      approval: JSON.parse(await read(`${root}/m2c-items/approval-attestation.json`)) },
    propertySourceAuthoring: { candidateBytes: propertyBytes,
      approval: JSON.parse(await read(`${root}/m2c-items/property-context-approval.json`)),
      sourceBytesByPath: Object.fromEntries(sources) } });
}

async function loadTargetFiniteStageB({ read, worldRevisionId, baseProfile }) {
  const root = 'data/world-catalogs/novgorod/live-world-runtime-v17/';
  const approval = JSON.parse(await read(`${root}m2c-finite-only-ordinary-stage-b-runtime-cutover-approval.json`));
  const candidateBytes = await read(approval.candidate_path);
  const sourceBytes = await read(approval.source_probe_path);
  const reportBytes = await read(approval.qualification_report_path);
  const candidate = JSON.parse(candidateBytes);
  const report = JSON.parse(reportBytes);
  const probes = JSON.parse(sourceBytes);
  if (approval.schema !== 'rus.live_world_runtime.m2c_finite_stage_b_runtime_cutover_approval.v1'
    || approval.decision !== 'APPROVE_RUNTIME_SELECTION' || approval.runtime_selection_authorized !== true
    || approval.production_db_authorized !== false
    || approval.candidate_path !== `${root}m2c-finite-only-ordinary-stage-b-successor-candidate.json`
    || approval.source_probe_path !== `${root}m2c-stage-b-source-access-probes.json`
    || approval.qualification_report_path !== 'data/model-evals/live-world-runtime-v17-finite-stage-b-qualification-pass.json'
    || hash(candidateBytes) !== approval.candidate_sha256
    || hash(sourceBytes) !== approval.source_probe_sha256
    || hash(reportBytes) !== approval.qualification_report_sha256
    || candidate.schema !== 'rus.live_world_runtime.m2c_finite_only_ordinary_stage_b_successor_candidate.v1'
    || candidate.runtime_selectable !== false || candidate.revision !== 2
    || candidate.supersedes_profile_id !== baseProfile.profile_id
    || candidate.target_world_revision_id !== worldRevisionId
    || !validateLowerDvinaTraceOrdinaryStageBEval(candidate.stage_b_classification_eval)
    || candidate.stage_b_classification_eval.version !== 2
    || probes.schema !== 'rus.live_world_runtime.m2c_stage_b_source_access_probes.v1'
    || report.status !== 'PASS' || report.eval_candidate_sha256 !== approval.candidate_sha256
    || report.committed_source_probe_sha256 !== approval.source_probe_sha256
    || report.case_count !== candidate.stage_b_classification_eval.cases.length
    || report.failed_case_ids?.length !== 0
    || report.model_identity?.request_timeout_ms !== 120000
    || Object.entries(approval.model_identity).some(([key, value]) =>
      report.model_identity?.[key] !== value)) finiteGap();
  const receipt = { schema: 'rus.ordinary_materialization_stage_b_approval_receipt.v1',
    version: 1, profile_digest: approval.candidate_sha256,
    eval_contract_digest: canonicalDigest(candidate.stage_b_classification_eval),
    model_identity: approval.model_identity,
    approved_case_ids: candidate.stage_b_classification_eval.cases.map(({ id }) => id).sort(),
    result_digest: approval.qualification_report_sha256 };
  return { profile: { ...baseProfile, profile_id: candidate.profile_id,
    revision: candidate.revision,
    stage_b_classification_eval: candidate.stage_b_classification_eval }, receipt };
}

function finiteGap() { throw serverError('SPATIAL_V3_TARGET_FINITE_PROFILE_APPROVAL_REQUIRED',
  'Exact separately approved finite-only policy and source authoring are required.', { status: 503 }); }

function hash(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function gap() { throw serverError('SPATIAL_V3_TARGET_RUNTIME_PROFILE_APPROVAL_REQUIRED',
  'Exact separately reviewed target runtime profile mapping is required.', { status: 503 }); }
