import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ddlFiles = [
  'schemas/party-db/002_party_runtime_v3.sql',
  'schemas/party-db/003_party_runtime_v3_planning.sql',
  'schemas/party-db/004_party_runtime_v3_journeys.sql'
];

test('temporal v4 DDL persists unbounded exact temporal integers as integral NUMERIC', async () => {
  const ddl = await Promise.all(ddlFiles.map((file) => readFile(file, 'utf8')));
  const combined = ddl.join('\n');

  for (const field of [
    'whole_minutes', 'subminute_numerator', 'subminute_denominator',
    'effective_whole_minutes', 'effective_subminute_numerator', 'effective_subminute_denominator',
    'elapsed_numerator', 'elapsed_denominator', 'clock_before_whole_minutes',
    'clock_before_subminute_numerator', 'clock_before_subminute_denominator',
    'clock_after_whole_minutes', 'clock_after_subminute_numerator',
    'clock_after_subminute_denominator', 'crossed_whole_minute_boundaries',
    'cumulative_elapsed_numerator', 'cumulative_elapsed_denominator',
    'remaining_time_numerator', 'remaining_time_denominator',
    'remaining_before_numerator', 'remaining_before_denominator',
    'planned_time_numerator', 'planned_time_denominator', 'actual_time_numerator',
    'actual_time_denominator', 'remaining_after_numerator', 'remaining_after_denominator',
    'cumulative_time_before_numerator',
    'cumulative_time_before_denominator', 'cumulative_time_after_numerator',
    'cumulative_time_after_denominator', 'cumulative_actual_time_numerator',
    'cumulative_actual_time_denominator', 'original_total_minutes', 'base_minutes'
  ]) {
    assert.doesNotMatch(combined, new RegExp(`\\b${field}\\s+(?:bigint|integer)\\b`, 'u'), `${field} must not use a bounded integer type`);
    assert.match(
      combined,
      new RegExp(`\\b${field}\\s+numeric\\b`, 'u'),
      `${field} must use NUMERIC`
    );
    assert.match(
      combined,
      new RegExp(`party_runtime\\.integral_numeric\\(${field}\\)`, 'u'),
      `${field} must be an integral NUMERIC`
    );
  }
  assert.match(
    combined,
    /value\s+NOT\s+IN\s*\(\s*'NaN'::numeric\s*,\s*'Infinity'::numeric\s*,\s*'-Infinity'::numeric\s*\)\s+AND\s+value\s*=\s*trunc\(value\)/u,
    'integral_numeric must reject NaN and both infinities while accepting scale-0 integers'
  );
  assert.match(combined, /gcd\(/u, 'rational temporal fields must remain reduced');
  for (const comparison of [
    /NEW\.clock_after_subminute_numerator\s*\*\s*NEW\.clock_before_subminute_denominator\s*<\s*NEW\.clock_before_subminute_numerator\s*\*\s*NEW\.clock_after_subminute_denominator/u,
    /NEW\.subminute_numerator\s*\*\s*OLD\.subminute_denominator\s*<\s*OLD\.subminute_numerator\s*\*\s*NEW\.subminute_denominator/u,
    /r\.elapsed_numerator\s*\*\s*NEW\.elapsed_denominator\s*>\s*NEW\.elapsed_numerator\s*\*\s*r\.elapsed_denominator/u
  ]) {
    assert.match(combined, comparison, 'rational comparison must use denominator cross-products');
  }
  assert.doesNotMatch(combined, /::numeric\s*\/\s*(?:NEW\.|OLD\.|r\.)/u, 'temporal comparisons must not divide exact fractions');
});
