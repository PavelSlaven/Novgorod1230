import { readFile, readdir } from 'node:fs/promises';
import { readApprovedCanonicalFiniteApplicability } from
  '../infrastructure/postgres/ordinary-materialization-canonical-natural.js';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { canonicalDigest } from '@rus/materialization';
import { serverError } from '../errors.js';
import { validNeutralActionProductionProfile } from './lower-dvina-trace-a1-bundle.js';
import { validateLowerDvinaTraceOrdinaryStageBEval } from './lower-dvina-trace-ordinary-stage-b-eval.js';
import { validPostActionPerceptionProfile } from
  './post-action-perception-profile.js';
import { TARGET_O1_PROFILE_ARTIFACT_PINS } from './target-o1-profile-pins.js';

/** The separate mapped-data approval owns applicability; absent owners stay absent. */
const A1_CLASS_FILE = 'data/world-catalogs/novgorod/live-world-runtime-v17/a1-applicability-class.json';
const APPROVAL_FIELDS = ['approved_by', 'approved_on', 'approved_path', 'approved_commit'];

/** The class rule counts only when its file carries the approver's fields (WR §21.1). */
export function readApprovedA1ApplicabilityClass(file, worldRevisionId) {
  return file?.schema === 'rus.a1_applicability_class.v1' && file.status === 'approved'
    && file.world_revision_id === worldRevisionId && file.rule?.kind === 'all_g5_sites'
    && APPROVAL_FIELDS.every((key) => typeof file.approval?.[key] === 'string'
      && file.approval[key].length > 0)
    ? { kind: 'all_g5_sites', world_revision_id: worldRevisionId } : null;
}

export async function loadTargetRuntimeProfiles({ rootDir = process.cwd(), worldRevisionId, verifiedCatalog,
  o1ArtifactPins = TARGET_O1_PROFILE_ARTIFACT_PINS,
  a1ApplicabilityClassPath = resolve(rootDir, A1_CLASS_FILE) } = {}) {
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
  const ordinaryMaterializationProfile = await loadTargetO1PresenceProfile({
    rootDir, worldRevisionId, pins: o1ArtifactPins,
  });
  const turn = data.profiles.turn_step;
  const turnPin = { artifact_id: turn.profile_set_id, revision: turn.revision, digest: canonicalDigest(turn) };
  const a1Class = readApprovedA1ApplicabilityClass(
    JSON.parse(await readFile(a1ApplicabilityClassPath, 'utf8').catch(() => 'null')), worldRevisionId);
  const finiteFirstEntry = verifiedCatalog == null ? null
    : await loadTargetFiniteFirstEntryProfile({ rootDir, worldRevisionId, verifiedCatalog });
  const postActionPerceptionProfile = await loadTargetPostActionPerceptionProfile({
    rootDir, worldRevisionId
  });
  const bodyNeedsProfile = await loadTargetBodyNeedsProfile({ rootDir, worldRevisionId });
  return freeze({ schema: 'rus.live_world_runtime.target_runtime_profiles_loaded.v1',
    world_revision_id: worldRevisionId, candidate_sha256: manifest.source_candidate_sha256,
    manifest_sha256: pin.manifest_sha256,
    post_action_perception_profile: postActionPerceptionProfile,
    body_needs_profile: bodyNeedsProfile,
    finite_first_entry: finiteFirstEntry,
    // Supplied only after the release-selected mapped approval has been checked.
    turn_profile: Object.freeze({ profile: turn, pin: turnPin, selected_profile_pin: { ...turnPin } }),
    ordinary_profiles: Object.freeze({ s1: null, n1: { ...data.profiles.n1,
      participant_binding_kind: 'approved_source_binding',
      target_applicability: { world_revision_id: worldRevisionId, applicability: data.applicability,
        n1_binding_basis: data.n1_binding_basis } } }),
    materialization_profiles: Object.freeze({ ordinaryMaterializationProfile,
      ordinaryContainerContentsProfile: null, localFireProfile: null,
      actionProductionProfile: Object.freeze({ schema: 'rus.live_world_runtime.a1_loaded_profile.v1',
        artifact_digest: manifest.dataset.sha256, profile: data.profiles.action_production,
        target_applicability: { world_revision_id: worldRevisionId, applicability: data.applicability,
          ...(a1Class == null ? {} : { class_rule: a1Class }) } }) }),
    capability_gaps: [...data.capability_gaps, ...data.consumer_gaps.filter((entry) =>
      !['M2C_TARGET_A1_PROFILE_CONSUMER_GAP', 'M2C_TARGET_N1_PROFILE_BINDING_CONSUMER_GAP'].includes(entry.code))],
    applicability: data.applicability });
}

