import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as materialization from '../src/index.js';

// D102 acceptance contract: this file is pinned before implementation.
// Actor names/instance IDs are isolated fixtures; relationship evidence is the real approved D-2 row.
const wave = new URL('../../../data/world-catalogs/novgorod/m2c-npc-wave/v1/datasets/', import.meta.url);
const json = async (name) => JSON.parse(await readFile(new URL(name, wave), 'utf8'));
const rules = await json('npc_relationship_materialization_rules.json');
const source = (await json('place_population_composition_rules.json'))
  .find((row) => row.composition_id === 'pf_peasant_homestead');
const spouseRule = rules.find((row) => row.rule_id === 'rel_composition_spouse_2dc90533f844af8e');
assert.equal(source.status, 'approved');
assert.equal(spouseRule.status, 'approved');
assert.equal(source.authoring_payload.slot_relationships.length, 1);

function fixture() {
  const composition = {
    place_family_id: source.place_family_id,
    place_family_version: source.place_family_version,
    composition_ref: { id: source.composition_id, version: source.composition_version,
      world_revision_id: source.world_revision_id },
    population_groups: structuredClone(source.population_groups),
    slot_relationships: structuredClone(source.authoring_payload.slot_relationships),
  };
  const actor = (id, name, group, role) => ({
    instance_id: id, identity_state: { canonical_name: name },
    role_ref: { id: role }, occupation_ref: { id: 'fixture:occupation' },
    g5_node_id: 'household:one', relationships: [],
    semantic_state: { relationships: [], source_binding: {
      world_revision_id: source.world_revision_id,
      canonical_g5_ref: { id: 'household:one', version: 1 },
      place_family_id: source.place_family_id, group_id: group,
      place_population_composition_ref: structuredClone(composition.composition_ref),
    } },
  });
  return { rules: structuredClone(rules), compositions: [composition], npcs: [
    actor('npc:a', 'Гюрята', 'pf_peasant_homestead.householder', spouseRule.subject_role_ref),
    actor('npc:b', 'Офимья', 'pf_peasant_homestead.mistress', spouseRule.object_role_ref),
  ] };
}

function consume(input) {
  assert.equal(typeof materialization.materializeNpcRelationshipRules, 'function',
    '@rus/materialization must export the approved-rule consumer materializeNpcRelationshipRules');
  const result = materialization.materializeNpcRelationshipRules(input);
  assert.ok(Array.isArray(result.npcs), 'consumer returns the complete NPC roster');
  assert.ok(Array.isArray(result.relations), 'consumer returns normalized party_npc_relations records');
  return result;
}

function expectEmpty(input) {
  const before = structuredClone(input);
  const result = consume(input);
  assert.deepEqual(result.relations, [], 'an unfulfilled guard cannot create an edge');
  for (const npc of result.npcs) {
    assert.deepEqual(npc.relationships ?? [], [], 'no invented NPC relationship');
    assert.deepEqual(npc.semantic_state.relationships ?? [], [], 'no invented semantic relationship');
  }
  assert.deepEqual(input, before, 'consumer must not mutate approved inputs');
}

function expectSpouses(result) {
  assert.equal(result.relations.length, 1, 'PLAN: symmetric relationship has one canonical DB pair');
  const [edge] = result.relations;
  assert.deepEqual([edge.from_npc_id, edge.to_npc_id, edge.relation_category_id], ['npc:a', 'npc:b', 'spouse']);
  assert.ok(edge.state && typeof edge.state === 'object');
  for (const [id, other] of [['npc:a', 'npc:b'], ['npc:b', 'npc:a']]) {
    const npc = result.npcs.find((row) => row.instance_id === id);
    const relation = { target_actor_id: other, kind: 'spouse' };
    for (const projected of [npc.relationships, npc.semantic_state.relationships]) {
      assert.equal(projected.length, 1);
      assert.deepEqual({ target_actor_id: projected[0].target_actor_id, kind: projected[0].kind }, relation);
      assert.equal(projected[0].standing, undefined, 'source confidence is not social standing');
    }
  }
}

test('approved D-2 spouse fact resolves exact named actors and both semantic projections', () => {
  const input = fixture();
  const before = structuredClone(input);
  expectSpouses(consume(input));
  assert.deepEqual(input, before);
});

