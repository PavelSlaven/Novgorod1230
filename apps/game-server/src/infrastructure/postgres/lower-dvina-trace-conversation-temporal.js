import { integrateSpatialV3TemporalWriteFragments } from
  '@rus/turn/spatial-v3-temporal-write-integration';

export function integrateConversationTemporalWrites({ input, semanticExchange,
  fail }) {
  let integratedInput = input;
  for (const temporalResult of semanticExchange?.exchange?.working_state
    ?.temporal_advance_results ?? []) {
    const integrated = integrateSpatialV3TemporalWriteFragments({
      base_write_plan_input: integratedInput,
      temporal_result: temporalResult
    });
    if (!integrated.ok) fail(integrated.error);
    integratedInput = integrated.input;
  }
  return integratedInput;
}

export function applyConversationTemporalNpcWrites(next, semanticExchange) {
  for (const temporalResult of semanticExchange?.exchange?.working_state
    ?.temporal_advance_results ?? []) {
    for (const proposal of temporalResult.combined_change_set?.proposals ?? []) {
      for (const write of proposal.write_set?.updates ?? []) {
        if (write.target_table !== 'party_npcs'
            || write.record?.party_id !== next.party_id) continue;
        const npc = next.npcs?.find(({ instance_id: id }) =>
          id === write.record.npc_id);
        if (!npc) throw Object.assign(
          new Error('TRACE_CONVERSATION_TEMPORAL_NPC_PROJECTION_GAP'),
          { code: 'TRACE_CONVERSATION_TEMPORAL_NPC_PROJECTION_GAP' }
        );
        if (write.record.anchor_id !== undefined) {
          npc.anchor_id = write.record.anchor_id;
        }
        if (write.record.machine_state !== undefined) {
          npc.machine_state = structuredClone(write.record.machine_state);
        }
      }
    }
  }
}
