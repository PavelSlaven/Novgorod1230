import {
  frameFromHistoricalFrame,
  getAllowedStatuses,
  getRetrieverQueryable,
  makeAudit
} from './common.js';

const DEFAULT_POLICY = Object.freeze({
  target_candidates_min: 20,
  target_candidates_max: 120,
  include_background_profiles: true,
  include_scene_profiles: true,
  include_key_seeds: true,
  do_not_materialize_npcs: true,
  require_social_role: true,
  require_occupation_when_applicable: true,
  require_archetype: true,
  require_name_pool_for_named_npc: true,
  allow_unnamed_background_npc: true,
  require_place_template_match: true,
  require_time_of_day_match: true,
  require_season_match: true,
  require_sources: true,
  reject_rejected_or_conflict_records: true,
  allow_usable_with_caution: true
});

const FORBIDDEN_OUTPUT_KEYS = Object.freeze([
  'npc_id',
  'name',
  'npc_name',
  'current_action',
  'npc_current_action',
  'secret',
  'hidden_motive',
  'hidden_state',
  'relationship_to_player',
  'inventory',
  'dialogue',
  'visible_scene',
  'intro_prose'
]);

const REJECTED_STATUSES = new Set(['rejected', 'conflict']);
const DAY_TIMES = new Set(['morning', 'day']);
const NIGHT_TIMES = new Set(['evening', 'night', 'deep_night']);

