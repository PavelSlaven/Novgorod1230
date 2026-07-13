import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSafeNarratorPackage, detectHiddenLeaks, mergeKnowledgeFacts, stripHiddenForNarrator, validateMemoryFact, validateVisibleContext } from '../src/index.js';

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
