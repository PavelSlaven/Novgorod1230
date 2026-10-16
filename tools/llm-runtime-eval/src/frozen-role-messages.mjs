import {
  createLowerDvinaTraceNpcSemanticModel,
  createLowerDvinaTraceNarrationService,
  createLowerDvinaTracePlayerConversationModel,
  createLowerDvinaTraceTurnStepModel
} from '../../../apps/game-server/src/runtime/lower-dvina-trace-phase-2-llm.js';
import { createLowerDvinaTraceNpcAutonomousModel } from
  '../../../apps/game-server/src/runtime/lower-dvina-trace-autonomous-llm.js';
import { createLowerDvinaTraceNpcCombatModel } from
  '../../../apps/game-server/src/runtime/lower-dvina-trace-combat-llm.js';
import { createLowerDvinaTraceWorldProcessStepModel } from
  '../../../apps/game-server/src/runtime/lower-dvina-trace-world-process-llm.js';
import { buildOrdinaryMaterializationMessages } from
  '../../../apps/game-server/src/runtime/ordinary-materialization-llm.js';

const models = {
  world_process_step: createLowerDvinaTraceWorldProcessStepModel,
  turn_step_planner: createLowerDvinaTraceTurnStepModel,
  turn_step_planner_repair: createLowerDvinaTraceTurnStepModel,
  npc_combat_decider: createLowerDvinaTraceNpcCombatModel,
  npc_combat_decider_format_repair: createLowerDvinaTraceNpcCombatModel,
  npc_autonomous_decider: createLowerDvinaTraceNpcAutonomousModel,
  npc_autonomous_decider_format_repair: createLowerDvinaTraceNpcAutonomousModel,
  player_conversation_interpreter: createLowerDvinaTracePlayerConversationModel,
  player_conversation_interpreter_format_repair:
    createLowerDvinaTracePlayerConversationModel,
  npc_conversation_responder: createLowerDvinaTraceNpcSemanticModel,
  npc_conversation_responder_format_repair: createLowerDvinaTraceNpcSemanticModel
};

export async function buildFrozenRoleMessages(fixture) {
  if (fixture.role_id.startsWith('gameplay_narrator')) return narrationMessages(fixture);
  if (fixture.role_id === 'ordinary_materialization') {
    const request = fixture.repair
      ? fixture.request.request
      : JSON.parse(fixture.messages.at(-1).content);
    return buildOrdinaryMaterializationMessages(request, { repair: fixture.repair
      ? { schema: 'ordinary_materialization_repair_context_v1',
        original_output: fixture.request.original_output,
        validation_errors: fixture.request.validation_errors }
      : null });
  }
  const createModel = models[fixture.role_id];
  if (!createModel) throw new TypeError(`Unknown frozen role: ${fixture.role_id}`);
  let call;
  const model = createModel({ roleRunner: { async run(next) {
    call = next;
    return { output: {} };
  } } });
  const wire = JSON.parse(fixture.messages.at(-1).content);
  const npcCombat = fixture.role_id.startsWith('npc_combat_decider');
  const payload = npcCombat ? fixture.request ?? wire
    : fixture.request == null ? wire : { ...wire, request: fixture.request };
  if (!fixture.repair) await model(npcCombat ? payload : fixture.request ?? wire);
  else if (npcCombat) await model(payload.request, { repair: {
    original_output: payload.original_output,
    validation_errors: payload.validation_errors
  } });
  else if (fixture.role_id === 'turn_step_planner_repair') await model(
    payload.request?.request ?? payload.request, {
      structural_errors: payload.request?.structural_errors
        ?? payload.structural_errors });
  else await model(payload.request, { repair: {
    original_output: payload.original_output,
    validation_errors: payload.validation_errors
  } });
  return call.messages;
}

function reviewedNarration(segments, coverage = {}) {
  return {
    reviewed_segments: segments.map(({ segment_id }) => segment_id),
    source_reviews: Object.entries(coverage).map(([ref, segment_choices]) => ({ ref, segment_choices })),
    unsupported: [], literary_failures: [], evidence: ['Grounded current beat.']
  };
}

async function narrationMessages(fixture) {
  const target = fixture.role_id;
  const payload = fixture.request;
  const request = target === 'gameplay_narrator_format_repair' ? payload.request : {
    version: 1, schema: 'narration_request', request_id: payload.output?.output_id ?? 'narration-eval-1',
    surface: 'turn', visible_context: payload.visible_context ?? payload.request?.visible_context,
    style_policy: payload.style_policy ?? payload.request?.style_policy ?? {},
    ...(payload.context == null ? {} : { context: payload.context })
  };
  const draft = target === 'gameplay_narrator_auditor' ? payload.output : {
    version: 1, schema: 'narration_output', output_id: request.request_id,
    prose: target === 'gameplay_narrator_semantic_repair'
      ? payload.segments?.[0]?.prose : 'Сначала видны ворота. Телега скрипит у ворот. Потом всё тихо.',
    action_options: [], used_references: [], self_check: {}
  };
  let call, auditCalls = 0;
  const narration = createLowerDvinaTraceNarrationService({ roleRunner: { async run(next) {
    if (next.role_id === target) call = next;
    if (next.role_id === 'gameplay_narrator') {
      return { output: target === 'gameplay_narrator_format_repair' ? {}
        : target === 'gameplay_narrator_auditor' || target === 'gameplay_narrator_semantic_repair'
          ? draft : fixture.expected_output };
    }
    if (next.role_id === 'gameplay_narrator_format_repair') return { output: fixture.expected_output };
    if (next.role_id === 'gameplay_narrator_semantic_repair') return { output: fixture.expected_output };
    auditCalls += 1;
    if (target === 'gameplay_narrator_auditor') {
      return { output: fixture.expected_output };
    }
    const wire = JSON.parse(next.messages[1].content);
    const segments = wire['Отрывки прозы'];
    const first = segments[0]?.segment_id;
    const coverage = Object.fromEntries(wire['Обязательные положения текущего эпизода']
      .map((line) => [line.split(': ', 1)[0], first == null ? [] : [first]]));
    const audit = reviewedNarration(segments, coverage);
    if (target === 'gameplay_narrator_semantic_repair' && auditCalls === 1) {
      audit.unsupported = [{ segment_choice: first,
      kind: payload.concerns[0].kind, reason: payload.concerns[0].reason }];
      audit.evidence = [];
    }
    return { output: audit };
  } } });
  await narration.run(request);
  if (!call) throw new Error(`narration role was not called: ${target}`);
  return call.messages;
}
