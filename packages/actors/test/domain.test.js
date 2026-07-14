import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeActor, projectActorIdentity, validateActor } from '../src/index.js';

test('actors validates and projects identity without inventing fields', () => {
  const source = { id:'npc_1', kind:'npc', name:'Иван', biography:{ origin:'Новгород' }, skills:{ craft:2 } };
  assert.deepEqual(validateActor(source), { ok:true, errors:[] });
  const actor = normalizeActor(source);
  assert.equal(actor.id, 'npc_1');
  assert.equal(actor.social_bindings.length, 0);
  assert.equal(Object.isFrozen(actor), true);
  assert.equal(projectActorIdentity(actor).biography.origin, 'Новгород');
  assert.equal(validateActor({ kind:'npc' }).ok, false);
});