const BODY_NEEDS_BINDING_PATH =
  'data/world-catalogs/novgorod/live-world-runtime-v17/body-needs-binding.v1.json';
const BODY_NEEDS_DATASET_PATH =
  'data/world-catalogs/novgorod/temporal-v4/datasets/body_time_effect_profiles_thresholds.json';
const BODY_NEEDS_APPROVAL_PATH =
  'data/world-catalogs/novgorod/temporal-v4/approvals/body_time_effect_profiles_thresholds.json';
const BODY_NEEDS_APPROVAL_ATTESTATION_DIRECTORY =
  'data/world-catalogs/novgorod/live-world-runtime-v17';
const BODY_NEEDS_APPROVAL_ATTESTATION_PATTERN =
  /^body-needs-binding\.v1\.approval-attestation.*\.json$/u;
const BODY_NEEDS_APPROVAL_ATTESTATION_SCHEMA =
  'rus.live_world_runtime_v17_body_needs_binding_approval.v1';
const BODY_NEEDS_PROFILE_IDS = [
  'satiety_hourly_spend_v2', 'energy_awake_spend_v2', 'starvation_health_harm_v2'
];
const BODY_NEEDS_SLEEP_ID = 'energy_sleep_recovery_v1';

/** Loads approved source profiles while preserving the separate binding candidate's pending status. */
export async function loadTargetBodyNeedsProfile({ rootDir = process.cwd(), worldRevisionId } = {}) {
  try {
    const [bindingBytes, datasetBytes, approvalBytes] = await Promise.all([
      readFile(resolve(rootDir, BODY_NEEDS_BINDING_PATH)),
      readFile(resolve(rootDir, BODY_NEEDS_DATASET_PATH)),
      readFile(resolve(rootDir, BODY_NEEDS_APPROVAL_PATH)),
    ]);
    const binding = JSON.parse(bindingBytes);
    const dataset = JSON.parse(datasetBytes);
    const approval = JSON.parse(approvalBytes);
    const datasetSha = hash(datasetBytes);
    const approvalSha = hash(approvalBytes);
    if (binding.schema !== 'rus.live_world_runtime_v17.body_needs_binding_candidate.v1'
      || binding.version !== 1 || binding.status !== 'candidate_only_pending_review'
      || binding.approved !== false || binding.import_authorized !== false
      || binding.activation_authorized !== false
      || binding.target?.world_revision_id !== worldRevisionId
      || binding.source_artifacts?.dataset?.path !== BODY_NEEDS_DATASET_PATH
      || binding.source_artifacts?.dataset?.sha256 !== datasetSha
      || binding.source_artifacts?.approval?.path !== BODY_NEEDS_APPROVAL_PATH
      || binding.source_artifacts?.approval?.sha256 !== approvalSha
      || approval.schema !== 'rus.temporal-world-v4.data-family-approval.v1'
      || approval.family_id !== 'body_time_effect_profiles_thresholds'
      || approval.status !== 'approved' || !Array.isArray(approval.record_ids)
      || approval.artifacts?.dataset?.sha256 !== datasetSha
      || JSON.stringify([...approval.record_ids].sort()) !== JSON.stringify([
        'record:body_time_effect_profiles_thresholds:energy_awake_spend_v2',
        'record:body_time_effect_profiles_thresholds:energy_sleep_recovery_v1',
        'record:body_time_effect_profiles_thresholds:satiety_hourly_spend_v2',
        'record:body_time_effect_profiles_thresholds:starvation_health_harm_v2'
      ])
      || !Array.isArray(dataset) || dataset.length !== 4
      || !Array.isArray(binding.effort_bindings) || binding.effort_bindings.length !== 5) bodyNeedsGap();
    const byId = new Map(dataset.map((record) => [record.record_id, record]));
    const candidateSha = hash(bindingBytes);
    const approvalAttestation = await loadBodyNeedsApprovalAttestation({
      rootDir, candidateSha
    });
    const bindingsByEffort = new Map(binding.effort_bindings.map((entry) => [entry.effort_id, entry.activity_intensity_id]));
    if (bindingsByEffort.size !== 5
      || ['none', 'light', 'moderate'].some((effort) => bindingsByEffort.get(effort) !== 'rest_or_ordinary_activity')
      || ['heavy', 'extreme'].some((effort) => bindingsByEffort.get(effort) !== 'heavy_activity')) bodyNeedsGap();
    const expected = BODY_NEEDS_PROFILE_IDS.map((id) => `record:body_time_effect_profiles_thresholds:${id}`);
    if (binding.profiles?.filter((entry) => entry.binding_candidate === true).length !== 3
      || BODY_NEEDS_PROFILE_IDS.some((id) => {
        const record = byId.get(`record:body_time_effect_profiles_thresholds:${id}`);
        return !record || record.status !== 'approved' || record.record_kind !== 'body_time_effect_profile'
          || record.family_id !== 'body_time_effect_profiles_thresholds'
          || record.payload?.body_effect_profile_id !== id;
      })
      || binding.profiles.some((entry) => entry.payload_id === BODY_NEEDS_SLEEP_ID && entry.binding_candidate !== false)
      || expected.some((recordId) => !binding.profiles.some((entry) => entry.record_id === recordId
        && entry.binding_candidate === true
        && Array.isArray(entry.source_refs) && entry.source_refs.length > 0
        && entry.source_refs.every((ref) => ref.path === BODY_NEEDS_DATASET_PATH
          && /^\d+-\d+$/u.test(ref.lines) && typeof ref.use === 'string' && ref.use.length > 0)))) bodyNeedsGap();
    return freeze({ schema: 'rus.live_world_runtime.body_needs_profile_candidate.v1',
      status: binding.status,
      approved: approvalAttestation?.attestation.approved ?? false,
      import_authorized: approvalAttestation?.attestation.import_authorized ?? false,
      activation_authorized: approvalAttestation?.attestation.activation_authorized ?? false,
      world_revision_id: worldRevisionId, candidate_path: BODY_NEEDS_BINDING_PATH,
      candidate_sha256: candidateSha, approval_attestation: approvalAttestation == null ? null : {
        path: approvalAttestation.path, sha256: approvalAttestation.sha256,
        verdict: approvalAttestation.attestation.verdict
      }, dataset_path: BODY_NEEDS_DATASET_PATH,
      dataset_sha256: datasetSha, source_approval_path: BODY_NEEDS_APPROVAL_PATH,
      source_approval_sha256: approvalSha,
      effort_bindings: binding.effort_bindings,
      profiles: Object.fromEntries(BODY_NEEDS_PROFILE_IDS.map((id) => [id,
        (() => {
          const record = byId.get(`record:body_time_effect_profiles_thresholds:${id}`);
          return { record_id: record.record_id, version: String(record.version),
            source_digest: canonicalDigest({ record_id: record.record_id,
              family_id: record.family_id, record_kind: record.record_kind,
              record_version: record.version, applicability: record.applicability,
              status: record.status, provenance_refs: record.provenance_refs,
              normalized_reference_ids: record.normalized_reference_ids,
              source_history_refs: record.source_history_refs, payload: record.payload }),
            payload: record.payload };
        })()])) });
  } catch (error) {
    if (['SPATIAL_V3_TARGET_BODY_NEEDS_PROFILE_REQUIRED',
      'SPATIAL_V3_TARGET_BODY_NEEDS_APPROVAL_ATTESTATION_INVALID',
      'SPATIAL_V3_TARGET_BODY_NEEDS_APPROVAL_ATTESTATION_AMBIGUOUS'].includes(error?.code)) throw error;
    bodyNeedsGap();
  }
}

