import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { canonicalJson, canonicalJsonBytes } from './p12-canonical-manifest.mjs';

export const CONTENT_ROOT = 'data/world-catalogs/novgorod/first-playable-v1';
export const CONTENT_MANIFEST_PATH = `${CONTENT_ROOT}/manifest.json`;
const CATALOG_PATH = `${CONTENT_ROOT}/catalog.json`;
const SCENARIO_PATH = `${CONTENT_ROOT}/scenario.json`;
const APPROVAL_REQUEST_PATH =
  'docs/implementation/item-container-120-approval-audit/evidence/FINAL_APPROVAL_REQUEST.json';
const APPROVAL_ATTESTATION_PATH =
  'docs/implementation/item-container-120-approval-audit/evidence/FINAL_APPROVAL_ATTESTATION.json';
const PROMOTION_PATH =
  'docs/implementation/item-container-120-approval-audit/evidence/STAGE3C_PROMOTION_RESULT.json';
const SPATIAL_AUTHORING_PATH =
  'data/world-catalogs/novgorod/spatial-v3/candidates/spatial-v3-production-v2/datasets/spatial_v3_authoring_versions.json';
const ITEM_TEMPLATES_PATH =
  'data/knowledge-source/imports/item-container-120-v5/candidate/tables/item_templates.json';
const ITEM_QUANTITY_PROFILES_PATH =
  'data/knowledge-source/imports/item-container-120-v5/candidate/tables/item_template_quantity_profiles.json';
const READINESS_PATH =
  'docs/implementation/lower-dvina-first-playable/evidence/first_playable_content_readiness_manifest.v1.json';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const digest = (value) => sha256(Buffer.from(canonicalJson(value), 'utf8'));
const uniqueStrings = (value) =>
  Array.isArray(value) &&
  value.length > 0 &&
  new Set(value).size === value.length &&
  value.every((entry) => typeof entry === 'string' && entry.length > 0);

async function json(root, repositoryPath) {
  return JSON.parse(await readFile(resolve(root, repositoryPath), 'utf8'));
}

function collectTemplateRefs(catalog) {
  const refs = [];
  for (const profile of Object.values(catalog.character_candidate_sets ?? {})) {
    for (const equipment of profile.equipment_profile_candidates ?? []) {
      refs.push(
        ...(equipment.clothing_template_refs ?? []),
        ...(equipment.owned_item_template_refs ?? []),
        ...(equipment.owned_container_template_refs ?? [])
      );
    }
  }
  return [...new Set(refs)].sort();
}

function characterTupleCount(candidateSet, requiredFields) {
  if (!candidateSet) return 0;
  return requiredFields.reduce((count, field) => {
    const candidates = candidateSet[field];
    return count * (Array.isArray(candidates) ? candidates.length : 0);
  }, 1);
}

function resolveActivityProfile(catalog, context) {
  const applicable = (catalog.activity_profiles ?? []).filter((profile) => {
    if (profile.category !== context.category) return false;
    return Object.entries(profile.applicability ?? {}).every(([key, expected]) =>
      Object.hasOwn(context, key) &&
      canonicalJson(context[key]) === canonicalJson(expected));
  });
  if (applicable.length === 0) {
    return { status: 'activity_profile_gap', reason: 'no_applicable_profile', candidates: [] };
  }
  const highest = Math.max(...applicable.map(({ priority }) => priority));
  const candidates = applicable.filter(({ priority }) => priority === highest);
  if (candidates.length !== 1) {
    return {
      status: 'activity_policy_gap',
      reason: 'ambiguous_most_specific_profile',
      candidates: candidates.map(({ activity_profile_id }) => activity_profile_id)
    };
  }
  return {
    status: 'resolved',
    profile_id: candidates[0].activity_profile_id,
    candidate_count: 1
  };
}

