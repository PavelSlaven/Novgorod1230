import { canonicalDigest } from '@rus/materialization';
import { loadLowerDvinaTraceMaterializationBundle } from
  './lower-dvina-trace-phase-1a-bundle.js';
import { loadLowerDvinaTraceNpcActorStepPublication } from
  './lower-dvina-trace-npc-actor-step-publication.js';

export async function loadLowerDvinaTraceNpcActorStepProfile({ rootDir = process.cwd() } = {}) {
  const [bundle, publication] = await Promise.all([
    loadLowerDvinaTraceMaterializationBundle({ rootDir,
      scenarioDefinitionRevision: 25 }),
    loadLowerDvinaTraceNpcActorStepPublication({ rootDir })
  ]);
  const profile = bundle.npc_actor_step_profile;
  if (!isExactLowerDvinaTraceNpcActorStepProfile(bundle, { profile,
    artifact_digest: bundle.artifact_pins?.npc_actor_step_profile?.digest })
      || publication.definition?.revision !== 25) invalid();
  return freeze({ schema: 'rus.lower_dvina_trace_npc_actor_step_loaded_profile.v1',
    artifact_digest: bundle.artifact_pins.npc_actor_step_profile.digest,
    profile_canonical_digest: canonicalDigest(profile), profile });
}

export function isExactLowerDvinaTraceNpcActorStepProfile(bundle, loaded) {
  const profile = loaded?.profile;
  const pin = bundle?.artifact_pins?.npc_actor_step_profile;
  const binding = bundle?.materialization_bindings?.npc_actor_step_activation;
  return bundle?.definition_revision === 25
    && profile?.schema === 'rus.lower_dvina_trace_npc_actor_step_profile.v1'
    && profile.profile_id === 'lower_dvina_trace_npc_actor_step_profile_v1'
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
function invalid() { throw Object.assign(new Error('TRACE_NPC_ACTOR_STEP_PROFILE_INVALID'),
  { code: 'TRACE_NPC_ACTOR_STEP_PROFILE_INVALID' }); }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
  Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