export async function retrieveNpcCandidates(input = {}, deps = {}) {
  const requestId = input.request_id ?? input.requestId ?? null;
  const frame = frameFromHistoricalFrame(input.historical_frame);
  const policy = { ...DEFAULT_POLICY, ...(input.npc_candidate_policy ?? {}) };
  const statuses = getAllowedStatuses(policy);
  const concerns = [];
  const evidence = [];

  if (!frame.region_id) {
    return blockedOutput({ requestId, frame, concerns: [concern('NPC_CANDIDATE_REGION_MISMATCH', 'historical_frame.region.region_id is required.')], evidence });
  }
  if (frame.year == null) {
    concerns.push(concern('NPC_CANDIDATE_SCHEMA_MISMATCH', 'historical_frame.year.value is required.'));
  }
  if (!frame.season) {
    concerns.push(concern('NPC_CANDIDATE_SCHEMA_MISMATCH', 'historical_frame.calendar.season is required.'));
  }
  if (!frame.clock || Object.keys(frame.clock).length === 0) {
    concerns.push(concern('NPC_CANDIDATE_SCHEMA_MISMATCH', 'historical_frame.clock is required.'));
  }

  const upstreamConcerns = validateUpstreamInputs(input);
  concerns.push(...upstreamConcerns);
  if (input.candidate_place_template_set?.selection_status !== 'ready') {
    concerns.push(concern('NPC_CANDIDATE_PLACE_TEMPLATE_MISMATCH', 'candidate_place_template_set.selection_status must be ready before Stage 7 runs.'));
  }

  if (concerns.length > 0) {
    return blockedOutput({ requestId, frame, concerns, evidence });
  }

  if (deps.queryable == null) {
    const error = new Error('NPC_CANDIDATE_QUERYABLE_MISSING');
    error.code = 'NPC_CANDIDATE_QUERYABLE_MISSING';
    throw error;
  }

  const db = getRetrieverQueryable(deps);
  const regional = input.regional_context_package ?? {};
  const npcContext = regional.npc_context ?? {};
  const actorProfiles = resolveActorProfileSnapshot(input, frame);
  if (actorProfiles.concerns.length > 0) {
    return blockedOutput({ requestId, frame, concerns: actorProfiles.concerns, evidence });
  }

  const [roles, occupations, archetypes, namePools, keySeeds, regionArchetypeLinks] = await Promise.all([
    loadRoles({ db, regional, regionId: frame.region_id, statuses, policy }),
    loadOccupations({ db, regional, regionId: frame.region_id, statuses, policy }),
    loadNpcArchetypes({ db, npcContext, regionId: frame.region_id, statuses, policy }),
    loadNamePools({ db, npcContext, regionId: frame.region_id, statuses, policy }),
    loadKeySeeds({ db, npcContext, regionId: frame.region_id, year: frame.year, statuses, policy }),
    loadRegionArchetypeLinks({ db, npcContext, regionId: frame.region_id, statuses, policy })
  ]);

  evidence.push({
    kind: 'stage7_world_base_read',
    region_id: frame.region_id,
    retrieved_social_role_count: roles.length,
    retrieved_occupation_count: occupations.length,
    retrieved_npc_archetype_count: archetypes.length,
    retrieved_name_pool_count: namePools.length,
    retrieved_key_npc_seed_count: keySeeds.length,
    retrieved_region_npc_archetype_link_count: regionArchetypeLinks.length,
    actor_profile_snapshot_digest: actorProfiles.snapshot?.catalog_digest ?? null
  });

  const missingConcerns = [];
  if (policy.require_social_role && roles.length === 0) {
    missingConcerns.push(concern('NPC_CANDIDATE_SOCIAL_ROLE_NOT_FOUND', 'No allowed region_social_roles were available for Stage 7.'));
  }
  if (policy.require_archetype && archetypes.length === 0) {
    missingConcerns.push(concern('NPC_CANDIDATE_ARCHETYPE_NOT_FOUND', 'No allowed npc_archetypes were available for Stage 7.'));
  }
  const templateLinks = normalizeTemplateLinks(input.candidate_place_template_set?.candidate_template_links ?? []);
  if (templateLinks.length === 0) {
    missingConcerns.push(concern('NPC_CANDIDATE_PLACE_TEMPLATE_MISMATCH', 'No candidate_place_template_set links were available for Stage 7.'));
  }
  if (missingConcerns.length > 0) {
    return blockedOutput({ requestId, frame, concerns: missingConcerns, evidence });
  }

  const hardConstraints = normalizeHardConstraints(input.normalized_request?.hard_constraints);
  const indexes = buildIndexes({ roles, occupations, archetypes, namePools, keySeeds, templateLinks, regionArchetypeLinks });
  const candidates = [];
  const rejected = [];
  const max = Math.max(1, Number(policy.target_candidates_max ?? DEFAULT_POLICY.target_candidates_max));
  const maxRejected = Math.max(max * 4, 80);

  for (const role of roles) {
    const roleStatusConcern = validateRecordBasics(role, 'world_base.region_social_roles', frame.region_id, policy);
    if (roleStatusConcern) {
      pushRejected(rejected, maxRejected, buildRejected({ role, code: roleStatusConcern.code, reason: roleStatusConcern.message, evidence: [role.id] }));
      continue;
    }

    const roleOccupations = compatibleOccupationsForRole(role, occupations, policy);
    const occupationChoices = roleOccupations.length > 0
      ? roleOccupations
      : (policy.allow_unnamed_background_npc ? [null] : []);

    if (occupationChoices.length === 0) {
      pushRejected(rejected, maxRejected, buildRejected({
        role,
        code: 'NPC_CANDIDATE_OCCUPATION_NOT_FOUND',
        reason: `No occupation compatible with social_role_id=${role.id}.`,
        evidence: [`social_role_id=${role.id}`]
      }));
      continue;
    }

    for (const occupation of occupationChoices) {
      if (occupation) {
        const occupationStatusConcern = validateRecordBasics(occupation, 'world_base.region_occupations', frame.region_id, policy);
        if (occupationStatusConcern) {
          pushRejected(rejected, maxRejected, buildRejected({
            role,
            occupation,
            code: occupationStatusConcern.code,
            reason: occupationStatusConcern.message,
            evidence: [occupation.id]
          }));
          continue;
        }
        if (!isOccupationCompatibleWithRole(occupation, role)) {
          pushRejected(rejected, maxRejected, buildRejected({
            role,
            occupation,
            code: 'NPC_CANDIDATE_SOCIAL_ROLE_OCCUPATION_MISMATCH',
            reason: `occupation_id=${occupation.id} is not compatible with social_role_id=${role.id}.`,
            evidence: [`occupation.required/allowed_social_roles does not contain ${role.id}`]
          }));
          continue;
        }
      }

      for (const archetype of archetypes) {
        if (candidates.length >= max) break;

        const archetypeStatusConcern = validateArchetypeBasics(archetype, frame.region_id, regionArchetypeLinks, policy);
        if (archetypeStatusConcern) {
          pushRejected(rejected, maxRejected, buildRejected({
            role,
            occupation,
            archetype,
            code: archetypeStatusConcern.code,
            reason: archetypeStatusConcern.message,
            evidence: [archetype.id]
          }));
          continue;
        }

        const profileLevel = normalizeProfileLevel(archetype.profile_level_default ?? archetype.profile_level ?? archetype.default_profile_level);
        if (!isProfileLevelAllowed(profileLevel, policy)) continue;

        if (!isArchetypeCompatibleWithRole(archetype, role)) {
          pushRejected(rejected, maxRejected, buildRejected({
            role,
            occupation,
            archetype,
            code: 'NPC_CANDIDATE_ARCHETYPE_SOCIAL_ROLE_MISMATCH',
            reason: `npc_archetype_id=${archetype.id} is not compatible with social_role_id=${role.id}.`,
            evidence: [`archetype.allowed_social_role_ids excludes ${role.id}`]
          }));
          continue;
        }

        if (!isArchetypeCompatibleWithOccupation(archetype, occupation)) {
          pushRejected(rejected, maxRejected, buildRejected({
            role,
            occupation,
            archetype,
            code: 'NPC_CANDIDATE_ARCHETYPE_OCCUPATION_MISMATCH',
            reason: `npc_archetype_id=${archetype.id} is not compatible with occupation_id=${occupation?.id ?? 'null'}.`,
            evidence: [`archetype.allowed_occupation_ids excludes ${occupation?.id ?? 'null'}`]
          }));
          continue;
        }

        const placeCompatibility = getPlaceCompatibility({ role, occupation, archetype, templateLinks, regional });
        if (policy.require_place_template_match && placeCompatibility.allowed_candidate_place_template_link_ids.length === 0) {
          pushRejected(rejected, maxRejected, buildRejected({
            role,
            occupation,
            archetype,
            code: 'NPC_CANDIDATE_PLACE_TEMPLATE_MISMATCH',
            reason: 'No candidate_place_template_set link is compatible with the NPC role/occupation/archetype.',
            evidence: [`role=${role.id}`, `occupation=${occupation?.id ?? 'null'}`, `archetype=${archetype.id}`]
          }));
          continue;
        }

        const timeAndSeason = getTimeAndSeasonCompatibility({ role, occupation, archetype, frame });
        if (policy.require_time_of_day_match && !timeAndSeason.time_of_day_match) {
          pushRejected(rejected, maxRejected, buildRejected({
            role,
            occupation,
            archetype,
            code: 'NPC_CANDIDATE_TIME_OF_DAY_CONFLICT',
            reason: `Candidate is not compatible with time_of_day=${frame.clock?.time_of_day ?? 'unknown'}.`,
            evidence: timeAndSeason.clock_warnings
          }));
          continue;
        }
        if (policy.require_season_match && !timeAndSeason.season_match) {
          pushRejected(rejected, maxRejected, buildRejected({
            role,
            occupation,
            archetype,
            code: 'NPC_CANDIDATE_SEASON_CONFLICT',
            reason: `Candidate is not compatible with season=${frame.season ?? 'unknown'}.`,
            evidence: timeAndSeason.season_warnings
          }));
          continue;
        }

        const hardConstraintConcern = getHardConstraintConflict({ role, occupation, archetype, hardConstraints });
        if (hardConstraintConcern) {
          pushRejected(rejected, maxRejected, buildRejected({
            role,
            occupation,
            archetype,
            code: 'NPC_CANDIDATE_PLAYER_HARD_CONSTRAINT_CONFLICT',
            reason: hardConstraintConcern.message,
            evidence: hardConstraintConcern.evidence
          }));
          continue;
        }

        const sourceEntries = buildCandidateSourceTrace({ role, occupation, archetype, namePools: [], keySeed: null });
        if (policy.require_sources && sourceEntries.some((entry) => entry.source_ids.length === 0)) {
          pushRejected(rejected, maxRejected, buildRejected({
            role,
            occupation,
            archetype,
            code: 'NPC_CANDIDATE_SOURCE_MISSING',
            reason: 'A required world_base record has an empty sources list.',
            evidence: sourceEntries.filter((entry) => entry.source_ids.length === 0).map((entry) => `${entry.table}:${entry.record_id}`)
          }));
          continue;
        }

        const compatibleNamePools = getCompatibleNamePools({ role, occupation, namePools, regionId: frame.region_id, policy });
        const baseRequiresNamePool = profileLevel !== 'background' && policy.require_name_pool_for_named_npc;
        if (baseRequiresNamePool && compatibleNamePools.length === 0) {
          pushRejected(rejected, maxRejected, buildRejected({
            role,
            occupation,
            archetype,
            code: 'NPC_CANDIDATE_NAME_POOL_NOT_FOUND',
            reason: `No compatible npc_name_pool for ${profileLevel} candidate.`,
            evidence: [`social_role_id=${role.id}`, `occupation_id=${occupation?.id ?? 'null'}`]
          }));
          continue;
        }

        const baseCandidate = buildCandidate({
          index: candidates.length + 1,
          role,
          occupation,
          archetype,
          profileLevel,
          placeCompatibility,
          namePools: compatibleNamePools,
          timeAndSeason,
          keySeed: null,
          policy,
          hardConstraints,
          frame,
          actorProfiles
        });

        if (baseCandidate.score.value < 30) {
          pushRejected(rejected, maxRejected, buildRejected({
            role,
            occupation,
            archetype,
            code: 'NPC_CANDIDATE_PLACE_TEMPLATE_MISMATCH',
            reason: 'Candidate scoring fell below the reject threshold.',
            evidence: baseCandidate.score.score_penalties
          }));
          continue;
        }

        candidates.push(baseCandidate);

        if (policy.include_key_seeds && candidates.length < max) {
          const matchingSeeds = getCompatibleKeySeeds({ keySeeds, role, occupation, archetype, placeCompatibility, frame });
          for (const keySeed of matchingSeeds) {
            if (candidates.length >= max) break;
            const seedStatusConcern = validateRecordBasics(keySeed, 'world_base.key_npc_seeds', frame.region_id, policy);
            if (seedStatusConcern) {
              pushRejected(rejected, maxRejected, buildRejected({
                role,
                occupation,
                archetype,
                keySeed,
                code: seedStatusConcern.code,
                reason: seedStatusConcern.message,
                evidence: [keySeed.id]
              }));
              continue;
            }
            const keyCandidate = buildCandidate({
              index: candidates.length + 1,
              role,
              occupation,
              archetype,
              profileLevel: 'key_seed',
              placeCompatibility,
              namePools: compatibleNamePools,
              timeAndSeason,
              keySeed,
              policy,
              hardConstraints,
              frame,
              actorProfiles
            });
            if (policy.require_name_pool_for_named_npc && compatibleNamePools.length === 0) {
              pushRejected(rejected, maxRejected, buildRejected({
                role,
                occupation,
                archetype,
                keySeed,
                code: 'NPC_CANDIDATE_NAME_POOL_NOT_FOUND',
                reason: 'No compatible npc_name_pool for key seed candidate.',
                evidence: [`key_npc_seed_id=${keySeed.id}`]
              }));
              continue;
            }
            candidates.push(keyCandidate);
          }
        }
      }
    }
  }

  const selectedCandidates = candidates.slice(0, max);
  const noAllowedConcern = selectedCandidates.length === 0 ? [concern(
    'NO_ALLOWED_NPC_CANDIDATES',
    'No allowed NPC candidates survived Stage 7 hard gates. Do not ask LLM to invent NPCs; return to place/start candidate selection or relax soft preferences only.'
  )] : [];

  const output = {
    version: 1,
    schema: 'npc_candidate_set',
    request_id: requestId,
    ...(actorProfiles.snapshot ? {
      world_revision_id: actorProfiles.snapshot.world_revision_id,
      actor_profile_catalog_digest: actorProfiles.snapshot.catalog_digest,
      actor_profile_snapshot: structuredClone(actorProfiles.snapshot),
      appearance_contract_version: 'actor_base_appearance_v1',
      require_complete_actor_appearance: true
    } : {}),
    selection_status: selectedCandidates.length > 0 ? 'ready' : 'empty',
    frame,
    summary: {
      npc_candidate_count: selectedCandidates.length,
      background_candidate_count: selectedCandidates.filter((item) => item.profile_level === 'background').length,
      scene_candidate_count: selectedCandidates.filter((item) => item.profile_level === 'scene').length,
      key_seed_candidate_count: selectedCandidates.filter((item) => item.profile_level === 'key_seed').length,
      rejected_candidate_count: rejected.length + noAllowedConcern.length
    },
    npc_candidates: selectedCandidates,
    rejected_npc_candidates: noAllowedConcern.length > 0
      ? [...rejected, buildRejected({ code: 'NO_ALLOWED_NPC_CANDIDATES', reason: noAllowedConcern[0].message, evidence: ['npc_candidates.length=0'] })]
      : rejected,
    npc_candidate_groups: buildGroups(selectedCandidates),
    name_pool_index: buildNamePoolIndex(namePools, selectedCandidates),
    downstream_constraints: {
      must_choose_from_npc_candidate_ids: selectedCandidates.map((candidate) => candidate.npc_candidate_id),
      must_preserve: [
        'region_id',
        'year',
        'season',
        'clock',
        'npc_candidate_id',
        'npc_archetype_id',
        'social_role_id',
        'occupation_id',
        'candidate_place_template_link_ids',
        ...(actorProfiles.snapshot ? [
          'actor_profile_snapshot',
          'demographic_profile_entries',
          'appearance_profile_entries',
          'equipment_profile_refs'
        ] : [])
      ],
      must_not_create_yet: [
        'npc_id',
        'npc_name',
        'name',
        'current_action',
        'hidden_motive',
        'relationship_to_player',
        'inventory',
        'dialogue',
        'visible_scene',
        'intro_prose'
      ],
      must_resolve_later: [
        'which_npcs_are_materialized',
        'npc_g5_anchor_position',
        'npc_current_action',
        'npc_visibility',
        'npc_memory_profile'
      ]
    },
    source_trace: buildSetSourceTrace(selectedCandidates),
    audit: makeAudit(noAllowedConcern.length === 0, noAllowedConcern, [
      ...evidence,
      {
        kind: 'stage7_hard_gate',
        message: 'NPC candidates were built only from world_base references and approved upstream context; no concrete NPC was materialized.'
      },
      {
        kind: 'stage7_forbidden_fields_check',
        forbidden_fields_absent: FORBIDDEN_OUTPUT_KEYS
      }
    ])
  };

  const validation = validateNpcCandidateSet(output, { policy });
  if (!validation.pass) {
    output.audit = makeAudit(false, mergeConcerns(output.audit.concerns, validation.concerns), mergeEvidence(output.audit.evidence, validation.evidence));
    if (output.selection_status === 'ready') output.selection_status = 'requires_repair';
  }

  return output;
}

