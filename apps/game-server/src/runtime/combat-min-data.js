import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const DATA_DIR = 'data/world-catalogs/novgorod/live-world-runtime-v17/combat-min-data-v1';

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
