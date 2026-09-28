#!/usr/bin/env node
/**
 * Build m2c-npc-wave v1 datasets from approved game-base-v1 @ SOURCE_COMMIT (git show).
 */
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const OUT_ROOT = 'data/world-catalogs/novgorod/m2c-npc-wave/v1';
const APPROVAL_JSON = `${OUT_ROOT}/approval.json`;

function resolveSourceCommit() {
  if (process.env.M2C_SOURCE_COMMIT) return process.env.M2C_SOURCE_COMMIT;
  try {
    const approval = JSON.parse(readFileSync(resolve(root, APPROVAL_JSON), 'utf8'));
    const commit = String(approval.source_commit ?? '');
    if (/^[0-9a-f]{40}$/u.test(commit)) return commit;
  } catch {
    // fall through
  }
  throw new Error('M2C_SOURCE_COMMIT required or valid m2c-npc-wave/v1/approval.json source_commit');
}

const SOURCE_COMMIT = resolveSourceCommit();
const WORLD_REVISION_ID = 'novgorod_spatial_v3_target_contract_approval_001';
const GAME_BASE = 'data/world-catalogs/novgorod/game-base-v1';
const SPATIAL_V3_ROOT = 'data/world-catalogs/novgorod/spatial-v3';
export const STARTER_G3_SUBSTR = 'xp017_yp026';

function loadSpatialJson(relPath) {
  return JSON.parse(readFileSync(resolve(root, `${SPATIAL_V3_ROOT}/${relPath}`), 'utf8'));
}

export function loadSpatialClosure(worldRevisionId, bindings) {
  const revisions = loadSpatialJson('datasets/spatial_v3_world_revisions.json');
  const nodesAll = loadSpatialJson('datasets/spatial_v3_nodes.json');
  const revisionRows = revisions.filter((row) => row.id === worldRevisionId);
  if (revisionRows.length !== 1) throw new Error(`world revision missing: ${worldRevisionId}`);
  const nodeKeys = new Set(bindings.map((b) => `${b.node_id}|${b.node_version}`));
  const closureNodes = nodesAll.filter((row) => nodeKeys.has(`${row.id}|${row.version}`));
  if (closureNodes.length !== nodeKeys.size) {
    throw new Error(`spatial node closure incomplete: expected ${nodeKeys.size}, got ${closureNodes.length}`);
  }
  return { revisionRows, closureNodes };
}

export function starterPrimaryPlaceFamilies(bindings) {
  const pfIds = new Set();
  for (const binding of bindings) {
    if (binding.binding_role !== 'primary') continue;
    if (!String(binding.node_id).includes(STARTER_G3_SUBSTR)) continue;
    pfIds.add(binding.place_family_id);
  }
  return pfIds;
}

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
    let parsed;
    try {
      parsed = JSON.parse(t);
    } catch {
      throw new Error(`invalid text array JSON: ${t.slice(0, 80)}`);
    }
    if (!Array.isArray(parsed)) throw new Error(`invalid text array: expected JSON array, got ${typeof parsed}`);
    return parsed.map(String);
  }
  return t.split(/[|;]/u).map((s) => s.trim()).filter(Boolean);
}

export function parseRequiredNonNegInt(raw, field) {
  const t = String(raw ?? '').trim();
  if (!t) throw new Error(`missing required integer: ${field}`);
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) throw new Error(`invalid required integer: ${field}`);
  return n;
}