export function validateNpcCandidateSet(output = {}, { policy = DEFAULT_POLICY } = {}) {
  policy = { ...DEFAULT_POLICY, ...(policy ?? {}) };
  const concerns = [];
  const evidence = [];

  if (output?.version !== 1 || output?.schema !== 'npc_candidate_set') {
    concerns.push(concern('NPC_CANDIDATE_SCHEMA_MISMATCH', 'Stage 7 output must have version=1 and schema="npc_candidate_set".'));
  }
  if (!['ready', 'empty', 'blocked', 'requires_repair'].includes(output?.selection_status)) {
    concerns.push(concern('NPC_CANDIDATE_SCHEMA_MISMATCH', 'selection_status must be ready, empty, blocked, or requires_repair.'));
  }

  const forbiddenHits = findForbiddenKeys(output);
  for (const hit of forbiddenHits) {
    concerns.push(concern(errorCodeForForbiddenKey(hit.key), `Stage 7 output contains forbidden materialized NPC field: ${hit.path}.`, { field: hit.path }));
  }

  const candidates = Array.isArray(output?.npc_candidates) ? output.npc_candidates : [];
  if (output?.selection_status === 'ready' && candidates.length === 0) {
    concerns.push(concern('NO_ALLOWED_NPC_CANDIDATES', 'selection_status=ready requires at least one npc_candidate.'));
  }

  const seen = new Set();
  for (const candidate of candidates) {
    if (!candidate?.npc_candidate_id || seen.has(candidate.npc_candidate_id)) {
      concerns.push(concern('NPC_CANDIDATE_SCHEMA_MISMATCH', `Invalid or duplicate npc_candidate_id: ${candidate?.npc_candidate_id ?? 'null'}.`));
    }
    seen.add(candidate?.npc_candidate_id);

    if (!candidate?.social_role?.social_role_id) {
      concerns.push(concern('NPC_CANDIDATE_SOCIAL_ROLE_NOT_FOUND', `${candidate?.npc_candidate_id ?? 'candidate'} has no social_role.social_role_id.`));
    }
    if (policy.require_archetype && !candidate?.npc_archetype?.npc_archetype_id) {
      concerns.push(concern('NPC_CANDIDATE_ARCHETYPE_NOT_FOUND', `${candidate?.npc_candidate_id ?? 'candidate'} has no npc_archetype.npc_archetype_id.`));
    }
    if (!candidate?.place_compatibility?.allowed_candidate_place_template_link_ids?.length) {
      concerns.push(concern('NPC_CANDIDATE_PLACE_TEMPLATE_MISMATCH', `${candidate?.npc_candidate_id ?? 'candidate'} has no allowed_candidate_place_template_link_ids.`));
    }
    if (candidate?.time_and_season_compatibility?.season_match !== true) {
      concerns.push(concern('NPC_CANDIDATE_SEASON_CONFLICT', `${candidate?.npc_candidate_id ?? 'candidate'} is not season-compatible.`));
    }
    if (candidate?.time_and_season_compatibility?.time_of_day_match !== true) {
      concerns.push(concern('NPC_CANDIDATE_TIME_OF_DAY_CONFLICT', `${candidate?.npc_candidate_id ?? 'candidate'} is not time-of-day-compatible.`));
    }
    if (candidate?.profile_level === 'background' && candidate?.name_pool_compatibility?.allowed_name_pool_ids?.length === 0 && policy.allow_unnamed_background_npc !== true) {
      concerns.push(concern('NPC_CANDIDATE_NAME_POOL_NOT_FOUND', `${candidate.npc_candidate_id} is unnamed background but policy does not allow unnamed background NPC candidates.`));
    }
    if (['scene', 'key_seed'].includes(candidate?.profile_level) && policy.require_name_pool_for_named_npc && candidate?.name_pool_compatibility?.allowed_name_pool_ids?.length === 0) {
      concerns.push(concern('NPC_CANDIDATE_NAME_POOL_NOT_FOUND', `${candidate.npc_candidate_id} is ${candidate.profile_level} but has no compatible name pool.`));
    }
    if (candidate?.profile_level === 'key_seed' && !candidate?.key_seed?.key_npc_seed_id) {
      concerns.push(concern('NPC_CANDIDATE_KEY_SEED_NOT_FOUND', `${candidate.npc_candidate_id} is key_seed but has no key_npc_seed_id.`));
    }
    if (policy.require_sources && (!Array.isArray(candidate?.source_trace) || candidate.source_trace.length === 0)) {
      concerns.push(concern('NPC_CANDIDATE_SOURCE_MISSING', `${candidate?.npc_candidate_id ?? 'candidate'} has empty source_trace.`));
    }
    concerns.push(...validateActorProfileCandidate(candidate, output));
  }

  if (!output?.audit?.evidence || output.audit.evidence.length === 0) {
    concerns.push(concern('NPC_CANDIDATE_EMPTY_AUDIT_EVIDENCE', 'audit.evidence must not be empty.'));
  }
  if (output?.audit?.pass === false && (!output.audit.concerns || output.audit.concerns.length === 0)) {
    concerns.push(concern('NPC_CANDIDATE_SCHEMA_MISMATCH', 'audit.pass=false requires non-empty audit.concerns.'));
  }

  evidence.push({
    kind: 'npc_candidate_set_validation',
    checked_candidate_count: candidates.length,
    checked_forbidden_keys: FORBIDDEN_OUTPUT_KEYS,
    concern_count: concerns.length
  });

  return { pass: concerns.length === 0 && output?.audit?.pass === true, concerns, evidence };
}

async function loadRoles({ db, regional, regionId, statuses, policy }) {
  const existing = regional?.social_context?.roles;
  if (Array.isArray(existing) && existing.length > 0) return existing;
  if (!db) return [];
  return safeMany(db, `
    SELECT *
    FROM world_base.region_social_roles
    WHERE region_id = $1 AND status = ANY($2::text[])
    ORDER BY COALESCE(title, slug, id), id
  `, [regionId, statuses], policy);
}

async function loadOccupations({ db, regional, regionId, statuses, policy }) {
  const existing = regional?.occupation_context?.occupations;
  if (Array.isArray(existing) && existing.length > 0) return existing;
  if (!db) return [];
  return safeMany(db, `
    SELECT *
    FROM world_base.region_occupations
    WHERE region_id = $1 AND status = ANY($2::text[])
    ORDER BY COALESCE(title, slug, id), id
  `, [regionId, statuses], policy);
}

async function loadNpcArchetypes({ db, npcContext, regionId, statuses, policy }) {
  const existing = firstArray(npcContext, ['archetypes', 'npc_archetypes']);
  if (existing.length > 0) return existing;
  if (!db) return [];
  const rows = await safeMany(db, `
    SELECT *
    FROM world_base.npc_archetypes
    WHERE status = ANY($1::text[])
    ORDER BY COALESCE(title, slug, id), id
  `, [statuses], policy);
  return rows.filter((row) => row.region_id == null || row.region_id === regionId);
}

