import assert from 'node:assert/strict';
import test from 'node:test';
import { assertPublicPayload, projectPublicPayload } from '../src/public-boundary.js';
import { projectPublicScreenReferences } from '../src/public-screen-references.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });

function payload() {
  const speaker = ref('npc', 'npc:internal-330');
  return {
    screen: {
      visible_context: {
        visible_npc: [{ entity_ref: speaker, display_label: 'Еремей' }],
        visible_objects: [
          { entity_ref: ref('item', 'item:internal-330'), display_label: 'узелок' },
          { entity_ref: ref('scene_movement_edge', 'edge:internal-330'), display_label: 'проход' },
          { entity_ref: ref('g4_directional_exit', 'exit:internal-330'), display_label: 'тропа' },
          { entity_ref: ref('g5_site_connection', 'connection:internal-330'), display_label: 'переход' },
          { entity_ref: ref('item', 'item:other-330'), display_label: 'узелок' }
        ]
      },
      exact_npc_utterances: [{
        speaker_ref: speaker,
        utterance_text: 'Тропа ведёт к реке.',
        provenance: {
          source: 'phase3_statement_receipt',
          player_receipt: 'full',
          precommit_service_marker_check: true,
          statement_ref: ref('conversation_statement', 'statement:internal-330'),
          listener_ref: ref('player_character', 'player:internal-330'),
          receipt_utterance_text: 'Тропа ведёт к реке.'
        }
      }],
      active_interlocutor: { entity_ref: speaker },
      portrait: { subject_ref: speaker }
    }
  };
}

test('issue #330 public screen refs are opaque, scoped to whole payload, stable and non-mutating', () => {
  const saved = payload();
  const before = structuredClone(saved);
  assert.equal(assertPublicPayload(saved), saved);

  const projected = projectPublicPayload(saved);
  assert.notStrictEqual(projected, saved);
  assert.deepEqual(saved, before, 'projection must leave saved DTO untouched');
  const speakerKey = projected.screen.visible_context.visible_npc[0].entity_ref.public_key;
  const objectRefs = projected.screen.visible_context.visible_objects.map(({ entity_ref }) => entity_ref);
  assert.deepEqual(projected.screen.visible_context.visible_npc[0].entity_ref.entity_kind, 'npc');
  assert.ok(objectRefs.every(({ entity_kind }) => typeof entity_kind === 'string'));
  const publicKeys = [speakerKey, ...objectRefs.map(({ public_key }) => public_key)];
  assert.ok(publicKeys.every((key) => /^e[1-9]\d*$/u.test(key)),
    'public keys must be opaque short keys');
  assert.equal(new Set(publicKeys).size, publicKeys.length,
    'different internal identities must receive different public keys');
  assert.equal(objectRefs[0].entity_kind, 'item');
  assert.equal(objectRefs[1].entity_kind, 'scene_movement_edge');
  assert.equal(objectRefs[2].entity_kind, 'g4_directional_exit');
  assert.equal(objectRefs[3].entity_kind, 'g5_site_connection');
  assert.equal(objectRefs[4].entity_kind, 'item');
  assert.notEqual(objectRefs[0].public_key, objectRefs[4].public_key,
    'same-kind entities with different internal IDs must remain distinct');
  assert.deepEqual(projected.screen.exact_npc_utterances[0].speaker_ref,
    { entity_kind: 'npc', public_key: speakerKey });
  assert.deepEqual(projected.screen.active_interlocutor.entity_ref,
    { entity_kind: 'npc', public_key: speakerKey });
  assert.deepEqual(projected.screen.portrait.subject_ref,
    { entity_kind: 'npc', public_key: speakerKey });
  assert.equal(Object.hasOwn(projected.screen.exact_npc_utterances[0], 'provenance'), false,
    'verified speech provenance must be removed before reference projection');

  const serialized = JSON.stringify(projected);
  for (const internalId of ['npc:internal-330', 'item:internal-330',
    'edge:internal-330', 'exit:internal-330', 'connection:internal-330',
    'statement:internal-330', 'player:internal-330']) {
    assert.equal(serialized.includes(internalId), false, `${internalId} must stay private`);
  }
  assert.equal(/"(?:entity_id|instance_id)"/u.test(serialized), false,
    'projected JSON must contain no internal ID fields');

  const withoutProvenance = structuredClone(saved);
  delete withoutProvenance.screen.exact_npc_utterances[0].provenance;
  const withoutProvenanceBefore = structuredClone(withoutProvenance);
  const directProjection = projectPublicScreenReferences(withoutProvenance);
  assert.notStrictEqual(directProjection, withoutProvenance,
    'reference projection must return a new copy');
  assert.deepEqual(withoutProvenance, withoutProvenanceBefore,
    'reference projection must not mutate its input');
  assert.deepEqual(directProjection, projected,
    'direct and public-payload projection must share the same owner');
  assert.deepEqual(projectPublicPayload(structuredClone(saved)), projected,
    'fresh projection of equivalent saved DTO must produce the same keys');
  assert.deepEqual(projectPublicScreenReferences(reverseObjectKeys(withoutProvenance)), directProjection,
    'reordered JSON object properties must not change keys (PostgreSQL JSONB order)');
});

test('issue #330 preserves array order while assigning refs across the whole payload', () => {
  const source = payload();
  delete source.screen.exact_npc_utterances[0].provenance;
  const projected = projectPublicScreenReferences(source);
  assert.deepEqual(projected.screen.visible_context.visible_objects.map(({ display_label }) => display_label),
    ['узелок', 'проход', 'тропа', 'переход', 'узелок']);
  assert.equal(projected.screen.visible_context.visible_npc[0].entity_ref.public_key,
    projected.screen.active_interlocutor.entity_ref.public_key,
    'same internal identity in different branches must reuse one screen key');
});

test('issue #330 turn response metadata does not change saved screen keys on GET', () => {
  const source = payload();
  const body = { proposal: { profile_ref: { entity_ref: {
    entity_kind: 'body_state_profile', entity_id: 'body:approved-profile'
  } } } };
  const turn = projectPublicPayload({
    body_update: body,
    ...source
  });
  const reload = projectPublicPayload(source);
  assert.deepEqual(turn.screen, reload.screen,
    'response-only refs must not renumber the committed screen');
  assert.deepEqual(turn.body_update, body,
    'non-screen profile refs must remain with their existing public owner');
});

test('issue #330 rejects malformed or unknown typed refs and residual internal IDs', () => {
  for (const entity_ref of [
    { entity_kind: 'unknown_kind', entity_id: 'private:1' },
    { entity_kind: 'npc' },
    { entity_id: 'npc:private' },
    { entity_kind: 'npc', entity_id: 'npc:private', public_key: 'forged' }
  ]) {
    assert.throws(() => projectPublicScreenReferences({ visible_context: { entity_ref } }),
      { code: 'PUBLIC_PAYLOAD_ENTITY_REFERENCE_INVALID' },
      `must reject malformed typed ref ${JSON.stringify(entity_ref)}`);
  }

  for (const value of [
    { entity_id: 'orphan:private' },
    { instance_id: 'instance:private' },
    { nested: [{ entity_id: 'orphan:private' }] }
  ]) {
    assert.throws(() => projectPublicScreenReferences(value),
      { code: 'PUBLIC_PAYLOAD_ENTITY_REFERENCE_INVALID' },
      `must reject residual internal identifier in ${JSON.stringify(value)}`);
  }
});

function reverseObjectKeys(value) {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).reverse()
    .map(([key, child]) => [key, reverseObjectKeys(child)]));
}
