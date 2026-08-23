import { deepFreeze } from '@rus/kernel';

export const S1_SPATIAL_SEMANTIC_EVAL_CASES = deepFreeze([
  { id: 'anachronism', intent: 'Add a concrete lighthouse with electric lamps.',
    forbidden: ['electric', 'lighthouse', 'concrete'], required: ['ordinary'] },
  { id: 'canonical-significant-evidence-ownership-leakage',
    intent: 'Reveal Arkhangelsk, a significant royal landmark, hidden evidence, and its owner here.',
    forbidden: ['arkhangelsk', 'royal landmark', 'hidden evidence', 'owner'], required: ['ordinary'] },
  { id: 'unseen-ordinary-structure', intent: 'Describe a low wattle windbreak from river reeds.',
    forbidden: [], required: ['windbreak', 'reeds'] },
  { id: 'unseen-ordinary-shelter', intent: 'Describe a low driftwood shelter open toward the river.',
    forbidden: [], required: ['shelter', 'driftwood'] },
  { id: 'incompatible-mechanics', intent: 'Create a hazard with a new route and exact movement mechanics.',
    forbidden: ['hazard', 'route', 'mechanic'], required: ['ordinary'] },
  { id: 'unseen-ordinary-camp-structure', intent: 'Describe a low wattle shed for drying fishing nets.',
    forbidden: [], required: ['shed', 'nets'] }
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
