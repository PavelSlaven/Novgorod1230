import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  buildActorAppearanceV6CarryForward,
  CARRY_FORWARD_ROOT
} from './generate-actor-appearance-v6-carry-forward.mjs';

const TABLES = Object.freeze([
  'source_records',
  'universal_categories',
  'region_category_options',
  'region_demographic_profiles',
  'region_demographic_profile_entries',
  'region_appearance_profiles',
  'region_appearance_profile_entries'
]);
const APPLICABILITY = Object.freeze({
  sex_category: new Set(['male', 'female']),
  age_category: new Set(['young_adult', 'adult', 'middle_aged', 'old']),
  'appearance.hair.length': new Set(['bald', 'short', 'medium', 'long'])
});

export async function validateActorAppearanceV6CarryForward(root = process.cwd()) {
  const errors = [];
  let candidate;
  let expected;
  try {
    candidate = JSON.parse(await readFile(resolve(root, CARRY_FORWARD_ROOT, 'candidate.json'), 'utf8'));
    expected = await buildActorAppearanceV6CarryForward(root);
  } catch (error) {
    return { pass: false, errors: [{ code: 'ACTOR_APPEARANCE_V6_CANDIDATE_MISSING', detail: error.message }] };
  }

  expect(errors, candidate.schema === expected.schema, 'ACTOR_APPEARANCE_V6_SCHEMA');
  expect(errors, candidate.status === 'pending_independent_approval'
    && candidate.approval_status === 'pending', 'ACTOR_APPEARANCE_V6_APPROVAL_STATE');
  expect(errors, candidate.import_activation === false
    && candidate.runtime_status === 'typed_data_gap'
    && candidate.runtime_gap_code === 'ACTOR_APPEARANCE_V6_IMPORT_NOT_APPROVED'
    && Array.isArray(candidate.runtime_import_rows)
    && candidate.runtime_import_rows.length === 0, 'ACTOR_APPEARANCE_V6_RUNTIME_GAP');
  expectEqual(errors, candidate.source, expected.source, 'ACTOR_APPEARANCE_V6_SOURCE_TUPLE');
  expectEqual(errors, candidate.target, expected.target, 'ACTOR_APPEARANCE_V6_TARGET_TUPLE');
  expect(errors, candidate.target?.world_revision_id
    === 'novgorod_spatial_v3_production_v6_candidate_001', 'ACTOR_APPEARANCE_V6_WORLD_TUPLE');
  expect(errors, candidate.target?.production_activation === false,
    'ACTOR_APPEARANCE_V6_TARGET_NOT_ACTIVE');
  expectEqual(errors, candidate.supported_contexts, expected.supported_contexts,
    'ACTOR_APPEARANCE_V6_CONTEXT_DRIFT');

  for (const table of TABLES) {
    const rows = candidate.candidate_rows?.[table];
    expect(errors, Array.isArray(rows), 'ACTOR_APPEARANCE_V6_ROWS_MISSING', table);
    if (!Array.isArray(rows)) continue;
    expect(errors, rows.every(({ status }) => status === 'approved'),
      'ACTOR_APPEARANCE_V6_ROW_NOT_APPROVED', table);
    expect(errors, unique(rows.map(({ id }) => id)),
      'ACTOR_APPEARANCE_V6_DUPLICATE_ID', table);
    expectEqual(errors, rows.length, expected.candidate_row_count_by_table[table],
      'ACTOR_APPEARANCE_V6_CANDIDATE_COUNT', table);
    expectEqual(errors, rows.map(({ id }) => id).sort(),
      expected.candidate_ids_by_table[table], 'ACTOR_APPEARANCE_V6_CANDIDATE_IDS', table);
    expectEqual(errors, candidate.source_row_count_by_table?.[table],
      expected.source_row_count_by_table[table], 'ACTOR_APPEARANCE_V6_SOURCE_COUNT', table);
    expectEqual(errors, candidate.source_ids_by_table?.[table],
      expected.source_ids_by_table[table], 'ACTOR_APPEARANCE_V6_SOURCE_IDS', table);
    expectEqual(errors, candidate.candidate_row_count_by_table?.[table],
      expected.candidate_row_count_by_table[table], 'ACTOR_APPEARANCE_V6_CANDIDATE_COUNT', table);
    expectEqual(errors, candidate.candidate_ids_by_table?.[table],
      expected.candidate_ids_by_table[table], 'ACTOR_APPEARANCE_V6_CANDIDATE_IDS', table);
  }
  expectEqual(errors, candidate.source_projection_sha256,
    expected.source_projection_sha256, 'ACTOR_APPEARANCE_V6_SOURCE_DIGEST');
  expectEqual(errors, candidate.candidate_rows_sha256,
    expected.candidate_rows_sha256, 'ACTOR_APPEARANCE_V6_CANDIDATE_DIGEST');
  expectEqual(errors, candidate.candidate_rows, expected.candidate_rows,
    'ACTOR_APPEARANCE_V6_SEMANTIC_DRIFT');
  validateApplicability(errors, candidate.candidate_rows ?? {});
  validateSourceRefs(errors, candidate.candidate_rows ?? {});
  validateNoAuthoredPersonOverride(errors, candidate);
  return { pass: errors.length === 0, errors };
}