async function loadBodyNeedsApprovalAttestation({ rootDir, candidateSha }) {
  const directory = resolve(rootDir, BODY_NEEDS_APPROVAL_ATTESTATION_DIRECTORY);
  let names;
  try { names = await readdir(directory); }
  catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  const matches = [];
  for (const name of names) {
    if (!BODY_NEEDS_APPROVAL_ATTESTATION_PATTERN.test(name)) continue;
    const path = `${BODY_NEEDS_APPROVAL_ATTESTATION_DIRECTORY}/${name}`;
    let attestation;
    let bytes;
    try {
      bytes = await readFile(resolve(rootDir, path));
      attestation = JSON.parse(bytes);
    } catch {
      bodyNeedsAttestationInvalid();
    }
    // Other candidates in the same directory do not attest this binding.
    if (attestation?.candidate_path !== BODY_NEEDS_BINDING_PATH) continue;
    if (attestation.candidate_sha256 !== candidateSha
      || attestation.schema !== BODY_NEEDS_APPROVAL_ATTESTATION_SCHEMA
      || !['APPROVE', 'APPROVE_CONDITIONAL'].includes(attestation.verdict)
      || typeof attestation.approved !== 'boolean'
      || typeof attestation.import_authorized !== 'boolean'
      || typeof attestation.activation_authorized !== 'boolean'
      || !nonempty(attestation.auditor_ref)
      || !nonempty(attestation.independence_basis)
      || !nonempty(attestation.reviewed_repository_head)
      || !nonempty(attestation.approval)) bodyNeedsAttestationInvalid();
    matches.push({ path, sha256: hash(bytes), attestation });
  }
  if (matches.length > 1) bodyNeedsAttestationAmbiguous();
  return matches[0] ?? null;
}

