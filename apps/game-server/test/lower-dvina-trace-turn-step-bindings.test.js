import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  bindLowerDvinaTraceTurnStepCommands
} from '../src/runtime/lower-dvina-trace-turn-step-bindings.js';

const turnStepBindings = JSON.parse(await readFile(
  'data/world-catalogs/novgorod/lower-dvina-trace-v1/'
    + 'phase-m1-content/turn-step-bindings.json',
  'utf8'
));
const revision15Bindings = JSON.parse(await readFile(
  'data/world-catalogs/novgorod/lower-dvina-trace-v1/'
    + 'phase-m3-content/turn-step-bindings.json',
  'utf8'
));
const revision16Bindings = JSON.parse(await readFile(
  'data/world-catalogs/novgorod/lower-dvina-trace-v1/'
    + 'phase-m4-content/turn-step-bindings.json',
  'utf8'
));
const revision17Bindings = JSON.parse(await readFile(
  'data/world-catalogs/novgorod/lower-dvina-trace-v1/'
    + 'phase-m5-content/turn-step-bindings.json',
  'utf8'
));
const commandIds = turnStepBindings.domain_bindings.map(
  ({ command_id: commandId }) => commandId
);
const handlers = Object.freeze({
  availability: () => null,
  consequence: () => null,
  writeTargets: () => []
});
const commands = commandIds.map((commandId) => ({
  command_id: commandId,
  label: commandId,
  matches: () => false,
  ...handlers
}));
const targetRefs = Object.freeze({
  actor: 'player',
  wreck: 'trace_ld_v1_loc_wreck_shore',
  fishingCamp: 'trace_ld_v1_loc_fishing_camp',
  eremey: 'npc:eremey',
  evidence: 'trace_ld_v1_evidence_blue_wool',
  dryingShed: 'trace_ld_v1_loc_old_drying_shed',
  ratsha: 'npc:ratsha',
  onisim: 'npc:onisim',
  participatingFisher: 'npc:fisher-1',
  otherFisher: 'npc:fisher-2',
  zhdankoStorehouse: 'place:zhdanko-storehouse',
  zhdanko: 'npc:zhdanko',
  activeHostileNpc: 'npc:hostile',
  combatScope: 'place:combat-scope',
  roadBag: 'item:road-bag',
  sealedPacket: 'item:sealed-packet',
  caseEvidence: 'case:evidence',
  temporaryDispositionOptions: {
    custody: ['custody:hold'], property: ['property:preserve'],
    promise: ['promise:recognize']
  }
});

test('historical revision keeps the original bounded command definitions', () => {
  const historical = bindLowerDvinaTraceTurnStepCommands({
    commands,
    bundle: { definition_revision: 12 },
    targetRefs
  });
  assert.equal(historical, commands);
  assert.equal(historical.some(({ semantic_binding: binding }) => binding),
    false);
});

