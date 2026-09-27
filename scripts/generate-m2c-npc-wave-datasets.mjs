#!/usr/bin/env node
/**
 * Build m2c-npc-wave v1 datasets from approved game-base-v1 @ SOURCE_COMMIT (git show).
 * ponytail: single generator; schedules/composition stay as staging JSON until target DDL exists.
 */
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const SOURCE_COMMIT = process.env.M2C_SOURCE_COMMIT ?? 'b1f249de';
const WORLD_REVISION_ID = 'novgorod_spatial_v3_target_contract_approval_001';
const PROVENANCE_REF = `game_base_v1_m2c_people_${SOURCE_COMMIT.slice(0, 8)}`;
const OUT_ROOT = 'data/world-catalogs/novgorod/m2c-npc-wave/v1';
const GAME_BASE = 'data/world-catalogs/novgorod/game-base-v1';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

function gitShow(path) {
  return execSync(`git show ${SOURCE_COMMIT}:${path}`, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** Minimal RFC4180-ish CSV parser. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let i = 0;
  let inQuotes = false;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  if (!rows.length) return [];
  const headers = rows[0];
  return rows.slice(1).map((cells) => Object.fromEntries(
    headers.map((h, idx) => [h, cells[idx] ?? ''])
  ));
}

export function mapConfidence(letter) {
  const c = String(letter ?? '').trim().toUpperCase();
  if (c === 'A') return 'high';
  if (c === 'B') return 'medium';
  if (c === 'C') return 'low';
  return 'unknown';
}

export function parseTextArray(raw) {
  const t = String(raw ?? '').trim();
  if (!t || t === 'all') return t === 'all' ? ['all'] : [];
  if (t.startsWith('[')) {
    try {
      const parsed = JSON.parse(t);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return t.split(/[|;]/u).map((s) => s.trim()).filter(Boolean);
}

export function parseVariants(raw) {
  const t = String(raw ?? '').trim();
  if (!t || t === '[]') return [];
  try {
    const parsed = JSON.parse(t);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function parseNodeRef(nodeRef) {
  const m = String(nodeRef).match(/^(.*)@(\d+)$/u);
  if (!m) throw new Error(`bad node_ref: ${nodeRef}`);
  return { node_id: m[1], node_version: Number(m[2]) };
}

function blank(raw) {
  const t = String(raw ?? '').trim();
  return t.length ? t : null;
}

function intOrNull(raw) {
  const t = String(raw ?? '').trim();
  if (!t || t === 'unspecified') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function intOrZero(raw) {
  const n = intOrNull(raw);
  return n == null ? 0 : n;
}

export function mapPresenceRule(row, worldRevisionId, provenanceRef) {
  const variants = parseVariants(row.variants);
  return {
    rule_id: row.pr_id,
    rule_version: 1,
    world_revision_id: worldRevisionId,
    scope_kind: row.scope_kind,
    scope_ref: row.scope_ref,
    region_id: blank(row.region_id),
    subject_kind: row.subject_kind,
    subject_ref: row.subject_ref,
    category_id: row.subject_kind === 'category' ? (row.category_ref || row.subject_ref) : null,
    item_ref: blank(row.item_ref),
    variants,
    presence_probability_ppm: intOrZero(row.probability_ppm),
    count_limit: intOrZero(row.count_limit),
    allowed_seasons: parseTextArray(row.allowed_seasons),
    allowed_times: parseTextArray(row.allowed_times),
    guards: parseTextArray(row.guards),
    entry_visible_if: blank(row.entry_visible_if),
    search_only_if: blank(row.search_only_if),
    entry_exposed_weight: intOrNull(row.entry_exposed_weight),
    search_concealed_weight: intOrNull(row.search_concealed_weight),
    wild_arrival_cause: blank(row.wild_arrival_cause_required),
    refresh_class: row.refresh_class?.trim() || 'none',
    confidence: mapConfidence(row.confidence),
    status: 'approved',
    provenance_ref: provenanceRef,
    authoring_payload: {
      frequency_class: row.frequency_class ?? '',
      probability_rule_ref: row.probability_rule_ref ?? '',
      count_limit_basis: row.count_limit_basis ?? '',
      source_row_id: row.source_row_id ?? '',
      source_refs: row.source_refs ?? '',
      pool_confidence: row.pool_confidence ?? '',
      csv_status: row.status ?? '',
    },
  };
}

async function writeDataset(relPath, rows) {
  const file = `${OUT_ROOT}/${relPath}`;
  await mkdir(dirname(resolve(root, file)), { recursive: true });
  const body = json(rows);
  await writeFile(resolve(root, file), body, 'utf8');
  return { file, sha256: sha256(body) };
}

export async function buildM2cNpcWaveDatasets(options = {}) {
  const commit = options.sourceCommit ?? SOURCE_COMMIT;
  const worldRevisionId = options.worldRevisionId ?? WORLD_REVISION_ID;
  const provenanceRef = options.provenanceRef ?? PROVENANCE_REF;
  const show = options.gitShow ?? ((path) => execSync(`git show ${commit}:${path}`, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }));

  const sourceRecords = [{
    id: provenanceRef,
    status: 'approved',
    provenance_kind: 'game_base_authoring',
    source_commit: commit,
    notes: 'approve_with_limits wave from game-base-v1 @ git show',
  }];

  const pfCsv = parseCsv(show(`${GAME_BASE}/places-binding/places/place_families.csv`));
  const placeFamilies = pfCsv.map((row) => ({
    id: row.pf_id,
    version: 1,
    world_revision_id: worldRevisionId,
    display_name_ru: blank(row.name_ru),
    pf_kind: blank(row.pf_kind),
    status: 'approved',
    provenance_ref: provenanceRef,
    confidence: mapConfidence(row.confidence),
    payload: {
      name_en: row.name_en ?? '',
      csv_status: row.status ?? '',
      source_refs: row.source_refs ?? '',
    },
  }));

  const bindCsv = parseCsv(show(`${GAME_BASE}/places-binding/places/node_binding.csv`));
  const bindings = [];
  for (const row of bindCsv) {
    if (!row.pf_id?.trim()) continue;
    const { node_id, node_version } = parseNodeRef(row.node_ref);
    bindings.push({
      world_revision_id: worldRevisionId,
      node_id,
      node_version,
      place_family_id: row.pf_id.trim(),
      place_family_version: 1,
      binding_role: 'primary',
      status: 'approved',
      provenance_ref: provenanceRef,
      confidence: mapConfidence(row.confidence),
    });
  }

  const prCsv = parseCsv(show(`${GAME_BASE}/places-binding/presence/presence_rules.csv`));
  const presenceRules = prCsv.map((row) => mapPresenceRule(row, worldRevisionId, provenanceRef));
  const ruleKeys = new Set();
  for (const rule of presenceRules) {
    const key = `${rule.rule_id}@${rule.rule_version}`;
    if (ruleKeys.has(key)) throw new Error(`duplicate rule_id@rule_version in revision: ${key}`);
    ruleKeys.add(key);
  }

  const hhCsv = parseCsv(show(
    `${GAME_BASE}/households-psychology-speech/households_kinship/household_composition_profiles.csv`
  ));
  const householdProfiles = hhCsv.map((row) => ({
    profile_id: row.hh_id,
    profile_version: 1,
    world_revision_id: worldRevisionId,
    household_type: blank(row.household_type),
    wealth_band: blank(row.wealth_band),
    place_family_id: blank(row.pf_id),
    members_estimate_min: intOrNull(row.members_estimate_min),
    members_estimate_max: intOrNull(row.members_estimate_max),
    status: 'approved',
    confidence: mapConfidence(row.confidence),
    provenance_ref: provenanceRef,
    payload: {
      family_pattern_ru: row.family_pattern_ru ?? '',
      household_pattern_ru: row.household_pattern_ru ?? '',
      members_estimate_basis: row.members_estimate_basis ?? '',
      note: row.note ?? '',
    },
  }));

  const slotJson = JSON.parse(show(`${GAME_BASE}/places-binding/slots/slot_instance_variants.json`));
  const slotVariants = slotJson.map((row) => ({
    variant_id: row.variant_id,
    variant_version: 1,
    world_revision_id: worldRevisionId,
    slot_id: row.slot_id,
    weight: intOrZero(row.weight) || 1,
    applicability: typeof row.applicability === 'object' && row.applicability != null
      ? row.applicability
      : { scope: String(row.applicability ?? 'all') },
    facets: row.facets ?? {},
    status: 'approved',
    confidence: mapConfidence(row.facets?.material?.confidence ?? row.confidence),
    provenance_ref: provenanceRef,
    payload: { candidate_record_ref: row.candidate_record_ref ?? '' },
  }));

  const waterCsv = parseCsv(show(
    `${GAME_BASE}/nature-materials-weather/weather_climate/water_profiles.csv`
  ));
  const waterFacets = waterCsv.map((row) => ({
    facet_id: row.water_profile_id,
    facet_version: 1,
    world_revision_id: worldRevisionId,
    scope_kind: row.scope_kind,
    scope_ref: row.scope_ref,
    place_family_id: blank(row.pf_id),
    season: blank(row.season),
    facet: row.facet,
    variant_id: blank(row.variant_id),
    weight: intOrNull(row.weight),
    value_ru: blank(row.value_ru),
    value_num: intOrNull(row.value_num),
    unit: blank(row.unit),
    no_source: String(row.no_source ?? '').includes('no_source'),
    status: 'approved',
    confidence: mapConfidence(row.confidence),
    provenance_ref: provenanceRef,
    payload: {
      value_ref: row.value_ref ?? '',
      condition: row.condition ?? '',
      rule_ref: row.rule_ref ?? '',
    },
  }));

  const faunaPaths = [
    `${GAME_BASE}/fauna-fish-invertebrates-livestock/fauna/phase_activity.csv`,
    `${GAME_BASE}/fauna-mammals-birds/fauna/phase_activity.csv`,
  ];
  const faunaRules = [];
  for (const path of faunaPaths) {
    for (const row of parseCsv(show(path))) {
      faunaRules.push({
        rule_id: row.phase_rule_id,
        rule_version: 1,
        world_revision_id: worldRevisionId,
        fauna_ref: row.fa_id,
        season: blank(row.season),
        phase: row.phase,
        visibility_state: blank(row.visibility_state),
        voice_state: blank(row.voice_state),
        voice_text_ref: blank(row.voice_text_ref),
        status: 'approved',
        confidence: mapConfidence(row.confidence),
        provenance_ref: provenanceRef,
        payload: { source_refs: row.source_refs ?? '', rule_ref: row.rule_ref ?? '' },
      });
    }
  }

  const schedulesCsv = parseCsv(show(`${GAME_BASE}/time-calendar-church/time/schedules_routines.csv`));
  const schedulesStaging = schedulesCsv
    .filter((row) => (row.day_type ?? '').trim() === 'normal')
    .map((row) => ({
      sch_id: row.sch_id,
      revision: Number(row.revision) || 1,
      role_ref: blank(row.role_ref),
      occupation_ref: blank(row.occupation_ref),
      season: row.season ?? '',
      time_blocks: row.time_blocks ?? '',
      place_access_ref: blank(row.place_access_ref),
      confidence: row.confidence ?? '',
      csv_status: row.status ?? '',
    }));

  const compositionStaging = JSON.parse(show(
    `${GAME_BASE}/places-binding/presence/people_composition_authoring.json`
  ));

  const datasets = [];
  const entries = [
    ['datasets/source_records.json', sourceRecords, 'source_records', []],
    ['datasets/place_families.json', placeFamilies, 'place_families', ['source_records']],
    ['datasets/spatial_node_place_family_bindings.json', bindings, 'spatial_node_place_family_bindings', ['place_families']],
    ['datasets/presence_rules.json', presenceRules, 'presence_rules', ['place_families']],
    ['datasets/household_composition_profiles.json', householdProfiles, 'household_composition_profiles', ['source_records']],
    ['datasets/slot_instance_variants.json', slotVariants, 'slot_instance_variants', ['source_records']],
    ['datasets/water_body_presence_facets.json', waterFacets, 'water_body_presence_facets', ['place_families']],
    ['datasets/fauna_phase_activity_rules.json', faunaRules, 'fauna_phase_activity_rules', ['source_records']],
    ['datasets/staging_schedules_routines_normal.json', schedulesStaging, null, []],
    ['datasets/staging_people_composition_authoring.json', compositionStaging, null, []],
  ];

  for (const [rel, rows, table, dependsOn] of entries) {
    const { file, sha256: digest } = await writeDataset(rel, rows);
    if (table) {
      datasets.push({
        table,
        file,
        sha256: digest,
        status: 'draft',
        provenance_ref: provenanceRef,
        delete_policy: 'forbid',
        depends_on: dependsOn,
      });
    }
  }

  const manifest = {
    schema_version: 'rus.spatial-v3.world-base-authoring-bundle.v1',
    bundle_id: 'novgorod_m2c_npc_wave_v1',
    world_revision_id: worldRevisionId,
    status: 'draft',
    provenance_ref: provenanceRef,
    delete_policy: 'forbid',
    source_commit: commit,
    datasets,
    data_gaps: [
      {
        gap_id: 'M2C_D1_ROUTINES_TARGET_TABLE',
        summary: 'schedules_routines normal rows staged; spatial_v3_npc_runtime_profiles import pending DDL/importer',
      },
      {
        gap_id: 'M2C_D2_COMPOSITION_BINDINGS',
        summary: 'people_composition_authoring staged; spatial_v3_g4_npc_composition_bindings import pending DDL/importer',
      },
    ],
  };

  const manifestPath = `${OUT_ROOT}/manifest.json`;
  await mkdir(dirname(resolve(root, manifestPath)), { recursive: true });
  await writeFile(resolve(root, manifestPath), json(manifest), 'utf8');

  return {
    manifestPath,
    counts: Object.fromEntries(datasets.map((d) => [d.table, 'rows'])),
    presenceRules: presenceRules.length,
    bindings: bindings.length,
  };
}

const isMain = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const result = await buildM2cNpcWaveDatasets({ gitShow: gitShow });
  console.log(JSON.stringify(result, null, 2));
}