function nonempty(value) { return typeof value === 'string' && value.trim().length > 0; }
function bodyNeedsAttestationInvalid() {
  throw serverError('SPATIAL_V3_TARGET_BODY_NEEDS_APPROVAL_ATTESTATION_INVALID',
    'The body-needs approval attestation must exactly identify and approve the pending candidate.',
    { status: 503, details: { severity: 'hard_block' } });
}
function bodyNeedsAttestationAmbiguous() {
  throw serverError('SPATIAL_V3_TARGET_BODY_NEEDS_APPROVAL_ATTESTATION_AMBIGUOUS',
    'More than one body-needs approval attestation matches the pending candidate.',
    { status: 503, details: { severity: 'hard_block' } });
}

export function isUniqueTargetO1Applicability(applicability) {
  const refs = applicability?.rule_refs;
  const selectors = applicability?.selectors;
  const uniqueRefs = Array.isArray(refs)
    && new Set(refs.map((entry) => `${entry?.rule_id}@${entry?.rule_version}`)).size === 75
    && refs.length === 75
    && refs.every((entry) => typeof entry?.rule_id === 'string'
      && Number.isInteger(entry.rule_version) && entry.rule_version >= 1);
  const tupleKey = (entry) => [entry?.g1_ref, entry?.g4_ref,
    entry?.canonical_g5_ref, entry?.place_family_ref, entry?.source_pf_id].join('|');
  const siteKey = (entry) => [entry?.g4_ref, entry?.canonical_g5_ref].join('|');
  const uniqueSelectors = Array.isArray(selectors) && selectors.length === 4
    && new Set(selectors.map(tupleKey)).size === 4
    && new Set(selectors.map(siteKey)).size === 4
    && selectors.every((entry) => typeof entry?.g1_ref === 'string'
      && typeof entry?.g4_ref === 'string'
      && typeof entry?.canonical_g5_ref === 'string'
      && typeof entry?.place_family_ref === 'string'
      && typeof entry?.source_pf_id === 'string');
  return uniqueRefs && uniqueSelectors;
}