test('revision 13 bindings preserve mechanics and map all approved domains', () => {
  const bound = bindLowerDvinaTraceTurnStepCommands({
    commands,
    bundle: {
      definition_revision: 13,
      turn_step_bindings: turnStepBindings
    },
    targetRefs
  });
  assert.equal(bound.length, 8);
  for (let index = 0; index < bound.length; index += 1) {
    assert.equal(bound[index].availability, commands[index].availability);
    assert.equal(bound[index].consequence, commands[index].consequence);
    assert.equal(bound[index].writeTargets, commands[index].writeTargets);
    assert.equal(typeof bound[index].semantic_binding?.matches, 'function');
  }
  assertMatches(bound, 'lower_dvina_trace.inspect_wreck_in_detail', {
    op: 'request_discovery', actor_ref: 'player',
    discovery_kind: 'inspect', target_refs: [targetRefs.wreck],
    query: 'lower_dvina_trace.inspect_wreck_in_detail'
  });
  assertMatches(bound, 'lower_dvina_trace.follow_path_to_fishing_camp', {
    op: 'request_movement', actor_ref: 'player', movement_kind: 'local',
    target_ref: targetRefs.fishingCamp
  });
  const fishingCamp = bound.find(({ command_id: id }) =>
    id === 'lower_dvina_trace.follow_path_to_fishing_camp');
  assert.equal(fishingCamp.semantic_binding.operation_dto.description,
    fishingCamp.label);
  assertMatches(bound, 'lower_dvina_trace.ask_eremey_about_wreck', {
    op: 'emit_interaction', actor_ref: 'player', interaction_kind: 'speech',
    target_actor_refs: [targetRefs.eremey], instrument_refs: [], content: 'что было'
  });
  assertMatches(bound,
    'lower_dvina_trace.show_clue_and_seek_eremey_cooperation', {
      op: 'emit_interaction', actor_ref: 'player', interaction_kind: 'offer',
      target_actor_refs: [targetRefs.eremey],
      instrument_refs: [targetRefs.evidence], content: 'показать улику'
    });
  assertMatches(bound,
    'lower_dvina_trace.follow_known_route_to_drying_shed', {
      op: 'request_movement', actor_ref: 'player', movement_kind: 'route',
      target_ref: targetRefs.dryingShed
    });
  assertMatches(bound,
    'lower_dvina_trace.offer_conditional_protection_and_seek_surrender', {
      op: 'emit_interaction', actor_ref: 'player', interaction_kind: 'offer',
      target_actor_refs: [targetRefs.ratsha], instrument_refs: [],
      content: 'предложить защиту'
    });
  assertMatches(bound,
    'lower_dvina_trace.attempt_risky_first_aid_onisim', {
      op: 'request_activity', actor_ref: 'player', activity_kind: 'recover',
      target_refs: [targetRefs.onisim], description: 'лечить Онисима'
    });
  assertMatches(bound,
    'lower_dvina_trace.make_stretcher_and_carry_onisim_to_camp', {
      op: 'request_activity', actor_ref: 'player', activity_kind: 'carry',
      target_refs: [targetRefs.onisim], description: 'нести Онисима'
    });
  const inspection = bound.find(({ command_id: id }) =>
    id === 'lower_dvina_trace.inspect_wreck_in_detail');
  assert.equal(inspection.semantic_binding.matches({ operation: {
    op: 'request_discovery', actor_ref: 'player',
    discovery_kind: 'look', target_refs: [targetRefs.wreck], query: 'обзор'
  } }), false, 'a general look cannot trigger detailed wreck inspection');
  assert.equal(inspection.semantic_binding.matches({ operation: {
    op: 'request_discovery', actor_ref: 'player',
    discovery_kind: 'inspect', target_refs: [targetRefs.wreck],
    query: 'найти пригодный обломок дерева'
  } }), false, 'a free discovery query must reach the ordinary owner');
  assert.equal(inspection.semantic_binding.matches({ operation: {
    op: 'request_discovery', actor_ref: targetRefs.eremey,
    discovery_kind: 'inspect', target_refs: [targetRefs.wreck], query: 'осмотр'
  } }), false, 'a semantic operation cannot act as another actor');

  const carry = bound.find(({ command_id: id }) =>
    id === 'lower_dvina_trace.make_stretcher_and_carry_onisim_to_camp');
  assert.equal(carry.matches({
    raw_text: 'Сделать носилки и отнести Онисима в стан.'
  }), true);
  assert.equal(carry.matches({
    raw_text: 'Хочу отнести Онисима, если получится.'
  }), false, 'revision 13 paraphrases must use the step planner');
});

test('revision 15 maps both registered and free rest prose through semantic bindings', () => {
  const revision15Commands = revision15Bindings.domain_bindings.map(
    ({ command_id: commandId }) => ({
      command_id: commandId,
      matches: () => false,
      ...handlers
    }));
  const bound = bindLowerDvinaTraceTurnStepCommands({
    commands: revision15Commands,
    bundle: {
      definition_revision: 15,
      turn_step_bindings: revision15Bindings
    },
    targetRefs
  });
  const rest = bound.find(({ command_id: id }) =>
    id === 'lower_dvina_trace.rest_by_fire_and_dry_clothing');
  assert.equal(rest.matches({
    raw_text: 'Отдохнуть у огня полчаса и подсушить одежду.'
  }), false, 'only historical revision 13 owns exact text matching');
  assert.equal(rest.matches({
    raw_text: 'Давайте немного погреемся у костра и просушим одежду'
  }), false, 'a free phrase must enter the common player-step planner');
  assert.equal(rest.matches({
    raw_text: 'Отдохнуть у огня полчаса и подсушить одежду. '
      + 'Попросить Еремея и рыбака пойти со мной к Жданко.'
  }), false,
  'compound Turn 10 must not select the Phase 7 exact command alone');
  assert.equal(rest.semantic_binding.matches({ operation: {
    op: 'request_activity',
    actor_ref: targetRefs.actor,
    activity_kind: 'recover',
    target_refs: [targetRefs.fishingCamp],
    description: 'погреться у костра и просушить одежду'
  } }), true, 'the validated player-step plan must bind the same command');
  const companions = bound.find(({ command_id: id }) =>
    id === 'lower_dvina_trace.request_eremey_and_fisher_to_zhdanko_storehouse');
  assert.equal(companions.semantic_binding.matches({ operation: {
    op: 'emit_interaction',
    actor_ref: targetRefs.actor,
    interaction_kind: 'request',
    target_actor_refs: [
      targetRefs.eremey,
      targetRefs.participatingFisher,
      targetRefs.otherFisher
    ],
    instrument_refs: [],
    content_summary: 'попросить пойти к Жданко'
  } }), true);
});