export async function assessFirstPlayableContent(root = process.cwd()) {
  const errors = [];
  const issue = (code, details = {}) => errors.push({ code, ...details });
  const [
    catalog,
    scenario,
    approvalRequest,
    approvalAttestation,
    promotion,
    authoringVersions,
    itemTemplates,
    itemQuantityProfiles
  ] = await Promise.all([
    json(root, CATALOG_PATH),
    json(root, SCENARIO_PATH),
    json(root, APPROVAL_REQUEST_PATH),
    json(root, APPROVAL_ATTESTATION_PATH),
    json(root, PROMOTION_PATH),
    json(root, SPATIAL_AUTHORING_PATH),
    json(root, ITEM_TEMPLATES_PATH),
    json(root, ITEM_QUANTITY_PROFILES_PATH)
  ]);

  if (catalog.schema !== 'rus.first_playable.content_catalog.v1' ||
      catalog.catalog_id !== 'lower_dvina_first_playable_content_v1' ||
      catalog.version !== 1) {
    issue('content_catalog_identity_invalid');
  }
  if (scenario.schema !== 'rus.game_scenario.v1' ||
      scenario.scenario_id !== 'lower_dvina_late_summer_open_water_v1' ||
      scenario.version !== 1 ||
      scenario.runtime_input?.kind !== 'scenario_id_only') {
    issue('scenario_identity_invalid');
  }
  if (scenario.scenario_action_policy !== null ||
      Object.hasOwn(scenario, 'fixed_duration_minutes')) {
    issue('scenario_action_policy_forbidden');
  }
  if (scenario.content_catalog_ref !== `${catalog.catalog_id}@${catalog.version}` ||
      scenario.season_mode !== catalog.applicability?.season_mode ||
      scenario.player_profile_set_ref !== 'player_boatman') {
    issue('scenario_catalog_binding_invalid');
  }

  const sourceEvidence = [];
  for (const binding of catalog.source_bindings ?? []) {
    if (binding.status !== 'approved' || typeof binding.path !== 'string') {
      issue('source_binding_invalid', { source_id: binding.source_id });
      continue;
    }
    try {
      const bytes = await readFile(resolve(root, binding.path));
      sourceEvidence.push({
        source_id: binding.source_id,
        path: binding.path,
        sha256: sha256(bytes)
      });
    } catch {
      issue('source_binding_unreadable', { source_id: binding.source_id });
    }
  }

  const promotionDecision = approvalAttestation.decision === 'approve_all_120' &&
    approvalAttestation.activation_authorized === false &&
    promotion.first_apply?.target_revision_status === 'approved' &&
    promotion.first_apply?.all_dataset_readbacks_passed === true &&
    promotion.runtime_e2e?.pass === true &&
    promotion.activation_performed === false &&
    promotion.candidate_digest === approvalAttestation.candidate_digest;
  if (!promotionDecision) issue('item_container_promotion_evidence_invalid');

  const approvedTemplateIds = new Set(approvalRequest.template_ids ?? []);
  const templateRefs = collectTemplateRefs(catalog);
  for (const templateRef of templateRefs) {
    if (!approvedTemplateIds.has(templateRef)) {
      issue('template_not_in_approved_promotion', { template_ref: templateRef });
    }
  }
  const itemTemplateById = new Map(
    itemTemplates.map((record) => [record.id, record])
  );
  const quantityProfileById = new Map(
    itemQuantityProfiles.map((record) => [record.id, record])
  );
  for (const [profileSetId, profileSet] of Object.entries(
    catalog.character_candidate_sets ?? {}
  )) {
    for (const equipment of profileSet.equipment_profile_candidates ?? []) {
      const expectedItemTemplates = new Set([
        ...(equipment.clothing_template_refs ?? []),
        ...(equipment.owned_item_template_refs ?? [])
      ]);
      const allocations = equipment.initial_item_allocations ?? [];
      if (allocations.length !== expectedItemTemplates.size ||
          new Set(allocations.map(({ slot_id }) => slot_id)).size !==
            allocations.length) {
        issue('equipment_item_allocation_set_invalid', { profile_set_id: profileSetId });
      }
      for (const allocation of allocations) {
        const template = itemTemplateById.get(allocation.template_id);
        const quantityProfile =
          quantityProfileById.get(allocation.quantity_profile_id);
        const candidates = allocation.quantity_candidates;
        if (!expectedItemTemplates.has(allocation.template_id) ||
            !template ||
            template.category_id !== allocation.category_id ||
            quantityProfile?.item_template_id !== allocation.template_id ||
            !Array.isArray(candidates) ||
            candidates.length === 0 ||
            candidates.some(({ quantity, unit_id }) =>
              !Number.isInteger(quantity) ||
              quantity < quantityProfile.minimum_quantity ||
              quantity > quantityProfile.maximum_quantity ||
              unit_id !== quantityProfile.quantity_unit_id)) {
          issue('equipment_item_allocation_invalid', {
            profile_set_id: profileSetId,
            slot_id: allocation.slot_id
          });
        }
      }
      const expectedContainers = new Set(
        equipment.owned_container_template_refs ?? []
      );
      const containerAllocations =
        equipment.initial_container_allocations ?? [];
      if (containerAllocations.length !== expectedContainers.size ||
          new Set(containerAllocations.map(({ slot_id }) => slot_id)).size !==
            containerAllocations.length ||
          containerAllocations.some((allocation) =>
            !expectedContainers.has(allocation.template_id) ||
            !Array.isArray(allocation.count_candidates) ||
            allocation.count_candidates.length === 0 ||
            allocation.count_candidates.some((count) =>
              !Number.isInteger(count) || count < 1))) {
        issue('equipment_container_allocation_set_invalid', {
          profile_set_id: profileSetId
        });
      }
    }
  }

  const playerTupleCount = characterTupleCount(
    catalog.character_candidate_sets?.player_boatman,
    [
      'role_candidates',
      'occupation_candidates',
      'skill_profile_candidates',
      'name_candidates',
      'language_profile_candidates',
      'knowledge_profile_candidates',
      'body_profile_candidates',
      'equipment_profile_candidates'
    ]
  );
  const npcTupleCount = characterTupleCount(
    catalog.character_candidate_sets?.scene_fisher,
    [
      'role_candidates',
      'occupation_candidates',
      'name_candidates',
      'language_profile_candidates',
      'knowledge_profile_candidates',
      'equipment_profile_candidates'
    ]
  );
  if (playerTupleCount < 1) issue('player_compatible_tuple_empty');
  if (npcTupleCount < 1) issue('npc_compatible_tuple_empty');

  const transport = catalog.transport_contracts?.[0];
  if (!transport ||
      !transport.transport_category_ref ||
      !transport.transport_template_ref ||
      !uniqueStrings(transport.movement_capability_refs) ||
      !transport.capacity_policy ||
      !transport.control_requirements ||
      !uniqueStrings(transport.route_applicability) ||
      transport.interior_topology !== 'forbidden') {
    issue('transport_contract_incomplete');
  }

  const contexts = [
    {
      key: 'talk',
      category: 'conversation',
      addressed_scene_npc_required: true
    },
    {
      key: 'collect_water',
      category: 'collect_resource',
      resource_quality: 'untested_surface_water',
      quantity: { numerator: 1000, denominator: 1, unit: 'millilitre' },
      container_required: true
    },
    {
      key: 'collect_deadwood',
      category: 'collect_resource',
      resource_kind: 'fallen_deadwood',
      quantity: { numerator: 1, denominator: 1, unit: 'bundle' }
    },
    {
      key: 'assist_net',
      category: 'perform_simple_work',
      occupation_context: 'fishing_water',
      required_participant_role: 'nov_role_fisher'
    },
    {
      key: 'rest',
      category: 'rest',
      rest_place_required: true
    }
  ];
  const activityResolution = Object.fromEntries(contexts.map(({ key, ...context }) => [
    key,
    resolveActivityProfile(catalog, context)
  ]));
  for (const [context, resolution] of Object.entries(activityResolution)) {
    if (resolution.status !== 'resolved') issue('activity_profile_resolution_failed', {
      context,
      reason: resolution.reason
    });
  }

  const authoringIndex = new Map(authoringVersions.map((entry) => [
    entry.entity_id,
    entry
  ]));
  const canonicalG5Ids = Object.values(catalog.local_scene_slots ?? {})
    .map(({ canonical_g5_id }) => canonical_g5_id)
    .filter(Boolean);
  for (const canonicalG5Id of new Set(canonicalG5Ids)) {
    if (!authoringIndex.has(canonicalG5Id)) {
      issue('canonical_g5_missing_from_v2_snapshot', { canonical_g5_id: canonicalG5Id });
    }
  }
  const scenarioStartId = scenario.start_canonical_g5_ref?.split('@')[0];
  const startVersion = Number(scenario.start_canonical_g5_ref?.split('@')[1]);
  const startAuthoring = authoringIndex.get(scenarioStartId);
  if (!startAuthoring || startAuthoring.version !== startVersion) {
    issue('scenario_start_exact_pin_invalid');
  }

  if (catalog.boundary_capability?.status !== 'blocked' ||
      !uniqueStrings(catalog.boundary_capability?.typed_gaps) ||
      catalog.boundary_capability?.fallback !== 'forbidden') {
    issue('boundary_gate_invalid');
  }

  const manifestWithoutDigest = {
    schema: 'rus.first_playable.content_manifest.v1',
    version: 1,
    catalog_id: catalog.catalog_id,
    catalog_version: catalog.version,
    catalog_status: catalog.status,
    scenario_id: scenario.scenario_id,
    scenario_version: scenario.version,
    scenario_status: scenario.status,
    source_evidence: sourceEvidence,
    item_container_promotion: {
      decision: approvalAttestation.decision,
      candidate_digest: approvalAttestation.candidate_digest,
      target_world_revision_id: approvalRequest.target_revision?.id,
      referenced_template_ids: templateRefs,
      referenced_template_set_digest: digest(templateRefs)
    },
    candidate_sets: {
      player_boatman: {
        compatible_tuple_count: playerTupleCount,
        digest: digest(catalog.character_candidate_sets?.player_boatman)
      },
      scene_fisher: {
        compatible_tuple_count: npcTupleCount,
        digest: digest(catalog.character_candidate_sets?.scene_fisher)
      }
    },
    activity_profile_resolution: activityResolution,
    transport_contract_digest: digest(transport),
    capabilities: {
      local_scene: {
        status: errors.length === 0 && catalog.status === 'approved' &&
          scenario.status === 'approved' ? 'ready' : 'blocked',
        blocking_gaps: errors.length > 0
          ? [...new Set(errors.map(({ code }) => code))].sort()
          : catalog.status === 'approved' && scenario.status === 'approved'
            ? []
            : ['content_approval_pending']
      },
      boundary_crossing: {
        status: 'blocked',
        blocking_gaps: catalog.boundary_capability?.typed_gaps ?? []
      }
    },
    fallback_policy: 'forbidden',
    llm_repair: 'forbidden'
  };
  const manifest = {
    ...manifestWithoutDigest,
    canonical_digest: digest(manifestWithoutDigest)
  };
  return {
    valid: errors.length === 0,
    errors,
    manifest
  };
}