async function loadTargetO1PresenceProfile({ rootDir, worldRevisionId, pins }) {
  try {
    if (!pins?.profile?.path || !pins.profile.sha256 || !pins?.selector?.path
        || !pins.selector.sha256 || !pins?.approval?.path || !pins.approval.sha256
        || !Array.isArray(pins.sources) || pins.sources.length !== 2) o1Gap();
    const readPinnedJson = async (pin) => {
      const bytes = await readFile(resolve(rootDir, pin.path));
      if (hash(bytes) !== pin.sha256) o1Gap();
      return JSON.parse(bytes);
    };
    const [profile, selector, approval] = await Promise.all([
      readPinnedJson(pins.profile), readPinnedJson(pins.selector), readPinnedJson(pins.approval),
    ]);
    for (const sourcePin of pins.sources) {
      const source = await readFile(resolve(rootDir, sourcePin.path));
      if (hash(source) !== sourcePin.sha256) o1Gap();
    }
    const expectedSourcePins = pins.sources.map(({ path, sha256 }) => ({ path, sha256 }));
    const approvedSourcePins = approval.required_source_pins;
    if (profile.schema !== 'rus.live_world_runtime.ordinary_materialization_profile.v1'
        || profile.profile_id !== 'novgorod_v17_o1_presence_profile_v1'
        || profile.revision !== 1 || profile.status !== 'approved_with_limits'
        || profile.world_revision_id !== worldRevisionId
        || profile.fallback_policy !== 'forbidden'
        || profile.o1_presence?.fallback_policy !== 'forbidden'
        || profile.o1_presence?.selector_path !== pins.selector.path
        || profile.o1_presence?.selector_sha256 !== pins.selector.sha256
        || profile.o1_presence?.selector_id !== selector.selector_id
        || profile.o2a_ambient !== null
        || selector.schema !== 'rus.live_world_runtime.o1_applicability_selector_candidate.v1'
        || selector.status !== 'candidate_only_pending_review'
        || selector.approved !== false || selector.import_authorized !== false
        || selector.activation_authorized !== false || selector.runtime_input !== false
        || selector.target?.world_revision_id !== worldRevisionId
        || !isUniqueTargetO1Applicability(selector.applicability)
        || approval.schema !== 'rus.live_world_runtime.o1_applicability_selector_approval.v1'
        || approval.decision !== 'APPROVE_WITH_LIMITS'
        || approval.selector_id !== selector.selector_id
        || approval.selector_path !== pins.selector.path
        || approval.selector_sha256 !== pins.selector.sha256
        || approval.independent_review?.path !== '/srv/novgorod-work/fleet/tasks/ap-o1-selector/out/ap-o1-selector.json'
        || approval.independent_review?.sha256 !== 'b333fd1b0ab13ae160a393cb3d3c04b9a38aa10c7df39e2a61111395ce393a69'
        || approval.independent_review?.reviewed_object_sha256 !== pins.selector.sha256
        || approval.independent_review?.verdict !== 'CHANGES_REQUIRED'
        || approval.lead_decision?.decision !== 'APPROVE_WITH_LIMITS'
        || approval.lead_decision?.decision_id !== 'D67'
        || !Array.isArray(approval.limits) || approval.limits.length === 0
        || !Array.isArray(approval.excludes) || approval.excludes.length === 0
        || JSON.stringify(approvedSourcePins) !== JSON.stringify(expectedSourcePins)) o1Gap();
    return freeze({ ...profile, o1_presence: {
      ...profile.o1_presence,
      selector,
      approval: { decision: approval.decision, lead_decision: approval.lead_decision,
        limits: approval.limits, excludes: approval.excludes },
    }, artifact_pin: { profile: pins.profile, selector: pins.selector, approval: pins.approval,
      sources: pins.sources } });
  } catch (error) {
    if (error?.code === 'SPATIAL_V3_TARGET_O1_PROFILE_APPROVAL_REQUIRED') throw error;
    o1Gap();
  }
}

