import test from 'node:test';
import assert from 'node:assert/strict';
import { playerSafeAppearanceSummary as canonicalSummary } from
  '../src/runtime/player-safe-appearance-summary.js';
import { playerSafeAppearanceSummary as traceSummary } from
  '../src/runtime/lower-dvina-trace-player-safe-appearance.js';
import { projectLowerDvinaTraceScreenPanels } from
  '../src/infrastructure/postgres/lower-dvina-trace-screen-panels.js';
import { lowerDvinaTraceObservedSceneChanges } from
  '../src/runtime/lower-dvina-trace-visible-scene-items.js';

import { createProductionWorldKnowledgeGrounder } from
  '../src/runtime/world-knowledge-grounding.js';
import { createAuthoredOpeningNarrationService } from
  '../src/runtime/authored-opening-narration.js';
import { buildAuthoredOpeningVisibleContext } from
  '../src/runtime/lower-dvina-trace-opening.js';
import { buildCanonicalOpeningVisibleContext } from
  '../src/runtime/canonical-opening-context.js';
import { projectG4NaturalPerception } from
  '../src/runtime/g4-natural-perception.js';
import { projectSpatialV3CurrentVisibleContext } from
  '../src/runtime/spatial-v3-current-visible-context.js';
import { approvedNaturalPerceptionFixture } from './g4-natural-perception-fixture.js';
import { buildVisibleContextAuditApproval, computeVisibleContextPackageDigest } from
  '@rus/contracts';

// Production cue shape: footwear can precede the base garment in equipment.
function equipment(slot, color, fabric) {
  return { physical_position: 'equipped', equipment_slot_category_id: slot,
    visual_profile_snapshot: { schema: 'item_visual_profile_snapshot_v1',
      version: 1, equipment_slot: slot, main_visible_color: color,
      visible_fabric: fabric,
      ...(slot === 'footwear' ? { outer_form: 'low_leather_shoe' } : {}) } };
}

function defaultEquipment() {
  return [equipment('footwear', 'brown', 'leather'),
    equipment('base_garment', 'undyed_linen', 'light_linen')];
}

function npc(id = 'npc-shirt', worn = defaultEquipment()) {
  return { entity_ref: { entity_kind: 'npc', entity_id: id },
    display_label: 'женщина', recognition: 'unrecognized',
    observable_cues: { identity: { sex_category: 'female', age_category: 'adult',
      appearance: {} }, equipment: worn } };
}

function context(npcs) {
  return { version: 1, schema: 'visible_context_package',
    visible_scene: 'Рыбацкий стан.', visible_changes: [], sensory_details: [],
    visible_npc: npcs, visible_objects: [], known_context: [],
    uncertainties: [], allowed_tensions: [], do_not_imply: [] };
}

function assertShirtColor(text, where) {
  assert.match(text, /неокрашенная льняная одежда/u,
    `${where}: clothing color must come from the linen shirt`);
  assert.doesNotMatch(text, /коричневая одежда/u,
    `${where}: brown footwear must not supply the clothing color`);
}

const summaries = { canonical: canonicalSummary, trace: traceSummary };
const cases = [
  ['footwear before shirt', defaultEquipment(), 'неокрашенная льняная одежда'],
  ['shirt before footwear', defaultEquipment().reverse(), 'неокрашенная льняная одежда'],
  ['headwear before shirt', [equipment('headwear', 'madder_red', 'wool'),
    ...defaultEquipment()], 'неокрашенная льняная одежда'],
  ['base alias', [equipment('footwear', 'brown', 'leather'),
    equipment('base', 'undyed_linen', 'light_linen')], 'неокрашенная льняная одежда'],
  ['outer garment wins', [...defaultEquipment(),
    equipment('outer_garment', 'dark_blue', 'wool')], 'тёмно-синяя одежда'],
  ['outer alias wins', [...defaultEquipment(),
    equipment('outer', 'dark_blue', 'wool')], 'тёмно-синяя одежда'],
  ['footwear and headwear without garment', [equipment('footwear', 'brown', 'leather'),
    equipment('headwear', 'madder_red', 'wool')], null]
];

