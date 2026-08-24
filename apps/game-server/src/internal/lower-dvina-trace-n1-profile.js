import { canonicalDigest } from '@rus/materialization';
import { loadLowerDvinaTraceMaterializationBundle } from
  './lower-dvina-trace-phase-1a-bundle.js';
import { loadLowerDvinaTraceN1Publication } from
  './lower-dvina-trace-n1-publication.js';

export async function loadLowerDvinaTraceN1Profile({ rootDir = process.cwd() } = {}) {
  const [bundle, publication] = await Promise.all([
    loadLowerDvinaTraceMaterializationBundle({ rootDir,
      scenarioDefinitionRevision: 25 }),
    loadLowerDvinaTraceN1Publication({ rootDir })
  ]);
  const profile = bundle.npc_semantic_profile;
  if (!isExactLowerDvinaTraceN1Profile(bundle, { profile,
    artifact_digest: bundle.artifact_pins?.npc_semantic_profile?.digest })
      || publication.definition?.revision !== 25) invalid();
  return freeze({ schema: 'rus.lower_dvina_trace_n1_loaded_profile.v1',
    artifact_digest: bundle.artifact_pins.npc_semantic_profile.digest,
    profile_canonical_digest: canonicalDigest(profile), profile });
}

export function isExactLowerDvinaTraceN1Profile(bundle, loaded) {
  const profile = loaded?.profile;
  const pin = bundle?.artifact_pins?.npc_semantic_profile;
  const binding = bundle?.materialization_bindings?.npc_semantic_activation;
  return bundle?.definition_revision === 25
    && profile?.schema === 'rus.lower_dvina_trace_n1_npc_semantic_profile.v1'
    && profile.profile_id === 'lower_dvina_trace_n1_npc_semantic_profile_v1'
    && profile.revision === 1 && profile.status === 'approved'
    && profile.activation_boundary?.phase === 'phase_7'
    && profile.activation_boundary?.npc_participant_slot_ref
      === 'zhdanko_storehouse_controller'
    && canonicalDigest(profile.actor_mechanics_context) === canonicalDigest({
      attributes: [{ attribute_ref: 'strength', label: 'сила', value: 10 }]
    })
    && profile.fallback_policy === 'forbidden'
    && pin?.digest === loaded.artifact_digest
    && binding?.profile_ref?.digest === pin.digest
    && binding?.fallback_policy === 'forbidden';
}
function invalid() { throw Object.assign(new Error('TRACE_N1_PROFILE_INVALID'),
  { code: 'TRACE_N1_PROFILE_INVALID' }); }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
  Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
