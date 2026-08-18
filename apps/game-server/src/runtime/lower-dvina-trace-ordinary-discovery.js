import { createOrdinaryMaterializationDiscoveryOwner } from '@rus/turn';
import {
  buildOrdinaryMaterializationPresenceRequest,
  buildOrdinaryMaterializationSeedScopeRequest
} from './ordinary-materialization-seed-request.js';
import { createOrdinaryMaterializationAtomicWritePlan } from
  '../infrastructure/postgres/ordinary-materialization-phase-6-commit.js';

/** Lower Dvina supplies profile/context adapters to the common @rus/turn owner. */
export function createLowerDvinaTraceOrdinaryDiscoveryResolver({
  partyId, loadEnablement, ordinaryMaterializationModel,
  verifyStageBCutover = ordinaryMaterializationModel?.verifyStageBCutover,
  inputDigest
} = {}) {
  if (typeof loadEnablement !== 'function'
      || typeof ordinaryMaterializationModel !== 'function'
      || typeof verifyStageBCutover !== 'function') {
    throw new TypeError('ordinary discovery requires enablement and verified model ports');
  }
  return createOrdinaryMaterializationDiscoveryOwner({
    ordinaryMaterializationModel,
    verifyStageBCutover: (input) => verifyStageBCutover.call(
      ordinaryMaterializationModel, input),
    inputDigest,
    buildSeedRequest: buildOrdinaryMaterializationSeedScopeRequest,
    buildPresenceRequest: buildOrdinaryMaterializationPresenceRequest,
    sealAtomicWritePlan: createOrdinaryMaterializationAtomicWritePlan,
    async loadDiscoveryContext(request) {
      const scopeRef = currentG6(request?.committed_state);
      const rootId = request?.request?.root_turn_id;
      if (scopeRef == null || typeof rootId !== 'string' || !rootId) return null;
      const enabled = await loadEnablement({ partyId, scopeRef });
      const execution = enabled?.execution_context;
      if (!validExecution(execution)
          || execution.candidate_context.target_ref
            !== request?.operation?.target_refs?.[0]) return null;
      return { ...enabled, party_id: partyId, scope_ref: scopeRef };
    }
  });
}

function currentG6(state) {
  const id = state?.position?.g6_id ?? state?.position?.g6_ref;
  return typeof id === 'string' && id.length
    ? { entity_kind: 'g6', entity_id: id } : null;
}
function validExecution(value) {
  return value != null && typeof value === 'object'
    && Array.isArray(value.supporting_bases)
    && value.candidate_context != null
    && value.density_policy != null
    && value.mechanics_policy != null
    && value.stage_b_classification_eval != null
    && typeof value.causal_ref === 'string'
    && Array.isArray(value.source_refs)
    && typeof value.candidate_context.target_ref === 'string';
}
