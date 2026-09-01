import { serverError } from '../errors.js';

const PROMPT = 'Return only {"pass":true,"concerns":[]} or {"pass":false,"concerns":[{"kind":"source_semantic_mismatch"}]} or the same failure with kind "missing_required_source_move". Audit two things only. First, every selected action-production source must denote the ordinary material named in remaining_intent, resolving pronouns from root_player_action and completed_steps. Use only that source own supplied player-safe descriptors as grounding evidence. An unbound sensory sentence, another item descriptor, inventory order, and the player claim do not ground a source ref. Tools are not material sources. Second, when remaining_intent explicitly says the actor takes, picks up, drops, wears, attaches, or otherwise relocates that selected source, planned_operations must contain a matching move_entity; action production never implies relocation. Do not require movement merely because physical handling is needed for transformation. Do not plan, repair, invent refs, or judge mechanics.';

export async function auditTurnStepSourceGrounding({ roleRunner, plan,
  request }) {
  const operation = plan?.operations?.find((candidate) =>
    candidate?.op === 'request_item_use'
      && candidate.action_production != null);
  if (operation == null) return true;
  const response = await roleRunner.run({
    scope: 'turn_runtime', role_id: 'turn_step_grounding_auditor',
    request_identity: request.request_id,
    messages: [{ role: 'system', content: PROMPT }, {
      role: 'user', content: JSON.stringify({
        root_player_action: request.root_player_action,
        remaining_intent: request.remaining_intent,
        completed_steps: request.completed_steps ?? [],
        actor_ref: request.actor?.actor_id,
        planned_operations: plan.operations,
        source_refs: operation.action_production.source_refs,
        sources: sourceDescriptors(request.player_safe_state,
          operation.action_production.source_refs),
        sensory_details: request.player_safe_state?.current_visible_context
          ?.sensory_details ?? []
      })
    }], overrides: { temperature: 0, maxTokens: 20_000 }
  });
  if (!valid(response?.output)) throw serverError(
    'TRACE_TURN_STEP_GROUNDING_AUDIT_INVALID',
    'Turn-step grounding auditor returned an invalid result.', { status: 503 }
  );
  if (response.output.pass) return true;
  const moveMissing = response.output.concerns.some(({ kind }) =>
    kind === 'missing_required_source_move');
  const code = moveMissing
    ? 'source_placement_grounding' : 'source_semantic_grounding';
  return { pass: false, errors: [{
    path: '$.operations', rule: code, code,
    message: moveMissing
      ? 'explicit source relocation requires a matching move_entity'
      : 'each source must denote its named material from its own player-safe evidence'
  }] };
}

function sourceDescriptors(state, refs) {
  const items = Array.isArray(state?.items) ? state.items : [];
  const visible = Array.isArray(state?.current_visible_context?.visible_objects)
    ? state.current_visible_context.visible_objects : [];
  return refs.map((sourceRef) => ({ source_ref: sourceRef,
    item: descriptors(items.find(({ item_id: id }) => id === sourceRef)),
    visible: descriptors(visible.find(({ entity_ref: ref }) =>
      ref?.entity_kind === 'item' && ref.entity_id === sourceRef)),
    placement: structuredClone(items.find(({ item_id: id }) =>
      id === sourceRef)?.placement ?? null) }));
}

function descriptors(value) {
  if (value == null) return null;
  const output = {};
  for (const key of ['name', 'semantic_type', 'category_id', 'display_label',
    'physical_description', 'physical_facts']) {
    if (typeof value[key] === 'string' && value[key].trim()) {
      output[key] = value[key];
    } else if (Array.isArray(value[key])) {
      output[key] = value[key].filter((entry) =>
        typeof entry === 'string' && entry.trim());
    }
  }
  return output;
}

function valid(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === 2
    && typeof value.pass === 'boolean' && Array.isArray(value.concerns)
    && (value.pass ? value.concerns.length === 0 : value.concerns.length > 0)
    && value.concerns.every((concern) => concern != null
      && typeof concern === 'object' && !Array.isArray(concern)
      && Object.keys(concern).length === 1
      && typeof concern.kind === 'string' && concern.kind.trim());
}
