import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadLowerDvinaTraceMaterializationBundle } from
  './lower-dvina-trace-phase-1a-bundle.js';

const PATH = 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-2-v31/npc-semantic-remainder-profile.json';
export const TRACE_N1_PROFILE_DIGEST = '0e44bc05cd6e27aa962eee7d3114209a1b9959d447fc72679e743c16176d4aeb';

export async function loadLowerDvinaTraceN1Profile({
  rootDir = process.cwd() } = {}) {
  const [raw, bundle] = await Promise.all([
    readFile(resolve(rootDir, PATH)),
    loadLowerDvinaTraceMaterializationBundle({ rootDir,
      scenarioDefinitionRevision: 32 })
  ]);
  if (createHash('sha256').update(raw).digest('hex') !== TRACE_N1_PROFILE_DIGEST) fail();
  let profile;
  try { profile = JSON.parse(raw); } catch { fail(); }
  const eligible = profile.eligible_participant_profiles;
  const ref = bundle?.definition?.immutable_content_refs
    ?.npc_semantic_remainder_profile;
  if (!exact(profile, ['schema', 'profile_id', 'revision', 'status',
    'scenario_definition_revision', 'eligible_participant_profiles',
    'eligible_profile_levels', 'allowed_semantic_facets',
    'forbidden_authority', 'max_text_length', 'fallback_policy'])
      || profile.schema !== 'rus.lower_dvina_trace_n1_profile.v1'
      || profile.profile_id !== 'lower_dvina_trace_n1_background_npc_v1'
      || profile.revision !== 1 || profile.status !== 'approved'
      || profile.scenario_definition_revision !== 31
      || profile.fallback_policy !== 'forbidden'
      || profile.max_text_length !== 240
      || !Array.isArray(eligible) || eligible.length !== 1
      || !exact(eligible[0], ['profile_id', 'revision'])
      || eligible[0].profile_id !== 'trace_ld_v1_background_fisher_v1'
      || eligible[0].revision !== 2
      || !same(profile.eligible_profile_levels, ['background'])
      || !same(profile.allowed_semantic_facets,
        ['ordinary_descriptor', 'ordinary_activity'])
      || !Array.isArray(profile.forbidden_authority)
      || new Set(profile.forbidden_authority).size
        !== profile.forbidden_authority.length
      || ref?.id !== profile.profile_id || ref?.revision !== 1
      || ref?.digest !== TRACE_N1_PROFILE_DIGEST
      || bundle?.definition_revision !== 32) fail();
  return Object.freeze({ schema: 'rus.lower_dvina_trace_n1_loaded_profile.v1',
    profile: deepFreeze(profile), digest: TRACE_N1_PROFILE_DIGEST });
}

function exact(value, keys) { return value != null && typeof value === 'object'
  && !Array.isArray(value) && Object.keys(value).length === keys.length
  && keys.every((key) => Object.hasOwn(value, key)); }
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function deepFreeze(value) { if (value && typeof value === 'object'
  && !Object.isFrozen(value)) { Object.values(value).forEach(deepFreeze);
  Object.freeze(value); } return value; }
function fail() { throw Object.assign(new Error('TRACE_N1_PROFILE_INVALID'),
  { code: 'TRACE_N1_PROFILE_INVALID', status: 409 }); }