for (const [path, summarize] of Object.entries(summaries)) {
  for (const [name, worn, expected] of cases) {
    test(`issue #620: ${path} summary — ${name}`, () => {
      const visibleNpc = npc('npc-shirt', structuredClone(worn));
      const before = structuredClone(visibleNpc);
      const summary = summarize(visibleNpc) ?? '';
      if (expected !== null) {
        assert.ok(summary.includes(expected),
          `${path}/${name}: expected "${expected}", got "${summary}"`);
      }
      assert.doesNotMatch(summary, /коричневая одежда|красная одежда/u,
        `${path}/${name}: footwear and headwear must not supply the clothing color`);
      assert.deepEqual(visibleNpc, before, 'summarizing must preserve the observed cues');
    });
  }
}

function garmentColor(summary) {
  return summary?.match(/(?:неокрашенная льняная|тёмно-синяя|зелёная|красная|охряная|коричневая|угольно-серая) одежда/u)?.[0] ?? null;
}

test('issue #620: summary outputs agree on garment color across cue matrix', () => {
  for (const [name, worn, expected] of cases) {
    const visibleNpc = npc('npc-shirt', structuredClone(worn));
    const canonicalColor = garmentColor(canonicalSummary(visibleNpc));
    const traceColor = garmentColor(traceSummary(visibleNpc));
    assert.equal(canonicalColor, traceColor,
      `${name}: both summary paths must report the same garment color`);
    if (expected !== null) assert.equal(canonicalColor, expected);
    else assert.equal(canonicalColor, null);
  }
});

test('issue #620: people panel preserves the shirt color', () => {
  const npcs = [npc('npc-shirt-1'), npc('npc-shirt-2')];
  const visible = context(npcs);
  const payload = { party_id: 'party-620', actor_id: 'player-620',
    party_state: { state_version: 1, turn_number: 1 },
    position: { location_ref: 'camp' }, current_visible_context: visible,
    npcs: npcs.map(({ entity_ref: ref }) => ({ instance_id: ref.entity_id,
      location_ref: 'camp' })), conversation_sessions: [], last_turn: {},
    opening_identity: {} };
  const people = projectLowerDvinaTraceScreenPanels({ payload,
    screen: { panels: {}, visible_context: visible }
  }).panels.people.data.visible_npcs;
  assert.equal(people.length, 2);
  for (const person of people) {
    assertShirtColor([person.display_label, person.appearance].filter(Boolean).join(', '),
      'people panel');
  }
});

test('issue #620: observed scene preserves the shirt color in duplicate NPC labels', () => {
  // A single label bypasses the summary in distinctNpcLabels.
  const changes = lowerDvinaTraceObservedSceneChanges(
    context([npc('npc-shirt-1'), npc('npc-shirt-2')]));
  assert.ok(changes.length > 0, 'observation must describe the visible people');
  for (const change of changes) assertShirtColor(change, 'observed scene');
});

test('issue #620: WK planner wire preserves shirt color without outerwear', async () => {
  const wire = await issue620TurnPlannerWire(npc());
  const summary = canonicalSummary(npc()) ?? '';
  assert.ok(wire.situation_summary.includes(summary),
    'the turn planner wire carries the canonical appearance summary');
  assert.match(wire.situation_summary, /неокрашенная льняная одежда/u,
    'WK must describe the base garment color rather than the first equipped item');
  assert.doesNotMatch(wire.situation_summary, /коричневая одежда/u,
    'brown footwear must not supply the clothing color in the WK planner input');
});