function validateApplicability(errors, rows) {
  for (const table of ['region_category_options', 'region_demographic_profile_entries',
    'region_appearance_profile_entries']) {
    for (const row of rows[table] ?? []) {
      const applicability = row.applicability;
      expect(errors, applicability && typeof applicability === 'object'
        && !Array.isArray(applicability), 'ACTOR_APPEARANCE_V6_APPLICABILITY_INVALID', row.id);
      for (const [path, values] of Object.entries(applicability ?? {})) {
        expect(errors, APPLICABILITY[path] instanceof Set && Array.isArray(values)
          && values.length > 0 && values.every((value) => APPLICABILITY[path].has(value)),
        'ACTOR_APPEARANCE_V6_APPLICABILITY_OPEN', row.id);
      }
    }
  }
}

function validateSourceRefs(errors, rows) {
  const sources = new Set((rows.source_records ?? []).map(({ id }) => id));
  expect(errors, sources.has('prov_character_appearance_v1'),
    'ACTOR_APPEARANCE_V6_SOURCE_REF_MISSING');
  const options = new Set((rows.region_category_options ?? []).map(({ id }) => id));
  const categories = new Set((rows.universal_categories ?? []).map(({ id }) => id));
  for (const row of rows.region_category_options ?? []) {
    expect(errors, categories.has(row.category_id),
      'ACTOR_APPEARANCE_V6_CATEGORY_SOURCE_MISSING', row.id);
  }
  for (const table of ['region_demographic_profile_entries', 'region_appearance_profile_entries']) {
    const profiles = new Set((rows[table === 'region_demographic_profile_entries'
      ? 'region_demographic_profiles' : 'region_appearance_profiles'] ?? [])
      .map(({ id }) => id));
    const profileKey = table === 'region_demographic_profile_entries'
      ? 'demographic_profile_id' : 'appearance_profile_id';
    for (const row of rows[table] ?? []) {
      expect(errors, options.has(row.option_id),
        'ACTOR_APPEARANCE_V6_OPTION_SOURCE_MISSING', row.id);
      expect(errors, profiles.has(row[profileKey]),
        'ACTOR_APPEARANCE_V6_PROFILE_SOURCE_MISSING', row.id);
    }
  }
}

function validateNoAuthoredPersonOverride(errors, candidate) {
  const allowed = new Set([
    'schema', 'candidate_id', 'status', 'approval_status', 'import_activation',
    'runtime_status', 'runtime_gap_code', 'runtime_import_rows', 'source', 'target',
    'supported_contexts', 'source_row_count_by_table', 'source_ids_by_table',
    'source_projection_sha256', 'candidate_row_count_by_table',
    'candidate_ids_by_table', 'candidate_rows_sha256', 'candidate_rows'
  ]);
  expect(errors, Object.keys(candidate).every((key) => allowed.has(key)),
    'ACTOR_APPEARANCE_V6_AUTHORED_PERSON_OVERRIDE');
}

function unique(ids) {
  return ids.length === new Set(ids).size && ids.every((id) => typeof id === 'string' && id.length > 0);
}

function expect(errors, ok, code, detail) {
  if (!ok) errors.push({ code, ...(detail == null ? {} : { detail }) });
}

function expectEqual(errors, actual, expected, code, detail) {
  expect(errors, JSON.stringify(actual) === JSON.stringify(expected), code, detail);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await validateActorAppearanceV6CarryForward(resolve(process.argv.at(2) ?? process.cwd()));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.pass) process.exitCode = 1;
}
