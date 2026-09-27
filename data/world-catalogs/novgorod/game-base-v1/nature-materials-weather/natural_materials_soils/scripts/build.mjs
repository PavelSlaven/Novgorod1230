// Builds natural_materials_soils candidate tables from authoring/*.mjs + read-only sources.
// Run from anywhere: node natural_materials_soils/scripts/build.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, readTsv, writeCsv, writeJson, FREQ_WEIGHT, SEASONS, SHARED } from '../../_shared/scripts/lib.mjs';
import SOURCES from '../authoring/sources.mjs';
import SOILS from '../authoring/soils.mjs';
import MATERIALS, { BASE_PORTIONS } from '../authoring/materials.mjs';
import TOOLS from '../authoring/tools.mjs';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGION = 'region_novgorod_land';
const expand = (refs) => refs.map((r) => {
  const [k, sub] = r.split(':').length === 2 && SOURCES[r.split(':')[0]] ? r.split(':') : [r, null];
  if (SOURCES[k]) return SOURCES[k].ref + (sub ? `#${sub}` : '');
  return r;
});

const landscapes = readTsv(path.join(SHARED, 'novgorod_landscape_templates.world_db.tsv'));
const g4index = readJson(path.join(SHARED, 'g4_nature_index.json'));
const soilByType = Object.fromEntries(SOILS.map((s) => [s.type, s]));

// 1. ground types (universal category rows; regional binding separate)
const groundRows = SOILS.map((s) => ({
  nm_id: `nm_ground_${s.type}`, name_ru: s.name_ru, name_en: s.name_en, material_kind: 'ground', category_code: `natural_ground.${s.type}`,
  scope: 'universal', soil_ground_type: s.type, texture_ru: s.texture, parent_material: s.parent,
  perceptual_cues: `цвет: ${s.colour}; запах: ${s.smell}; на ощупь/под ногой: ${s.touch}`,
  moisture_regime: s.moisture, winter_ground_state: s.frost, wet_trafficability: s.traffic_wet, dig_difficulty: s.dig,
  landscape_template_ids: landscapes.filter((l) => l.soil_ground_type === s.type).map((l) => l.id),
  source_refs: expand(s.src), confidence: s.conf, status: 'candidate',
}));

// 2. regional landscape -> ground binding
const bindRows = landscapes.map((l) => ({
  binding_id: `nmb_${l.id}`, region_id: REGION, landscape_template_id: l.id, regional_link_id: l.rlt, landscape_title_ru: l.title,
  ground_nm_id: soilByType[l.soil_ground_type] ? `nm_ground_${l.soil_ground_type}` : '', soil_ground_type: l.soil_ground_type,
  moisture_level: l.moisture_level, source_refs: [SOURCES.lt_templates.ref + '#' + l.id], confidence: 'C', status: 'candidate',
}));

// 3. materials (universal categories)
const seasonCell = (m, s) => `${m.season[s][0]}${m.season[s][1] ? ': ' + m.season[s][1] : ''}`;
const matRows = MATERIALS.map((m) => ({
  nm_id: m.id, name_ru: m.name_ru, name_en: m.name_en, material_kind: m.kind, category_code: m.category_code,
  scope: m.region_scope === 'site_specific' ? 'universal_category_site_specific_presence' : 'universal',
  stock_unit: 'portion', portion_mass_g: m.portion.mass_g, portion_desc_ru: m.portion.desc_ru,
  stock_rule: m.renewal === 'unbounded_while_water_body' ? 'unbounded while the water body exists (no finite stock)' : `portions = FREQ_WEIGHT[class] x ${BASE_PORTIONS} (ubiquitous 200, common 100, contextual 50, rare 25)`,
  renewal: m.renewal, operation: m.operation,
  access_tool_refs: m.tools, tool_required: m.tool_required,
  season_winter: seasonCell(m, 'winter'), season_spring: seasonCell(m, 'spring'), season_summer: seasonCell(m, 'summer'), season_autumn: seasonCell(m, 'autumn'),
  cue_visual: m.cues.visual, cue_touch: m.cues.touch, cue_smell: m.cues.smell, cue_sound: m.cues.sound,
  craft_process_refs: m.crafts, master_item_refs: m.master_refs, v17_profile_ref: m.v17_profile || '',
  source_refs: expand(m.src), confidence: m.conf, note: m.note, status: 'candidate',
}));