async function issue620TurnPlannerWire(visibleNpc) {
  const conceptRef = 'wk:material_culture:clothing';
  const claimRef = 'claim:issue620:clothing';
  const bundle = {
    manifest: { status: 'production', pack_ref: 'pack:issue620',
      revision_id: 'revision:issue620', supported_locales: ['en'],
      default_locale: 'en', domains: ['material'] },
    coverage_profiles: [{ domain: 'material', status: 'production',
      purposes: ['semantic_resolution'] }],
    concepts: [{ concept_ref: conceptRef, domain: 'material',
      review_status: 'approved', localizations: {} }],
    claims: [{ claim_ref: claimRef, domain: 'material',
      applicability: { context_scope: 'universal' },
      knowledge_access: { class: 'general_physical', required_facets: [] } }],
    exact_indexes: { concept_to_claim_refs: { [conceptRef]: [claimRef] } },
    lexical_indexes: { en: { clothing: [claimRef] } },
    predicate_registry: { material: {} }
  };
  const calls = [];
  const grounder = createProductionWorldKnowledgeGrounder({
    worldKnowledge: {
      bundle,
      encoder: { encode: async () => [1] },
      vector_index: { search: () => new Map() },
      core: { resolveWorldKnowledge(query) {
        return { schema: 'world_knowledge_slice_v1',
          pack_ref: 'pack:issue620', pack_revision: 'revision:issue620',
          purpose: query.purpose, coverage: [], verdict: 'insufficient',
          hard_constraints: [], facts: [], disputes: [], gaps: [] };
      } }
    },
    roleRunner: { async run(call) {
      calls.push(call);
      return { output: { schema: 'world_knowledge_query_plan_v1',
        query_locale: 'en', domains: ['material'], focus_refs: [conceptRef],
        requested_predicates: [], search_hints: ['clothing'] } };
    } }
  });
  await grounder.ground({ input_locale: 'en', remaining_intent: 'clothing',
    player_safe_state: { actor_id: 'player:issue620', position: {}, items: [],
      current_visible_context: context([visibleNpc]) } }, 'semantic_resolution');

  assert.equal(calls.length, 1, 'the test captures the main planner request');
  return JSON.parse(calls[0].messages[1].content);
}

test('issue #620: opening wire distinguishes linen shirt from brown footwear', async () => {
  const woman = npc();
  const pkg = issue620OpeningPackage(woman);
  const calls = [];
  const prose = pkg.visible_scene_dossier.must_include
    .map(({ text }) => text).join(' ');
  const service = createAuthoredOpeningNarrationService({ roleRunner: {
    async run(call) {
      calls.push(call);
      if (call.role_id === 'gameplay_narrator') return { output: { prose } };
      return { output: { pass: true, failed_checks: [], concerns: [],
        evidence: ['Видимые детали даны.'] } };
    }
  } });
  await service.run({ requestId: pkg.request_id,
    visibleContextPackage: pkg,
    visibleContextApproval: issue620OpeningApproval(pkg) });

  const writerCall = calls.find(({ role_id }) => role_id === 'gameplay_narrator');
  assert.ok(writerCall, 'the test captures the opening writer request');
  const groups = JSON.parse(writerCall.messages[1].content).сцена.персонажи;
  const womanFacts = groups.find(({ имя }) => имя === woman.display_label)?.факты;
  assert.ok(Array.isArray(womanFacts), 'the woman has visible facts in the opening');
  const shirtFact = womanFacts.find((fact) => fact.startsWith('Нижняя одежда:'));
  const footwearFact = womanFacts.find((fact) => fact.startsWith('Обувь:'));
  assert.equal(typeof shirtFact, 'string', 'the opening preserves the base garment slot');
  assert.equal(typeof footwearFact, 'string', 'the opening preserves the footwear slot');
  assert.match(shirtFact, /цвета неокрашенного льна/u,
    'the opening describes the linen shirt color');
  assert.doesNotMatch(shirtFact, /коричневого цвета/u,
    'the shirt fact must not acquire the footwear color');
  assert.match(footwearFact, /коричневого цвета/u,
    'the separate footwear fact retains its brown color');
});

