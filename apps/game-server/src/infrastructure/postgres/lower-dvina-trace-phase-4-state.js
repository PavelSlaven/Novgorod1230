import { buildTracePhase5ArrivalResources } from
  '../../runtime/lower-dvina-trace-phase-5-resources.js';
import { commitPhase2BodyState } from
  './lower-dvina-trace-phase-2-state.js';

export function nextPhase4State({ state, factual, nextVersion, turnNumber,
  inputDigest, changeSetId, contracts }) {
  const next = structuredClone(state);
  next.schema = 'rus.lower_dvina_trace_turn_snapshot.v2';
  next.party_state = { ...next.party_state, state_version: nextVersion,
    session_state_version: next.party_state.session_state_version + 1,
    clock_state_version: next.party_state.clock_state_version + 1, turn_number: turnNumber };
  if (factual.body_update?.applied === true) {
    next.body_state = commitPhase2BodyState({
      before: state.body_state,
      proposed: factual.body_update.state_after
    });
    next.body_effect_history = [...(next.body_effect_history ?? []), {
      history_id: `body-history:${state.party_id}:trace-phase4:${turnNumber}`,
      effect_ref: factual.body_update.proposal.profile_ref,
      activity_attempt_id: factual.body_update.proposal.activity_attempt_id,
      occurred_at: structuredClone(factual.time_update.clock_after)
    }];
    next.party_state.body_state_version = state.party_state.body_state_version + 1;
  }
  next.clock = structuredClone(factual.time_update.clock_after);
  next.clock_weather_light.clock = structuredClone(next.clock);
  const c = factual.consequence;
  if (c.phase4_kind === 'movement') {
    const scene = next.prepared_scenes.find((entry) => entry.location_profile_ref === c.movement.destination_location_ref);
    if (!scene) throw new Error('TRACE_PHASE_4_DRYING_SHED_MISSING');
    next.position = { ...next.position, location_ref: c.movement.destination_location_ref,
      g5_anchor_id: scene.anchor.instance_id, g5_node_id: scene.node.instance_id };
    next.npcs = next.npcs.map((npc) => c.movement.participants.includes(npc.instance_id)
      ? { ...npc, anchor_id: scene.anchor.instance_id } : npc);
    if (contracts.resourceArrivalBinding != null) {
      const resourceTemplates = new Set([
        'trace_ld_v1_item_fishing_net',
        'trace_ld_v1_item_carry_poles',
        'trace_ld_v1_item_eremey_drinking_water_vessel'
      ]);
      const existingResources = next.items.filter(
        ({ template_id: id }) => resourceTemplates.has(id)
      );
      if (existingResources.length !== 0) {
        throw new Error('TRACE_PHASE_5_RESOURCE_ALREADY_MATERIALIZED');
      }
      next.items.push(...buildTracePhase5ArrivalResources({
        state: next,
        contracts
      }));
    }
    next.route_knowledge = [...new Set([...(next.route_knowledge ?? []),
      c.movement.route_ref, c.movement.reverse_route_ref])];
    next.knowledge = mergeKnowledge(next.knowledge, [{
      fact_id: 'onisim_found_alive',
      knowledge_state: 'known_from_committed_source',
      evidence_refs: [c.movement.arrival_observation_ref]
    }, {
      fact_id: c.movement.reverse_route_ref,
      knowledge_state: 'known_from_committed_traversal',
      evidence_refs: [c.movement.traversal.ids.execution_id]
    }]);
    next.perceptions = [...(next.perceptions ?? []), {
      perception_id: `perception:${next.party_id}:trace-phase4:${turnNumber}:arrival`,
      observation_ref: c.movement.arrival_observation_ref,
      fact_id: 'onisim_found_alive',
      causal_route_execution_id: c.movement.traversal.ids.execution_id
    }];
  } else {
    const n = c.negotiation;
    const prior = next.promise_instances?.[0];
    if (!prior) throw new Error('TRACE_PHASE_4_PROMISE_MISSING');
    const promiseState = n.npc_decision.outcome === 'surrender'
      ? 'active'
      : 'offered';
    const transitionCount =
      (prior.current_state === 'not_offered' ? 1 : 0)
      + (promiseState === 'active' ? 1 : 0);
    next.promise_instances = [{ ...prior, current_state: promiseState,
      current_state_fact: promiseState === 'active'
        ? 'promise_current_active'
        : 'promise_current_offered',
      state_version: Number(prior.state_version) + transitionCount,
      last_change_set_id: transitionCount > 0
        ? changeSetId
        : prior.last_change_set_id }];
    next.npc_decisions = [...(next.npc_decisions ?? []), structuredClone(n.npc_decision.trace)];
    if (n.npc_decision.outcome === 'surrender') {
      const knifeWrites = contracts?.knifeTransition?.writes;
      if (!knifeWrites?.physical_position || !knifeWrites?.accessibility) {
        throw new Error('TRACE_PHASE_4_KNIFE_TRANSITION_WRITES_MISSING');
      }
      next.ratsha_surrendered = true;
      next.npcs = next.npcs.map((npc) =>
        npc.participant_slot_ref !== 'ratsha_storehouse_helper'
          ? npc
          : {
              ...npc,
              machine_state: {
                ...npc.machine_state,
                surrender_state: 'surrendered_without_further_harm'
              },
              semantic_state: {
                ...npc.semantic_state,
                participant_slot_ref: npc.participant_slot_ref,
                surrender_fact:
                  'ratsha_surrender_without_further_harm_committed'
              }
            });
      next.knowledge = mergeKnowledge(next.knowledge, [{
        fact_id: 'ratsha_surrender_without_further_harm_committed',
        knowledge_state: 'known_from_committed_source',
        evidence_refs: [n.npc_decision.trace.request_id]
      }, {
        fact_id: 'promise_activation_basis_committed',
        knowledge_state: 'known_from_committed_source',
        evidence_refs: [n.npc_decision.trace.request_id]
      }]);
      if (n.confession) {
        next.interactions = [...(next.interactions ?? []), {
          interaction_id:
            `interaction:${next.party_id}:trace-phase4:${turnNumber}:confession`,
          statement_ref: n.confession.statement_ref,
          assertion: structuredClone(n.confession.assertion),
          speaker_npc_id:
            contracts.actors.ratsha_storehouse_helper.instance_id,
          audience_ids: [
            next.actor_id,
            ...n.confession.required_audience_ids
          ],
          truth_projection: 'forbidden',
          memory_ref: n.confession.statement_ref,
          journal_ref: n.confession.statement_ref
        }];
      }
      next.items = next.items.map((item) => item.template_id !== 'trace_ld_v1_item_ratsha_knife' ? item : ({ ...item,
        placement: { ...item.placement, holder_npc_id: n.participating_fisher_id, holder_character_id: null, physical_position: knifeWrites.physical_position },
        ownership: { ...item.ownership, controller_npc_id: n.participating_fisher_id, controller_character_id: null },
        state: { ...item.state, property_state: { ...item.state.property_state, holder_ref: n.participating_fisher_id, controller_ref: n.participating_fisher_id, accessibility: knifeWrites.accessibility } } }));
    } else if (n.threat) {
      next.interactions = [...(next.interactions ?? []), {
        interaction_id:
          `interaction:${next.party_id}:trace-phase4:${turnNumber}:threat`,
        statement_ref: null,
        statement_effect_contract_ref: n.threat.effect_contract_ref,
        source_rule: n.threat.source_rule,
        speaker_npc_id:
          contracts.actors.ratsha_storehouse_helper.instance_id,
        audience_ids: [
          next.actor_id,
          ...n.threat.required_audience_ids
        ],
        truth_projection: 'forbidden'
      }];
    } else if (n.attack_facts?.length) {
      next.knowledge = mergeKnowledge(next.knowledge,
        n.attack_facts.map((factId) => ({
          fact_id: factId,
          knowledge_state: 'known_from_committed_source',
          evidence_refs: [n.npc_decision.trace.request_id]
        })));
    }
    next.player_response_boundary = n.player_response_boundary;
  }
  next.phase4_history = [...(next.phase4_history ?? []), {
    turn_number: turnNumber,
    change_set_id: changeSetId,
    request_id: factual.player_input.request_id,
    option_id: factual.mode_resolution.option_id,
    phase4_kind: c.phase4_kind,
    time_update: structuredClone(factual.time_update),
    consequence: structuredClone(c)
  }];
  next.last_turn = { request_id: factual.player_input.request_id, idempotency_key: factual.player_input.idempotency_key,
    input_digest: inputDigest, raw_text: factual.player_input.raw_text, option_id: factual.mode_resolution.option_id,
    action_set_digest: factual.mode_resolution.decision_trace.action_set_digest, semantic_trace: structuredClone(factual.mode_resolution.decision_trace),
    consequence: structuredClone(c), time_update: structuredClone(factual.time_update), visible_package: null, change_set_id: changeSetId };
  return next;
}

function mergeKnowledge(current = [], added = []) {
  const byId = new Map(current.map((entry) => [entry.fact_id, entry]));
  for (const entry of added) if (!byId.has(entry.fact_id)) {
    byId.set(entry.fact_id, entry);
  }
  return [...byId.values()].sort((left, right) =>
    left.fact_id.localeCompare(right.fact_id));
}
