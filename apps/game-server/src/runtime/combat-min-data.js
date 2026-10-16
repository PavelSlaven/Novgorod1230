import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const DATA_DIR = 'data/world-catalogs/novgorod/live-world-runtime-v17/combat-min-data-v1';
const BODY_PROFILE_SOURCE_SHA256 = 'dc1a53306ec363d49b9286221e13782cba25c651b489547aa9094a015e4cee01';
const BODY_PROFILE_SOURCE_COMMIT = 'feed71c2647b38e3ba4ab7bc613aa1483beaa774';
const BODY_PROFILE_POINTER = '/npc_decision/body_state_qualitative_context';
const BODY_PROFILE_ID = 'candidate.npc-body-state-description.v1';

/** Loads only the body profile covered by its scoped production approval. */
export async function loadCombatMinScopedBodyProfile(repositoryRoot) {
  const directory = resolve(repositoryRoot, DATA_DIR);
  let bundleBytes;
  let outerApproval;
  let scopedApproval;
  try {
    [bundleBytes, outerApproval, scopedApproval] = await Promise.all([
      readFile(resolve(directory, 'minimal-combat-bundle.candidate.json')),
      readJson(resolve(directory, 'combat-data-approval.json')),
      readJson(resolve(directory, 'body-bands-production-approval-7.json'))
    ]);
  } catch {
    throw scopedBodyApprovalGap();
  }

  if (createHash('sha256').update(bundleBytes).digest('hex')
        !== BODY_PROFILE_SOURCE_SHA256
      || !hasScopedBodyApproval(scopedApproval)
      || outerApproval?.approval_granted !== true
      || outerApproval?.verdict !== 'APPROVE_WITH_LIMITS'
      || outerApproval?.import_authorized !== false
      || outerApproval?.activation_authorized !== false
      || outerApproval?.production_authorized !== false) {
    throw scopedBodyApprovalGap();
  }

  let bundle;
  try {
    bundle = JSON.parse(bundleBytes.toString('utf8'));
  } catch {
    throw scopedBodyApprovalGap();
  }
  const qualitativeProfile = bundle.npc_decision?.body_state_qualitative_context;
  if (bundle.status !== 'candidate_not_approved'
      || bundle.production_usable !== false
      || qualitativeProfile?.status !== 'candidate_not_approved'
      || qualitativeProfile?.profile_id !== BODY_PROFILE_ID
      || qualitativeProfile?.version !== 1) {
    throw scopedBodyApprovalGap();
  }

  return Object.freeze({ qualitativeProfile,
    scopedProductionApproval: scopedApproval, mode: 'runtime' });
}

const MATERIALIZED_BODY_INIT_SHA256 = '208672c3b1faa36def01470e81dd517cc3417eec1c87f850ece8b321c2f361bf';

/** Builds the body-state owner DTO from the exact Opus-approved source bytes. */
export async function loadApprovedMaterializedNpcBodyInitializationProfile({
  readFileImpl = readFile
} = {}) {
  const path = new URL('../../../../data/world-catalogs/novgorod/live-world-runtime-v17/combat-min-data-v1/body-init-profile-source.json', import.meta.url);
  let bytes;
  let source;
  try {
    bytes = await readFileImpl(path);
    if (createHash('sha256').update(bytes).digest('hex')
        !== MATERIALIZED_BODY_INIT_SHA256) throw new Error('source digest mismatch');
    source = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw Object.assign(new Error('combat_actor_body_state_profile_gap'), {
      code: 'combat_actor_body_state_profile_gap'
    });
  }
  if (source?.candidate_status !== 'candidate_not_approved'
      || source.target_schema !== 'rus.body_state.initialization_profile.v1'
      || source.profile_id !== 'combat-min-materialized-npc-default-v1'
      || source.version !== 1 || source.selection_rule?.variants?.length !== 0
      || source.approval_state?.candidate_emission !== null) {
    throw Object.assign(new Error('combat_actor_body_state_profile_gap'), {
      code: 'combat_actor_body_state_profile_gap'
    });
  }
  return Object.freeze({ schema: source.target_schema, status: 'approved',
    profile_ref: structuredClone(source.profile_ref),
    initial_state: structuredClone(source.initial_state_proposal) });
}

