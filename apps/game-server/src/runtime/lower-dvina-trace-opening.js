import { validateFirstGameScreen } from '@rus/presentation';
import { detectHiddenLeaks, validateVisibleContext } from '@rus/visibility-knowledge-memory';

const FORBIDDEN_KEYS = new Set([
  'hidden_truth',
  'culprit',
  'motive',
  'hidden_sequence',
  'sealed_selections',
  'clue_placements',
  'lies_and_statements',
  'private_knowledge',
  'materialization_trace',
  'policy_profile_pins',
  'completion_state',
  'epilogue_state'
]);
const SCREEN_ENVIRONMENT_FACTS = new Set(['cold', 'wet', 'exposed']);

export function buildLowerDvinaTraceOpeningScreen({
  visible,
  approvedProjection,
  openingProse = null
} = {}) {
  assertVisibleSource(visible, approvedProjection);
  const projection = approvedProjection.opening_projection;
  const screen = {
    version: projection.version,
    schema: projection.schema,
    screen_status: 'ready',
    party_id: visible.party_id,
    scenario_id: approvedProjection.scenario_id,
    main_prose: openingProse ?? projection.opening_prose,
    visible_context: {
      place: projection.place_label,
      calendar: projection.calendar_label,
      timestamp: structuredClone(visible.timestamp),
      environment: { facts: visible.environment.facts.filter((fact) =>
        SCREEN_ENVIRONMENT_FACTS.has(fact)) }
    },
    action_panel: { suggested_actions: [] },
    panels: {
      character: {
        visible: true,
        data: {
          name: visible.player.name,
          role: visible.player.social_status.display_name,
          health: visible.body.health,
          energy: visible.body.energy,
          satiety: visible.body.satiety
        }
      },
      route: {
        visible: true,
        data: { current_place: projection.place_label }
      }
    },
    input_panel: {
      free_text_enabled: false,
      input_contract: 'gameplay_not_available'
    },
    delivery_state: {
      message_id: `opening:${visible.party_id}`,
      ready: true
    }
  };
  assertLowerDvinaTracePublicScreen(screen);
  return freezeDeep(screen);
}

