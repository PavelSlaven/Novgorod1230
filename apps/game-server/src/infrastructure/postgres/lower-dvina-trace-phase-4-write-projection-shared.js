import { canonicalDigest } from '@rus/materialization';

export function validPersistedOfferStage({ state, factual, negotiation, contracts }) {
  const promise = state.promise_instances[0];
  const stage = negotiation.offer_stage;
  const request = negotiation.check_request;
  const factualRequest = factual.availability?.check_requests?.[0];
  if (!stage || ((request === null) !== (factualRequest == null))
      || (request !== null && canonicalDigest(request)
        !== canonicalDigest(factualRequest))) return false;
  const { stage_digest: suppliedDigest, ...payload } = stage;
  return suppliedDigest === canonicalDigest(payload)
    && stage.audit_ordinal === 0
    && stage.prior_state === promise.current_state
    && stage.operation === (promise.current_state === 'not_offered'
      ? 'offer'
      : 'reuse_current_offer')
    && stage.resulting_state === 'offered'
    && stage.fact_id === 'promise_current_offered'
    && stage.obligation_id === (promise.obligation_id ?? promise.instance_id)
    && stage.policy_id === contracts.promisePolicy.policy_id
    && stage.beneficiary_actor_id === promise.beneficiary_actor_id
    && canonicalDigest(stage.witness_actor_ids)
      === canonicalDigest(promise.witness_actor_ids)
    && stage.scope_digest === canonicalDigest(promise.scope_snapshot)
    && (request === null || (
      request.audit_ordinal === 1
      && request.causal_predecessor_fact_id === stage.fact_id
      && request.causal_predecessor_stage_digest === stage.stage_digest
    ));
}

export function exactActivityRoots(n) {
  const roots = n.activity_roots ?? [];
  const negotiation = roots.filter(({ duration_minutes }) => duration_minutes === 10);
  const continuation = roots.filter(({ duration_minutes }) => duration_minutes === 2);
  if (negotiation.length !== 1 || continuation.length > 1
      || (Boolean(n.player_response_boundary) !== Boolean(continuation.length))) {
    throw new Error('TRACE_PHASE_4_ACTIVITY_ROOTS_INVALID');
  }
  return { negotiation: negotiation[0], continuation: continuation[0] ?? null };
}