// 4. material x regional landscape presence
const presRows = [];
for (const m of MATERIALS) for (const l of landscapes) {
  const cls = m.lt(l);
  if (cls === 'absent') continue;
  const w = FREQ_WEIGHT[cls];
  presRows.push({
    presence_id: `nmp_${m.id.slice(3)}__${l.id.slice(3)}`, region_id: REGION, nm_id: m.id, landscape_template_id: l.id,
    frequency_class: cls, weight: w, stock_portions: m.renewal === 'unbounded_while_water_body' ? 'unbounded' : w * BASE_PORTIONS,
    rule: 'authoring/materials.mjs lt() over world_db landscape attributes (group, soil_ground_type, moisture, dominant_vegetation)',
    source_refs: [SOURCES.lt_templates.ref + '#' + l.id, ...expand(m.src).slice(0, 2)], confidence: 'C', status: 'candidate',
  });
}

// 5. exact G4 binding
const rank = ['absent', 'rare', 'contextual', 'common', 'ubiquitous'];
const maxc = (a, b) => (rank.indexOf(a) >= rank.indexOf(b) ? a : b);
const g4Rows = [];
const ltById = Object.fromEntries(landscapes.map((l) => [l.id, l]));
for (const g of g4index.g4) {
  const lt = ltById[g.landscape_template_id];
  if (!lt) throw new Error('landscape not in regional set: ' + g.landscape_template_id);
  const soil = soilByType[lt.soil_ground_type];
  g4Rows.push({
    row_id: `nmg4_${g.g4_short}__ground`, g4_ref: g.g4_id, g4_short: g.g4_short, place_function: g.place_function, landscape_template_id: lt.id,
    nm_id: `nm_ground_${lt.soil_ground_type}`, role: 'ground', frequency_class: 'ubiquitous', weight: 8, stock_portions: '', derivation: `ground of ${lt.id} (world_db soil_ground_type=${lt.soil_ground_type}); G4 surface class=${g.surface}`,
    season_winter: soil.frost, season_spring: '', season_summer: '', season_autumn: '', access_note: '', source_refs: [SOURCES.lt_templates.ref + '#' + lt.id, SOURCES.g4_index.ref + '#' + g.g4_id], confidence: 'C', status: 'candidate',
  });
  const memberRefs = new Set(g.members.map((x) => x.ref));
  for (const m of MATERIALS) {
    let cls = m.lt(lt); const why = [`landscape ${lt.id} -> ${cls}`];
    if (m.g4[g.place_function]) { cls = maxc(cls, m.g4[g.place_function]); why.push(`place_function ${g.place_function} -> ${m.g4[g.place_function]}`); }
    for (const [ref, c] of Object.entries(m.member_upgrade || {})) if (memberRefs.has(ref)) { cls = maxc(cls, c); why.push(`nature member ${ref} -> ${c}`); }
    if (m.water_body_rule) {
      if (g.water_body_type) { cls = 'ubiquitous'; why.push(`water_body ${g.water_body_type} -> ubiquitous`); }
    }
    const vegDependent = ['plant_bark', 'plant_resin', 'wood_resinous', 'wood_dead', 'plant_stem', 'moss', 'plant_root'].includes(m.kind) && m.id !== 'nm_driftwood';
    const noVegetation = g.applicability.tree_layer === 'not_applicable' && g.applicability.shrub_layer === 'not_applicable' && g.applicability.ground_cover === 'not_applicable';
    if (vegDependent && noVegetation && cls !== 'absent') { why.push('G4 has no vegetation layers (open bar/shoal) -> absent'); cls = 'absent'; }
    if (cls === 'absent') continue;
    const w = FREQ_WEIGHT[cls];
    let access = '';
    if (g.place_function === 'burial_area' && ['mineral_ground', 'organic_ground', 'ore', 'mineral_stone'].includes(m.kind)) access = 'restricted: burial ground — digging requires property/social-law check (no free extraction)';
    else if (g.place_function === 'archaeological_settlement') access = 'settlement land: ownership check by property owner before extraction';
    g4Rows.push({
      row_id: `nmg4_${g.g4_short}__${m.id.slice(3)}`, g4_ref: g.g4_id, g4_short: g.g4_short, place_function: g.place_function, landscape_template_id: lt.id,
      nm_id: m.id, role: 'raw_material', frequency_class: cls, weight: w,
      stock_portions: m.renewal === 'unbounded_while_water_body' ? 'unbounded' : w * BASE_PORTIONS, derivation: why.join('; '),
      season_winter: m.season.winter[0], season_spring: m.season.spring[0], season_summer: m.season.summer[0], season_autumn: m.season.autumn[0],
      access_note: access, source_refs: [SOURCES.g4_index.ref + '#' + g.g4_id, ...expand(m.src).slice(0, 2)], confidence: 'C', status: 'candidate',
    });
  }
}

