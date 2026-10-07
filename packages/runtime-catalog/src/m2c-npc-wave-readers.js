import { createHash } from 'node:crypto';
import { readFile as readFileDefault } from 'node:fs/promises';
import { resolve } from 'node:path';
import { deepFreeze, fail, rowsFrom } from './shared.js';
import {
  assertApprovedWorldCatalogActivation,
  assertSpatialV3WorldRevisionPin,
} from './world-catalog-gate.js';

export const NPC_SPEECH_REGISTERS_PIN = Object.freeze({
  path: 'data/world-catalogs/novgorod/game-base-v1/'
    + 'households-psychology-speech/speech_address/speech_registers.csv',
  sha256: 'abbb6a27b4ec3b9ebe0a4f039aef5907dc564fc0118101818240e29bb3b9b71d',
  approval_ref: 'C007c2',
  snapshot_commit: '8f0c1d91',
});

const NPC_SPEECH_REGISTERS_MAX_BYTES = 1_000_000;
const NPC_SPEECH_REGISTERS_MAX_ROWS = 500;
const npcSpeechRegistersCache = new Map();

/** Read approved, process-cached speech registers from their exact pinned CSV. */
export async function loadNpcSpeechRegisters({
  rootDir = process.cwd(),
  readFile = readFileDefault,
  onDiagnostic,
} = {}) {
  const path = resolve(rootDir, NPC_SPEECH_REGISTERS_PIN.path);
  if (!npcSpeechRegistersCache.has(path)) {
    const pending = loadPinnedSpeechRegisters(path, readFile, onDiagnostic);
    npcSpeechRegistersCache.set(path, pending);
  }
  return npcSpeechRegistersCache.get(path);
}

async function loadPinnedSpeechRegisters(path, readFile, onDiagnostic) {
  try {
    const bytes = await readFile(path);
    const source = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    if (source.length > NPC_SPEECH_REGISTERS_MAX_BYTES
        || createHash('sha256').update(source).digest('hex')
          !== NPC_SPEECH_REGISTERS_PIN.sha256) {
      diagnoseSpeechRegisters(onDiagnostic, 'pin_mismatch');
      return Object.freeze([]);
    }
    return parseNpcSpeechRegisters(source.toString('utf8'));
  } catch {
    diagnoseSpeechRegisters(onDiagnostic, 'unavailable');
    return Object.freeze([]);
  }
}

function diagnoseSpeechRegisters(onDiagnostic, reason) {
  if (typeof onDiagnostic !== 'function') return;
  try {
    onDiagnostic(Object.freeze({
      code: 'NPC_SPEECH_REGISTERS_UNAVAILABLE',
      reason,
      source: NPC_SPEECH_REGISTERS_PIN.path,
    }));
  } catch {
    // Diagnostics must not turn optional speech context into a failed turn.
  }
}

function parseNpcSpeechRegisters(source) {
  const records = parseBoundedCsv(source);
  const headers = records.shift();
  const expectedHeaders = [
    'subject_kind', 'subject_ref', 'register', 'literacy_expectation_ru',
    'speech_notes_ru', 'derivation_rule', 'source_refs', 'confidence',
  ];
  if (!headers || headers.length !== expectedHeaders.length
      || headers.some((value, index) => value !== expectedHeaders[index])
      || records.length !== 139) {
    throw new TypeError('invalid_pinned_speech_register_csv');
  }
  const seen = new Set();
  const rows = records.map((record) => {
    if (record.length !== headers.length) throw new TypeError('invalid_csv_record');
    const [subject_kind, subject_ref, register] = record;
    const key = `${subject_kind}\0${subject_ref}`;
    if (!['role', 'occupation'].includes(subject_kind) || !subject_ref
        || !['formal_literate', 'everyday_oral', 'plain_oral'].includes(register)
        || seen.has(key)) {
      throw new TypeError('invalid_speech_register_row');
    }
    seen.add(key);
    return Object.freeze({ subject_kind, subject_ref, register });
  });
  return Object.freeze(rows);
}

