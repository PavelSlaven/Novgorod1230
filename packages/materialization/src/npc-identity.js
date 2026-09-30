import { createRandomSource, deriveSeed } from './core.js';
import { weightedCandidate } from './world-validation.js';

/**
 * Personal name and character of one generated NPC, chosen by code from the approved world_base
 * identity catalog (`bundle.npc_identity`). Each domain has its own seed stream derived from the
 * actor seed, so the appearance stream is untouched. A missing catalog leaves the NPC as before.
 */
export function pickNpcName({ catalog, regionalContextId, sexCategory, parentSeedDigest, actorSlotRef }) {
  if (!catalog) return {};
  const bound = catalog.name_bindings.find((row) => row.regional_context_id === regionalContextId);
  if (!bound) return nameless('no_pool_binding');
  const candidates = catalog.name_entries.filter((row) => row.name_pool_id === bound.name_pool_id
    && row.people_ref === bound.people_ref && row.sex_category === sexCategory)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (!candidates.length) return nameless('no_candidates');
  const picked = weightedCandidate(candidates, streamFor(parentSeedDigest, actorSlotRef, 'name').nextUint32());
  return { canonical_name: picked.name_form,
    name_provenance: { pool_id: picked.name_pool_id, entry_id: picked.id, people_ref: picked.people_ref } };
}

/** 1 temperament, 2 values, 1-2 goals and 1 fear of the occupation; undefined when data are incomplete. */
export function pickNpcCharacter({ catalog, occupationId, parentSeedDigest, actorSlotRef }) {
  if (!catalog) return undefined;
  const scale = (kind) => catalog.scale_entries.filter((row) => row.scale_kind === kind)
    .sort((a, b) => a.entry_id.localeCompare(b.entry_id));
  const items = (kind) => catalog.character_items.filter((row) => row.occupation_id === occupationId
    && row.item_kind === kind).sort((a, b) => a.item_id.localeCompare(b.item_id));
  const [traits, values, goals, fears] = [scale('trait'), scale('value'), items('goal'), items('fear')];
  if (!traits.length || values.length < 2 || !goals.length || !fears.length) return undefined;
  const random = streamFor(parentSeedDigest, actorSlotRef, 'character');
  const temperament = weightedCandidate(traits, random.nextUint32());
  const firstValue = weightedCandidate(values, random.nextUint32());
  const secondValue = weightedCandidate(values.filter((row) => row !== firstValue), random.nextUint32());
  const goalCount = Math.min(goals.length, 1 + (random.nextUint32() % 2));
  const remaining = [...goals];
  const chosenGoals = Array.from({ length: goalCount }, () => remaining.splice(random.nextIndex(remaining.length), 1)[0]);
  return { temperament_ref: temperament.entry_id, temperament_label_ru: temperament.label_ru,
    value_refs: [firstValue.entry_id, secondValue.entry_id],
    value_labels_ru: [firstValue.label_ru, secondValue.label_ru],
    goals_ru: chosenGoals.map((row) => row.text_ru), fear_ru: fears[random.nextIndex(fears.length)].text_ru };
}

const nameless = (reason) => ({ canonical_name: null, name_provenance: { reason } });
const streamFor = (parentSeedDigest, actorSlotRef, domain) => createRandomSource({
  seed: deriveSeed({ parent_seed_digest: parentSeedDigest, actor_slot_ref: actorSlotRef, domain }).uint32 });
