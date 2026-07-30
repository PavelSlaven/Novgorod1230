import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const source = resolve(
  'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0d-v4'
);
const historicalV3Source = resolve(
  'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0d-v3'
);
const checker = resolve(
  'tools/world-catalog-workflow/src/lower-dvina-trace-phase-0d-check.mjs'
);
const bodyFile = 'body-environment-profiles.json';
const definitionFile = 'definition.json';
const manifestFile = 'manifest.json';
const canonicalConditions = [
  'wet',
  'cold_with_possible_shivering',
  'headache',
  'shoulder_bruise'
];

const digest = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const readJson = (directory, name) =>
  JSON.parse(readFileSync(resolve(directory, name), 'utf8'));
const writeJson = (directory, name, value) => {
  writeFileSync(resolve(directory, name), `${JSON.stringify(value, null, 2)}\n`);
};
const mutateJson = (directory, name, mutate) => {
  const value = readJson(directory, name);
  mutate(value);
  writeJson(directory, name, value);
};
const refreshDigests = (directory) => {
  const bodyDigest = digest(resolve(directory, bodyFile));
  const definition = readJson(directory, definitionFile);
  definition.resolved_policy_refs.body_environment_profiles.digest = bodyDigest;
  writeJson(directory, definitionFile, definition);

  const definitionDigest = digest(resolve(directory, definitionFile));
  const manifest = readJson(directory, manifestFile);
  manifest.files[bodyFile] = bodyDigest;
  manifest.files[definitionFile] = definitionDigest;
  manifest.content_refs.body_environment_profiles.digest = bodyDigest;
  manifest.content_refs.definition.digest = definitionDigest;
  const aggregate = Object.entries(manifest.files)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}:${value}`)
    .join('\n') + '\n';
  manifest.content_digest = createHash('sha256').update(aggregate).digest('hex');
  writeJson(directory, manifestFile, manifest);
};
const runChecker = ({ directory = null, historicalV3Directory = null } = {}) => {
  const args = [checker];
  if (directory || historicalV3Directory) args.push('--validation-only');
  if (directory) args.push('--directory', directory);
  if (historicalV3Directory) {
    args.push('--historical-v3-directory', historicalV3Directory);
  }
  return spawnSync(process.execPath, args, { encoding: 'utf8' });
};
const withFixture = (mutate, { refresh = true } = {}) => {
  const directory = mkdtempSync(resolve(tmpdir(), 'trace-0d-v4-'));
  cpSync(source, directory, { recursive: true });
  try {
    mutate(directory);
    if (refresh) refreshDigests(directory);
    return runChecker({ directory });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};
const assertRejected = (result, pattern) => {
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(`${result.stderr}\n${result.stdout}`, pattern);
};

test('phase 0D v4 admits only canonical start conditions', () => {
  const result = runChecker();
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.package_id, 'lower_dvina_trace_phase_0d_v4');
  assert.equal(report.package_revision, 4);
  assert.equal(report.scenario_revision, 7);
  assert.equal(report.body_environment_revision, 4);
  assert.deepEqual(report.canonical_start_conditions, canonicalConditions);

  const body = readJson(source, bodyFile);
  assert.deepEqual(body.start_profile.conditions, canonicalConditions);
  const coldEffect = body.effect_profiles.find(
    ({ effect_profile_id }) => effect_profile_id === 'trace_ld_v1_body_wreck_inspection_15m'
  );
  assert.deepEqual(coldEffect.condition_outcomes[1], {
    condition_profile_ref: 'trace_ld_v1_condition_cold_shivering',
    from: 'cold_with_possible_shivering',
    to: 'mild_shivering',
    outcome: 'worsens'
  });
});

test('canonical start conditions fail closed without aliases or normalization', async (t) => {
  for (const [label, index, state] of [
    ['legacy cold', 1, 'cold'],
    ['legacy bruise', 3, 'bruise'],
    ['unknown token', 1, 'unknown_condition']
  ]) {
    await t.test(label, () => {
      const result = withFixture((directory) => mutateJson(
        directory,
        bodyFile,
        (body) => { body.start_profile.conditions[index] = state; }
      ));
      assertRejected(result, /TRACE_0D_V4_BODY_START_CONDITIONS/);
    });
  }
  await t.test('alias policy', () => {
    const result = withFixture((directory) => mutateJson(
      directory,
      bodyFile,
      (body) => { body.alias_policy = 'allowed'; }
    ));
    assertRejected(result, /TRACE_0D_V4_SEMANTIC_FALLBACK/);
  });
});

test('ambiguous condition profile and unproved fixed-effect source are rejected', async (t) => {
  await t.test('duplicate condition profile state', () => {
    const result = withFixture((directory) => mutateJson(
      directory,
      bodyFile,
      (body) => body.condition_profiles.push({
        ...structuredClone(body.condition_profiles.find(
          ({ state }) => state === 'wet'
        )),
        condition_profile_id: 'duplicate_wet_profile'
      })
    ));
    assertRejected(result, /TRACE_0D_V4_CONDITION_PROFILE_RESOLUTION/);
  });
  await t.test('fixed effect has no materialized or predecessor source', () => {
    const result = withFixture((directory) => mutateJson(
      directory,
      bodyFile,
      (body) => {
        const effect = body.effect_profiles.find(
          ({ effect_profile_id }) => effect_profile_id === 'trace_ld_v1_body_wreck_inspection_15m'
        );
        effect.condition_outcomes[1].from = 'cold';
      }
    ));
    assertRejected(
      result,
      /TRACE_0D_V4_FIXED_EFFECT_PROFILE|TRACE_0D_V4_FIXED_EFFECT_FROM_CHAIN/
    );
  });
});

test('historical revision 6 package hash remains immutable', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'trace-0d-v3-mutated-'));
  cpSync(historicalV3Source, directory, { recursive: true });
  try {
    writeFileSync(
      resolve(directory, bodyFile),
      `${readFileSync(resolve(directory, bodyFile), 'utf8')}\n`
    );
    const result = runChecker({
      directory: source,
      historicalV3Directory: directory
    });
    assertRejected(result, /TRACE_0D_V3_DIGEST_MISMATCH|TRACE_0D_V4_V3_REGRESSION/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