function parseBoundedCsv(source) {
  const records = [];
  let record = [];
  let field = '';
  let quoted = false;
  for (let index = source.charCodeAt(0) === 0xfeff ? 1 : 0;
    index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      if (field.length !== 0) throw new TypeError('invalid_csv_quote');
      quoted = true;
    } else if (char === ',') {
      record.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      else if (char === '\r') throw new TypeError('invalid_csv_newline');
      record.push(field);
      records.push(record);
      if (records.length > NPC_SPEECH_REGISTERS_MAX_ROWS) {
        throw new TypeError('too_many_csv_rows');
      }
      record = [];
      field = '';
    } else {
      field += char;
    }
    if (field.length > 100_000) throw new TypeError('csv_field_too_large');
  }
  if (quoted) throw new TypeError('unterminated_csv_quote');
  if (field.length || record.length) {
    record.push(field);
    records.push(record);
  }
  if (records.length > NPC_SPEECH_REGISTERS_MAX_ROWS) {
    throw new TypeError('too_many_csv_rows');
  }
  return records;
}

async function assertReadableContext(input) {
  await assertSpatialV3WorldRevisionPin({
    worldBaseReader: input.worldBaseReader,
    spatialWorldPin: input.spatialWorldPin,
  });
  await assertApprovedWorldCatalogActivation({
    worldBaseReader: input.worldBaseReader,
    worldPin: input.worldPin,
    runtimeCatalogPin: input.runtimeCatalogPin,
  });
}

/** Read approved speech-address forms from the exact spatial revision. */
export async function loadNpcSpeechAddressForms({
  worldBaseReader,
  spatialWorldPin,
  worldPin,
  runtimeCatalogPin,
} = {}) {
  await assertReadableContext({ worldBaseReader, spatialWorldPin, worldPin, runtimeCatalogPin });
  const rows = rowsFrom(await worldBaseReader.read(
    `SELECT form_id, form_version, world_revision_id, channel, relationship_kind,
      speaker_role_ref, addressee_role_ref, register_ref, form_ru, situation,
      status, confidence, provenance_ref, payload
     FROM world_base.speech_address_forms
     WHERE world_revision_id = $1 AND status = 'approved'
     ORDER BY form_id, form_version`,
    [spatialWorldPin.world_revision_id],
  ));
  return rows.map((row) => deepFreeze({ ...row, payload: structuredClone(row.payload ?? {}) }));
}

/** Read-only D-1 schedules after spatial pin and runtime-catalog activation checks. */
export async function loadScheduleRoutineRules({
  worldBaseReader,
  spatialWorldPin,
  worldPin,
  runtimeCatalogPin,
  placeFamilyId,
  season,
  month,
} = {}) {
  await assertReadableContext({
    worldBaseReader, spatialWorldPin, worldPin, runtimeCatalogPin,
  });
  const revisionId = spatialWorldPin.world_revision_id;
  const params = [revisionId, placeFamilyId, season];
  let monthClause = '';
  if (month !== undefined && month !== null) {
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new TypeError('month must be an integer from 1 to 12.');
    }
    monthClause = ' AND (months IS NULL OR $4 = ANY(months))';
    params.push(month);
  }
  const result = await worldBaseReader.read(
    `SELECT schedule_id, schedule_version, world_revision_id, scope_kind, scope_ref,
      subject_kind, subject_ref, season, months, day_type, routine_profile, status,
      confidence, provenance_ref, authoring_payload
     FROM world_base.npc_schedule_routine_rules
     WHERE world_revision_id = $1 AND scope_ref = $2 AND season = $3
       AND status = 'approved'${monthClause}
     ORDER BY schedule_id, schedule_version`,
    params,
  );
  return rowsFrom(result).map((row) => deepFreeze({
    ...row,
    routine_profile: structuredClone(row.routine_profile),
    authoring_payload: structuredClone(row.authoring_payload ?? {}),
  }));
}

/** Read-only D-2 composition for one place family (pinned bundle version). */
export async function loadPlacePopulationComposition({
  worldBaseReader,
  spatialWorldPin,
  worldPin,
  runtimeCatalogPin,
  placeFamilyId,
  compositionVersion = 1,
} = {}) {
  await assertReadableContext({
    worldBaseReader, spatialWorldPin, worldPin, runtimeCatalogPin,
  });
  const revisionId = spatialWorldPin.world_revision_id;
  const result = await worldBaseReader.read(
    `SELECT composition_id, composition_version, world_revision_id, place_family_id,
      place_family_version, population_groups, scheduled_absences, empty_reason, status,
      confidence, provenance_ref, authoring_payload
     FROM world_base.place_population_composition_rules
     WHERE world_revision_id = $1 AND place_family_id = $2
       AND composition_version = $3 AND status = 'approved'
     LIMIT 2`,
    [revisionId, placeFamilyId, compositionVersion],
  );
  const rows = rowsFrom(result);
  if (rows.length > 1) {
    throw new Error('ambiguous_approved_place_population_composition');
  }
  if (!rows.length) return null;
  const row = rows[0];
  return deepFreeze({
    place_family_id: row.place_family_id,
    place_family_version: row.place_family_version,
    population_groups: structuredClone(row.population_groups ?? []),
    scheduled_absences: structuredClone(row.scheduled_absences ?? []),
    empty_reason: row.empty_reason ?? null,
    slot_relationships: structuredClone(row.authoring_payload?.slot_relationships ?? []),
    composition_ref: {
      id: row.composition_id,
      version: row.composition_version,
      world_revision_id: row.world_revision_id,
    },
  });
}