export function parseVariants(raw) {
  const t = String(raw ?? '').trim();
  if (!t || t === '[]') return [];
  let parsed;
  try {
    parsed = JSON.parse(t);
  } catch {
    throw new Error(`invalid variants JSON: ${t.slice(0, 80)}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`invalid variants: expected JSON array, got ${typeof parsed}`);
  }
  return parsed.map((entry) => {
    if (typeof entry === 'string') {
      throw new Error(`invalid variants entry: string elements are forbidden: ${entry}`);
    }
    if (entry && typeof entry === 'object' && entry.item_ref != null) {
      const variant = { item_ref: String(entry.item_ref) };
      if (entry.source_pool) variant.source_pool = String(entry.source_pool);
      if (entry.source_row_id) variant.source_row_id = String(entry.source_row_id);
      return variant;
    }
    throw new Error(`invalid variants entry: ${JSON.stringify(entry)}`);
  });
}

/** Slot variant weight: empty → 1; zero/negative → error (DDL requires weight > 0). */
export function parseSlotWeight(raw) {
  const t = String(raw ?? '').trim();
  if (!t) return 1;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`invalid slot weight: ${raw}`);
  }
  return n;
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

export function mapNpcRelationshipRule(row, worldRevisionId, provenanceRef) {
  return {
    rule_id: row.rel_rule_id,
    rule_version: 1,
    world_revision_id: worldRevisionId,
    scope_kind: row.scope_kind,
    scope_ref: blank(row.scope_ref) ?? '',
    subject_role_ref: blank(row.subject_role_ref),
    object_role_ref: blank(row.object_role_ref),
    relationship_kind: row.relationship_kind,
    direction: blank(row.direction),
    materialization_guard: blank(row.materialization_guard),
    status: 'approved',
    confidence: mapConfidence(row.confidence),
    provenance_ref: provenanceRef,
    payload: {
      source_refs: row.source_refs ?? '',
      rule_ref: row.rule_ref ?? '',
      no_source: row.no_source ?? '',
      csv_status: row.status ?? '',
    },
  };
}

export function mapSpeechAddressForm(row, worldRevisionId, provenanceRef) {
  return {
    form_id: row.sp_id,
    form_version: 1,
    world_revision_id: worldRevisionId,
    channel: blank(row.channel),
    relationship_kind: blank(row.relationship_kind),
    speaker_role_ref: blank(row.speaker_role_ref),
    addressee_role_ref: blank(row.addressee_role_ref),
    register_ref: blank(row.register_ref),
    form_ru: row.form_ru,
    situation: blank(row.situation),
    status: 'approved',
    confidence: mapConfidence(row.confidence),
    provenance_ref: provenanceRef,
    payload: {
      legal_weight_ref: row.legal_weight_ref ?? '',
      attestation: row.attestation ?? '',
      source_refs: row.source_refs ?? '',
      rule_ref: row.rule_ref ?? '',
      no_source: row.no_source ?? '',
      csv_status: row.status ?? '',
    },
  };
}

export const SCHEDULE_DAY_TYPES = Object.freeze([
  'normal', 'night_watch', 'night_fishing', 'market_day', 'church_day',
]);

const CONFIDENCE_RANK = Object.freeze({
  unknown: 0,
  low: 1,
  medium_low: 2,
  medium: 3,
  medium_high: 4,
  high: 5,
});

function parseMonths(raw, schId) {
  const t = String(raw ?? '').trim();
  if (!t) throw new Error(`schedule months missing: ${schId}`);
  const months = t.split('|').map((part) => Number(part.trim()));
  if (!months.length || months.some((n) => !Number.isInteger(n) || n < 1 || n > 12)) {
    throw new Error(`schedule months invalid: ${schId}`);
  }
  return months;
}

export function resolveScheduleScopeFromSchId(schId, pfIds) {
  const sorted = [...pfIds].sort((a, b) => b.length - a.length);
  for (const pf of sorted) {
    if (schId.includes(`_${pf}_`)) return pf;
  }
  throw new Error(`schedule sch_id place family unresolved: ${schId}`);
}

export function resolveScheduleSubject(row) {
  const occupation = blank(row.occupation_ref);
  const role = blank(row.role_ref);
  if (occupation) return { subject_kind: 'occupation', subject_ref: occupation };
  if (role) return { subject_kind: 'social_role', subject_ref: role };
  if (/^sch_household_child_/u.test(String(row.sch_id))) {
    return { subject_kind: 'household_member', subject_ref: 'child' };
  }
  throw new Error(`schedule subject unresolved: ${row.sch_id}`);
}

export function assertScheduleRowSchId(row, pfIds) {
  if (!SCHEDULE_DAY_TYPES.includes(row.day_type)) {
    throw new Error(`schedule day_type invalid: ${row.sch_id}`);
  }
  if (!['winter', 'spring', 'summer', 'autumn'].includes(row.season)) {
    throw new Error(`schedule season invalid: ${row.sch_id}`);
  }
  if (!row.sch_id.endsWith(`_${row.season}`)) {
    throw new Error(`schedule sch_id season suffix mismatch: ${row.sch_id}`);
  }
  if (!row.sch_id.includes(`_${row.day_type}_`)) {
    throw new Error(`schedule sch_id day_type marker mismatch: ${row.sch_id}`);
  }
  resolveScheduleSubject(row);
  return resolveScheduleScopeFromSchId(row.sch_id, pfIds);
}

function lowestMappedConfidence(groups) {
  let chosen = 'high';
  for (const group of groups) {
    if (!group?.confidence) continue;
    const mapped = mapConfidence(group.confidence);
    if (CONFIDENCE_RANK[mapped] < CONFIDENCE_RANK[chosen]) chosen = mapped;
  }
  return groups.length ? chosen : 'unknown';
}

function mapRoutinePhases(timeBlocksJson) {
  const blocks = JSON.parse(timeBlocksJson);
  if (!Array.isArray(blocks)) throw new Error('time_blocks must be array');
  return blocks.map((phase) => ({
    state_id: phase.state_id,
    duration_minutes: phase.duration_minutes,
    runtime_status: phase.runtime_status,
    activity_ref: phase.activity_ref,
    summary: phase.summary,
    activity_status: phase.activity_status,
    uses_current_activity: phase.uses_current_activity ?? false,
    can_continue_automatically: phase.can_continue_automatically,
    decision_required: phase.decision_required,
    presence_state: phase.presence_state ?? '',
    location_ref: blank(phase.location_ref),
    absence_reason_ru: phase.absence_reason_ru ?? '',
  }));
}

export function mapScheduleRoutineRule(row, worldRevisionId, provenanceRef, pfIds) {
  const { subject_kind, subject_ref } = resolveScheduleSubject(row);
  const scopeRef = assertScheduleRowSchId(row, pfIds);
  const revision = Number(row.revision) || 1;
  const localStart = Number(row.local_start_minute);
  const phases = mapRoutinePhases(row.time_blocks);
  const routineProfile = {
    schema: 'npc_routine_profile_v1',
    profile_id: row.sch_id,
    revision,
    status: 'approved',
    phases,
    ...(Number.isFinite(localStart) ? { local_start_minute: localStart } : {}),
  };
  return {
    schedule_id: row.sch_id,
    schedule_version: revision,
    world_revision_id: worldRevisionId,
    scope_kind: 'place_family',
    scope_ref: scopeRef,
    subject_kind,
    subject_ref,
    season: row.season,
    months: parseMonths(row.months, row.sch_id),
    day_type: row.day_type,
    routine_profile: routineProfile,
    status: 'approved',
    confidence: mapConfidence(row.confidence),
    provenance_ref: provenanceRef,
    authoring_payload: {
      place_access_ref: blank(row.place_access_ref),
      source_refs: row.source_refs ?? '',
      source_rule_ref: row.source_rule_ref ?? '',
      no_source: row.no_source ?? '',
      csv_status: row.status ?? '',
    },
  };
}

export function mapPlacePopulationComposition(entry, worldRevisionId, provenanceRef) {
  const groups = entry.population_groups ?? [];
  const confidence = lowestMappedConfidence(groups);
  return {
    composition_id: entry.pf_id,
    composition_version: 1,
    world_revision_id: worldRevisionId,
    place_family_id: entry.pf_id,
    place_family_version: 1,
    population_groups: groups,
    scheduled_absences: entry.scheduled_absences ?? [],
    empty_reason: blank(entry.empty_reason),
    status: 'approved',
    confidence,
    provenance_ref: provenanceRef,
    authoring_payload: {
      slot_relationships: entry.slot_relationships ?? [],
    },
  };
}

export function mapPresenceRule(row, worldRevisionId, provenanceRef) {
  const variants = parseVariants(row.variants);
  const parsedTimes = parseTextArray(row.allowed_times);
  const peopleSubject = row.subject_kind === 'occupation' || row.subject_kind === 'social_role';
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
    presence_probability_ppm: parseRequiredNonNegInt(row.probability_ppm, 'probability_ppm'),
    count_limit: parseRequiredNonNegInt(row.count_limit, 'count_limit'),
    allowed_seasons: parseTextArray(row.allowed_seasons),
    allowed_times: peopleSubject ? [] : parsedTimes,
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

async function writeDataset(relPath, rows, outRoot) {
  const file = `${outRoot}/${relPath}`;
  await mkdir(dirname(resolve(root, file)), { recursive: true });
  const body = json(rows);
  await writeFile(resolve(root, file), body, 'utf8');
  return { relPath, sha256: sha256(body) };
}

export async function buildM2cNpcWaveDatasets(options = {}) {
  const commit = options.sourceCommit ?? SOURCE_COMMIT;
  const worldRevisionId = options.worldRevisionId ?? WORLD_REVISION_ID;
  const outRoot = options.outRoot ?? OUT_ROOT;
  const provenanceRef = options.provenanceRef
    ?? `game_base_v1_m2c_people_${commit.slice(0, 8)}`;
  const show = options.gitShow ?? ((path) => execSync(`git show ${commit}:${path}`, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }));

  const sourceRecords = [{
    id: provenanceRef,
    title: `M2C NPC wave game-base @ ${commit.slice(0, 8)}`,
    source_type: 'project_note',
    file_reference: `${GAME_BASE}@${commit}`,
    summary: 'WR §21.1 approval trail for m2c-npc-wave v1 (D24 approve_with_limits)',
    status: 'approved',
    confidence: 'high',
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
  const peoplePresenceCsv = parseCsv(show(
    `${GAME_BASE}/places-binding/presence/people_presence_authoring.csv`
  ));
  const creationOwnerByKey = new Map();
  for (const row of peoplePresenceCsv) {
    const owner = blank(row.creation_owner);
    if (!owner) continue;
    creationOwnerByKey.set(`${row.scope_ref}|${row.subject_kind}|${row.subject_ref}`, owner);
  }
  for (const rule of presenceRules) {
    const owner = creationOwnerByKey.get(`${rule.scope_ref}|${rule.subject_kind}|${rule.subject_ref}`);
    if (owner) rule.authoring_payload.creation_owner = owner;
  }
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
    weight: parseSlotWeight(row.weight),
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
  const pfIds = new Set(placeFamilies.map((row) => row.id));
  const scheduleRoutineRules = schedulesCsv.map((row) => mapScheduleRoutineRule(
    row, worldRevisionId, provenanceRef, pfIds
  ));

  const relCsv = parseCsv(show(
    `${GAME_BASE}/households-psychology-speech/households_kinship/relationship_rules.csv`
  ));
  const npcRelationshipRules = relCsv.map((row) => mapNpcRelationshipRule(
    row, worldRevisionId, provenanceRef
  ));

  const speechCsv = parseCsv(show(
    `${GAME_BASE}/households-psychology-speech/speech_address/address_forms.csv`
  ));
  const speechAddressForms = speechCsv.map((row) => mapSpeechAddressForm(
    row, worldRevisionId, provenanceRef
  ));

  const compositionAuthoring = JSON.parse(show(
    `${GAME_BASE}/places-binding/presence/people_composition_authoring.json`
  ));
  const placePopulationCompositionRules = compositionAuthoring.compositions.map((entry) => (
    mapPlacePopulationComposition(entry, worldRevisionId, provenanceRef)
  ));

  const { revisionRows, closureNodes } = options.spatialClosure
    ?? loadSpatialClosure(worldRevisionId, bindings);

  const datasets = [];
  const entries = [
    ['datasets/source_records.json', sourceRecords, 'source_records', []],
    ['datasets/spatial_v3_world_revisions.json', revisionRows, 'spatial_v3_world_revisions', ['source_records']],
    ['datasets/place_families.json', placeFamilies, 'place_families', ['source_records', 'spatial_v3_world_revisions']],
    ['datasets/spatial_node_place_family_bindings.json', bindings, 'spatial_node_place_family_bindings', ['place_families']],
    ['datasets/presence_rules.json', presenceRules, 'presence_rules', ['place_families']],
    ['datasets/water_body_presence_facets.json', waterFacets, 'water_body_presence_facets', ['place_families']],
    ['datasets/npc_relationship_materialization_rules.json', npcRelationshipRules, 'npc_relationship_materialization_rules', ['source_records']],
    ['datasets/speech_address_forms.json', speechAddressForms, 'speech_address_forms', ['source_records']],
    ['datasets/household_composition_profiles.json', householdProfiles, 'household_composition_profiles', ['source_records']],
    ['datasets/slot_instance_variants.json', slotVariants, 'slot_instance_variants', ['source_records']],
    ['datasets/fauna_phase_activity_rules.json', faunaRules, 'fauna_phase_activity_rules', ['source_records']],
    ['datasets/npc_schedule_routine_rules.json', scheduleRoutineRules, 'npc_schedule_routine_rules', ['place_families']],
    ['datasets/place_population_composition_rules.json', placePopulationCompositionRules, 'place_population_composition_rules', ['place_families']],
    ['datasets/spatial_v3_nodes.json', closureNodes, 'spatial_v3_nodes', ['source_records', 'spatial_v3_world_revisions']],
  ];

  for (const [rel, rows, table, dependsOn] of entries) {
    const { relPath, sha256: digest } = await writeDataset(rel, rows, outRoot);
    if (table) {
      datasets.push({
        table,
        file: relPath,
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
    bundle_kind: 'dependency_closure',
    bundle_id: 'novgorod_m2c_npc_wave_v1',
    world_revision_id: worldRevisionId,
    status: 'draft',
    provenance_ref: provenanceRef,
    delete_policy: 'forbid',
    datasets,
    data_gaps: [],
  };

  const manifestPath = `${outRoot}/manifest.json`;
  await mkdir(dirname(resolve(root, manifestPath)), { recursive: true });
  await writeFile(resolve(root, manifestPath), json(manifest), 'utf8');

  const variantElementCount = presenceRules.reduce(
    (sum, rule) => sum + (Array.isArray(rule.variants) ? rule.variants.length : 0),
    0
  );
  const rulesWithVariants = presenceRules.filter(
    (rule) => Array.isArray(rule.variants) && rule.variants.length > 0
  ).length;

  return {
    manifestPath,
    sourceCommit: commit,
    counts: Object.fromEntries(datasets.map((d) => [d.table, 'rows'])),
    presenceRules: presenceRules.length,
    rulesWithVariants,
    variantElementCount,
    bindings: bindings.length,
    closureNodes: closureNodes.length,
    starterPlaceFamilies: starterPrimaryPlaceFamilies(bindings).size,
    npcRelationshipRules: npcRelationshipRules.length,
    speechAddressForms: speechAddressForms.length,
    tableCounts: Object.fromEntries(datasets.map((d) => [d.table, 'see dataset file'])),
  };
}

const isMain = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const result = await buildM2cNpcWaveDatasets({ gitShow: gitShow });
  console.log(JSON.stringify(result, null, 2));
}