for (const [name, mutate] of [
  ['same roles and co-presence without the relationship fact', (input) => { input.compositions[0].slot_relationships = []; }],
  ['missing second actor', (input) => { input.npcs.pop(); }],
  ['unnamed endpoint', (input) => { input.npcs[1].identity_state.canonical_name = null; }],
  ['blank name', (input) => { input.npcs[1].identity_state.canonical_name = ' '; }],
  ['wrong role', (input) => { input.npcs[1].role_ref.id = 'nov_role_servant'; }],
  ['wrong group', (input) => { input.npcs[1].semantic_state.source_binding.group_id = 'pf_outbuildings.household_servant'; }],
  ['missing group lineage', (input) => { delete input.npcs[1].semantic_state.source_binding.group_id; }],
  ['different composition ID', (input) => { input.npcs[1].semantic_state.source_binding.place_population_composition_ref.id = 'other'; }],
  ['different composition version', (input) => { input.npcs[1].semantic_state.source_binding.place_population_composition_ref.version += 1; }],
  ['different world revision', (input) => { input.npcs[1].semantic_state.source_binding.place_population_composition_ref.world_revision_id = 'other'; }],
  ['different place family', (input) => { input.npcs[1].semantic_state.source_binding.place_family_id = 'pf_rural_yard'; }],
  ['actors in different households with the same group and role labels', (input) => {
    input.npcs[1].g5_node_id = 'household:two';
    input.npcs[1].semantic_state.source_binding.canonical_g5_ref.id = 'household:two';
  }],
  ['ambiguous endpoint group', (input) => { input.npcs.push({ ...structuredClone(input.npcs[0]), instance_id: 'npc:c' }); }],
  ['self relationship', (input) => { input.npcs[1].instance_id = input.npcs[0].instance_id; }],
  ['unapproved rule', (input) => { input.rules = [{ ...spouseRule, status: 'retired' }]; }],
  ['rule from another world', (input) => { input.rules = [{ ...spouseRule, world_revision_id: 'other' }]; }],
  ['unsupported guard', (input) => { input.rules = [{ ...spouseRule, materialization_guard: 'Unsupported fixture condition' }]; }],
  ['unsupported direction', (input) => { input.rules = [{ ...spouseRule, direction: 'unknown' }]; }],
  ['no rule for an otherwise established slot fact', (input) => { input.rules = []; }],
]) {
  test(`guard fails closed: ${name}`, () => { const input = fixture(); mutate(input); expectEmpty(input); });
}

test('the other 45 real rules cannot infer family, community, work or service from named roles alone', () => {
  for (const rule of rules.filter((row) => row.rule_id !== spouseRule.rule_id)) {
    const input = fixture();
    input.rules = [structuredClone(rule)];
    input.compositions[0].slot_relationships = [];
    input.npcs[0].role_ref.id = rule.subject_role_ref;
    input.npcs[1].role_ref.id = rule.object_role_ref;
    expectEmpty(input);
  }
});

test('duplicate rules, duplicate source facts, reverse roster order and replay do not duplicate a pair', () => {
  const input = fixture();
  const first = consume(input);
  expectSpouses(first);
  input.rules.push(structuredClone(spouseRule));
  input.compositions[0].slot_relationships.push(structuredClone(input.compositions[0].slot_relationships[0]));
  input.npcs.reverse();
  const duplicate = consume(input);
  expectSpouses(duplicate);
  assert.deepEqual(duplicate.relations, first.relations);
  const replay = consume({ ...input, npcs: duplicate.npcs });
  expectSpouses(replay);
  assert.deepEqual(replay, duplicate);
});

test('existing authored relationships survive materialization without inferred standing or knowledge', () => {
  const input = fixture();
  const existing = { target_actor_id: 'npc:already-known', kind: 'acquaintance', standing: 'authored' };
  input.npcs[0].relationships = [existing];
  input.npcs[0].semantic_state.relationships = [structuredClone(existing)];
  input.npcs[0].knowledge_profile_snapshot = { local: ['authored knowledge'] };
  const result = consume(input);
  const npc = result.npcs.find((row) => row.instance_id === 'npc:a');
  assert.deepEqual(npc.relationships.find((row) => row.target_actor_id === existing.target_actor_id), existing);
  assert.deepEqual(npc.semantic_state.relationships.find((row) => row.target_actor_id === existing.target_actor_id), existing);
  assert.deepEqual(npc.knowledge_profile_snapshot, input.npcs[0].knowledge_profile_snapshot);
  assert.equal(npc.relationships.length, 2);
  assert.equal(result.relations.length, 1);
});