/** Read approved relationship rules from the exact spatial revision after both catalog gates. */
export async function loadNpcRelationshipMaterializationRules({
  worldBaseReader,
  spatialWorldPin,
  worldPin,
  runtimeCatalogPin,
} = {}) {
  await assertReadableContext({ worldBaseReader, spatialWorldPin, worldPin, runtimeCatalogPin });
  const rows = rowsFrom(await worldBaseReader.read(
    `SELECT rule_id, rule_version, world_revision_id, scope_kind, scope_ref,
      subject_role_ref, object_role_ref, relationship_kind, direction,
      materialization_guard, status, confidence, provenance_ref, payload
     FROM world_base.npc_relationship_materialization_rules
     WHERE world_revision_id = $1 AND status = 'approved'
     ORDER BY rule_id, rule_version`,
    [spatialWorldPin.world_revision_id],
  ));
  const versions = new Set();
  for (const row of rows) {
    if (versions.has(row.rule_id)) {
      fail('M2C_NPC_RELATIONSHIP_RULE_VERSION_AMBIGUOUS',
        'At most one approved relationship rule version per id is allowed.');
    }
    versions.add(row.rule_id);
  }
  return rows.map((row) => deepFreeze({ ...row, payload: structuredClone(row.payload ?? {}) }));
}

/** G0 region node id for a pinned spatial node (walk parents to spatial_level = G0). */
export async function loadG0RegionIdForSpatialNode({
  worldBaseReader,
  spatialWorldPin,
  worldPin,
  runtimeCatalogPin,
  nodeId,
  nodeVersion,
} = {}) {
  await assertReadableContext({
    worldBaseReader, spatialWorldPin, worldPin, runtimeCatalogPin,
  });
  if (typeof nodeId !== 'string' || !nodeId.trim()
      || !Number.isInteger(nodeVersion) || nodeVersion < 1) {
    throw new TypeError('nodeId and nodeVersion are required.');
  }
  const revisionId = spatialWorldPin.world_revision_id;
  const result = await worldBaseReader.read(
    `WITH RECURSIVE chain AS (
       SELECT n.id, n.version, n.spatial_level, 0 AS depth
         FROM world_base.spatial_v3_nodes n
        WHERE n.id = $1 AND n.version = $2 AND n.world_revision_id = $3
          AND n.status = 'approved'
       UNION ALL
       SELECT p.parent_id, p.parent_version, pn.spatial_level, chain.depth + 1
         FROM chain
         JOIN world_base.spatial_v3_node_parents p
           ON p.child_id = chain.id AND p.child_version = chain.version
          AND p.world_revision_id = $3
         JOIN world_base.spatial_v3_nodes pn
           ON pn.id = p.parent_id AND pn.version = p.parent_version
          AND pn.world_revision_id = $3 AND pn.status = 'approved'
        WHERE chain.depth < 24
     )
     SELECT id FROM (
       SELECT DISTINCT id, MAX(depth) AS depth
         FROM chain WHERE spatial_level = 'G0'
        GROUP BY id
     ) g0 ORDER BY depth DESC LIMIT 2`,
    [nodeId, nodeVersion, revisionId],
  );
  const rows = rowsFrom(result);
  if (rows.length !== 1) {
    fail('PRESENCE_G0_REGION_AMBIGUOUS',
      'Pinned spatial node must have exactly one G0 region ancestor.');
  }
  return rows[0].id;
}