test('issue #620: canonical opening and turn wires share the same appearance summary', async () => {
  const woman = npc();
  const pkg = await issue620CanonicalOpeningPackage(woman);
  const perceivedWoman = pkg.visible_npcs.find(({ npc_instance_id }) =>
    npc_instance_id === woman.entity_ref.entity_id);
  const turnNpc = { ...woman, display_label: perceivedWoman.label,
    recognition: perceivedWoman.recognition,
    observable_cues: perceivedWoman.observable_cues };
  const turnWire = await issue620TurnPlannerWire(turnNpc);
  const calls = [];
  const prose = pkg.visible_scene_dossier.must_include
    .map(({ text }) => text).join(' ');
  const service = createAuthoredOpeningNarrationService({ roleRunner: {
    async run(call) {
      calls.push(call);
      if (call.role_id === 'gameplay_narrator') return { output: { prose } };
      return { output: { pass: true, failed_checks: [], concerns: [],
        evidence: ['Видимые детали даны.'] } };
    }
  } });
  await service.run({ requestId: pkg.request_id,
    visibleContextPackage: pkg,
    visibleContextApproval: issue620OpeningApproval(pkg) });

  const writerCall = calls.find(({ role_id }) => role_id === 'gameplay_narrator');
  assert.ok(writerCall, 'the test captures the canonical opening writer request');
  const openingWire = JSON.parse(writerCall.messages[1].content);
  const womanFacts = openingWire.сцена.персонажи
    .find(({ имя }) => имя === woman.display_label)?.факты ?? [];
  const shirtFact = womanFacts.find((fact) => fact.startsWith('Нижняя одежда:'));
  const footwearFact = womanFacts.find((fact) => fact.startsWith('Обувь:'));
  assert.equal(typeof shirtFact, 'string', 'canonical opening retains the base garment fact');
  assert.match(shirtFact, /цвета неокрашенного льна/u);
  assert.doesNotMatch(shirtFact, /коричневого цвета/u);
  assert.equal(typeof footwearFact, 'string', 'canonical opening retains the footwear fact');
  assert.match(footwearFact, /коричневого цвета/u,
    'canonical perception retains brown footwear as its separate fact');
  assert.equal(garmentColor(turnWire.situation_summary),
    'неокрашенная льняная одежда',
    'turn facts preserve the base garment color seen in the canonical opening');
});

function issue620OpeningPackage(woman) {
  const visible = {
    party_id: 'party:issue620',
    player: { name: 'Любава', social_status: { display_name: 'рыбачка' } },
    position: { g4_id: 'g4', g5_node_id: 'g5', g5_anchor_id: 'anchor:start' },
    timestamp: { whole_minutes: '1' },
    body: { health: 92, energy: 71, satiety: 66 },
    environment: { environment_profile_id: 'env', facts: [
      'Светлое позднелетнее утро.', 'Слышны течение и работа на берегу.'
    ] }
  };
  const internal = {
    player: { instance_id: 'player:issue620', dossier: {
      identity: { name: 'Любава' }, social_status: { display_name: 'рыбачка' },
      knowledge: { known_facts: ['До вечера проверить снасти.',
        'С рассвета Любава работает вместе с братом.'] },
      opening_context: { schema: 'rus.authored_start_opening_context.v1',
        source_hint: 'hint', foreground: { text: 'Берег и настил.',
          anchor_ref: 'anchor:start' },
        far_orientation: [{ text: 'Выше по берегу сушильня.', anchor_ref: 'anchor:far' }],
        local_structure: { name: 'навес', description: 'Открытый рабочий навес.',
          g6_instance_ref: 'g6:inside', interior_position_ref: 'position:inside',
          movement_edge_refs: ['edge:out', 'edge:back'] },
        uncertainty: 'Снасти ещё не проверены.' }
    } },
    position: visible.position,
    npcs: [{ instance_id: 'npc:brother', anchor_id: 'anchor:start',
      identity_state: { canonical_name: 'Милослав', public_role_label: 'лодочник' },
      machine_state: {}, relationships: [{ target_actor_id: 'player:issue620',
        kind: 'older_brother', standing: 'trusted' }] },
    { instance_id: woman.entity_ref.entity_id, anchor_id: 'anchor:start',
      identity_state: { public_role_label: woman.display_label },
      relationships: [], machine_state: { current_activity: { summary: 'Чинит снасти.' } } }],
    items: [{ instance_id: 'item:rope', placement: { holder_character_id: 'player:issue620' },
      state: { display_name: 'верёвка' }, condition_state: 'serviceable' }]
  };
  const pkg = structuredClone(buildAuthoredOpeningVisibleContext({
    requestId: 'opening:issue620', visible, internal,
    approvedProjection: { scenario_id: 'scenario', opening_projection: {
      place_label: 'рыбацкий стан', opening_prose: 'hint',
      visible_field_allowlist: ['party_id', 'player.name', 'player.social_status',
        'position', 'timestamp', 'body', 'environment'] } }
  }));
  const target = pkg.visible_npcs.find(({ npc_instance_id }) =>
    npc_instance_id === woman.entity_ref.entity_id);
  assert.ok(target, 'the opening builder includes the same visible woman');
  target.observable_cues = structuredClone(woman.observable_cues);
  return pkg;
}