// 6. tools
const toolRows = TOOLS.map((t) => ({ tool_ref: t.id, name_ru: t.name_ru, used_by: MATERIALS.filter((m) => m.tools.includes(t.id)).map((m) => m.id), source_refs: expand(t.src), confidence: t.conf, note: t.note, status: 'candidate_proposal_for_craft_tools_gear' }));

// 7. v17-shaped finite source profile extension (authoring only; not runtime)
const finite = MATERIALS.filter((m) => m.renewal !== 'unbounded_while_water_body').map((m) => ({
  profile_id: `gb1_finite_${m.id.slice(3)}_v1`, extends_v17_profile: m.v17_profile || null, status: 'candidate', approved: false,
  resource_class: m.id.slice(3), operation: m.operation, public_name: m.name_ru, item_kind: 'natural_resource_portion', basis_kind: 'finite_source',
  quantity_unit: m.portion_unit_v17 ? 'item (50 g, v17 unit)' : `portion (${m.portion.mass_g} g)`, mass_grams_per_unit: m.portion.mass_g,
  initial_quantity_rule: { formula: `FREQ_WEIGHT[class] * ${BASE_PORTIONS}`, weights: FREQ_WEIGHT },
  extraction: { tool_refs: m.tools, tool_required: m.tool_required, season_access: Object.fromEntries(SEASONS.map((s) => [s, m.season[s][0]])), depleted: 'persist zero; renewal owned by party_resource_nodes owner', renewal_class: m.renewal },
  applicability: g4Rows.filter((r) => r.nm_id === m.id).map((r) => ({ g4_ref: r.g4_ref, frequency_class: r.frequency_class, initial_quantity: r.stock_portions, access_note: r.access_note || undefined })),
  source_refs: expand(m.src), confidence: m.conf,
}));

const counts = {
  ground_types: writeCsv(path.join(DIR, 'ground_types.csv'), groundRows),
  landscape_ground_binding: writeCsv(path.join(DIR, 'landscape_ground_binding.csv'), bindRows),
  natural_materials: writeCsv(path.join(DIR, 'natural_materials.csv'), matRows),
  material_landscape_presence: writeCsv(path.join(DIR, 'material_landscape_presence.csv'), presRows),
  g4_ground_and_materials: writeCsv(path.join(DIR, 'g4_ground_and_materials.csv'), g4Rows),
  access_tools: writeCsv(path.join(DIR, 'access_tools.csv'), toolRows),
};
writeJson(path.join(DIR, 'finite_source_profiles_ext.json'), { schema: 'game_base_v1.finite_source_profiles_ext.v1', status: 'candidate', approved: false, note: 'Authoring extension of pr98 m2c-finite-source capability (4 profiles). Not runtime authority.', base_portions: BASE_PORTIONS, profiles: finite });
counts.finite_source_profiles_ext = finite.length;
console.log(JSON.stringify(counts));