test('revision 16 keeps future Phase 8 bindings inactive before admission', () => {
  const inactive = new Set([
    'lower_dvina_trace.follow_known_route_to_zhdanko_storehouse',
    'lower_dvina_trace.accuse_zhdanko_at_storehouse'
  ]);
  const earlyCommands = revision16Bindings.domain_bindings
    .filter(({ command_id: id }) => !inactive.has(id))
    .map(({ command_id: commandId }) => ({
      command_id: commandId,
      matches: () => false,
      ...handlers
    }));
  const bundle = { definition_revision: 16,
    turn_step_bindings: revision16Bindings };
  const bound = bindLowerDvinaTraceTurnStepCommands({
    commands: earlyCommands,
    bundle,
    targetRefs
  });
  assert.equal(bound.length, earlyCommands.length);
  assert.equal(bound.every(({ semantic_binding: binding }) => binding), true);
  assert.throws(() => bindLowerDvinaTraceTurnStepCommands({
    commands: earlyCommands.filter(({ command_id: id }) =>
      id !== 'lower_dvina_trace.rest_by_fire_and_dry_clothing'),
    bundle,
    targetRefs
  }), { code: 'TRACE_TURN_STEP_BINDING_INVALID' });
});

test('revision 17 exposes valid copyable DTOs except bounded selection', () => {
  const revision17Commands = revision17Bindings.domain_bindings.map(
    ({ command_id: commandId }) => ({ command_id: commandId,
      label: commandId, matches: () => false, ...handlers }));
  const bound = bindLowerDvinaTraceTurnStepCommands({
    commands: revision17Commands,
    bundle: { definition_revision: 17, turn_step_bindings: revision17Bindings },
    targetRefs
  });
  for (const command of bound) {
    if (command.command_id ===
        'lower_dvina_trace.commit_temporary_disposition') {
      assert.equal(command.semantic_binding.operation_dto, null);
    } else if (command.command_id ===
        'lower_dvina_trace.respond_in_active_combat') {
      assert.deepEqual(command.semantic_binding.operation_dtos.map(
        ({ intent_kind: kind }) => kind), [
        'engage', 'control', 'hold', 'break_contact', 'surrender',
        'cease_hostility'
      ]);
      assert.equal(command.semantic_binding.operation_dtos.every((operation) =>
        command.semantic_binding.matches({ operation })), true);
    } else {
      assert.equal(command.semantic_binding.matches({
        operation: command.semantic_binding.operation_dto
      }), true, command.command_id);
    }
  }
});

test('revision 24 keeps inherited inactive bindings unbound', () => {
  const activeCommands = commands.slice(0, 4);
  const bound = bindLowerDvinaTraceTurnStepCommands({
    commands: activeCommands,
    bundle: { definition_revision: 24, turn_step_bindings: revision17Bindings },
    targetRefs
  });
  assert.equal(bound.length, activeCommands.length);
  assert.equal(bound.every(({ semantic_binding: binding }) => binding), true);
});

test('revision 28 keeps paraphrases on semantic bindings, not revision 13 text matches', () => {
  const activeCommands = revision17Bindings.domain_bindings.map(
    ({ command_id: commandId }) => ({ command_id: commandId,
      label: commandId, matches: () => false, ...handlers }));
  const bound = bindLowerDvinaTraceTurnStepCommands({
    commands: activeCommands,
    bundle: { definition_revision: 28, turn_step_bindings: revision17Bindings },
    targetRefs
  });
  const route = bound.find(({ command_id: id }) =>
    id === 'lower_dvina_trace.follow_known_route_to_drying_shed');
  assert.equal(route.matches({ raw_text: 'пройти известной тропой к старой сушильне.' }),
    false);
  assert.equal(route.semantic_binding.matches({ operation: {
    op: 'request_movement', actor_ref: targetRefs.actor, movement_kind: 'route',
    target_ref: targetRefs.dryingShed
  } }), true);
});

function assertMatches(commandsToSearch, commandId, operation) {
  const command = commandsToSearch.find(
    ({ command_id: current }) => current === commandId
  );
  assert.equal(command.semantic_binding.matches({ operation }), true);
}
