import assert from 'node:assert/strict';

export function phase4Pool(data) {
  return {
    async query(sql) {
      if (sql.includes('party_perception_witnesses')) {
        return result(data.witnesses);
      }
      if (sql.includes('party_perception_replay_evidence')) {
        return result(data.replay);
      }
      if (sql.includes('FROM party_runtime.party_perception_records p')) {
        return result(data.perceptions);
      }
      if (sql.includes('party_route_plans p')) return result(data.traversal);
      if (sql.includes('party_timed_activity_executions')) return result([]);
      if (sql.includes('party_check_resolutions')) return result([]);
      if (sql.includes('party_npc_decision_traces')) return result([]);
      if (sql.includes('party_obligations')) return result(data.obligation);
      if (sql.includes('party_obligation_transitions')) return result([]);
      if (sql.includes("template_id='trace_ld_v1_item_ratsha_knife'")) {
        return result([]);
      }
      if (sql.includes('party_visible_packages')) return result(data.visible);
      if (sql.includes('party_npc_runtime_transitions')) return result([]);
      if (sql.includes('party_actor_npc_interactions')) return result([]);
      if (sql.includes('party_actor_npc_interaction_summaries')) {
        return result([]);
      }
      if (sql.includes('party_character_knowledge')) {
        return result(data.knowledge);
      }
      if (sql.includes('template_id=ANY')) return result([]);
      throw new Error('Unexpected Phase 4 read query: ' + sql);
    }
  };
}

export function rows(values, table) {
  return values.filter(({ target_table: target }) => target === table);
}

export function only(values, table) {
  const matches = rows(values, table);
  assert.equal(matches.length, 1, 'expected one ' + table + ' row');
  return matches[0];
}

export function byId(values, table) {
  return new Map(rows(values, table).map((entry) => [entry.id, entry]));
}

export function byParent(values, table, key) {
  return new Map(
    rows(values, table).map((entry) => [entry.record[key], entry])
  );
}

export function result(values) {
  return { rows: structuredClone(values), rowCount: values.length };
}

export function integrityFailure(error) {
  return error?.code === 'TRACE_PHASE_2_SESSION_READ_INVALID';
}