/** Reads the approved authoring package without activating it in gameplay. */
export async function loadCombatMinDataPackage(repositoryRoot) {
  const directory = resolve(repositoryRoot, DATA_DIR);
  const [bundle, approval] = await Promise.all([
    readJson(resolve(directory, 'minimal-combat-bundle.candidate.json')),
    readJson(resolve(directory, 'combat-data-approval.json'))
  ]);
  if (approval.verdict !== 'APPROVE_WITH_LIMITS'
      || approval.approval_granted !== true
      || bundle.status !== 'candidate_not_approved'
      || bundle.production_usable !== false) {
    throw Object.assign(new Error('combat_min_data_approval_gap'), {
      code: 'combat_min_data_approval_gap'
    });
  }
  return Object.freeze({ bundle, approval,
    production_activation: productionActivation(bundle, approval) });
}

/** Returns only test fixtures and authoring bands for an explicit D65 probe. */
export function createCombatMinD65ProbeData(packageData) {
  if (!packageData || packageData.production_activation.enabled !== false
      || packageData.approval.import_authorized !== false
      || packageData.approval.activation_authorized !== false
      || packageData.approval.production_authorized !== false) {
    throw Object.assign(new Error('combat_min_d65_probe_gate_invalid'), {
      code: 'combat_min_d65_probe_gate_invalid'
    });
  }
  const bodyInitialization = packageData.bundle.execution?.health_transition
    ?.body_initialization?.owner_initialization_profile_adapter;
  const fixture = bodyInitialization?.test_only_approved_dto_fixture;
  if (fixture?.approval_fixture_only !== true
      || bodyInitialization.candidate_emission !== null) {
    throw Object.assign(new Error('combat_min_body_fixture_gap'), {
      code: 'combat_min_body_fixture_gap'
    });
  }
  const qualitativeProfile = packageData.bundle.npc_decision
    ?.body_state_qualitative_context;
  if (qualitativeProfile?.status !== 'candidate_not_approved') {
    throw Object.assign(new Error('combat_min_body_bands_gap'), {
      code: 'combat_min_body_bands_gap'
    });
  }
  return Object.freeze({ mode: 'D65_PROBE',
    bodyInitializationProfileFixture: fixture,
    qualitativeProfile,
    dataApproval: packageData.approval,
    productionActivationEnabled: false });
}

function productionActivation(bundle, approval) {
  const enabled = approval.import_authorized === true
    && approval.activation_authorized === true
    && approval.production_authorized === true
    && bundle.production_usable === true;
  return Object.freeze({ enabled,
    reason: enabled ? null : 'combat_min_production_activation_not_authorized' });
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function hasScopedBodyApproval(approval) {
  return approval?.schema === 'npc_body_qualitative_profile_scoped_approval_v1'
    && approval.repository === 'PavelSlaven/Novgorod1230'
    && approval.branch === 'fleet/combat-data'
    && approval.path === `${DATA_DIR}/minimal-combat-bundle.candidate.json`
    && approval.commit === BODY_PROFILE_SOURCE_COMMIT
    && approval.json_pointer === BODY_PROFILE_POINTER
    && approval.profile_id === BODY_PROFILE_ID
    && approval.version === 1
    && approval.verdict === 'APPROVE_WITH_LIMITS'
    && approval.approval_granted === true
    && approval.production_authorized === true
    && approval.import_authorized === false
    && approval.activation_authorized === false
    && approval.bundle_production_authorized === false
    && hasSupportedBodyScope(approval.approved_use);
}

function hasSupportedBodyScope(use) {
  return use?.actor === 'ordinary combat NPC only'
    && use.numeric_domain === 'finite JSON/JS number in [0,100], без округления и преобразования строки/bool'
    && Array.isArray(use.metrics)
    && use.metrics.length === 3
    && use.metrics[0] === 'health'
    && use.metrics[1] === 'energy'
    && use.metrics[2] === 'satiety'
    && Array.isArray(use.intervals)
    && use.intervals.length === 3
    && use.intervals[0] === '[0,30)'
    && use.intervals[1] === '[30,70)'
    && use.intervals[2] === '[70,100]'
    && Array.isArray(use.owner_projection_output)
    && use.owner_projection_output.length === 2
    && use.owner_projection_output[0] === 'metric'
    && use.owner_projection_output[1] === 'npc_description';
}

function scopedBodyApprovalGap() {
  return Object.assign(new Error('combat_min_scoped_body_profile_approval_gap'), {
    code: 'combat_min_scoped_body_profile_approval_gap'
  });
}
