import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { posix, resolve, win32 } from 'node:path';
import { pathToFileURL } from 'node:url';

const FREEZE = (value) => Object.freeze(value);
const SCHEMA = 'rus.temporal-world-v4.data-readiness.v1';
const ASSESSMENT_SCHEMA = 'rus.temporal-world-v4.data-readiness-assessment.v1';
const APPROVAL_SCHEMA = 'rus.temporal-world-v4.data-family-approval.v1';
const EXTERNAL_DECISION_SCHEMA =
  'rus.temporal-world-v4.external-auditor-family-decision.v1';
const EXISTING_STATUSES = FREEZE(['absent', 'partial', 'complete']);
const APPROVAL_ARTIFACTS = FREEZE([
  'dataset',
  'provenance',
  'normalized_references',
  'source_history',
  'deterministic_import',
  'generated_schema'
]);
const TEMPORAL_DATA_ROOT = 'data/world-catalogs/novgorod/temporal-v4/';
const EXTERNAL_DECISION_ROOT =
  'docs/work/temporal-world-v4/external-data-audit/decisions/';

export const TEMPORAL_DATA_READINESS_PATH =
  'docs/work/temporal-world-v4/data-readiness.v1.json';

export const TEMPORAL_REQUIRED_DATA_FAMILIES = FREEZE([
  FREEZE({ id: 'calendar_daylight_light_profiles', name: 'calendar/daylight/light profiles', gap_codes: FREEZE(['time_calendar_profile_gap']) }),
  FREEZE({ id: 'activity_categories_profiles', name: 'activity categories and profiles', gap_codes: FREEZE(['activity_profile_gap']) }),
  FREEZE({ id: 'activity_execution_policies', name: 'progress/resource/participant/continuation/interruption/completion/same-time policies', gap_codes: FREEZE(['activity_policy_gap']) }),
  FREEZE({ id: 'body_time_effect_profiles_thresholds', name: 'body time-effect profiles and thresholds', gap_codes: FREEZE(['event_effect_gap']) }),
  FREEZE({ id: 'npc_temporal_profiles_policies', name: 'NPC schedules, activities, perception and decision policies', gap_codes: FREEZE(['npc_schedule_gap', 'npc_decision_policy_gap', 'perception_policy_gap']) }),
  FREEZE({ id: 'exact_event_profiles', name: 'exact timer/event/trigger/effect profiles', gap_codes: FREEZE(['event_rule_gap', 'event_effect_gap']) }),
  FREEZE({ id: 'place_access_schedules', name: 'place access schedules', gap_codes: FREEZE(['spatial_candidate_gap']) }),
  FREEZE({ id: 'weather_transition_profiles_processes', name: 'weather transition profiles/processes', gap_codes: FREEZE(['weather_profile_gap']) }),
  FREEZE({ id: 'historical_phase_local_effect_rules', name: 'historical phase/local-effect rules', gap_codes: FREEZE(['historical_phase_rule_gap']) }),
  FREEZE({ id: 'traversal_recheck_contracts', name: 'traversal recheck contracts', gap_codes: FREEZE(['spatial_candidate_gap']) }),
  FREEZE({ id: 'propagation_profiles', name: 'propagation profiles', gap_codes: FREEZE(['propagation_rule_gap']) }),
  FREEZE({ id: 'remote_catch_up_rules', name: 'remote catch-up rules', gap_codes: FREEZE(['remote_catch_up_rule_gap']) }),
  FREEZE({ id: 'carrier_synchronization_rescue_recovery_policies', name: 'carrier synchronization and rescue/recovery policies', gap_codes: FREEZE(['spatial_candidate_gap']) })
]);

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function repositoryPath(value) {
  return nonEmptyString(value) &&
    !value.includes('\0') &&
    !value.includes('\\') &&
    !win32.isAbsolute(value) &&
    !posix.isAbsolute(value) &&
    !/^[a-z]:/iu.test(value) &&
    value.split('/').every((part) => part && part !== '.' && part !== '..') &&
    posix.normalize(value) === value;
}