async function loadRegionArchetypeLinks({ db, npcContext, regionId, statuses, policy }) {
  const existing = firstArray(npcContext, ['region_npc_archetypes', 'region_archetype_links']);
  if (existing.length > 0) return existing;
  if (!db) return [];
  return safeMany(db, `
    SELECT *
    FROM world_base.region_npc_archetypes
    WHERE region_id = $1
      AND COALESCE(is_allowed, true) = true
      AND status = ANY($2::text[])
    ORDER BY COALESCE(npc_archetype_id, id), id
  `, [regionId, statuses], policy);
}

async function loadNamePools({ db, npcContext, regionId, statuses, policy }) {
  const existing = firstArray(npcContext, ['name_pools', 'npc_name_pools']);
  if (existing.length > 0) return existing;
  if (!db) return [];
  const rows = await safeMany(db, `
    SELECT *
    FROM world_base.npc_name_pools
    WHERE region_id = $1 AND status = ANY($2::text[])
    ORDER BY COALESCE(title, slug, id), id
  `, [regionId, statuses], policy);
  if (rows.length > 0) return rows;
  return safeMany(db, `
    SELECT *
    FROM world_base.name_pools
    WHERE region_id = $1 AND status = ANY($2::text[])
    ORDER BY COALESCE(title, slug, id), id
  `, [regionId, statuses], policy);
}

async function loadKeySeeds({ db, npcContext, regionId, year, statuses, policy }) {
  const existing = firstArray(npcContext, ['key_npc_seeds', 'key_seeds']);
  if (existing.length > 0) return existing.filter((seed) => isYearInSeedRange(seed, year));
  if (!db) return [];
  const rows = await safeMany(db, `
    SELECT *
    FROM world_base.key_npc_seeds
    WHERE region_id = $1 AND status = ANY($2::text[])
    ORDER BY COALESCE(title, slug, id), id
  `, [regionId, statuses], policy);
  return rows.filter((seed) => isYearInSeedRange(seed, year));
}

async function safeMany(db, sql, params, policy) {
  try {
    const { rows } = await db.query(sql, params);
    return rows ?? [];
  } catch (error) {
    if (policy?.throw_on_missing_stage7_tables === true) throw error;
    return [];
  }
}

function canQuery(deps = {}) {
  return Boolean(deps?.queryable || deps?.env);
}

function validateUpstreamInputs(input) {
  const concerns = [];
  const checks = [
    ['historical_frame', input.historical_frame],
    ['regional_context_package', input.regional_context_package],
    ['start_candidate_set', input.start_candidate_set],
    ['candidate_place_template_set', input.candidate_place_template_set]
  ];
  for (const [name, value] of checks) {
    if (!value) {
      concerns.push(concern('NPC_CANDIDATE_SCHEMA_MISMATCH', `${name} is required for Stage 7.`));
      continue;
    }
    if (value.audit && value.audit.pass !== true) {
      concerns.push(concern('NPC_CANDIDATE_SCHEMA_MISMATCH', `${name}.audit.pass must be true before Stage 7 runs.`));
    }
  }
  return concerns;
}

function buildIndexes({ roles, occupations, archetypes, namePools, keySeeds, templateLinks, regionArchetypeLinks }) {
  return {
    social_role_by_id: indexById(roles),
    occupation_by_id: indexById(occupations),
    npc_archetype_by_id: indexById(archetypes),
    name_pool_by_id: indexById(namePools),
    key_npc_seed_by_id: indexById(keySeeds),
    place_template_link_by_id: indexById(templateLinks, (link) => link.candidate_place_template_link_id),
    region_archetype_links_by_archetype_id: groupByKey(regionArchetypeLinks, (link) => link.npc_archetype_id ?? link.archetype_id)
  };
}

function compatibleOccupationsForRole(role, occupations, policy) {
  const explicitRoleOccupations = idSet(role.allowed_occupations ?? role.allowed_occupation_ids ?? role.occupation_ids);
  return occupations.filter((occupation) => {
    if (policy.require_occupation_when_applicable && occupation.is_generated_allowed === false) return false;
    if (explicitRoleOccupations.size > 0) return hasAnyId(explicitRoleOccupations, occupation);
    return isOccupationCompatibleWithRole(occupation, role);
  });
}

function isOccupationCompatibleWithRole(occupation, role) {
  if (!occupation) return true;
  const roleIds = idSet(occupation.required_social_roles ?? occupation.allowed_social_roles ?? occupation.social_role_ids);
  if (roleIds.size === 0) return true;
  return hasAnyId(roleIds, role);
}

function isArchetypeCompatibleWithRole(archetype, role) {
  const allowedRoleIds = idSet(archetype.allowed_social_role_ids ?? archetype.social_role_ids ?? archetype.required_social_role_ids);
  if (allowedRoleIds.size === 0) return true;
  return hasAnyId(allowedRoleIds, role);
}

function isArchetypeCompatibleWithOccupation(archetype, occupation) {
  const allowedOccupationIds = idSet(archetype.allowed_occupation_ids ?? archetype.occupation_ids ?? archetype.required_occupation_ids);
  if (allowedOccupationIds.size === 0) return true;
  if (!occupation) return false;
  return hasAnyId(allowedOccupationIds, occupation);
}

function validateRecordBasics(record, table, regionId, policy) {
  if (!record?.id) return concern(recordErrorCode(table, 'not_found'), `${table} record is missing id.`);
  if (policy.reject_rejected_or_conflict_records && REJECTED_STATUSES.has(record.status)) {
    return concern(record.status === 'conflict' ? 'NPC_CANDIDATE_CONFLICT_RECORD_USED' : 'NPC_CANDIDATE_REJECTED_RECORD_USED', `${table}:${record.id} has status=${record.status}.`);
  }
  if (record.region_id != null && record.region_id !== regionId) {
    return concern('NPC_CANDIDATE_REGION_MISMATCH', `${table}:${record.id} region_id=${record.region_id} does not match ${regionId}.`);
  }
  return null;
}

function validateArchetypeBasics(archetype, regionId, regionArchetypeLinks, policy) {
  const base = validateRecordBasics(archetype, 'world_base.npc_archetypes', archetype.region_id == null ? archetype.region_id : regionId, policy);
  if (base && base.code !== 'NPC_CANDIDATE_REGION_MISMATCH') return base;
  if (archetype.region_id != null && archetype.region_id !== regionId) {
    return concern('NPC_CANDIDATE_REGION_MISMATCH', `npc_archetypes:${archetype.id} region_id=${archetype.region_id} does not match ${regionId}.`);
  }
  if (archetype.region_id == null && regionArchetypeLinks.length > 0) {
    const hasLink = regionArchetypeLinks.some((link) => (link.npc_archetype_id ?? link.archetype_id) === archetype.id && link.region_id === regionId && link.is_allowed !== false);
    if (!hasLink) return concern('NPC_CANDIDATE_REGION_MISMATCH', `Global npc_archetype_id=${archetype.id} is not explicitly allowed by region_npc_archetypes.`);
  }
  return null;
}

function getPlaceCompatibility({ role, occupation, archetype, templateLinks, regional }) {
  const matches = [];
  for (const link of templateLinks) {
    const bases = [];
    const placeTemplateId = link.place_template_id;
    const placeKind = link.place_kind;
    const linkId = link.candidate_place_template_link_id;

    const archetypePlaces = idSet(archetype.typical_place_template_ids ?? archetype.allowed_place_template_ids ?? archetype.place_template_ids);
    const occupationPlaces = idSet(occupation?.typical_places ?? occupation?.required_location_types ?? occupation?.allowed_place_template_ids ?? occupation?.place_template_ids);
    const rolePlaces = idSet(role.allowed_places ?? role.typical_places ?? role.allowed_place_template_ids);

    if (archetypePlaces.size > 0 && setHasAny(archetypePlaces, [placeTemplateId, placeKind, linkId])) bases.push('archetype typical_place_template_ids match');
    if (occupationPlaces.size > 0 && setHasAny(occupationPlaces, [placeTemplateId, placeKind, linkId])) bases.push('occupation typical_places/required_location_types match');
    if (rolePlaces.size > 0 && setHasAny(rolePlaces, [placeTemplateId, placeKind, linkId])) bases.push('social_role allowed_places match');
    if (placeRuleAllowsNpcGeneration(regional, link, role, occupation, archetype)) bases.push('region_place_generation_rules npc_generation_rules match');

    if (bases.length === 0 && archetypePlaces.size === 0 && occupationPlaces.size === 0 && rolePlaces.size === 0) {
      bases.push('no hard place restriction in world_base role/occupation/archetype; candidate_place_template_set link preserved');
    }

    if (bases.length > 0) matches.push({ link, bases });
  }
  return {
    allowed_candidate_place_template_link_ids: [...new Set(matches.map((match) => match.link.candidate_place_template_link_id))],
    allowed_place_template_ids: [...new Set(matches.map((match) => match.link.place_template_id))],
    allowed_start_candidate_ids: [...new Set(matches.map((match) => match.link.candidate_id).filter(Boolean))],
    place_match_basis: [...new Set(matches.flatMap((match) => match.bases))]
  };
}

