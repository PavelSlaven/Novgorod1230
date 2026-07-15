import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSafeNarratorPackage, buildTravelVisibleProjection, detectHiddenLeaks, mergeKnowledgeFacts, stripHiddenForNarrator, validateMemoryFact, validateVisibleContext } from '../src/index.js';

test('visibility boundary strips hidden data and rejects leaks', () => {
  const unsafe = { version:1, schema:'visible_context_package', visible_scene:'Двор', visible_changes:[], sensory_details:[], visible_npc:[], visible_objects:[], known_context:[], uncertainties:[], allowed_tensions:[], do_not_imply:[], hidden_state:{ secret:true } };
  assert.ok(detectHiddenLeaks(unsafe).length > 0);
  const safe = stripHiddenForNarrator(unsafe);
  assert.equal(safe.hidden_state, undefined);
  assert.equal(validateVisibleContext(safe).ok, true);
  assert.equal(buildSafeNarratorPackage(safe).ok, true);
  assert.equal(mergeKnowledgeFacts([{ id:'x', summary:'old' }], [{ id:'x', summary:'new' }])[0].summary, 'new');
  assert.equal(validateMemoryFact({ id:'m', type:'event', summary:'видел', knowledge_status:'observation' }).ok, true);
});

test('travel projection accepts only explicit player-safe state and rejects actual route leaks', () => {
  const input = {
    travel_status: 'active',
    visible_destination: { kind: 'known_place', label: 'Торговый двор' },
    perceived_position: { kind: 'between_known_places', label: 'На пути к Торговому двору' },
    orientation_confidence_band: 'uncertain',
    recognized_landmarks: [{ label: 'Высокая сосна' }],
    unrecognized_observations: [{ label: 'Дым вдали' }],
    visible_cues: [{ label: 'Дым вдали' }],
    visible_traces: [{ label: 'Следы телеги' }],
    estimated_elapsed_time: { band: 'less_than_hour' },
    remaining_daylight_band: 'daylight',
    known_route_options: [{ option_id: 'route:known', label: 'По дороге' }],
    obvious_stop_reason: null,
    interruption_options: []
  };
  const projection = buildTravelVisibleProjection(input);
  assert.deepEqual(projection, input);
  assert.throws(() => buildTravelVisibleProjection({ ...input, perceived_position: { ...input.perceived_position, edge_id: 'hidden-edge' } }), /TRAVEL_VISIBLE_LEAK/u);
  assert.throws(() => buildTravelVisibleProjection({ ...input, visible_cues: [{ label: 'Дым', source_id: 'hidden-hearth' }] }), /TRAVEL_VISIBLE_LEAK/u);
  const context = {
    version: 1, schema: 'visible_context_package', visible_scene: 'Дорога тянется к двору.',
    visible_changes: [], sensory_details: [], visible_npc: [], visible_objects: [], known_context: [], uncertainties: [], allowed_tensions: [], do_not_imply: [], travel: input
  };
  assert.equal(validateVisibleContext(context).ok, true);
  assert.equal(buildSafeNarratorPackage(context).package.travel.travel_status, 'active');
});
