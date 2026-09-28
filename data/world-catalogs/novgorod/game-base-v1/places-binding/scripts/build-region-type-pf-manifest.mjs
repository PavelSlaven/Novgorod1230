// Relate the pinned regional type list and two M2c start-only water types to current PF refs.
import path from 'node:path';
import { GROUP, readCsv, readJson, rel, split, writeJson } from './lib.mjs';
import { LOCAL_PF_ADDITIONS } from './build-place-families.mjs';

const INPUT = path.join(GROUP, 'inputs/m2c-nature-coverage-entries.json');
const FAMILIES = path.join(GROUP, 'places/place_families.csv');
const AUTHORING = path.join(GROUP, 'scripts/pf-authoring.json');
const OUTPUT = path.join(GROUP, 'places/region_type_pf_manifest.json');
const OWNER = 'data/world-catalogs/novgorod/world-knowledge/production-v1/place-first-cartography.json';
const FIELD = {
  landscape: 'landscape_template_refs',
  water_body: 'water_body_template_refs',
  land_use: 'land_use_template_refs',
  place: 'place_template_refs',
};
const AUTH_FIELD = { landscape: 'landscape', water_body: 'water', land_use: 'land_use', place: 'place' };

export function build() {
  const source = readJson(INPUT);
  const authoring = readJson(AUTHORING);
  const local = readJson(LOCAL_PF_ADDITIONS);
  const localById = new Map(local.additions.map((row) => [`pf_${row.id}`, row]));
  const families = readCsv(FAMILIES);
  const rows = [...source.entries, ...source.start_only_water_entries];
  const seen = new Set();
  const entries = rows.map((item) => {
    const { kind, template_id: id } = item;
    if (!FIELD[kind]) throw new Error(`unsupported type kind: ${kind}`);
    const key = `${kind}:${id}`;
    if (seen.has(key)) throw new Error(`duplicate type: ${key}`);
    seen.add(key);

    const matches = families.filter((pf) => split(pf[FIELD[kind]]).includes(id)).sort((a, b) => a.pf_id.localeCompare(b.pf_id));
    const pf_refs = matches.map((pf) => pf.pf_id).sort();
    const source_refs = [
      `${rel(INPUT)}#${source.entries.includes(item) ? 'entries' : 'start_only_water_entries'}[kind=${kind},template_id=${id}]`,
      ...(item.reference_source ? [item.reference_source] : []),
    ];
    const pf_mappings = matches.map((pf) => {
      const family = pf.pf_id.slice(3);
      const localFamily = localById.get(pf.pf_id);
      const evidence_refs = localFamily
        ? localFamily.exact_g4_refs.filter((ref) => (item.exact_m2c_g4 ?? []).includes(ref.replace(/@\d+$/, '')))
            .map((ref) => `${rel(FAMILIES.replace('place_families.csv', 'node_binding.csv'))}#${ref}`)
        : (authoring.families[family].template_ref_source_refs ?? []);
      return {
        pf_ref: `${rel(FAMILIES)}#pf_id=${pf.pf_id}`,
        authoring_ref: localFamily
          ? `${rel(LOCAL_PF_ADDITIONS)}#additions[id=${family}].${AUTH_FIELD[kind]}[${id}]`
          : `${rel(AUTHORING)}#families.${family}.${AUTH_FIELD[kind]}[${id}]`,
        evidence_refs: (key === 'landscape:lt_wooded_floodplain' || key === 'water_body:wb_nearshore_sea') ? evidence_refs : [],
      };
    });
    const row = {
      kind, template_id: id, coverage: matches.length ? 'covered' : 'gap', pf_refs,
      regional_scales: item.regional_scales ?? [], exact_g4: item.exact_m2c_g4 ?? [],
      source_refs, regional_source_refs: item.source_refs ?? [], pf_mappings, confidence: 'C',
    };
    if (!matches.length) {
      if (row.regional_scales.some((scale) => scale === 'G4' || scale === 'G5') || row.exact_g4.length) {
        throw new Error(`gap has exact G4/G5 evidence: ${key}`);
      }
      const closure = authoring.region_type_gap_closures?.[key];
      if (!closure || !Array.isArray(closure.nearest_pf_refs) ||
          closure.nearest_pf_refs.some((ref) => !families.some((pf) => pf.pf_id === ref)) ||
          ['existing_nearest_data', 'why_insufficient', 'minimum_data_delta'].some((field) => !closure[field]?.trim())) {
        throw new Error(`missing or invalid gap closure: ${key}`);
      }
      Object.assign(row, {
        required_capability: `Place-family applicability for ${kind} template ${id}`,
        correct_owner: OWNER,
        missing_authoring_data: `No authored PF ${FIELD[kind]} contains ${id}.`,
        ...closure,
        affected_acceptance_test: `C012 region-type PF coverage for ${key}`,
      });
    }
    return row;
  }).sort((a, b) => a.kind.localeCompare(b.kind) || a.template_id.localeCompare(b.template_id));
  const gaps = entries.filter((row) => row.coverage === 'gap').map((row) => `${row.kind}:${row.template_id}`).sort();
  const planned = Object.keys(authoring.region_type_gap_closures ?? {}).sort();
  if (JSON.stringify(gaps) !== JSON.stringify(planned)) throw new Error('gap closure keys differ from current gaps');

  const counts = { total: entries.length, covered: 0, gap: 0, by_kind: {} };
  for (const row of entries) {
    counts[row.coverage]++;
    const kind = counts.by_kind[row.kind] ??= { total: 0, covered: 0, gap: 0 };
    kind.total++; kind[row.coverage]++;
  }
  writeJson(OUTPUT, {
    schema: 'places_binding_region_type_pf_manifest_v1', status: 'candidate',
    source: source.source, source_status_warning: source.source_status_warning,
    counts, entries,
  });
  console.log('region type PF manifest', counts);
  return counts;
}

if (process.argv[1]?.endsWith('build-region-type-pf-manifest.mjs')) build();