const POST_ACTION_PERCEPTION_PROFILE_PATH =
  'data/world-catalogs/novgorod/live-world-runtime-v17/post-action-perception-profile.json';
const TARGET_POST_ACTION_PERCEPTION_PROFILE_ID =
  'live_world_post_action_perception_v1';

async function loadTargetPostActionPerceptionProfile({ rootDir, worldRevisionId }) {
  const bytes = await readFile(resolve(rootDir,
    POST_ACTION_PERCEPTION_PROFILE_PATH)).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (bytes === null) return null;
  let profile;
  try {
    profile = JSON.parse(bytes);
  } catch {
    return null;
  }
  return readApprovedPostActionPerceptionProfile(profile, worldRevisionId);
}

export function readApprovedPostActionPerceptionProfile(profile, worldRevisionId) {
  if (profile?.status !== 'approved'
      || profile.world_revision_id !== worldRevisionId
      || !APPROVAL_FIELDS.every((key) => typeof profile.approval?.[key]
        === 'string' && profile.approval[key].length > 0)) return null;
  if (!validPostActionPerceptionProfile(profile, {
    expectedProfileId: TARGET_POST_ACTION_PERCEPTION_PROFILE_ID
  })) perceptionProfileGap();
  return freeze(profile);
}

/** Finite-only policy stays separate from generic ordinary/Stage B admission. */
const CANONICAL_FINITE_FILE = 'data/world-catalogs/novgorod/m2c-items/canonical-finite-applicability.json';

export async function loadTargetFiniteFirstEntryProfile({ rootDir = process.cwd(), worldRevisionId, verifiedCatalog,
  canonicalFiniteApplicabilityPath = resolve(rootDir, CANONICAL_FINITE_FILE) } = {}) {
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
  const capacityApproval = JSON.parse(await read(`${root}/live-world-runtime-v17/capacity-v2-start-successors/data-approval.json`));
  const sceneTemplateBytes = await read(capacityApproval.source_pins?.scene_templates?.path);
  const materializationProfileBytes = await read(capacityApproval.source_pins?.materialization_profiles?.path);
  return freeze({ schema: 'rus.live_world_runtime.target_finite_first_entry_profile.v1',
    world_revision_id: worldRevisionId, candidate_sha256: hash(baseBytes),
    catalog_pin: verifiedCatalog.pin, profile: stageB.profile,
    canonicalNaturalApplicability: readApprovedCanonicalFiniteApplicability(
      JSON.parse(await readFile(canonicalFiniteApplicabilityPath, 'utf8').catch(() => 'null')),
      worldRevisionId),
    stage_b_approval: stageB.receipt,
    naturalSourceAuthoring: { candidateBytes: itemBytes,
      approval: JSON.parse(await read(`${root}/m2c-items/approval-attestation.json`)),
      capacityApproval, sceneTemplateBytes, materializationProfileBytes },
    propertySourceAuthoring: { candidateBytes: propertyBytes,
      approval: JSON.parse(await read(`${root}/m2c-items/property-context-approval.json`)),
      sourceBytesByPath: Object.fromEntries(sources), capacityApproval, sceneTemplateBytes,
      materializationProfileBytes } });
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

function bodyNeedsGap() {
  throw serverError('SPATIAL_V3_TARGET_BODY_NEEDS_PROFILE_REQUIRED',
    'Exact pending body-needs binding candidate and approved Temporal source profiles are required.',
    { status: 503 });
}

function perceptionProfileGap() {
  throw serverError('SPATIAL_V3_TARGET_POST_ACTION_PERCEPTION_PROFILE_INVALID',
    'Exact approved D66 post-action perception profile is required.',
    { status: 503 });
}

function o1Gap() {
  throw serverError('SPATIAL_V3_TARGET_O1_PROFILE_APPROVAL_REQUIRED',
    'Exact release-pinned O1 applicability and profile approvals are required.', { status: 503 });
}

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
