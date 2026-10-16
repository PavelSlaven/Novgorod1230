import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canonicalStringify } from '../packages/runtime-catalog/src/canonical-records.js';

const root = resolve(import.meta.dirname, '..');
const base = 'data/world-catalogs/novgorod/';
const paths = {
  natural: `${base}m2c-natural/candidate.json`,
  presentation: `${base}m2c-natural-presentation/candidate.json`,
  richness: `${base}m2c-natural/nature-richness-candidate-v1.json`,
  approval: `${base}m2c-natural/nature-richness-data-approval.json`,
  phrases: `${base}m2c-natural/nature-successor-phrases-v1.json`,
  naturalOutput: `${base}m2c-natural/nature-successor-candidate-v2.json`,
  presentationOutput: `${base}m2c-natural-presentation/nature-successor-candidate-v2.json`
};
const bytes = (path) => readFileSync(resolve(root, path));
const json = (path) => JSON.parse(bytes(path));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const natural = json(paths.natural);
const presentation = json(paths.presentation);
const richness = json(paths.richness);
const approval = json(paths.approval);
const phrases = json(paths.phrases);
const seasons = ['winter', 'spring', 'summer', 'autumn'];
const richnessRef = (variantIndex, rowIndex) => `${paths.richness}#profiles/${variantIndex}/selection_candidates/${rowIndex}`;
if (hash(bytes(paths.richness)) !== approval.candidate_sha256 || approval.decision !== 'APPROVE_AUTHORING_DATA_ONLY') {
  throw new Error('Nature richness input lacks exact data approval');
}
if (natural.natural_profiles.length !== 32 || presentation.presentation_profiles.length !== 32) throw new Error('Expected 32 exact G4 profiles');
const richnessByG4 = new Map();
for (const [variantIndex, variant] of richness.profiles.entries()) for (const id of variant.g4_ids) {
  if (richnessByG4.has(id)) throw new Error(`Duplicate richness G4: ${id}`);
  richnessByG4.set(id, { variant, variantIndex });
}
const presentationByG4 = new Map(presentation.presentation_profiles.map((profile) => [profile.g4_ref.id, profile]));
const naturalProfiles = [];
const presentationProfiles = [];
for (const [profileIndex, original] of natural.natural_profiles.entries()) {
  const id = original.g4_ref.id;
  const source = richnessByG4.get(id);
  const variant = source?.variant;
  const oldPresentation = presentationByG4.get(id);
  if (!variant || !oldPresentation || original.template_refs.landscape_template_id !== variant.landscape_template_id) {
    throw new Error(`Missing exact source profile: ${id}`);
  }
  const profile = structuredClone(original);
  profile.profile_version = 2;
  profile.status = 'candidate_approval_pending';
  const layers = profile.natural_profile.layer_applicability;
  layers.fauna = {
    applicability: 'conditional',
    value: { class: 'ambient_trace_or_sound_compatibility_only' },
    directness: 'inferred', confidence: 'low',
    source_refs: [richness.source_register.archaeological_fauna, richness.source_register.exact_g4],
    limits: 'Habitat compatibility only. No animal entity, current trace, sound, encounter or stock follows.'
  };
  const membersByLayer = new Map();
  const exclusionsByLayer = new Map();
  for (const [index, row] of variant.selection_candidates.entries()) {
    const layer = layers[row.layer];
    if (!layer) throw new Error(`Unknown layer ${row.layer}: ${id}`);
    const candidateRef = richnessRef(source.variantIndex, index);
    if (row.layer !== 'fauna' && layer.applicability !== 'present') {
      if (row.taxon !== 'Salix (willow)' || row.layer !== 'riparian_vegetation'
        || !id.endsWith('_driftwood_bar') && !id.endsWith('_shifting_shoal_field')) {
        throw new Error(`Unexpected inapplicable alternative: ${id}/${row.taxon}`);
      }
      (exclusionsByLayer.get(row.layer) ?? exclusionsByLayer.set(row.layer, []).get(row.layer)).push({ candidate_ref: candidateRef,
        reason: 'baseline_layer_not_applicable', baseline_ref: `${paths.natural}#natural_profiles/${profileIndex}/natural_profile/layer_applicability/${row.layer}` });
      continue;
    }
    if (row.kind === 'fungi' && !layer.value?.ambient_materials?.some((material) => richness.fungal_organic_substrates.includes(material))) {
      if (!id.endsWith('_shifting_shoal_field')) throw new Error(`Unexpected fungal substrate gap: ${id}`);
      (exclusionsByLayer.get(row.layer) ?? exclusionsByLayer.set(row.layer, []).get(row.layer)).push({ candidate_ref: candidateRef,
        reason: 'organic_substrate_absent', baseline_ref: `${paths.natural}#natural_profiles/${profileIndex}/natural_profile/layer_applicability/${row.layer}` });
      continue;
    }
    if (!(row.category in richness.weight_policy.weights)) throw new Error(`Unknown frequency category: ${row.category}`);
    const member = {
      id: `${id}:nature_member_${index + 1}`, kind: row.kind, taxon_or_material_ref: row.taxon,
      source_candidate_ref: candidateRef, frequency_category: row.category,
      ordinal_category: row.category, editorial_weight: richness.weight_policy.weights[row.category],
      directness: row.directness, confidence: row.confidence,
      source_refs: row.source_keys.map((key) => richness.source_register[key]),
      season_condition: row.season, limits: row.limit,
      candidate_use: row.candidate_use ?? 'conditional_selection'
    };
    (membersByLayer.get(row.layer) ?? membersByLayer.set(row.layer, []).get(row.layer)).push(member);
  }
  for (const [name, members] of membersByLayer) layers[name].alternatives = members;
  if (!layers.fauna.alternatives?.length) throw new Error(`Missing fauna alternatives: ${id}`);
  profile.natural_profile.season_matrix = Object.fromEntries(seasons.map((season, seasonIndex) => [season,
    Object.fromEntries(Object.entries(layers).map(([name, layer]) => {
      const alternatives = layer.alternatives ?? [];
      const members = alternatives.map((member) => ({
        member_ref: member.id, eligibility: 'conditional_current_state',
        frequency_category: member.frequency_category, editorial_weight: member.editorial_weight,
        season_eligibility: { status: 'unresolved_machine_condition', condition_ref: `${member.source_candidate_ref}/season` },
        phase: name === 'fauna' ? phrases.fauna_phase
          : phrases.seasonal_phase[member.taxon_or_material_ref]?.[seasonIndex] ?? phrases.default_phase
      }));
      if (layer.applicability === 'present') members.unshift({ member_ref: `baseline:${name}`, eligibility: 'approved_broad_context', phase: phrases.default_phase });
      if (layer.applicability !== 'not_applicable' && !members.length) throw new Error(`Empty applicable ${season}/${name}: ${id}`);
      return [name, { applicability: layer.applicability,
        mandatory_member_refs: layer.applicability === 'present' ? [`baseline:${name}`] : [],
        excluded_candidate_refs: exclusionsByLayer.get(name) ?? [],
        incompatibility: { status: 'unresolved_source_gap', member_refs: [] }, members }];
    }))]));
  naturalProfiles.push(profile);

  const display = structuredClone(oldPresentation);
  display.version = 2;
  display.status = 'candidate_approval_pending';
  const payload = { schema: 'rus.g4_natural_baseline_profile.v1', profile_id: profile.profile_id,
    profile_version: profile.profile_version, g4_ref: profile.g4_ref,
    exact_scene_features: profile.exact_scene_features, natural_profile: profile.natural_profile };
  display.natural_profile_ref = { id: profile.profile_id, version: 2,
    payload_digest: hash(canonicalStringify(payload)) };
  for (const descriptor of display.layers) {
    const members = layers[descriptor.layer].alternatives ?? [];
    descriptor.member_phrases = members.filter((member) => member.kind !== 'fungi' && member.kind !== 'fauna')
      .map((member) => {
        const clear_text = phrases.visual[member.taxon_or_material_ref];
        if (!clear_text) throw new Error(`Missing phrase: ${member.taxon_or_material_ref}`);
        return { member_ref: member.id, channel: 'visual', clear_text,
          admission: 'exact_current_source_and_P22_perception_required' };
      });
  }
  display.layers.push({ layer: 'fauna', channel: 'none', clear_text: null,
    non_projection_reason: 'No current fauna presence follows from habitat compatibility.',
    member_phrases: layers.fauna.alternatives.flatMap((member) => {
      const authored = phrases.fauna_static[member.taxon_or_material_ref];
      if (!authored?.trace || !authored?.sound) throw new Error(`Missing fauna phrase: ${member.taxon_or_material_ref}`);
      return [
        { member_ref: member.id, channel: 'visual', evidence: 'committed_static_trace', clear_text: authored.trace,
          admission: 'exact_current_trace_source_and_P22_perception_required' },
        { member_ref: member.id, channel: 'acoustic', evidence: 'committed_ambient_sound', clear_text: authored.sound,
          admission: 'exact_current_sound_source_and_P22_propagation_required' }
      ];
    }) });
  presentationProfiles.push(display);
}
if (richnessByG4.size !== naturalProfiles.length || presentationByG4.size !== naturalProfiles.length) throw new Error('Exact G4 coverage mismatch');
const sourcePins = Object.fromEntries(['natural', 'presentation', 'richness', 'phrases'].map((key) => [key, { path: paths[key], sha256: hash(bytes(paths[key])) }]));
const output = {
  naturalOutput: {
    artifact_type: 'natural_baseline_successor_authoring_candidate', candidate_id: 'novgorod_m2c_natural_baseline_g4_v2',
    version: 2, status: 'candidate_approval_pending', approved: false, import_authorized: false, activation_authorized: false,
    source_pins: sourcePins,
    frequency_weight_policy: structuredClone(richness.weight_policy),
    limits: 'Authoring data only. Existing 13-layer runtime validator does not admit the conditional fauna layer. Selection requires separate current-state and owner admission; no local presence or stock is asserted.',
    target: natural.target, natural_profiles: naturalProfiles
  },
  presentationOutput: {
    artifact_type: 'natural_presentation_successor_authoring_candidate', candidate_id: 'novgorod_m2c_natural_presentation_g4_v2',
    version: 2, status: 'candidate_approval_pending', approved: false, import_authorized: false, activation_authorized: false,
    source_pins: sourcePins,
    limits: 'Member phrases are candidates only; fauna is restricted to admitted static trace or ambient sound. No moving animal entity is authored. Existing 13-layer presentation runtime requires separate contract work.',
    presentation_profiles: presentationProfiles
  }
};
for (const [key, candidate] of Object.entries(output)) {
  const target = resolve(root, paths[key]);
  const serialized = JSON.stringify(candidate, null, 2) + '\n';
  if (process.argv.includes('--check')) {
    if (readFileSync(target, 'utf8') !== serialized) throw new Error(`Outdated successor candidate: ${paths[key]}`);
  } else writeFileSync(target, serialized);
}
console.log(`Nature successors: ${naturalProfiles.length} exact G4, ${seasons.length} seasons, ${naturalProfiles.reduce((n, p) => n + Object.values(p.natural_profile.layer_applicability).reduce((m, layer) => m + (layer.alternatives?.length ?? 0), 0), 0)} conditional member rows`);