function placeRuleAllowsNpcGeneration(regional, link, role, occupation, archetype) {
  const rules = regional?.settlement_and_place_rules?.place_generation_rules ?? [];
  return rules.some((rule) => {
    if (rule.template_type && ![link.place_kind, link.place_template_id].includes(rule.template_type)) return false;
    const typicalRoles = idSet(rule.typical_social_roles);
    const typicalOccupations = idSet(rule.typical_occupations);
    if (typicalRoles.size > 0 && !hasAnyId(typicalRoles, role)) return false;
    if (typicalOccupations.size > 0 && occupation && !hasAnyId(typicalOccupations, occupation)) return false;
    const npcRules = rule.npc_generation_rules;
    if (!npcRules) return typicalRoles.size > 0 || typicalOccupations.size > 0;
    return JSON.stringify(npcRules).includes(archetype.id) || JSON.stringify(npcRules).includes(archetype.slug ?? archetype.id) || typicalRoles.size > 0 || typicalOccupations.size > 0;
  });
}

function getTimeAndSeasonCompatibility({ role, occupation, archetype, frame }) {
  const clockWarnings = [];
  const seasonWarnings = [];
  const timeOfDay = frame.clock?.time_of_day ?? null;
  const season = frame.season ?? null;

  const timePatterns = [
    ...patternList(role.time_of_day_rules ?? role.availability_rules ?? role.npc_generation_rules),
    ...patternList(occupation?.daily_pattern ?? occupation?.seasonal_or_daily_pattern ?? occupation?.work_rhythm ?? occupation?.availability_rules),
    ...patternList(archetype.time_of_day_rules ?? archetype.availability_rules ?? archetype.typical_presence_times)
  ];

  const seasonPatterns = [
    ...patternList(role.seasonal_rules ?? role.npc_generation_rules),
    ...patternList(occupation?.seasonal_pattern ?? occupation?.seasonal_rules ?? occupation?.seasonality),
    ...patternList(archetype.seasonal_limits ?? archetype.seasonal_rules ?? archetype.availability_rules)
  ];

  const timeMatch = patternCompatibleWithTime(timePatterns, timeOfDay, clockWarnings);
  const seasonMatch = patternCompatibleWithSeason(seasonPatterns, season, seasonWarnings);

  return {
    season_match: seasonMatch,
    time_of_day_match: timeMatch,
    clock_warnings: clockWarnings,
    season_warnings: seasonWarnings
  };
}

function patternCompatibleWithTime(patterns, timeOfDay, warnings) {
  if (!timeOfDay || patterns.length === 0) return true;
  const text = patterns.join(' ').toLowerCase();
  if (hasAnyWord(text, ['all_day', 'all day', 'any_time', 'any time', 'always'])) return true;
  if (text.includes(timeOfDay)) return true;
  if (hasAnyWord(text, ['daytime', 'day_time', 'market_day', 'working_day', 'day work']) && NIGHT_TIMES.has(timeOfDay)) {
    warnings.push(`time_of_day=${timeOfDay} conflicts with daytime-only availability.`);
    return false;
  }
  if (hasAnyWord(text, ['night_only', 'night watch', 'night_watch', 'deep night only']) && DAY_TIMES.has(timeOfDay)) {
    warnings.push(`time_of_day=${timeOfDay} conflicts with night-only availability.`);
    return false;
  }
  if (timeOfDay === 'deep_night' && hasAnyWord(text, ['market', 'trade day', 'public office', 'day crowd'])) {
    warnings.push('deep_night conflicts with public daytime occupation/archetype pattern.');
    return false;
  }
  return true;
}

function patternCompatibleWithSeason(patterns, season, warnings) {
  if (!season || patterns.length === 0) return true;
  const text = patterns.join(' ').toLowerCase();
  if (hasAnyWord(text, ['all_seasons', 'all seasons', 'year_round', 'year round', 'always'])) return true;
  if (text.includes(season)) return true;
  const explicitSeasons = ['spring', 'summer', 'autumn', 'winter'].filter((item) => text.includes(item));
  if (explicitSeasons.length > 0 && !explicitSeasons.includes(season)) {
    warnings.push(`season=${season} conflicts with seasonal pattern=${explicitSeasons.join(',')}.`);
    return false;
  }
  return true;
}

function getHardConstraintConflict({ role, occupation, archetype, hardConstraints }) {
  if (hardConstraints.size === 0) return null;
  const tags = new Set([
    role.role_group,
    role.status_group,
    role.legal_status,
    role.free_status,
    role.relation_to_power,
    role.relation_to_religion,
    occupation?.occupation_group,
    ...(listFrom(occupation?.typical_risks)),
    archetype.archetype_group,
    ...(listFrom(archetype.typical_interaction_modes)),
    ...(listFrom(archetype.typical_risk_profile))
  ].filter(Boolean).map((item) => String(item).toLowerCase()));

  const checks = [
    ['no_combat_start', ['warrior', 'guard', 'armed', 'combat', 'violence', 'military']],
    ['no_authority_start', ['authority', 'official', 'elite', 'ruler', 'manager', 'guard', 'power']],
    ['no_religious_start', ['clergy', 'religious', 'monastic', 'church', 'priest']],
    ['no_trade_start', ['merchant', 'trade', 'trader', 'market', 'commerce']],
    ['no_noble_environment', ['noble', 'elite', 'boyar', 'aristocratic', 'ruling']],
    ['no_family_start', ['family', 'household', 'kin', 'relative']]
  ];

  for (const [constraint, terms] of checks) {
    if (!hardConstraints.has(constraint)) continue;
    const matched = terms.filter((term) => [...tags].some((tag) => tag.includes(term)));
    if (matched.length > 0) {
      return {
        message: `Player hard constraint ${constraint} conflicts with NPC candidate tags: ${matched.join(', ')}.`,
        evidence: [`constraint=${constraint}`, `tags=${[...tags].join(',')}`]
      };
    }
  }
  return null;
}

function getCompatibleNamePools({ role, occupation, namePools, regionId, policy }) {
  return namePools.filter((pool) => {
    if (policy.reject_rejected_or_conflict_records && REJECTED_STATUSES.has(pool.status)) return false;
    if (pool.region_id != null && pool.region_id !== regionId) return false;
    const roleIds = idSet(pool.social_role_ids ?? pool.allowed_social_role_ids ?? pool.role_ids);
    const occupationIds = idSet(pool.occupation_ids ?? pool.allowed_occupation_ids);
    if (roleIds.size > 0 && !hasAnyId(roleIds, role)) return false;
    if (occupationIds.size > 0) {
      if (!occupation) return false;
      if (!hasAnyId(occupationIds, occupation)) return false;
    }
    return true;
  });
}

function getCompatibleKeySeeds({ keySeeds, role, occupation, archetype, placeCompatibility, frame }) {
  const placeTemplateIds = new Set(placeCompatibility.allowed_place_template_ids);
  const startCandidateIds = new Set(placeCompatibility.allowed_start_candidate_ids);
  return keySeeds.filter((seed) => {
    if (!isYearInSeedRange(seed, frame.year)) return false;
    if (seed.social_role_id && ![role.id, role.slug].includes(seed.social_role_id)) return false;
    if (seed.occupation_id && occupation && ![occupation.id, occupation.slug].includes(seed.occupation_id)) return false;
    if (seed.occupation_id && !occupation) return false;
    if (seed.npc_archetype_id && ![archetype.id, archetype.slug].includes(seed.npc_archetype_id)) return false;
    const seedPlaces = idSet(seed.allowed_place_template_ids ?? seed.place_template_ids);
    const seedNodes = idSet(seed.allowed_graph_node_ids ?? seed.allowed_node_ids);
    if (seedPlaces.size > 0 && !intersects(seedPlaces, placeTemplateIds)) return false;
    if (seedNodes.size > 0 && !intersects(seedNodes, startCandidateIds)) return false;
    return true;
  });
}