export function buildAuthoredOpeningVisibleContext({ requestId, visible,
  internal, approvedProjection, naturalScenePerception = null } = {}) {
  assertVisibleSource(visible, approvedProjection);
  if (naturalScenePerception != null && (naturalScenePerception.ok !== true
    || !validateVisibleContext(naturalScenePerception.visible_context).ok
    || !Array.isArray(naturalScenePerception.perceived_facts)
    || naturalScenePerception.perceived_facts.some((fact) =>
      !naturalScenePerception.visible_context.sensory_details?.includes(fact.text)))) {
    fail('NATURAL_SCENE_PERCEPTION_DATA_GAP', 'Approved natural scene perception is required.');
  }
  const naturalFacts = naturalScenePerception?.perceived_facts ?? [];
  const dossier = internal?.player?.dossier;
  const context = dossier?.opening_context;
  if (context?.schema !== 'rus.authored_start_opening_context.v1') {
    fail('AUTHORED_OPENING_CONTEXT_INVALID', 'Persisted authored opening context is unavailable.');
  }
  const actorId = internal.player.instance_id;
  const position = internal.position;
  const localNpc = (internal.npcs ?? []).filter((npc) =>
    npc.anchor_id === position.g5_anchor_id);
  const playerItems = (internal.items ?? []).filter((item) =>
    item.placement?.holder_character_id === actorId);
  const knownFacts = dossier.knowledge?.known_facts ?? [];
  const relations = localNpc.flatMap((npc) => (npc.relationships ?? [])
    .filter(({ target_actor_id: target }) => target === actorId)
    .map((relation) => ({ npc_instance_id: npc.instance_id,
      npc_name: npc.identity_state?.canonical_name,
      relation_kind: relation.kind, standing: relation.standing })));
  const visibleNpcs = localNpc.map((npc) => ({
    npc_instance_id: npc.instance_id,
    label: relations.some(({ npc_instance_id: id }) => id === npc.instance_id)
      ? npc.identity_state?.canonical_name
      : npc.identity_state?.public_role_label,
    current_activity: npc.machine_state?.current_activity?.summary ?? null,
    recognition: relations.some(({ npc_instance_id: id }) => id === npc.instance_id)
      ? 'recognized' : 'unrecognized'
  }));
  const visibleItems = playerItems.map((item) => ({
    item_instance_id: item.instance_id, label: item.state?.display_name,
    placement: 'held_by_player', condition: item.condition_state
  }));
  const local = context.local_structure;
  const facts = [
    { fact_id: 'opening:identity', text: `${dossier.identity.name} — ${dossier.social_status.display_name}.`, source_refs: [actorId] },
    ...knownFacts.map((text, index) => ({ fact_id: `opening:known:${index + 1}`,
      text, source_refs: [actorId] })),
    { fact_id: 'opening:foreground', text: context.foreground.text,
      source_refs: [context.foreground.anchor_ref] },
    ...context.far_orientation.map((entry, index) => ({
      fact_id: `opening:far:${index + 1}`, text: entry.text,
      source_refs: [entry.anchor_ref] })),
    { fact_id: 'opening:local-structure',
      text: `${local.name}: ${local.description}`,
      source_refs: [local.interior_position_ref, ...local.movement_edge_refs] },
    ...visible.environment.facts.map((text, index) => ({
      fact_id: `opening:environment:${index + 1}`, text,
      source_refs: [position.g5_anchor_id] })),
    ...naturalFacts.map((fact, index) => ({ fact_id: `opening:natural:${index + 1}`,
      text: fact.text, source_refs: [fact.source_position_id] }))
  ];
  const bodySummary = bodyStateSummary(visible.body);
  const mustInclude = [
    ['identity', facts[0].text],
    ['preceding_context', knownFacts.at(-1)],
    ['people', visibleNpcs.map(({ label, current_activity: activity }) =>
      [label, activity].filter(Boolean).join(': ')).join('; ')],
    ['current_event', knownFacts[0]],
    ['goal_stake', knownFacts[0]],
    ['surroundings', [context.foreground.text,
      ...context.far_orientation.map(({ text }) => text), local.description,
      ...naturalFacts.map(({ text }) => text)].join(' ')],
    ['body', bodySummary],
    ['directions_interactions', `${local.name}; ${visibleNpcs.map(({ label }) => label).join('; ')}; ${visibleItems.map(({ label }) => label).join('; ')}`]
  ].map(([category, text]) => ({ category, text }));
  const reader = auditAuthoredOpeningContext({ mustInclude, visibleNpcs,
    visibleItems, localStructure: local, knownFacts });
  if (!reader.pass) fail('AUTHORED_OPENING_CONTEXT_INCOMPLETE',
    'Authored opening context does not answer the required reader controls.', reader);
  return freezeDeep({
    version: 1, schema: 'visible_context_package', request_id: requestId,
    visible_context_status: 'formed',
    frame: { region_id: position.g4_id, year: 1230, season: 'late_summer',
      clock: structuredClone(visible.timestamp),
      weather_state: { facts: structuredClone(visible.environment.facts) },
      light_profile: 'daylight' },
    position: { region_id: position.g4_id, place_id: position.g5_node_id,
      location_id: position.g5_node_id, minilocation_id: local.g6_instance_ref,
      anchor_id: position.g5_anchor_id },
    narrator_scope: { allowed_surfaces: ['opening'], forbidden_surfaces: ['hidden_state'],
      style_constraints: ['connected_literary_russian', 'second_person', 'two_to_four_paragraphs'],
      knowledge_boundary: { player_safe_only: true } },
    visible_scene_dossier: { must_include: mustInclude,
      must_not_include: ['unprovided hidden facts', 'unconfirmed routes',
        'unpersisted props'] },
    visible_scene_facts: facts,
    visible_anchors: [{ anchor_id: position.g5_anchor_id,
      label: approvedProjection.opening_projection.place_label },
    { anchor_id: local.interior_position_ref, label: local.name }],
    visible_exits: local.movement_edge_refs.map((edge_id) => ({ edge_id,
      anchor_id: local.interior_position_ref, label: local.name })),
    visible_npcs: visibleNpcs,
    visible_items: visibleItems,
    visible_containers: [], visible_risks: [],
    audible_context: [...visible.environment.facts.slice(1).map((text) => ({
      text, source_ref: { anchor_id: position.g5_anchor_id } })),
    ...naturalFacts.filter((fact) => fact.channel === 'acoustic').map((fact) => ({
      text: fact.text, source_ref: { position_id: fact.source_position_id } }))],
    smell_context: [], touch_body_context: [{ text: bodySummary }],
    weather_light_context: visible.environment.facts.slice(0, 1).map((text) => ({ text })),
    known_context: knownFacts.map((text) => ({ text, basis_refs: [actorId] })),
    rumor_context: [], uncertain_context: [{ text: context.uncertainty,
      uncertainty_marker: true, confidence: 'medium',
      inference_basis_refs: [actorId] }],
    available_actions_context: [], hidden_filtered_out: [],
    source_trace: [{ source_id: actorId, kind: 'persisted_authored_start' }],
    audit_self_check: { pass: true, concerns: [],
      evidence: ['All opening facts bind persisted actor, place, NPC, item or topology state.'] },
    opening_reader_control: reader
  });
}