function validStringArray(value, { paths = false, allowEmpty = false } = {}) {
  return Array.isArray(value) &&
    (allowEmpty || value.length > 0) &&
    new Set(value).size === value.length &&
    value.every(paths ? repositoryPath : nonEmptyString);
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function isDigest(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

function sameStrings(left, right) {
  return validStringArray(left) &&
    validStringArray(right) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function sameStringSet(left, right) {
  return validStringArray(left) &&
    validStringArray(right) &&
    left.length === right.length &&
    left.every((value) => right.includes(value));
}

function validateFamily(family, required, errors) {
  const issue = (code, details = {}) =>
    errors.push(FREEZE({ code, family_id: required.id, ...details }));

  if (family?.id !== required.id || family?.dataset_profile_family !== required.name) {
    issue('temporal_data_readiness_family_identity_invalid');
    return;
  }
  if (!EXISTING_STATUSES.includes(family.existing_status)) {
    issue('temporal_data_readiness_existing_status_invalid');
  }
  if (typeof family.approved !== 'boolean') {
    issue('temporal_data_readiness_approval_status_invalid');
  }
  if (!nonEmptyString(family.owner)) {
    issue('temporal_data_readiness_owner_missing');
  }
  if (!validStringArray(family.import_paths, { paths: true, allowEmpty: true })) {
    issue('temporal_data_readiness_import_paths_invalid');
  }
  if (!validStringArray(family.tests, { paths: true })) {
    issue('temporal_data_readiness_tests_invalid');
  }
  if (!validStringArray(family.evidence_paths, { paths: true })) {
    issue('temporal_data_readiness_evidence_paths_invalid');
  }
  if (!Array.isArray(family.blockers)) {
    issue('temporal_data_readiness_blockers_invalid');
    return;
  }

  if (family.approved === true) {
    if (family.existing_status !== 'complete' || family.blockers.length !== 0 ||
        !validStringArray(family.import_paths, { paths: true })) {
      issue('temporal_data_readiness_approved_state_invalid');
    }
    const approval = family.approval;
    if (approval?.status !== 'approved' || !nonEmptyString(approval?.version) ||
        !validStringArray(approval?.applicability) ||
        !repositoryPath(approval?.manifest_path) ||
        !approval.manifest_path.startsWith(`${TEMPORAL_DATA_ROOT}approvals/`) ||
        !approval.manifest_path.endsWith('.json') ||
        !isDigest(approval?.manifest_sha256)) {
      issue('temporal_data_readiness_approval_evidence_invalid');
    }
    return;
  }

  if (family.approval !== null) {
    issue('temporal_data_readiness_unapproved_evidence_forbidden');
  }
  if (family.blockers.length === 0) {
    issue('temporal_data_readiness_blocker_missing');
  }
  const seenCodes = new Set();
  for (const blocker of family.blockers) {
    if (!required.gap_codes.includes(blocker?.code) ||
        !nonEmptyString(blocker?.reason) ||
        seenCodes.has(blocker?.code)) {
      issue('temporal_data_readiness_blocker_invalid', {
        gap_code: blocker?.code ?? 'missing'
      });
    }
    seenCodes.add(blocker?.code);
  }
}

export function assessTemporalDataReadiness(manifest) {
  const errors = [];
  const issue = (code, details = {}) => errors.push(FREEZE({ code, ...details }));

  if (manifest?.schema !== SCHEMA || manifest?.version !== 1) {
    issue('temporal_data_readiness_manifest_schema_invalid');
  }
  if (!repositoryPath(manifest?.normative_source)) {
    issue('temporal_data_readiness_normative_source_invalid');
  }

  const families = manifest?.families;
  const exactCoverage = Array.isArray(families) &&
    families.length === TEMPORAL_REQUIRED_DATA_FAMILIES.length &&
    new Set(families.map((family) => family?.id)).size ===
      TEMPORAL_REQUIRED_DATA_FAMILIES.length &&
    TEMPORAL_REQUIRED_DATA_FAMILIES.every((required, index) =>
      families[index]?.id === required.id);
  if (!exactCoverage) {
    issue('temporal_data_readiness_family_coverage_invalid');
  } else {
    for (let index = 0; index < families.length; index += 1) {
      validateFamily(families[index], TEMPORAL_REQUIRED_DATA_FAMILIES[index], errors);
    }
  }

  const allApproved = exactCoverage && families.every((family) => family.approved === true);
  const expectedStatus = allApproved ? 'ready' : 'blocked';
  if (manifest?.activation_status !== expectedStatus) {
    issue('temporal_data_readiness_activation_status_invalid', {
      expected_status: expectedStatus
    });
  }

  const blockers = exactCoverage
    ? families.flatMap((family) => family.approved === false
      ? family.blockers.map((blocker) => FREEZE({
        family_id: family.id,
        dataset_profile_family: family.dataset_profile_family,
        existing_status: family.existing_status,
        gap_code: blocker.code,
        reason: blocker.reason
      }))
      : [FREEZE({
        family_id: family.id,
        dataset_profile_family: family.dataset_profile_family,
        existing_status: family.existing_status,
        gap_code: 'temporal_data_approval_evidence_unverified',
        reason: 'Approval metadata has not been verified against repository bytes.'
      })])
    : [];
  const valid = errors.length === 0;

  return FREEZE({
    schema: ASSESSMENT_SCHEMA,
    valid,
    activation_ready: false,
    errors: FREEZE(errors),
    blockers: FREEZE(blockers)
  });
}

function allowedArtifactPath(kind, path) {
  if (!repositoryPath(path)) return false;
  if (kind === 'dataset' || kind === 'normalized_references') {
    return path.startsWith(`${TEMPORAL_DATA_ROOT}datasets/`) && path.endsWith('.json');
  }
  if (kind === 'provenance' || kind === 'source_history') {
    return path.startsWith(`${TEMPORAL_DATA_ROOT}source-approval/`) && path.endsWith('.json');
  }
  if (kind === 'deterministic_import') {
    return path === 'tools/temporal-v4/import-approved-data.mjs';
  }
  return kind === 'generated_schema' && path === 'infra/world-base/SCHEMA_REFERENCE.md';
}

function parseArray(bytes) {
  try {
    const value = JSON.parse(Buffer.from(bytes).toString('utf8'));
    return Array.isArray(value) && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function exactIdCoverage(rows, field, ids) {
  return Array.isArray(rows) &&
    new Set(rows.map((row) => row?.[field])).size === rows.length &&
    rows.length === ids.length &&
    ids.every((id) => rows.some((row) => row?.[field] === id));
}

async function verifyFamilyApproval(family, readRepositoryFile) {
  const errors = [];
  const issue = (code, details = {}) =>
    errors.push(FREEZE({ code, family_id: family.id, ...details }));
  const approval = family.approval;
  let approvalBytes;
  let approvalManifest;
  try {
    approvalBytes = Buffer.from(await readRepositoryFile(approval.manifest_path));
    approvalManifest = JSON.parse(approvalBytes.toString('utf8'));
  } catch {
    issue('temporal_data_readiness_approval_manifest_invalid');
    return errors;
  }
  if (digest(approvalBytes) !== approval.manifest_sha256 ||
      approvalManifest?.schema !== APPROVAL_SCHEMA ||
      approvalManifest?.version !== 1 ||
      approvalManifest?.family_id !== family.id ||
      approvalManifest?.status !== 'approved' ||
      approvalManifest?.record_version !== approval.version ||
      !sameStrings(approvalManifest?.applicability, approval.applicability) ||
      !validStringArray(approvalManifest?.record_ids) ||
      !Array.isArray(approvalManifest?.data_gaps) ||
      approvalManifest.data_gaps.length !== 0) {
    issue('temporal_data_readiness_approval_manifest_invalid');
    return errors;
  }

  const externalDecision = approvalManifest.external_audit_decision;
  if (!repositoryPath(externalDecision?.path) ||
      !externalDecision.path.startsWith(EXTERNAL_DECISION_ROOT) ||
      !externalDecision.path.endsWith('.decision.json') ||
      !isDigest(externalDecision?.sha256) ||
      !nonEmptyString(externalDecision?.decision_id)) {
    issue('temporal_data_readiness_external_decision_invalid');
    return errors;
  }

  const artifacts = approvalManifest.artifacts;
  const artifactPaths = APPROVAL_ARTIFACTS.map((kind) => artifacts?.[kind]?.path);
  if (!artifacts || Object.keys(artifacts).length !== APPROVAL_ARTIFACTS.length ||
      new Set(artifactPaths).size !== APPROVAL_ARTIFACTS.length ||
      APPROVAL_ARTIFACTS.some((kind) =>
        !allowedArtifactPath(kind, artifacts[kind]?.path) ||
        !isDigest(artifacts[kind]?.sha256))) {
    issue('temporal_data_readiness_approval_artifact_invalid');
    return errors;
  }
  if (family.import_paths.length !== 1 ||
      family.import_paths[0] !== artifacts.deterministic_import.path) {
    issue('temporal_data_readiness_import_binding_invalid');
  }

  const artifactBytes = {};
  await Promise.all(APPROVAL_ARTIFACTS.map(async (kind) => {
    try {
      const bytes = Buffer.from(await readRepositoryFile(artifacts[kind].path));
      if (digest(bytes) !== artifacts[kind].sha256) {
        issue('temporal_data_readiness_approval_artifact_digest_mismatch', {
          artifact_kind: kind
        });
      } else {
        artifactBytes[kind] = bytes;
      }
    } catch {
      issue('temporal_data_readiness_approval_artifact_missing', {
        artifact_kind: kind
      });
    }
  }));
  if (errors.length > 0) return errors;

  const records = parseArray(artifactBytes.dataset);
  const provenance = parseArray(artifactBytes.provenance);
  const references = parseArray(artifactBytes.normalized_references);
  const history = parseArray(artifactBytes.source_history);
  if (!records || !provenance || !references || !history ||
      !exactIdCoverage(records, 'record_id', approvalManifest.record_ids)) {
    issue('temporal_data_readiness_approval_records_invalid');
    return errors;
  }

  let decision;
  try {
    const bytes = Buffer.from(await readRepositoryFile(externalDecision.path));
    if (digest(bytes) !== externalDecision.sha256) {
      issue('temporal_data_readiness_external_decision_digest_mismatch');
      return errors;
    }
    decision = JSON.parse(bytes.toString('utf8'));
  } catch {
    issue('temporal_data_readiness_external_decision_missing_or_invalid');
    return errors;
  }

  const provenanceIds = new Set(provenance.map((row) => row?.provenance_id));
  const referenceIds = new Set(references.map((row) => row?.reference_id));
  const sourceIds = new Set(history.map((row) => row?.source_id));
  if (decision?.schema !== EXTERNAL_DECISION_SCHEMA ||
      decision?.version !== 1 ||
      decision?.family_id !== family.id ||
      decision?.verdict !== 'approved' ||
      decision?.decision_id !== externalDecision.decision_id ||
      !sameStrings(decision?.applicability, approval.applicability) ||
      !Array.isArray(decision?.data_gaps) ||
      decision.data_gaps.length !== 0 ||
      !sameStringSet(decision?.approved_record_ids, approvalManifest.record_ids) ||
      !sameStringSet(decision?.source_ids_reviewed, [...sourceIds])) {
    issue('temporal_data_readiness_external_decision_invalid');
    return errors;
  }
  if (provenanceIds.size !== provenance.length ||
      referenceIds.size !== references.length ||
      sourceIds.size !== history.length ||
      provenance.some((row) => !nonEmptyString(row?.provenance_id) ||
        row?.status !== 'approved' ||
        row?.decision_id !== externalDecision.decision_id ||
        !validStringArray(row?.source_ids) ||
        row.source_ids.some((id) => !sourceIds.has(id))) ||
      references.some((row) => !nonEmptyString(row?.reference_id) ||
        row?.status !== 'approved' ||
        !nonEmptyString(row?.table) ||
        !nonEmptyString(row?.record_id)) ||
      history.some((row) => !nonEmptyString(row?.source_id) ||
        row?.status !== 'approved' ||
        !repositoryPath(row?.source_path) ||
        !row.source_path.startsWith(`${TEMPORAL_DATA_ROOT}sources/`) ||
        !isDigest(row?.source_sha256)) ||
      records.some((row) => row?.family_id !== family.id ||
        row?.status !== 'approved' ||
        row?.version !== approval.version ||
        !sameStrings(row?.applicability, approval.applicability) ||
        !validStringArray(row?.provenance_refs) ||
        row.provenance_refs.some((id) => !provenanceIds.has(id)) ||
        !validStringArray(row?.normalized_reference_ids) ||
        row.normalized_reference_ids.some((id) => !referenceIds.has(id)) ||
        !validStringArray(row?.source_history_refs) ||
        row.source_history_refs.some((id) => !sourceIds.has(id)))) {
    issue('temporal_data_readiness_approval_references_invalid');
    return errors;
  }

  await Promise.all(history.map(async (row) => {
    try {
      const bytes = Buffer.from(await readRepositoryFile(row.source_path));
      if (digest(bytes) !== row.source_sha256) {
        issue('temporal_data_readiness_source_digest_mismatch', {
          source_id: row.source_id
        });
      }
    } catch {
      issue('temporal_data_readiness_source_missing', {
        source_id: row.source_id
      });
    }
  }));
  return errors;
}

export async function assessTemporalDataReadinessForActivation(
  manifest,
  {
    root = process.cwd(),
    readRepositoryFile = (path) => readFile(resolve(root, path))
  } = {}
) {
  const structural = assessTemporalDataReadiness(manifest);
  if (!structural.valid || !Array.isArray(manifest?.families)) return structural;

  const approvedFamilies = manifest.families.filter((family) => family.approved === true);
  const familyErrorSets = await Promise.all(
    approvedFamilies.map((family) => verifyFamilyApproval(family, readRepositoryFile))
  );
  const evidenceErrors = familyErrorSets.flat();
  const invalidFamilyIds = new Set(evidenceErrors.map(({ family_id }) => family_id));
  const verifiedFamilyIds = new Set(approvedFamilies
    .filter((family) => !invalidFamilyIds.has(family.id))
    .map((family) => family.id));
  const blockers = [
    ...structural.blockers.filter((blocker) =>
      blocker.gap_code !== 'temporal_data_approval_evidence_unverified' ||
      !verifiedFamilyIds.has(blocker.family_id)),
    ...[...invalidFamilyIds].map((familyId) => FREEZE({
      family_id: familyId,
      dataset_profile_family: manifest.families.find((family) => family.id === familyId)
        ?.dataset_profile_family,
      existing_status: 'complete',
      gap_code: 'temporal_data_approval_evidence_invalid',
      reason: 'Approved family evidence failed repository byte or semantic validation.'
    }))
  ];
  const allApproved = manifest.families.length === TEMPORAL_REQUIRED_DATA_FAMILIES.length &&
    manifest.families.every((family) => family.approved === true);
  const errors = [...structural.errors, ...evidenceErrors];
  return FREEZE({
    schema: ASSESSMENT_SCHEMA,
    valid: errors.length === 0,
    activation_ready: errors.length === 0 && allApproved &&
      verifiedFamilyIds.size === TEMPORAL_REQUIRED_DATA_FAMILIES.length,
    errors: FREEZE(errors),
    blockers: FREEZE(blockers)
  });
}

if (process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let assessment;
  try {
    const manifest = JSON.parse(await readFile(
      resolve(process.cwd(), TEMPORAL_DATA_READINESS_PATH),
      'utf8'
    ));
    assessment = await assessTemporalDataReadinessForActivation(manifest);
  } catch {
    assessment = FREEZE({
      schema: ASSESSMENT_SCHEMA,
      valid: false,
      activation_ready: false,
      errors: FREEZE([FREEZE({
        code: 'temporal_data_readiness_manifest_missing_or_invalid'
      })]),
      blockers: FREEZE([])
    });
  }
  console.log(JSON.stringify(assessment, null, 2));
  if (!assessment.activation_ready) process.exitCode = 1;
}
