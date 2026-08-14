import { commitLowerDvinaTracePhase2 } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2-commit.js';

export async function commitGeneric({ commitInput, state }) {
  let plan = null;
  const committableState = structuredClone(state);
  delete committableState.current_visible_context;
  const committed = await commitLowerDvinaTracePhase2({
    ...commitInput,
    loadState: async () => structuredClone(committableState),
    committer: {
      async commit(input) {
        plan = input.plan;
        return { ok: true, replay: false, change_set_id: plan.change_set_id };
      }
    }
  });
  const snapshot = plan?.inserts.find(
    ({ target_table: table }) => table === 'party_state_snapshots')
    ?.record?.state_payload;
  const visible = plan?.visible_package_envelope;
  const envelope = commitInput.writePlan.turn_step_commit;
  if (snapshot == null || visible == null || envelope == null) {
    throw new TypeError('Generic turn-step fixture commit is incomplete.');
  }
  return {
    committed,
    snapshot: structuredClone(snapshot),
    visible: structuredClone(visible),
    idempotencyKey: envelope.player_input.idempotency_key,
    factual: {
      player_input: structuredClone(envelope.player_input),
      mode_resolution: structuredClone(envelope.mode_resolution),
      consequence: structuredClone(envelope.consequence),
      time_update: structuredClone(envelope.time_update),
      body_update: structuredClone(envelope.body_update)
    }
  };
}
