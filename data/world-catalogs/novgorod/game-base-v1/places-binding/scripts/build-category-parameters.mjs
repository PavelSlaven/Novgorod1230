// Category parameters: the characteristics code assigns to an instance of a category.
// parameters/parameter_definitions.csv — the universal parameter set (one row per parameter_key),
// parameters/category_parameters.csv — one row per (leaf category, required parameter).
// Values are copied only from a stated source (v5 item/container templates); everything else is an
// assignment rule with basis, never an invented number.
import path from 'node:path';
import { REPO, GROUP, readJson, readCsv, writeCsv, writeJson, arr } from './lib.mjs';

const V5 = 'data/knowledge-source/imports/item-container-120-v5/candidate/tables';
const T = (f) => arr(readJson(path.join(REPO, V5, f + '.json')));
const WKP = 'data/world-catalogs/novgorod/world-knowledge/production-v1';

const DEFS = [
  { key: 'mass_g', type: 'number', unit: 'gram per quantity unit', rule: 'by_template', values: '> 0', basis: `${V5}/item_template_quantity_profiles.json mass_grams_per_unit (source src_gameplay_physical_policy_v3: editorial gameplay ranges, not historical measurements); for categories without a template: by_material_and_size_band once materials_registry provides densities (gap)`, conf: 'C' },
  { key: 'size_band', type: 'enum', unit: '', rule: 'by_template', values: `v5 item/size_band categories (23, packing_N_bundle_M)`, basis: `${V5}/item_template_category_bindings.json binding_kind=size_band`, conf: 'C' },
  { key: 'primary_material', type: 'enum', unit: '', rule: 'by_template', values: 'v5 item/material and container/material categories; later materials_registry (nature-materials-weather group)', basis: `${V5}/item_template_category_bindings.json binding_kind=material; container_template_facet_bindings.json facet=material`, conf: 'C' },
  { key: 'manufacturing_technique', type: 'enum', unit: '', rule: 'by_template', values: 'v5 item/manufacturing_technique categories (55)', basis: `${V5}/item_template_category_bindings.json binding_kind=manufacturing_technique`, conf: 'C' },
  { key: 'quantity_unit', type: 'enum', unit: '', rule: 'by_template', values: 'gram|loaf|millilitre|piece|quantity_unit_gram_v1', basis: `${V5}/quantity_unit_definitions.json; item_template_quantity_profiles.json quantity_unit_id`, conf: 'C' },
  { key: 'quantity_min_max', type: 'text', unit: 'quantity unit', rule: 'by_template', values: 'min..max integers', basis: `${V5}/item_template_quantity_profiles.json minimum_quantity/maximum_quantity`, conf: 'C' },
  { key: 'stackable', type: 'boolean', unit: '', rule: 'by_template', values: 'true|false', basis: `${V5}/item_template_quantity_profiles.json stackable`, conf: 'C' },
  { key: 'divisible', type: 'boolean', unit: '', rule: 'by_template', values: 'true|false', basis: `${V5}/item_template_quantity_profiles.json partial_consumption_allowed`, conf: 'C' },
  { key: 'portability', type: 'enum', unit: '', rule: 'by_template', values: 'v5 container/portability categories (6); for items: by_size_band (rule owed by materialization owner)', basis: `${V5}/container_template_facet_bindings.json facet=portability`, conf: 'C' },
  { key: 'capacity_packing_slots', type: 'integer', unit: 'packing slot', rule: 'by_template', values: '>= 1', basis: `${V5}/container_templates.json capacity (capacity_policy packing_slots)`, conf: 'C' },
  { key: 'flammable', type: 'boolean', unit: '', rule: 'by_material', values: 'true|false', basis: `${WKP}/material-response.json, ${WKP}/foundations-physical.json (approved WK: response of materials to fire/heat); per-material table owed by materials_registry`, conf: 'B' },
  { key: 'floats', type: 'boolean', unit: '', rule: 'by_material', values: 'true|false', basis: `${WKP}/foundations-physical.json, ${WKP}/physical-interaction.json (approved WK); per-material table owed by materials_registry`, conf: 'B' },
  { key: 'durability_class', type: 'enum', unit: '', rule: 'by_material', values: 'vocabulary gap (no approved durability scale)', basis: `${WKP}/material-response.json (approved WK: wear, breakage, decay by material)`, conf: 'C' },
  { key: 'value_band', type: 'enum', unit: '', rule: 'by_material', values: 'vocabulary gap (owned by economy-trade-measures group: price bands)', basis: 'owner decision: value is assigned by code; D10 — value never makes an item significant', conf: 'C' },
  { key: 'quality_class', type: 'enum', unit: '', rule: 'by_form', values: 'vocabulary gap (craft quality / finish scale not defined)', basis: 'universal_category_classification_policy.md §5 (quality is a separate facet)', conf: 'C' },
  { key: 'spoilage_class', type: 'enum', unit: '', rule: 'by_material', values: 'food-drink group spoilage states (food/spoilage_states)', basis: 'food-drink group; MASTER food_system spoilage_states', conf: 'C' },
];
const REQUIRED = {
  item: ['mass_g', 'size_band', 'primary_material', 'manufacturing_technique', 'quantity_unit', 'quantity_min_max', 'stackable', 'divisible', 'portability', 'flammable', 'floats', 'durability_class', 'value_band', 'quality_class'],
  container: ['mass_g', 'primary_material', 'portability', 'capacity_packing_slots', 'flammable', 'floats', 'durability_class', 'value_band', 'quality_class'],
  garment: ['mass_g', 'size_band', 'primary_material', 'flammable', 'durability_class', 'value_band', 'quality_class'],
  food: ['mass_g', 'quantity_unit', 'divisible', 'spoilage_class', 'value_band'],
};
// Presence facet whose leaves carry instance parameters (policy: presence on one hierarchical facet).
const LEAF_FACETS = { item: ['object_type'], container: ['container_form'] };