function buildCandidate({ index, role, occupation, archetype, profileLevel, placeCompatibility, namePools, timeAndSeason, keySeed, policy, hardConstraints, frame, actorProfiles }) {
  const sourceTrace = buildCandidateSourceTrace({ role, occupation, archetype, namePools, keySeed });
  const warnings = [
    ...timeAndSeason.clock_warnings,
    ...timeAndSeason.season_warnings
  ];
  if (profileLevel === 'background' && namePools.length === 0 && policy.allow_unnamed_background_npc) {
    warnings.push('Background candidate can remain unnamed at materialization.');
  }

  const gameFunctions = inferGameFunctions({ role, occupation, archetype, profileLevel, keySeed });
  const score = scoreCandidate({ role, occupation, archetype, placeCompatibility, namePools, timeAndSeason, warnings, keySeed, hardConstraints });

  const actorProfileBinding = buildActorProfileBinding(actorProfiles, role, occupation);
  return {
    npc_candidate_id: `npc_cand_${String(index).padStart(3, '0')}_${slug(archetype.id)}_${slug(role.id)}_${slug(occupation?.id ?? 'no_occupation')}${keySeed ? `_${slug(keySeed.id)}` : ''}`,
    candidate_status: score.value >= 50 ? 'allowed' : 'weak',
    profile_level: profileLevel,
    npc_archetype: {
      npc_archetype_id: archetype.id,
      slug: archetype.slug ?? null,
      title: archetype.title ?? archetype.summary ?? archetype.id,
      archetype_group: archetype.archetype_group ?? null,
      profile_level_default: normalizeProfileLevel(archetype.profile_level_default ?? archetype.profile_level ?? archetype.default_profile_level)
    },
    social_role: {
      social_role_id: role.id,
      slug: role.slug ?? null,
      title: role.title ?? role.summary ?? role.id,
      status_group: role.status_group ?? role.role_group ?? null,
      legal_status: role.legal_status ?? role.free_status ?? null,
      wealth_band: role.wealth_band ?? role.wealth_level ?? null
    },
    occupation: {
      occupation_id: occupation?.id ?? null,
      slug: occupation?.slug ?? null,
      title: occupation?.title ?? occupation?.summary ?? null,
      occupation_group: occupation?.occupation_group ?? null
    },
    place_compatibility: placeCompatibility,
    name_pool_compatibility: {
      can_be_named_later: namePools.length > 0,
      requires_name_at_materialization: profileLevel !== 'background',
      allowed_name_pool_ids: namePools.map((pool) => pool.id),
      can_remain_unnamed_background: profileLevel === 'background' && policy.allow_unnamed_background_npc === true
    },
    time_and_season_compatibility: timeAndSeason,
    game_function_candidates: gameFunctions,
    key_seed: {
      key_npc_seed_id: keySeed?.id ?? null,
      activation_conditions: listFrom(keySeed?.activation_conditions),
      allowed_as_key_candidate: Boolean(keySeed)
    },
    score,
    why_allowed: [
      'All referenced records exist in world_base or upstream approved context.',
      'Candidate is compatible with candidate_place_template_set.',
      'Candidate passed time-of-day, season, source, region and hard-constraint gates.',
      'Candidate does not materialize a concrete NPC.'
    ],
    warnings,
    source_trace: sourceTrace,
    ...(actorProfileBinding ?? {})
  };
}

function resolveActorProfileSnapshot(input, frame) {
  const snapshot = input.approved_actor_profile_snapshot ?? null;
  const required = input.npc_candidate_policy?.require_actor_base_appearance === true;
  if (snapshot == null) {
    return {
      snapshot: null,
      demographic: null,
      appearance: null,
      concerns: required
        ? [concern('NPC_ACTOR_PROFILE_SNAPSHOT_REQUIRED',
          'The activated actor_base_appearance_v1 contract requires an approved actor profile snapshot.')]
        : []
    };
  }
  const concerns = [];
  if (snapshot.version !== 1 || snapshot.schema !== 'approved_actor_profile_snapshot') {
    concerns.push(concern('NPC_ACTOR_PROFILE_SNAPSHOT_INVALID', 'approved_actor_profile_snapshot must use version 1.'));
  }
  if (snapshot.world_revision_id !== input.world_revision_id) {
    concerns.push(concern('NPC_ACTOR_PROFILE_REVISION_MISMATCH', 'Actor profile snapshot must preserve world_revision_id.'));
  }
  if (snapshot.region_id !== frame.region_id) {
    concerns.push(concern('NPC_ACTOR_PROFILE_REGION_MISMATCH', 'Actor profile snapshot must match historical_frame region.'));
  }
  if (!/^[a-f0-9]{64}$/u.test(String(snapshot.catalog_digest ?? ''))) {
    concerns.push(concern('NPC_ACTOR_PROFILE_SNAPSHOT_INVALID', 'Actor profile snapshot requires a SHA-256 catalog digest.'));
  }
  const demographic = snapshot.demographic_profiles ?? [];
  const appearance = snapshot.appearance_profiles ?? [];
  if (demographic.length === 0 && appearance.length === 0) {
    if (required) {
      concerns.push(concern('NPC_ACTOR_PROFILE_SNAPSHOT_REQUIRED',
        'The activated actor_base_appearance_v1 contract has no approved demographic or appearance profile.'));
    }
    return { snapshot: null, demographic: null, appearance: null, concerns };
  }
  if (demographic.length !== 1 || appearance.length !== 1) {
    concerns.push(concern('NPC_ACTOR_PROFILE_SET_AMBIGUOUS', 'A revision with canonical actor appearance must resolve exactly one demographic and one appearance profile.'));
    return { snapshot, demographic: null, appearance: null, concerns };
  }
  const entries = [...(demographic[0].entries ?? []), ...(appearance[0].entries ?? [])];
  const facets = new Set(entries.filter((entry) => entry.status === 'approved').map((entry) => entry.facet));
  const requiredFacets = ['sex_category', 'age_category', 'build', 'skin_tone', 'face_shape', 'hair_color', 'hair_length', 'hair_style', 'facial_hair', 'eye_color'];
  for (const facet of requiredFacets) {
    if (!facets.has(facet)) concerns.push(concern('NPC_ACTOR_PROFILE_REQUIRED_FACET_EMPTY', `Actor profile has no approved ${facet} candidates.`));
  }
  return { snapshot, demographic: demographic[0], appearance: appearance[0], concerns };
}

function buildActorProfileBinding(actorProfiles, role, occupation) {
  if (!actorProfiles?.snapshot || !actorProfiles.demographic || !actorProfiles.appearance) return null;
  const equipment = (actorProfiles.snapshot.equipment_profiles ?? []).filter((profile) =>
    (profile.social_role_id == null || [role.id, role.slug].includes(profile.social_role_id))
    && (profile.occupation_id == null || (occupation && [occupation.id, occupation.slug].includes(profile.occupation_id)))
  ).sort((left, right) => String(left.id).localeCompare(String(right.id)));
  const actorProfileSnapshot = {
    schema: 'actor_profile_candidate_snapshot_v1',
    world_revision_id: actorProfiles.snapshot.world_revision_id,
    source_catalog_digest: actorProfiles.snapshot.source_catalog_digest,
    catalog_digest: actorProfiles.snapshot.catalog_digest,
    demographic_profile_ref: { id: actorProfiles.demographic.id },
    appearance_profile_ref: { id: actorProfiles.appearance.id },
    equipment_profile_refs: equipment.map((profile) => ({ id: profile.id }))
  };
  return {
    appearance_contract_version: 'actor_base_appearance_v1',
    require_complete_actor_appearance: true,
    demographic_profile_id: actorProfiles.demographic.id,
    appearance_profile_id: actorProfiles.appearance.id,
    demographic_profile_entries: structuredClone(actorProfiles.demographic.entries),
    appearance_profile_entries: structuredClone(actorProfiles.appearance.entries),
    equipment_profile_refs: actorProfileSnapshot.equipment_profile_refs,
    ...(equipment.length === 1 ? { equipment_profile_ref: { id: equipment[0].id } } : {}),
    actor_profile_snapshot: actorProfileSnapshot
  };
}

function validateActorProfileCandidate(candidate, output) {
  if (candidate?.require_complete_actor_appearance !== true) return [];
  const concerns = [];
  const snapshot = candidate.actor_profile_snapshot;
  if (candidate.appearance_contract_version !== 'actor_base_appearance_v1' || snapshot?.schema !== 'actor_profile_candidate_snapshot_v1') {
    concerns.push(concern('NPC_ACTOR_PROFILE_SNAPSHOT_INVALID', `${candidate.npc_candidate_id} lacks the canonical actor profile snapshot.`));
  }
  if (snapshot?.world_revision_id !== output.world_revision_id || snapshot?.catalog_digest !== output.actor_profile_catalog_digest) {
    concerns.push(concern('NPC_ACTOR_PROFILE_REVISION_MISMATCH', `${candidate.npc_candidate_id} actor profile pins do not match the Stage 7 output.`));
  }
  const entries = [...(candidate.demographic_profile_entries ?? []), ...(candidate.appearance_profile_entries ?? [])];
  const required = new Set(['sex_category', 'age_category', 'build', 'skin_tone', 'face_shape', 'hair_color', 'hair_length', 'hair_style', 'facial_hair', 'eye_color']);
  for (const entry of entries) if (entry?.status === 'approved') required.delete(entry.facet);
  if (required.size > 0) concerns.push(concern('NPC_ACTOR_PROFILE_REQUIRED_FACET_EMPTY', `${candidate.npc_candidate_id} has empty actor facets: ${[...required].sort().join(', ')}.`));
  return concerns;
}

