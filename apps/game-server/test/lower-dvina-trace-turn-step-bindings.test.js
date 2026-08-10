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
  otherFisher: 'npc:fisher-2'
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
    discovery_kind: 'inspect', target_refs: [targetRefs.wreck], query: 'осмотр'
  });
  assertMatches(bound, 'lower_dvina_trace.follow_path_to_fishing_camp', {
    op: 'request_movement', actor_ref: 'player', movement_kind: 'local',
    target_ref: targetRefs.fishingCamp
  });
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

test('revision 15 keeps the exact fast path and maps a free rest phrase', () => {
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
  }), true, 'registered Russian text must remain on the code fast path');
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

function assertMatches(commandsToSearch, commandId, operation) {
  const command = commandsToSearch.find(
    ({ command_id: current }) => current === commandId
  );
  assert.equal(command.semantic_binding.matches({ operation }), true);
}