export function build() {
  const defs = DEFS.map((d) => ({
    parameter_key: d.key, value_type: d.type, unit: d.unit, allowed_values_or_range: d.values, default_assignment_rule: d.rule, rule_basis: d.basis,
    applies_to_domains: Object.entries(REQUIRED).filter(([, ks]) => ks.includes(d.key)).map(([k]) => k), region_id: '', universal: 'true', confidence: d.conf, status: 'candidate',
  }));
  writeCsv(path.join(GROUP, 'parameters/parameter_definitions.csv'), Object.keys(defs[0]), defs);
  const defByKey = new Map(DEFS.map((d) => [d.key, d]));

  const reg = readCsv(path.join(GROUP, 'categories/category_registry.csv'));
  const parents = new Set(reg.map((r) => r.parent_category_id).filter(Boolean));
  const cats = new Map(reg.map((r) => [r.category_id, r]));
  const tpls = T('item_templates');
  const qty = new Map(T('item_template_quantity_profiles').map((q) => [q.item_template_id, q]));
  const binds = T('item_template_category_bindings');
  const ctpls = T('container_templates');
  const cbind = T('container_template_facet_bindings');

  const rows = [];
  let i = 0;
  const push = (cat, key, value, rule, basis, src, conf) => {
    const d = defByKey.get(key);
    rows.push({
      cp_id: `cp_${cat.category_id}__${key}`, category_id: cat.category_id, domain: cat.domain, parameter_key: key, value_type: d.type,
      allowed_values_or_range: value === null ? d.values : value, value_is_sourced: value === null ? 'false' : 'true', assignment_rule: rule, rule_basis: basis,
      region_id: '', source_refs: src, confidence: conf, status: 'candidate',
    });
    i++;
  };
  const leaves = reg.filter((r) => !parents.has(r.category_id) && ((LEAF_FACETS[r.domain] ?? []).includes(r.facet) || (['garment', 'food'].includes(r.domain) && r.origin.startsWith('game_base_v1'))));
  for (const cat of leaves) {
    const dom = cat.domain;
    const keys = REQUIRED[dom] ?? [];
    if (dom === 'item') {
      const tps = tpls.filter((t) => t.category_id === cat.category_id);
      for (const k of keys) {
        const d = defByKey.get(k);
        if (!tps.length) { push(cat, k, null, d.rule, d.basis + ' — no v5 template for this category: rule only', cat.source_domain_file, 'C'); continue; }
        const vals = new Set();
        for (const t of tps) {
          const q = qty.get(t.id);
          if (k === 'mass_g' && q) vals.add(q.mass_grams_per_unit);
          if (k === 'quantity_unit' && q) vals.add(q.quantity_unit_id);
          if (k === 'quantity_min_max' && q) vals.add(`${q.minimum_quantity}..${q.maximum_quantity}`);
          if (k === 'stackable' && q) vals.add(q.stackable);
          if (k === 'divisible' && q) vals.add(q.partial_consumption_allowed);
          if (['size_band', 'primary_material', 'manufacturing_technique'].includes(k)) {
            const bk = { size_band: 'size_band', primary_material: 'material', manufacturing_technique: 'manufacturing_technique' }[k];
            for (const b of binds.filter((b) => b.item_template_id === t.id && b.binding_kind === bk)) vals.add(b.category_id);
          }
        }
        const sourced = vals.size ? [...vals].join('|') : null;
        push(cat, k, sourced, sourced ? 'by_template' : k === 'portability' ? 'by_size_band' : d.rule, sourced ? `${V5} templates ${tps.map((t) => t.id).join(',')}` : d.basis, sourced ? `${V5}/item_templates.json#${tps.map((t) => t.id).join(',')}` : d.basis, 'C');
      }
    } else if (dom === 'container') {
      const tps = ctpls.filter((t) => t.category_id === cat.category_id);
      for (const k of keys) {
        const d = defByKey.get(k);
        let v = null;
        if (tps.length && k === 'capacity_packing_slots') v = [...new Set(tps.map((t) => t.capacity))].join('|');
        if (tps.length && (k === 'primary_material' || k === 'portability')) {
          const f = k === 'primary_material' ? 'material' : 'portability';
          const s = [...new Set(cbind.filter((b) => tps.some((t) => t.id === b.container_template_id) && b.facet === f).map((b) => b.category_id))];
          v = s.length ? s.join('|') : null;
        }
        push(cat, k, v, v ? 'by_template' : d.rule, v ? `${V5} container templates ${tps.map((t) => t.id).join(',')}` : d.basis, v ? `${V5}/container_templates.json#${tps.map((t) => t.id).join(',')}` : d.basis, 'C');
      }
    } else {
      for (const k of keys) { const d = defByKey.get(k); push(cat, k, null, d.rule, d.basis, cat.source_domain_file, 'C'); }
    }
  }
  const n = writeCsv(path.join(GROUP, 'parameters/category_parameters.csv'), Object.keys(rows[0]), rows);
  const summary = {
    parameter_definitions: defs.length, category_parameter_rows: n, leaf_categories: leaves.length,
    by_domain: leaves.reduce((a, r) => ((a[r.domain] = (a[r.domain] ?? 0) + 1), a), {}),
    sourced_values: rows.filter((r) => r.value_is_sourced === 'true').length, rule_only: rows.filter((r) => r.value_is_sourced === 'false').length,
    leaves_without_template: [...new Set(rows.filter((r) => /no v5 template/.test(r.rule_basis)).map((r) => r.category_id))].length,
  };
  writeJson(path.join(GROUP, 'reports/category-parameters-report.json'), summary);
  console.log('category parameters', summary);
  return summary;
}
if (process.argv[1]?.endsWith('build-category-parameters.mjs')) build();