async function issue620CanonicalOpeningPackage(woman) {
  const { perception, initialRule } =
    await approvedNaturalPerceptionFixture({ canonical: true });
  const visible = {
    party_id: 'party:1', player: { name: 'Любава',
      social_status: { display_name: 'рыбачка' } },
    position: { g4_id: 'g4', g5_node_id: 'site',
      g5_anchor_id: 'anchor:start' },
    timestamp: { whole_minutes: '1' },
    body: { health: 92, energy: 71, satiety: 66 },
    environment: { environment_profile_id: 'env', facts: [] }
  };
  const internal = {
    player: { instance_id: 'player:1', dossier: { knowledge: { known_facts: [] } } },
    position: { ...visible.position, position_id: 'position:shore',
      g6_instance_id: 'g6:inside' },
    items: [], environment_snapshot: {
      schema: 'rus.approved_initial_environment.v1',
      calendar_date: initialRule.initial_environment_inputs.calendar_date,
      season: 'summer', day_part: 'civil_dawn', light_state: 'daylight',
      weather_state: { precipitation: 'none', visibility: 'normal', wind: 'calm_or_light' }
    }
  };
  const approvedProjection = { scenario_id: initialRule.scenario_id,
    opening_projection: { place_label: 'рыбацкий стан',
      visible_field_allowlist: ['party_id', 'player.name',
        'player.social_status', 'position', 'timestamp', 'body',
        'environment'] } };
  const naturalInput = { ...perception, entity_observations: [{ entity_kind: 'npc',
      entity_id: woman.entity_ref.entity_id, visibility: 'clear',
      display_label: woman.display_label, exterior: {
        sex_category: 'female', age_category: 'adult', appearance: {},
        visible_equipment: structuredClone(woman.observable_cues.equipment)
      } }] };
  const natural = projectG4NaturalPerception({ input: naturalInput,
    partyId: visible.party_id, actorId: internal.player.instance_id,
    positionId: internal.position.position_id });
  const naturalScenePerception = { ...natural, visible_context:
    projectSpatialV3CurrentVisibleContext({ naturalInput,
      partyId: visible.party_id, actorId: internal.player.instance_id,
      positionId: internal.position.position_id,
      entityObservations: naturalInput.entity_observations,
      localEdges: [], directionalExits: [] }) };
  const pkg = buildCanonicalOpeningVisibleContext({
    requestId: 'opening:issue620-canonical', visible, internal,
    approvedProjection, naturalScenePerception,
    canonicalSourceBinding: perception.canonical_source_binding
  });
  const projectedNpc = pkg.visible_npcs.find(({ npc_instance_id }) =>
    npc_instance_id === woman.entity_ref.entity_id);
  assert.ok(projectedNpc, 'perception includes the target NPC in the opening');
  assert.deepEqual(projectedNpc.observable_cues, {
    ...woman.observable_cues, held_items: []
  }, 'opening builder carries perceived equipment and canonical empty held items');
  return pkg;
}

function issue620OpeningApproval(pkg) {
  const digest = computeVisibleContextPackageDigest(pkg);
  return buildVisibleContextAuditApproval({ request_id: pkg.request_id,
    pass: true, visible_context_package_digest: digest,
    visible_context_audit: { request_id: pkg.request_id, pass: true,
      visible_context_package_digest: digest },
    commit_permission: { can_send_to_narrator: true,
      can_write_visible_context_snapshot: true,
      can_generate_player_facing_prose: true } });
}
