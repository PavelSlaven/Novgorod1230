import { resolveTracePhase9Contracts } from
  './lower-dvina-trace-phase-9-contracts.js';
import { createTracePhase9Commands } from
  './lower-dvina-trace-phase-9-commands.js';
import { createTracePhase9TestimonyCommand } from
  './lower-dvina-trace-phase-9-testimony-command.js';

export function createTracePhase9Runtime({ state, bundle,
  conversationBindings, inputDigest, playerConversationModel,
  npcSemanticModel, temporalAdvanceOwner, revalidateStateVersion }) {
  if (bundle.definition_revision !== 17 || !phase8Terminal(state)) return null;
  const contracts = resolveTracePhase9Contracts({ state, bundle,
    conversationBindings });
  return Object.freeze({ contracts,
    commands: [...createTracePhase9Commands({ contracts, inputDigest }),
      createTracePhase9TestimonyCommand({ contracts, inputDigest,
        playerConversationModel, npcSemanticModel, temporalAdvanceOwner,
        revalidateStateVersion })],
    targetRefs: { roadBag: contracts.bag.container_id,
      sealedPacket: contracts.packet.item_id,
      fishingCamp: contracts.ids.camp,
      onisim: contracts.onisim.instance_id,
      ratsha: actor(state, 'ratsha_storehouse_helper'),
      zhdanko: actor(state, 'zhdanko_storehouse_controller'),
      temporaryDispositionOptions: structuredClone(
        state.phase9?.temporary_disposition_options?.eligible_option_ids
          ?? null),
      caseEvidence: 'trace_ld_v1_clue_evidence_graph_set' } });
}

function phase8Terminal(state) {
  return (state.player_response_boundary == null
    && !(state.combat_sessions ?? []).some(({ status }) => status !== 'ended')
    && (state.last_turn?.consequence?.combat?.session_after?.status === 'ended'
      || (state.npcs ?? []).some((npc) =>
        npc.participant_slot_ref === 'zhdanko_storehouse_controller'
        && npc.machine_state?.surrender_state
          === 'surrendered_without_further_attack')))
      || state.phase9 != null;
}
function actor(state, slot) {
  return (state.npcs ?? []).find(
    ({ participant_slot_ref: ref }) => ref === slot)?.instance_id ?? null;
}
