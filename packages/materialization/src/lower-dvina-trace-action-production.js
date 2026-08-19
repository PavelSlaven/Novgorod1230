import { canonicalDigest } from './core.js';
import { failLowerDvinaTraceMaterialization as fail } from
  './lower-dvina-trace-contract.js';

export function buildActionProductionAuthority({ partyId, actorRef, profile }) {
  if (profile?.schema
      !== 'rus.lower_dvina_trace_action_production_profile.v1'
      || profile.status !== 'approved' || profile.revision !== 1) {
    fail('TRACE_ACTION_PRODUCTION_PROFILE_INVALID',
      'Approved A1 profile is required for revision 21.');
  }
  const row = {
    party_id: partyId, actor_ref: actorRef,
    context_ref: profile.context_ref, profile_ref: profile.profile_id,
    profile_version: String(profile.revision), policy_ref: profile.policy_ref,
    policy_version: profile.policy_version,
    max_new_entities: profile.max_new_entities,
    allowed_access_states: structuredClone(profile.allowed_access_states),
    allowed_identity_modes: structuredClone(profile.allowed_identity_modes),
    allowed_origins: structuredClone(profile.allowed_origins),
    allowed_result_classes: structuredClone(profile.allowed_result_classes),
    authority_state_version: 1, status: 'committed'
  };
  return { ...row, authority_digest: `sha256:${canonicalDigest(row)}` };
}
