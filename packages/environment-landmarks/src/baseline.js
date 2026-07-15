import { canonicalDigest, deterministicInstanceId } from '@rus/materialization';
import { EnvironmentFeatureError } from './errors.js';
import { approved, byId, emptyRejections, numberAtLeast, required, requiredText, text } from './utils.js';

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
  if (!Array.isArray(input.g1_graph_snapshot.placement_candidates)) throw new EnvironmentFeatureError('ENVIRONMENT_INPUT_INVALID', 'g1_graph_snapshot.placement_candidates must be an array.');
  const placements = [...input.g1_graph_snapshot.placement_candidates].sort((left, right) => text(left.binding_id).localeCompare(text(right.binding_id)));
  const output = [];
  for (const rule of [...catalog.landmark_rules].sort(byId('id'))) {
    if (!approved(rule)) continue;
    const ruleId = requiredText(rule.id, 'ENVIRONMENT_LANDMARK_RULE_ID_REQUIRED');
    if (!scopeApplies(ruleId, input, catalog)) continue;
    const profile = catalog.landmark_profiles.find((item) => approved(item) && item.id === rule.profile_id && scoped(item, input, { regionRequired: true }));
    if (!profile) throw new EnvironmentFeatureError('ENVIRONMENT_LANDMARK_PROFILE_MISSING', 'Approved landmark rule requires an approved scoped profile.', { rule_id: ruleId, profile_id: rule.profile_id });
    if (!scoped(rule, input, { regionRequired: true })) throw new EnvironmentFeatureError('ENVIRONMENT_LANDMARK_RULE_SCOPE_INVALID', 'Approved landmark rule is outside the pinned request scope.', { rule_id: ruleId });
    const entries = catalog.landmark_profile_entries.filter((entry) => entry.profile_id === profile.id);
    const templates = entries.map((entry) => {
      const template = catalog.landmark_templates.find((item) => item.id === entry.template_id && approved(item) && scoped(item, input));
      if (!template) throw new EnvironmentFeatureError('ENVIRONMENT_LANDMARK_TEMPLATE_MISSING', 'Approved landmark profile entry references no approved scoped template.', { rule_id: ruleId, profile_id: profile.id, template_id: entry.template_id });
      return { ...template, template_id: template.id, weight: candidateWeight(entry), required: entry.required === true };
    }).sort(byId('template_id'));
    const placementCandidates = placements.filter((placement) => placementMatchesRule(placement, ruleId, catalog));
    if ((templates.length === 0 || placementCandidates.length === 0) && required(rule)) {
      throw new EnvironmentFeatureError('ENVIRONMENT_REQUIRED_CANDIDATE_SET_EMPTY', 'Required landmark rule has no approved profile template or scoped placement candidate.', { rule_id: ruleId, template_count: templates.length, placement_count: placementCandidates.length });
    }
    const count = chooseCount(rule, Math.min(templates.length, placementCandidates.length), random);
    if (templates.filter((template) => template.required).length > count) throw new EnvironmentFeatureError('ENVIRONMENT_REQUIRED_CANDIDATE_SET_EMPTY', 'Required landmark profile entries exceed the rule count.', { rule_id: ruleId, required_entry_count: templates.filter((template) => template.required).length, count });
    const templateDigest = canonicalDigest(templates.map((template) => template.template_id).sort());
    const placementDigest = canonicalDigest(placementCandidates.map((placement) => placement.binding_id));
    for (let ordinal = 0; ordinal < count; ordinal += 1) {
      const templateDraw = random.nextUint32();
      const placementDraw = random.nextUint32();
      const template = weighted(templates, templateDraw);
      const placement = weighted(placementCandidates, placementDraw);
      const landmarkId = deterministicInstanceId(input.party_id, runId, 'environment_landmark', ruleId, ordinal);
      output.push({
        landmark_id: landmarkId, template_id: template.template_id, category_id: requiredText(template.category_id, 'ENVIRONMENT_LANDMARK_CATEGORY_REQUIRED'), rule_id: ruleId,
        location_binding: placement.binding_id, placement_type: placement.binding_type, status: 'active',
        navigation_value: template.navigation_value, distinctiveness: template.distinctiveness, recognition_difficulty: template.recognition_difficulty,
        public_label_key: requiredText(template.public_label_key, 'ENVIRONMENT_LANDMARK_LABEL_REQUIRED'), icon_key: requiredText(template.icon_key, 'ENVIRONMENT_LANDMARK_ICON_REQUIRED')
      });
      choices.push(choice(choices.length, `${ruleId}:${ordinal}:template`, templateDigest, templates.map((item) => item.template_id), template, templateDraw, random.drawCount));
      choices.push(choice(choices.length, `${ruleId}:${ordinal}:placement`, placementDigest, placementCandidates.map((item) => item.binding_id), placement, placementDraw, random.drawCount, 'binding_id'));
    }
  }
  return output;
}

