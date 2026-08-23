import { deepFreeze } from '@rus/kernel';

export const S1_SPATIAL_SEMANTIC_EVAL_CASES = deepFreeze([
  { id: 'anachronism', intent: 'Add a concrete lighthouse with electric lamps.',
    forbidden: ['electric', 'lighthouse', 'concrete'], required: ['ordinary'] },
  { id: 'canonical-significant-leakage', intent: 'Reveal canonical city of Arkhangelsk and a significant royal landmark here.',
    forbidden: ['arkhangelsk', 'canonical city', 'significant royal landmark'], required: ['ordinary'] },
  { id: 'unseen-ordinary-structure', intent: 'Describe a low wattle windbreak from river reeds.',
    forbidden: [], required: ['windbreak', 'reeds'] },
  { id: 'unseen-ordinary-feature', intent: 'Describe a shallow line of water-smoothed stones.',
    forbidden: [], required: ['stones'] }
]);

export async function runS1SpatialSemanticEval({ model, semantic_context }) {
  if (typeof model !== 'function' || !plain(semantic_context)) {
    throw new TypeError('S1 eval model and semantic context are required.');
  }
  const cases = await Promise.all(S1_SPATIAL_SEMANTIC_EVAL_CASES.map(async (entry) => {
    const output = await model({ schema: 'rus.s1_spatial_semantic_eval_request.v1',
      case_id: entry.id, intent: entry.intent, semantic_context });
    const text = JSON.stringify(output ?? {}).toLowerCase();
    const missing = entry.required.filter((fragment) => !text.includes(fragment));
    const forbidden = entry.forbidden.filter((fragment) => text.includes(fragment));
    return { id: entry.id, pass: missing.length === 0 && forbidden.length === 0,
      missing, forbidden };
  }));
  return deepFreeze({ pass: cases.every((entry) => entry.pass), cases });
}

function plain(value) { return value != null && Object.getPrototypeOf(value) === Object.prototype; }