export async function writeFirstPlayableContentManifest(root = process.cwd()) {
  const assessment = await assessFirstPlayableContent(root);
  if (!assessment.valid) return assessment;
  await writeFile(resolve(root, CONTENT_MANIFEST_PATH), canonicalJsonBytes(assessment.manifest));
  const readiness = await json(root, READINESS_PATH);
  const catalogBytes = await readFile(resolve(root, CATALOG_PATH));
  const scenarioBytes = await readFile(resolve(root, SCENARIO_PATH));
  const catalog = JSON.parse(catalogBytes);
  const scenario = JSON.parse(scenarioBytes);
  const retainedScopes = readiness.scopes.filter(({ scope_key }) =>
    !['first_playable_character_profiles', 'first_playable_scenario'].includes(scope_key.id));
  const generatedScopes = [
    {
      scope_key: {
        kind: 'first_playable_character_profiles',
        id: 'first_playable_character_profiles'
      },
      source_path: CATALOG_PATH,
      registry_type: 'first_playable_content_catalog',
      stable_ids: ['player_boatman', 'scene_fisher'],
      version: '1',
      source_sha256: sha256(catalogBytes),
      approval_status: 'approved',
      applicability: [
        'region_novgorod_land',
        '1230-1250',
        'late_summer_open_water',
        catalog.applicability.host_g4_id
      ],
      candidate_count:
        assessment.manifest.candidate_sets.player_boatman.compatible_tuple_count +
        assessment.manifest.candidate_sets.scene_fisher.compatible_tuple_count,
      compatible_tuple_count:
        assessment.manifest.candidate_sets.player_boatman.compatible_tuple_count +
        assessment.manifest.candidate_sets.scene_fisher.compatible_tuple_count,
      candidate_set_digest: digest(assessment.manifest.candidate_sets),
      blocking_gaps: []
    },
    {
      scope_key: {
        kind: 'scenario',
        id: 'first_playable_scenario'
      },
      source_path: SCENARIO_PATH,
      registry_type: 'game_scenario',
      stable_ids: [assessment.manifest.scenario_id],
      version: '1',
      source_sha256: sha256(scenarioBytes),
      approval_status: 'approved',
      applicability: [
        'region_novgorod_land',
        'late_summer_open_water',
        'local_scene'
      ],
      candidate_count: 1,
      compatible_tuple_count: 1,
      candidate_set_digest: digest(scenario),
      blocking_gaps: []
    }
  ];
  const nextReadiness = {
    ...readiness,
    capabilities: {
      ...readiness.capabilities,
      local_scene: { status: 'ready', blocking_gaps: [] }
    },
    scopes: [...retainedScopes, ...generatedScopes],
    unresolved_required_scopes: [
      'directed_boundary_segments',
      'boundary_check_policy',
      'boundary_risk_policy',
      'boundary_consequence_policy'
    ]
  };
  await writeFile(resolve(root, READINESS_PATH), canonicalJsonBytes(nextReadiness));
  return assessment;
}

async function main() {
  const write = process.argv.includes('--write');
  const rootArgument = process.argv.slice(2).find((argument) => !argument.startsWith('--'));
  const root = resolve(rootArgument ?? process.cwd());
  const assessment = write
    ? await writeFirstPlayableContentManifest(root)
    : await assessFirstPlayableContent(root);
  process.stdout.write(`${JSON.stringify(assessment, null, 2)}\n`);
  if (!assessment.valid) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