/** G1 region node id for a pinned spatial node (walk parents to spatial_level = G1). */
export async function loadG1NodeIdForSpatialNode({
  worldBaseReader,
  spatialWorldPin,
  worldPin,
  runtimeCatalogPin,
  nodeId,
  nodeVersion,
} = {}) {
  await assertReadableContext({
    worldBaseReader, spatialWorldPin, worldPin, runtimeCatalogPin,
  });
  if (typeof nodeId !== 'string' || !nodeId.trim()
      || !Number.isInteger(nodeVersion) || nodeVersion < 1) {
    throw new TypeError('nodeId and nodeVersion are required.');
  }
  const revisionId = spatialWorldPin.world_revision_id;
  const result = await worldBaseReader.read(
    `WITH RECURSIVE chain AS (
       SELECT n.id, n.version, n.spatial_level, 0 AS depth
         FROM world_base.spatial_v3_nodes n
        WHERE n.id = $1 AND n.version = $2 AND n.world_revision_id = $3
          AND n.status = 'approved'
       UNION ALL
       SELECT p.parent_id, p.parent_version, pn.spatial_level, chain.depth + 1
         FROM chain
         JOIN world_base.spatial_v3_node_parents p
           ON p.child_id = chain.id AND p.child_version = chain.version
          AND p.world_revision_id = $3
         JOIN world_base.spatial_v3_nodes pn
           ON pn.id = p.parent_id AND pn.version = p.parent_version
          AND pn.world_revision_id = $3 AND pn.status = 'approved'
        WHERE chain.depth < 24
     )
     SELECT id FROM (
       SELECT DISTINCT id, MAX(depth) AS depth
         FROM chain WHERE spatial_level = 'G1'
        GROUP BY id
     ) g1 ORDER BY depth DESC LIMIT 2`,
    [nodeId, nodeVersion, revisionId],
  );
  const rows = rowsFrom(result);
  if (rows.length !== 1 || typeof rows[0].id !== 'string' || !rows[0].id) {
    fail('PRESENCE_G1_REGION_AMBIGUOUS',
      'Pinned spatial node must have exactly one G1 region ancestor.');
  }
  return rows[0].id;
}

/** Read-only M2c presence rules for place families after spatial pin and activation checks. */
export async function loadPresenceRulesForPlaceFamilies({
  worldBaseReader,
  spatialWorldPin,
  worldPin,
  runtimeCatalogPin,
  placeFamilyIds,
} = {}) {
  await assertReadableContext({
    worldBaseReader, spatialWorldPin, worldPin, runtimeCatalogPin,
  });
  if (!Array.isArray(placeFamilyIds) || placeFamilyIds.length === 0) {
    return [];
  }
  const unique = [...new Set(placeFamilyIds.filter((id) => typeof id === 'string' && id.length > 0))];
  if (unique.length === 0) return [];
  const revisionId = spatialWorldPin.world_revision_id;
  const result = await worldBaseReader.read(
    `SELECT rule_id, rule_version, world_revision_id, scope_kind, scope_ref, region_id,
      subject_kind, subject_ref, category_id, item_ref, variants,
      presence_probability_ppm, count_limit, allowed_seasons, allowed_times, guards,
      entry_visible_if, search_only_if, entry_exposed_weight, search_concealed_weight,
      wild_arrival_cause, refresh_class, status, confidence, provenance_ref, authoring_payload
     FROM world_base.presence_rules
     WHERE world_revision_id = $1
       AND scope_kind = 'place_family'
       AND scope_ref = ANY($2::text[])
       AND status = 'approved'
     ORDER BY scope_ref, subject_kind, subject_ref, rule_id, rule_version`,
    [revisionId, unique],
  );
  return rowsFrom(result).map((row) => deepFreeze({
    ...row,
    variants: structuredClone(row.variants ?? []),
    authoring_payload: structuredClone(row.authoring_payload ?? {}),
  }));
}

/** Parent map for object_type categories used by presence ancestor skip (LW-071). */
export async function loadCategoryParentMap({
  worldBaseReader,
  spatialWorldPin,
  worldPin,
  runtimeCatalogPin,
  categoryIds = [],
} = {}) {
  await assertReadableContext({
    worldBaseReader, spatialWorldPin, worldPin, runtimeCatalogPin,
  });
  const unique = [...new Set((categoryIds ?? []).filter((id) => typeof id === 'string' && id.length > 0))];
  if (unique.length === 0) return new Map();
  const result = await worldBaseReader.read(
    `WITH RECURSIVE chain AS (
       SELECT id, parent_category_id
         FROM world_base.universal_categories
        WHERE facet = 'object_type' AND id = ANY($1::text[])
       UNION
       SELECT parent.id, parent.parent_category_id
         FROM world_base.universal_categories parent
         JOIN chain child ON child.parent_category_id = parent.id
        WHERE parent.facet = 'object_type'
     )
     SELECT id, parent_category_id FROM chain`,
    [unique],
  );
  const parentById = new Map();
  for (const row of rowsFrom(result)) {
    if (row.parent_category_id) parentById.set(row.id, row.parent_category_id);
  }
  return parentById;
}