function scoped(record, input, { regionRequired = false } = {}) {
  if (record.world_revision_id !== input.world_revision_id) return false;
  if (regionRequired && record.region_id !== input.region_id) return false;
  return regionRequired || record.region_id == null || record.region_id === input.region_id;
}

function scopeApplies(ruleId, input, catalog) {
  const g1Classes = values(catalog.landmark_rule_g1_classes, ruleId, 'g1_class');
  if (g1Classes.length > 0) {
    const g1Class = requiredText(input.g1_graph_snapshot.g1_class, 'ENVIRONMENT_SCOPE_INPUT_INCOMPLETE');
    if (!g1Classes.includes(g1Class)) return false;
  }
  return true;
}

function placementMatchesRule(placement, ruleId, catalog) {
  return matches(values(catalog.landmark_rule_node_types, ruleId, 'node_type'), placement.node_type)
    && matches(values(catalog.landmark_rule_landscapes, ruleId, 'landscape_template_id'), placement.landscape_template_id)
    && matches(values(catalog.landmark_rule_hydrology, ruleId, 'water_body_template_id'), placement.water_body_template_id)
    && matches(values(catalog.landmark_rule_land_use, ruleId, 'land_use_template_id'), placement.land_use_template_id)
    && matchesRoute(values(catalog.landmark_rule_routes, ruleId, 'route_template_id'), placement);
}

function values(records, ruleId, key) { return records.filter((item) => item.rule_id === ruleId).map((item) => requiredText(item[key], 'ENVIRONMENT_SCOPE_BINDING_INVALID')).sort(); }
function matches(requiredValues, actual) { return requiredValues.length === 0 || (text(actual) && requiredValues.includes(actual)); }
function matchesRoute(requiredValues, placement) { return requiredValues.length === 0 || requiredValues.some((value) => value === placement.route_template_id || placement.route_template_ids?.includes(value)); }

function chooseCount(rule, available, random) {
  const min = numberAtLeast(rule.min_count, 0, 'rule.min_count');
  const max = numberAtLeast(rule.max_count, min, 'rule.max_count');
  if (min > available) {
    if (required(rule)) throw new EnvironmentFeatureError('ENVIRONMENT_REQUIRED_CANDIDATE_SET_EMPTY', 'Required landmark count exceeds candidates.', { rule_id: rule.rule_id, available, minimum: min });
    return 0;
  }
  return min + (max > min ? random.nextUint32() % (Math.min(max, available) - min + 1) : 0);
}

function weighted(items, draw) {
  if (items.length === 0) throw new EnvironmentFeatureError('ENVIRONMENT_REQUIRED_CANDIDATE_SET_EMPTY', 'Weighted selection requires at least one candidate.');
  const total = items.reduce((sum, item) => sum + candidateWeight(item), 0);
  let cursor = draw % total;
  for (const item of items) {
    cursor -= candidateWeight(item);
    if (cursor < 0) return item;
  }
  throw new EnvironmentFeatureError('ENVIRONMENT_WEIGHTED_SELECTION_INVALID', 'Weighted selection did not resolve a candidate.');
}

function choice(ordinal, choiceKey, digest, ids, selected, draw, counter, selectedKey = 'template_id') {
  return { choice_ordinal: ordinal, choice_key: choiceKey, candidate_set_digest: digest, candidate_ids: ids, selected_id: selected[selectedKey], selected_weight: candidateWeight(selected), rng_draw: draw, rng_counter: counter, rejection_summary: emptyRejections() };
}

function candidateWeight(candidate) {
  const weight = Number(candidate?.weight);
  if (!Number.isFinite(weight) || weight <= 0) throw new EnvironmentFeatureError('ENVIRONMENT_CANDIDATE_WEIGHT_INVALID', 'Every materialization candidate requires an explicit positive weight.', { candidate_id: candidate?.template_id ?? candidate?.binding_id ?? null });
  return weight;
}