function scoreCandidate({ occupation, archetype, placeCompatibility, namePools, timeAndSeason, warnings, keySeed, hardConstraints }) {
  const reasons = [];
  const penalties = [];
  let value = 40;
  value += 10; reasons.push('Social role is present and region-scoped.');
  value += 10; reasons.push('NPC archetype is present and allowed.');
  if (occupation) { value += 8; reasons.push('Occupation is compatible with social role.'); }
  else { value += 3; reasons.push('Occupation is null only for unnamed/background-style candidate.'); }
  if (placeCompatibility.allowed_candidate_place_template_link_ids.length > 0) { value += 12; reasons.push('Candidate has compatible candidate_place_template_set links.'); }
  if (timeAndSeason.time_of_day_match) { value += 5; reasons.push('Candidate matches time_of_day.'); }
  if (timeAndSeason.season_match) { value += 5; reasons.push('Candidate matches season.'); }
  if (namePools.length > 0) { value += 4; reasons.push('Compatible name pool exists for later materialization.'); }
  if (keySeed) { value += 4; reasons.push('Compatible key_npc_seed exists.'); }
  if (archetype.confidence === 'high' || archetype.confidence === 'medium_high') { value += 2; reasons.push('Archetype source confidence is strong.'); }
  if (hardConstraints.size === 0) { value += 2; reasons.push('No player hard constraint conflicts.'); }

  if (warnings.length > 0) {
    const penalty = Math.min(12, warnings.length * 3);
    value -= penalty;
    penalties.push(`Warnings penalty: -${penalty}.`);
  }
  value = clamp(value, 0, 100);
  return {
    value,
    band: scoreBand(value),
    score_reasons: reasons,
    score_penalties: penalties
  };
}

function inferGameFunctions({ role, occupation, archetype, profileLevel, keySeed }) {
  const text = [
    role.role_group,
    role.status_group,
    role.relation_to_power,
    role.relation_to_religion,
    occupation?.occupation_group,
    occupation?.services_provided,
    occupation?.typical_knowledge,
    archetype.archetype_group,
    archetype.typical_interaction_modes,
    archetype.typical_knowledge_scope,
    archetype.typical_resource_scope,
    archetype.typical_risk_profile
  ].map((item) => JSON.stringify(item ?? '')).join(' ').toLowerCase();

  return {
    can_be_visible_background: profileLevel === 'background' || text.includes('background') || true,
    can_be_addressed: profileLevel !== 'background' || hasAnyWord(text, ['talk', 'dialogue', 'address', 'scene', 'witness', 'trade', 'guide']),
    can_witness: !hasAnyWord(text, ['hidden_only', 'unseen']),
    can_control_access: hasAnyWord(text, ['guard', 'gate', 'watch', 'authority', 'manager', 'owner', 'steward', 'access']),
    can_trade: hasAnyWord(text, ['trade', 'merchant', 'market', 'sell', 'buy', 'commerce']),
    can_guide: hasAnyWord(text, ['guide', 'route', 'road', 'path', 'boatman', 'ferry', 'hunter']),
    can_share_knowledge: hasAnyWord(text, ['knowledge', 'rumor', 'clergy', 'scribe', 'elder', 'guide', 'local']),
    can_create_risk: hasAnyWord(text, ['risk', 'guard', 'armed', 'authority', 'thief', 'conflict', 'danger']),
    can_become_key_later: Boolean(keySeed) || profileLevel === 'key_seed'
  };
}

function buildCandidateSourceTrace({ role, occupation, archetype, namePools, keySeed }) {
  const rows = [
    sourceTraceEntry(role, 'world_base.region_social_roles', ['social_role']),
    occupation ? sourceTraceEntry(occupation, 'world_base.region_occupations', ['occupation']) : null,
    sourceTraceEntry(archetype, 'world_base.npc_archetypes', ['npc_archetype']),
    ...(namePools ?? []).map((pool) => sourceTraceEntry(pool, 'world_base.npc_name_pools', ['name_pool'])),
    keySeed ? sourceTraceEntry(keySeed, 'world_base.key_npc_seeds', ['key_seed']) : null
  ].filter(Boolean);
  return dedupeTrace(rows);
}

function sourceTraceEntry(row, table, supports) {
  return {
    record_id: row.id ?? null,
    table,
    source_ids: listFrom(row.sources),
    supports,
    status: row.status ?? null,
    confidence: row.confidence ?? null
  };
}

function buildSetSourceTrace(candidates) {
  return candidates.map((candidate) => ({
    record_id: candidate.npc_candidate_id,
    table: 'startup.npc_candidate_set',
    source_ids: [...new Set(candidate.source_trace.flatMap((entry) => entry.source_ids ?? []))],
    supports: ['npc_candidate'],
    status: 'derived_from_world_base_records',
    confidence: candidate.score?.value >= 70 ? 'medium_high' : 'medium'
  }));
}

function buildGroups(candidates) {
  const groups = [];
  pushGroup(groups, candidates, 'profile_level', (candidate) => candidate.profile_level, 'NPC candidates by profile level');
  pushGroup(groups, candidates, 'place_template', (candidate) => candidate.place_compatibility.allowed_place_template_ids[0] ?? 'unknown', 'NPC candidates by place template');
  pushGroup(groups, candidates, 'social_role_group', (candidate) => candidate.social_role.status_group ?? 'unknown', 'NPC candidates by social role group');
  pushGroup(groups, candidates, 'occupation_group', (candidate) => candidate.occupation.occupation_group ?? 'none', 'NPC candidates by occupation group');
  pushGroup(groups, candidates, 'archetype_group', (candidate) => candidate.npc_archetype.archetype_group ?? 'unknown', 'NPC candidates by archetype group');
  pushGroup(groups, candidates, 'time_availability', (candidate) => candidate.time_and_season_compatibility.time_of_day_match ? 'time_match' : 'time_warning', 'NPC candidates by time availability');
  pushGroup(groups, candidates, 'key_seed_available', (candidate) => candidate.key_seed.allowed_as_key_candidate ? 'key_seed_available' : 'ordinary_candidate', 'NPC candidates by key seed availability');
  for (const fn of ['can_witness', 'can_control_access', 'can_trade', 'can_guide', 'can_share_knowledge', 'can_create_risk']) {
    pushGroup(groups, candidates.filter((candidate) => candidate.game_function_candidates[fn]), fn, () => fn, `NPC candidates that ${fn}`);
  }
  return groups;
}

function pushGroup(groups, candidates, key, getValue, titlePrefix) {
  const grouped = groupByKey(candidates, getValue);
  for (const [value, rows] of grouped.entries()) {
    groups.push({
      group_id: `npc_group_${slug(key)}_${slug(value)}`,
      title: `${titlePrefix}: ${value}`,
      npc_candidate_ids: rows.map((candidate) => candidate.npc_candidate_id),
      group_tags: [key, value].filter(Boolean)
    });
  }
}

function buildNamePoolIndex(namePools, candidates) {
  const usedIds = new Set(candidates.flatMap((candidate) => candidate.name_pool_compatibility.allowed_name_pool_ids));
  const usedPools = namePools.filter((pool) => usedIds.has(pool.id));
  const byRole = {};
  const byOccupation = {};
  for (const pool of usedPools) {
    for (const roleId of listFrom(pool.social_role_ids ?? pool.allowed_social_role_ids ?? pool.role_ids)) {
      byRole[roleId] = [...new Set([...(byRole[roleId] ?? []), pool.id])];
    }
    for (const occupationId of listFrom(pool.occupation_ids ?? pool.allowed_occupation_ids)) {
      byOccupation[occupationId] = [...new Set([...(byOccupation[occupationId] ?? []), pool.id])];
    }
  }
  for (const candidate of candidates) {
    for (const poolId of candidate.name_pool_compatibility.allowed_name_pool_ids) {
      const roleId = candidate.social_role.social_role_id;
      const occupationId = candidate.occupation.occupation_id;
      byRole[roleId] = [...new Set([...(byRole[roleId] ?? []), poolId])];
      if (occupationId) byOccupation[occupationId] = [...new Set([...(byOccupation[occupationId] ?? []), poolId])];
    }
  }
  return {
    name_pool_ids: [...usedIds],
    name_pool_ids_by_social_role: byRole,
    name_pool_ids_by_occupation: byOccupation
  };
}

