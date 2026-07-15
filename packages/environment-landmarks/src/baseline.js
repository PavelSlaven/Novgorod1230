import { canonicalDigest, deterministicInstanceId } from '@rus/materialization';
import { EnvironmentFeatureError } from './errors.js';
import { approved, byId, emptyRejections, finiteOr, numberAtLeast, required, requiredText, text } from './utils.js';

export function baselineIdentity(input) {
  return { party_id: input.party_id, world_revision_id: input.world_revision_id, g1_id: input.g1_id, materializer_version: input.materializer_version };
}

export function sameBaseline(left, right) {
  return ['party_id', 'world_revision_id', 'g1_id', 'materializer_version'].every((key) => left[key] === right[key]);
}

export function seedContext(input) {
  return {
    party_id: input.party_id,
    world_revision_id: input.world_revision_id,
    region_id: input.region_id,
    historical_period_id: input.historical_period_id,
    g1_id: input.g1_id,
    trigger: input.trigger,
    occurrence: input.occurrence,
    catalog_digest: input.catalog_digest,
    environment_materializer_version: input.materializer_version,
    rng_algorithm_id: input.rng_algorithm_id
  };
}

export function materializeLandmarks({ input, catalog, random, runId, choices }) {
  const placements = [...(input.g1_graph_snapshot.placement_candidates ?? [])].sort((left, right) => text(left.binding_id).localeCompare(text(right.binding_id)));
  const output = [];
  for (const rule of [...catalog.landmark_rules].sort(byId('rule_id'))) {
    if (!approved(rule)) continue;
    const templates = catalog.landmark_templates.filter((template) => approved(template) && rule.template_ids?.includes(template.template_id));
    const placementCandidates = placements.filter((placement) => !Array.isArray(rule.placement_types) || rule.placement_types.includes(placement.binding_type));
    if ((templates.length === 0 || placementCandidates.length === 0) && required(rule)) {
      throw new EnvironmentFeatureError('ENVIRONMENT_REQUIRED_CANDIDATE_SET_EMPTY', 'Required landmark rule has no approved template or placement candidate.', { rule_id: rule.rule_id, template_count: templates.length, placement_count: placementCandidates.length });
    }
    const count = chooseCount(rule, Math.min(templates.length, placementCandidates.length), random);
    const templateDigest = canonicalDigest(templates.map((template) => template.template_id).sort());
    const placementDigest = canonicalDigest(placementCandidates.map((placement) => placement.binding_id));
    for (let ordinal = 0; ordinal < count; ordinal += 1) {
      const templateDraw = random.nextUint32();
      const placementDraw = random.nextUint32();
      const template = weighted(templates, templateDraw);
      const placement = weighted(placementCandidates, placementDraw);
      const landmarkId = deterministicInstanceId(input.party_id, runId, 'environment_landmark', rule.rule_id, ordinal);
      output.push({
        landmark_id: landmarkId, template_id: template.template_id, category_id: template.category_id, rule_id: rule.rule_id,
        location_binding: placement.binding_id, placement_type: placement.binding_type, status: 'active',
        navigation_value: template.navigation_value, distinctiveness: template.distinctiveness, recognition_difficulty: template.recognition_difficulty,
        public_label_key: requiredText(template.public_label_key, 'ENVIRONMENT_LANDMARK_LABEL_REQUIRED'), icon_key: requiredText(template.icon_key, 'ENVIRONMENT_LANDMARK_ICON_REQUIRED')
      });
      choices.push(choice(choices.length, `${rule.rule_id}:${ordinal}:template`, templateDigest, templates.map((item) => item.template_id), template, templateDraw, random.drawCount));
      choices.push(choice(choices.length, `${rule.rule_id}:${ordinal}:placement`, placementDigest, placementCandidates.map((item) => item.binding_id), placement, placementDraw, random.drawCount, 'binding_id'));
    }
  }
  return output;
}

function chooseCount(rule, available, random) {
  const min = numberAtLeast(rule.min_count ?? 0, 0, 'rule.min_count');
  const max = numberAtLeast(rule.max_count ?? min, min, 'rule.max_count');
  if (min > available) {
    if (required(rule)) throw new EnvironmentFeatureError('ENVIRONMENT_REQUIRED_CANDIDATE_SET_EMPTY', 'Required landmark count exceeds candidates.', { rule_id: rule.rule_id, available, minimum: min });
    return 0;
  }
  return min + (max > min ? random.nextUint32() % (Math.min(max, available) - min + 1) : 0);
}

function weighted(items, draw) {
  const total = items.reduce((sum, item) => sum + finiteOr(item.weight, 1), 0);
  let cursor = draw % total;
  for (const item of items) {
    cursor -= finiteOr(item.weight, 1);
    if (cursor < 0) return item;
  }
  return items.at(-1);
}

function choice(ordinal, choiceKey, digest, ids, selected, draw, counter, selectedKey = 'template_id') {
  return { choice_ordinal: ordinal, choice_key: choiceKey, candidate_set_digest: digest, candidate_ids: ids, selected_id: selected[selectedKey], selected_weight: finiteOr(selected.weight, 1), rng_draw: draw, rng_counter: counter, rejection_summary: emptyRejections() };
}