export function auditAuthoredOpeningContext({ mustInclude = [], visibleNpcs = [],
  visibleItems = [], localStructure = null, knownFacts = [] } = {}) {
  const categories = new Set(mustInclude.filter(({ text }) =>
    typeof text === 'string' && text.trim()).map(({ category }) => category));
  const checks = Object.fromEntries([
    'identity', 'preceding_context', 'people', 'current_event', 'goal_stake',
    'surroundings', 'body', 'directions_interactions'
  ].map((key) => [key, categories.has(key)]));
  checks.people &&= visibleNpcs.length > 0;
  checks.directions_interactions &&= visibleItems.length > 0
    && typeof localStructure?.interior_position_ref === 'string';
  checks.preceding_context &&= knownFacts.length > 1;
  return freezeDeep({ version: 1,
    schema: 'rus.authored_opening_reader_control.v1',
    pass: Object.values(checks).every(Boolean), checks });
}

function bodyStateSummary(body) {
  const health = Number(body?.health), energy = Number(body?.energy),
    satiety = Number(body?.satiety);
  if (![health, energy, satiety].every(Number.isFinite)) {
    fail('AUTHORED_OPENING_CONTEXT_INVALID', 'Player body state is unavailable.');
  }
  const condition = health >= 75 ? 'Вы не ранены'
    : health >= 40 ? 'Вы чувствуете боль' : 'Вы тяжело ранены';
  const fatigue = energy >= 60 ? 'сил достаточно для работы'
    : energy >= 30 ? 'чувствуется усталость' : 'сил почти не осталось';
  const hunger = satiety >= 50 ? 'сильного голода нет' : 'вы голодны';
  return `${condition}; ${fatigue}; ${hunger}.`;
}

export function assertLowerDvinaTracePublicScreen(screen) {
  const validation = validateFirstGameScreen(screen);
  const leaks = explicitLeaks(screen);
  if (!validation.ok || detectHiddenLeaks(screen).length > 0
    || leaks.length > 0) {
    fail(
      'TRACE_PHASE_1B_OPENING_SCREEN_INVALID',
      'Trace opening screen failed presentation or hidden-boundary validation.',
      { errors: validation.errors, leaks }
    );
  }
  return screen;
}

function assertVisibleSource(visible, approvedProjection) {
  if (!visible || typeof visible !== 'object' || Array.isArray(visible)
    || visible.party_id == null
    || !visible.player?.name
    || !visible.player?.social_status?.display_name
    || !visible.position?.g4_id
    || !visible.position?.g5_node_id
    || !visible.position?.g5_anchor_id
    || !visible.timestamp?.whole_minutes
    || !Number.isFinite(Number(visible.body?.health))
    || !Number.isFinite(Number(visible.body?.energy))
    || !Number.isFinite(Number(visible.body?.satiety))
    || !visible.environment?.environment_profile_id
    || !Array.isArray(visible.environment?.facts)) {
    fail(
      'TRACE_PHASE_1B_VISIBLE_STATE_INCOMPLETE',
      'Committed visible state is incomplete for the approved opening projection.'
    );
  }
  const allowlist =
    approvedProjection?.opening_projection?.visible_field_allowlist;
  if (!Array.isArray(allowlist)
    || JSON.stringify(allowlist) !== JSON.stringify([
      'party_id',
      'player.name',
      'player.social_status',
      'position',
      'timestamp',
      'body',
      'environment'
    ])) {
    fail(
      'TRACE_PHASE_1B_VISIBLE_ALLOWLIST_INVALID',
      'Opening projection allowlist is missing or incompatible.'
    );
  }
  const allowedRoots = new Set(allowlist.map((path) => path.split('.')[0]));
  if (Object.keys(visible).some((key) => !allowedRoots.has(key))
    || detectHiddenLeaks(visible).length > 0
    || explicitLeaks(visible).length > 0) {
    fail(
      'TRACE_PHASE_1B_VISIBLE_STATE_HIDDEN_LEAK',
      'Opening projection source contains a forbidden or unapproved field.',
      { leaks: explicitLeaks(visible) }
    );
  }
}

function explicitLeaks(value, path = [], leaks = []) {
  if (!value || typeof value !== 'object') return leaks;
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      explicitLeaks(entry, [...path, index], leaks));
    return leaks;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
      leaks.push([...path, key].join('.'));
    }
    explicitLeaks(nested, [...path, key], leaks);
  }
  return leaks;
}

function fail(code, message, details = {}) {
  throw Object.assign(new Error(message), {
    code,
    status: 409,
    details
  });
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}
