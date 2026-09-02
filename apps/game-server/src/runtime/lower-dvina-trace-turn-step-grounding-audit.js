import { isDeepStrictEqual } from 'node:util';
import { serverError } from '../errors.js';

const PROMPT = 'Return only {"pass":true,"concerns":[]} or {"pass":false,"concerns":[{"kind":"source_semantic_mismatch","reason":"<brief exact mismatch>"}]} using only these concern kinds: source_semantic_mismatch, missing_required_source_move, operation_semantic_mismatch; report every present concern once in that order. Every concern has exactly kind and a brief reason grounded in supplied text; name the mismatched or uncovered action, but do not propose a repair. Audit three things independently. Apply the first two checks only when action_productions is non-empty; when it is empty, never report source_semantic_mismatch or missing_required_source_move. First, every selected action-production source must denote the ordinary material named in remaining_intent, resolving pronouns from root_player_action and completed_steps. Use only that source own supplied player-safe descriptors as grounding evidence. An unbound sensory sentence, another item descriptor, inventory order, and the player claim do not ground a source ref. Tools are not material sources. Second, independently identify every explicit change of possession or placement in remaining_intent. If the actor explicitly takes, picks up, drops, wears, attaches, or otherwise relocates the selected action-production source, planned_operations must contain a matching move_entity; action production never implies relocation. Do not require movement when the intent only manipulates or transforms the source in place without a separate placement change. Third, each selected_domain_operation must semantically cover the next independently executable action in remaining_intent. Its own supplied query, description, kind, and player-safe referent evidence must match that action; sharing only an actor, place, broad verb, or operation type is insufficient. A fixed authored inspection does not cover a broader general look or a different ordinary search. Every independent clause not covered by that operation must remain in continuation.remaining_intent. Report operation_semantic_mismatch for a different action, over-broad consumption, or lost uncovered clause. In its reason identify the earliest uncovered action and every later clause missing from continuation. Do not report it merely because exact mechanics are absent from player text. Do not plan, repair, invent refs, or judge mechanics.';

export async function auditTurnStepSourceGrounding({ roleRunner, plan,
  request }) {
  const productions = actionProductions(plan, request.player_safe_state);
  const selectedDomains = selectedDomainOperations(plan, request);
  if (productions.length === 0 && selectedDomains.length === 0) return true;
  const response = await roleRunner.run({
    scope: 'turn_runtime', role_id: 'turn_step_grounding_auditor',
    request_identity: request.request_id,
    messages: [{ role: 'system', content: PROMPT }, {
      role: 'user', content: JSON.stringify({
        root_player_action: request.root_player_action,
        remaining_intent: request.remaining_intent,
        completed_steps: request.completed_steps ?? [],
        actor_ref: request.actor?.actor_id,
        planned_operations: { direct: plan.operations ?? [],
          check_outcomes: Object.fromEntries(Object.entries(
            plan.check?.outcomes ?? {}).map(([band, outcome]) => [band,
            outcome.operations ?? []])) },
        selected_domain_operations: selectedDomains,
        continuation: plan.continuation ?? null,
        action_productions: productions,
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
  const allowedKinds = new Set([
    ...(productions.length === 0 ? [] : [
      'source_semantic_mismatch', 'missing_required_source_move'
    ]),
    ...(selectedDomains.length === 0 ? [] : ['operation_semantic_mismatch'])
  ]);
  const definitions = [
    ['source_semantic_mismatch', 'source_semantic_grounding',
      'each source must denote its named material from its own player-safe evidence'],
    ['missing_required_source_move', 'source_placement_grounding',
      'explicit source relocation requires a matching move_entity'],
    ['operation_semantic_mismatch', 'operation_semantic_grounding',
      'selected domain operation must cover the current intent']
  ];
  const errors = definitions
    .filter(([kind]) => allowedKinds.has(kind))
    .flatMap(([kind, code, fallback]) => {
      const concern = response.output.concerns.find((entry) =>
        entry.kind === kind);
      return concern == null ? [] : [{ path: '$.operations', rule: code, code,
        message: concern.reason || fallback }];
    });
  return errors.length === 0 ? true : { pass: false, errors };
}

function selectedDomainOperations(plan, request) {
  const choices = [
    ...(request.available_domain_operations ?? []),
    ...(request.player_safe_state?.local_world_process?.allowed ?? [])
  ];
  return plannedOperations(plan).filter(({ operation }) => choices.some(
    (choice) => isDeepStrictEqual(choice, operation)));
}

function plannedOperations(plan) {
  const found = (plan?.operations ?? []).map((operation, index) => ({
    path: `$.operations.${index}`, operation: structuredClone(operation)
  }));
  for (const [band, outcome] of Object.entries(plan?.check?.outcomes ?? {})) {
    for (const [index, operation] of (outcome.operations ?? []).entries()) {
      found.push({ path: `$.check.outcomes.${band}.operations.${index}`,
        operation: structuredClone(operation) });
    }
  }
  return found;
}

function actionProductions(plan, state) {
  const found = [];
  const add = (operation, path) => {
    if (operation?.op !== 'request_item_use'
        || operation.action_production == null) return;
    const refs = operation.action_production.source_refs;
    found.push({ path, source_refs: structuredClone(refs),
      sources: sourceDescriptors(state, refs) });
  };
  for (const [index, operation] of (plan?.operations ?? []).entries()) {
    add(operation, `$.operations.${index}`);
  }
  for (const [band, outcome] of Object.entries(plan?.check?.outcomes ?? {})) {
    for (const [index, operation] of (outcome.operations ?? []).entries()) {
      add(operation, `$.check.outcomes.${band}.operations.${index}`);
    }
  }
  return found;
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
      && Object.keys(concern).length === 2
      && ['source_semantic_mismatch', 'missing_required_source_move',
        'operation_semantic_mismatch']
        .includes(concern.kind)
      && typeof concern.reason === 'string' && concern.reason.trim());
}