function buildRejected({ role = null, occupation = null, archetype = null, keySeed = null, code, reason, evidence }) {
  return {
    npc_candidate_id: `rejected_npc_cand_${slug(archetype?.id ?? 'no_archetype')}_${slug(role?.id ?? 'no_role')}_${slug(occupation?.id ?? 'no_occupation')}_${slug(keySeed?.id ?? code ?? 'reason')}`,
    npc_archetype_id: archetype?.id ?? null,
    social_role_id: role?.id ?? null,
    occupation_id: occupation?.id ?? null,
    candidate_place_template_link_id: null,
    key_npc_seed_id: keySeed?.id ?? null,
    rejection_code: code,
    rejection_reason: reason,
    evidence: Array.isArray(evidence) ? evidence : [String(evidence ?? reason)]
  };
}

function pushRejected(rejected, maxRejected, item) {
  if (rejected.length < maxRejected) rejected.push(item);
}

function blockedOutput({ requestId, frame, concerns, evidence }) {
  return {
    version: 1,
    schema: 'npc_candidate_set',
    request_id: requestId,
    selection_status: 'blocked',
    frame,
    summary: {
      npc_candidate_count: 0,
      background_candidate_count: 0,
      scene_candidate_count: 0,
      key_seed_candidate_count: 0,
      rejected_candidate_count: concerns.length
    },
    npc_candidates: [],
    rejected_npc_candidates: concerns.map((item) => buildRejected({ code: item.code, reason: item.message, evidence: [item.message] })),
    npc_candidate_groups: [],
    name_pool_index: {},
    downstream_constraints: {
      must_choose_from_npc_candidate_ids: [],
      must_preserve: ['region_id', 'year', 'season', 'clock'],
      must_not_create_yet: ['npc_id', 'npc_name', 'current_action', 'hidden_motive', 'relationship_to_player', 'inventory', 'dialogue', 'visible_scene', 'intro_prose'],
      must_resolve_later: ['npc_candidate_set']
    },
    source_trace: [],
    audit: makeAudit(false, concerns, evidence.length > 0 ? evidence : [{ kind: 'stage7_blocked_before_candidate_build' }])
  };
}

function normalizeTemplateLinks(links) {
  return links.map((link, index) => ({
    ...link,
    candidate_place_template_link_id: link.candidate_place_template_link_id ?? link.link_id ?? `candidate_place_template_link:${index + 1}`,
    link_id: link.link_id ?? link.candidate_place_template_link_id ?? `candidate_place_template_link:${index + 1}`
  }));
}

function normalizeHardConstraints(value) {
  if (!value) return new Set();
  if (Array.isArray(value)) return new Set(value.filter(Boolean).map((item) => String(item)));
  if (typeof value === 'object') return new Set(Object.entries(value).filter(([, enabled]) => enabled === true).map(([key]) => key));
  return new Set(String(value).split(/[\s,;]+/u).filter(Boolean));
}

function normalizeProfileLevel(value) {
  const text = String(value ?? 'background').toLowerCase();
  if (['key', 'key_seed', 'key-seed', 'key_npc'].includes(text)) return 'key_seed';
  if (['scene', 'scene_profile', 'scenic'].includes(text)) return 'scene';
  return 'background';
}

function isProfileLevelAllowed(profileLevel, policy) {
  if (profileLevel === 'background') return policy.include_background_profiles !== false;
  if (profileLevel === 'scene') return policy.include_scene_profiles !== false;
  if (profileLevel === 'key_seed') return policy.include_key_seeds !== false;
  return true;
}

function isYearInSeedRange(seed, year) {
  if (!seed || year == null) return true;
  const range = seed.availability_period ?? {};
  const start = seed.availability_start_year ?? range.start_year ?? range.start ?? null;
  const end = seed.availability_end_year ?? range.end_year ?? range.end ?? null;
  if (start != null && Number(start) > Number(year)) return false;
  if (end != null && Number(end) < Number(year)) return false;
  return true;
}

function firstArray(object, keys) {
  for (const key of keys) {
    if (Array.isArray(object?.[key])) return object[key];
  }
  return [];
}

function listFrom(value) {
  if (Array.isArray(value)) return value.filter((item) => item != null).map((item) => String(item));
  if (value == null) return [];
  if (typeof value === 'object') return Object.values(value).flatMap((item) => listFrom(item));
  const text = String(value).trim();
  if (!text) return [];
  if ((text.startsWith('[') && text.endsWith(']')) || (text.startsWith('{') && text.endsWith('}'))) {
    try {
      const parsed = JSON.parse(text);
      return listFrom(parsed);
    } catch {
      return [text];
    }
  }
  return text.split(/[;,|]/u).map((item) => item.trim()).filter(Boolean);
}

function patternList(value) {
  return listFrom(value).map((item) => item.toLowerCase());
}

function idSet(value) {
  return new Set(listFrom(value));
}

function hasAnyId(set, row) {
  return [row?.id, row?.slug, row?.title, row?.role_group, row?.occupation_group].filter(Boolean).some((value) => set.has(String(value)));
}

function setHasAny(set, values) {
  return values.filter(Boolean).some((value) => set.has(String(value)));
}

function intersects(a, b) {
  for (const value of a) if (b.has(value)) return true;
  return false;
}

function hasAnyWord(text, words) {
  return words.some((word) => text.includes(word));
}

function indexById(rows, getId = (row) => row.id) {
  return Object.fromEntries(rows.map((row) => [getId(row), row]).filter(([id]) => id));
}

function groupByKey(rows, getKey) {
  const map = new Map();
  for (const row of rows) {
    const key = getKey(row) ?? 'unknown';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

function dedupeTrace(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    const key = `${entry.table}:${entry.record_id}:${entry.supports.join(',')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeConcerns(a = [], b = []) {
  return [...a, ...b];
}

function mergeEvidence(a = [], b = []) {
  return [...a, ...b];
}

function findForbiddenKeys(value, path = '$', hits = []) {
  if (!value || typeof value !== 'object') return hits;
  if (Array.isArray(value)) {
    value.forEach((item, index) => findForbiddenKeys(item, `${path}[${index}]`, hits));
    return hits;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_OUTPUT_KEYS.includes(key)) hits.push({ key, path: `${path}.${key}` });
    findForbiddenKeys(child, `${path}.${key}`, hits);
  }
  return hits;
}

function errorCodeForForbiddenKey(key) {
  if (key === 'npc_id') return 'NPC_CANDIDATE_CREATED_NPC';
  if (key === 'name' || key === 'npc_name') return 'NPC_CANDIDATE_CREATED_NAME';
  if (key === 'current_action' || key === 'npc_current_action') return 'NPC_CANDIDATE_CREATED_ACTION';
  if (key === 'secret' || key === 'hidden_motive' || key === 'hidden_state') return 'NPC_CANDIDATE_CREATED_SECRET';
  if (key === 'inventory') return 'NPC_CANDIDATE_CREATED_INVENTORY';
  if (key === 'relationship_to_player') return 'NPC_CANDIDATE_CREATED_RELATIONSHIP';
  if (key === 'dialogue') return 'NPC_CANDIDATE_CREATED_DIALOGUE';
  return 'NPC_CANDIDATE_CREATED_SCENE';
}

function recordErrorCode(table, kind) {
  if (kind !== 'not_found') return 'NPC_CANDIDATE_SCHEMA_MISMATCH';
  if (table.includes('social_roles')) return 'NPC_CANDIDATE_SOCIAL_ROLE_NOT_FOUND';
  if (table.includes('occupations')) return 'NPC_CANDIDATE_OCCUPATION_NOT_FOUND';
  if (table.includes('archetypes')) return 'NPC_CANDIDATE_ARCHETYPE_NOT_FOUND';
  if (table.includes('name_pools')) return 'NPC_CANDIDATE_NAME_POOL_NOT_FOUND';
  if (table.includes('key_npc_seeds')) return 'NPC_CANDIDATE_KEY_SEED_NOT_FOUND';
  return 'NPC_CANDIDATE_SCHEMA_MISMATCH';
}

function concern(code, message, extra = {}) {
  return { code, message, ...extra };
}

function scoreBand(value) {
  if (value >= 90) return 'excellent';
  if (value >= 70) return 'good';
  if (value >= 50) return 'usable';
  if (value >= 30) return 'weak';
  return 'reject';
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function slug(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9_:-]+/giu, '_').replace(/^_+|_+$/gu, '') || 'unknown';
}
