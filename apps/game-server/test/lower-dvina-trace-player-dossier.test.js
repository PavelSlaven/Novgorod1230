import assert from 'node:assert/strict';
import test from 'node:test';
import { loadLowerDvinaTraceMaterializationBundle } from '../src/internal/lower-dvina-trace-phase-1a-bundle.js';
import { phase1AInstance } from './lower-dvina-trace-phase-2-fixture-support.js';
import { lowerDvinaTraceWorldSnapshot } from '../../../test/fixtures/lower-dvina-trace-world-snapshot.js';
import { projectLowerDvinaTracePlayerSafeState } from '../src/runtime/lower-dvina-trace-player-safe-state.js';
import { createLowerDvinaTraceTurnStepVisibleProjector } from '../src/runtime/lower-dvina-trace-turn-step-fire-visible.js';
import { projectLowerDvinaTraceScreenPanels } from '../src/infrastructure/postgres/lower-dvina-trace-screen-panels.js';
import { renderCharacterPanel } from '../../game-web/src/features/character/render.js';

const scene = label => ({ schema: 'visible_context_package', version: 1,
  visible_scene: label, visible_changes: [], sensory_details: [], visible_npc: [],
  visible_objects: [], known_context: [], uncertainties: [], allowed_tensions: [], do_not_imply: [] });
function state() {
  return { actor_id: 'player', party_state: { state_version: 3 },
    position: { location_ref: 'shore' },
    player_profile: { identity: { name: 'Ульяна' }, social_status: { display_name: 'ткачиха' },
      origin: { biography: 'Вы выросли в семье красильщика.', biography_basis: 'PRIVATE_APPROVAL' },
      memory: { records: [{ text: 'Вы помните работу у ткацкого стана.', knowledge_state: 'known' },
        { text: 'PRIVATE_MEMORY', visibility: 'hidden' }] },
      relations: [{ npc_candidate_id: 'boatman', display_name: 'Данила', recognition_basis: 'prior_admitted_perception' }] },
    knowledge: [{ text: 'Перед дорогой вам поручили передать свёрток.', knowledge_state: 'known' },
      { text: 'Сосед сказал, что мост повреждён; вы сами этого не видели.', knowledge_state: 'known' },
      { text: 'PRIVATE_KNOWLEDGE', visibility: 'hidden' }],
    npcs: [{ instance_id: 'boatman', participant_slot_ref: 'boatman', location_ref: 'elsewhere' }],
    current_visible_context: { ...scene('Старый берег'), visible_objects: [{ display_label: 'OLD_OBJECT' }] } };
}

test('current authored dossier materializes history while historical biography stays unchanged', async () => {
  for (const revision of [32, 33]) {
    const bundle = await loadLowerDvinaTraceMaterializationBundle({ scenarioDefinitionRevision: revision });
    const instance = phase1AInstance(`dossier-${revision}`, bundle, lowerDvinaTraceWorldSnapshot());
    const dossier = instance.immediate.player.dossier;
    const source = bundle.materialization_bindings.player_dossier_projection;
    assert.deepEqual(dossier.knowledge, source.knowledge);
    assert.deepEqual(dossier.relations, source.relations);
    if (revision === 32) {
      assert.equal(dossier.origin.biography, undefined);
      assert.equal(dossier.memory, undefined);
      assert.deepEqual(dossier.relations, []);
    } else {
      assert.equal(dossier.origin.biography, source.origin.biography);
      assert.deepEqual(dossier.memory, source.memory);
      assert.match(dossier.origin.biography, /разорившегося кожевника/u);
      assert.match(dossier.memory.records[1].text, /Онисим/u);
      assert.match(dossier.knowledge.initial_records[0].text, /Савва Твердич/u);
      assert.doesNotMatch(JSON.stringify(dossier.memory), /ранен|сушильн|виновник/u);
    }
  }
});

test('authored and fallback final scenes retain available self and knowledge text without old scene evidence', async () => {
  const committed = state();
  const before = structuredClone(committed);
  const authored = scene('Новая мельница');
  authored.visible_npc = [{ entity_ref: { entity_kind: 'npc', entity_id: 'boatman' },
    display_label: 'мужчина у двери', recognition: 'unrecognized' }];
  const projector = createLowerDvinaTraceTurnStepVisibleProjector({ fallback: { project: async () => authored } });
  for (const consequence of [{ phase4_kind: 'movement' }, {}]) {
    const result = await projector.project({ retrieved_state: committed, consequence });
    assert.equal(result.visible_scene, 'Новая мельница');
    assert.ok(result.known_context.includes('Вас зовут Ульяна.'));
    assert.ok(result.known_context.includes(committed.player_profile.origin.biography));
    assert.ok(result.known_context.includes(committed.player_profile.memory.records[0].text));
    for (const fact of committed.knowledge.slice(0, 2)) assert.ok(result.known_context.includes(fact.text));
    assert.equal(result.visible_npc[0].display_label, 'мужчина у двери');
    assert.equal(result.visible_npc[0].recognition, 'unrecognized');
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_|OLD_OBJECT|Старый берег/u);
    const reload = await projector.project({ retrieved_state: JSON.parse(JSON.stringify(committed)), consequence });
    assert.deepEqual(reload, result);
  }
  assert.deepEqual(committed, before);
});

test('planner and Character panel share safe history without treating remembered people as present', () => {
  const committed = state();
  const safe = projectLowerDvinaTracePlayerSafeState({ committed_state: committed, actor_id: 'player' });
  assert.equal(safe.actor.biography, committed.player_profile.origin.biography);
  assert.equal(safe.actor.memory.length, 1);
  assert.equal(safe.player_safe_state.npcs.length, 0);
  const screen = projectLowerDvinaTraceScreenPanels({ payload: committed, screen: { visible_context: scene('Берег') } });
  const html = renderCharacterPanel(screen);
  assert.match(html, /семье красильщика|ткацкого стана|передать свёрток/u);
  assert.doesNotMatch(JSON.stringify(safe) + html, /PRIVATE_/u);
  assert.equal(screen.panels.people, undefined);
  // Opening is built from the initial dossier before a Phase-2 snapshot exists.
  committed.player_profile.knowledge = { initial_records: structuredClone(committed.knowledge) };
  delete committed.knowledge;
  const opening = projectLowerDvinaTraceScreenPanels({ payload: committed, screen: { visible_context: scene('Берег') } });
  assert.match(opening.panels.character.data.knowledge, /передать свёрток/u);
  assert.doesNotMatch(opening.panels.character.data.knowledge, /PRIVATE_/u);
});
