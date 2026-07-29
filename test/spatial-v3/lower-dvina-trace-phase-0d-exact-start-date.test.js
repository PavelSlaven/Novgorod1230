import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const source = resolve('data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0d-v2');
const legacySource = resolve('data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0d');
const checker = resolve('tools/world-catalog-workflow/src/lower-dvina-trace-phase-0d-check.mjs');
const bodyFile = 'body-environment-profiles.json';
const definitionFile = 'definition.json';
const manifestFile = 'manifest.json';
const legacyDigests = {
  'manifest.json': 'cc4bdc04a87a10a0d37819b53a7de1359c672d5f4a82edfa7b796e101fe3025c',
  'definition.json': '76576704c1fbc73635ad89ced4a91598cdd5fffd583e4b3f96add36f0c0c20ba',
  'body-environment-profiles.json': '31f1b404868ac919e589acbc0d5c4bf7d5c04caa146b9201c065ee2a54f9757d'
};
const boatmanDigests = {
  'data/world-catalogs/novgorod/first-playable-v1/scenario.json': '50f00903cad0075edabd24bd69c9eaa6d88ee967a19eabb69de7c23c1898598f',
  'data/world-catalogs/novgorod/first-playable-v1/manifest.json': '0ce7b06b6a3706810976bc0dd7ac20695cb502594bf8e200b4e6d67e3e2162cb'
};

const digest = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const readJson = (directory, name) => JSON.parse(readFileSync(resolve(directory, name), 'utf8'));
const writeJson = (directory, name, value) => writeFileSync(resolve(directory, name), `${JSON.stringify(value, null, 2)}\n`);
const mutateJson = (directory, name, mutate) => {
  const value = readJson(directory, name);
  mutate(value);
  writeJson(directory, name, value);
};
const runChecker = (directory = source) => spawnSync(
  process.execPath,
  [checker, ...(directory === source ? [] : ['--validation-only', '--directory', directory])],
  { encoding: 'utf8' }
);
const refreshDigests = (directory, { synchronizeBodyRef = true } = {}) => {
  const bodyDigest = digest(resolve(directory, bodyFile));
  const definition = readJson(directory, definitionFile);
  if (synchronizeBodyRef) definition.resolved_policy_refs.body_environment_profiles.digest = bodyDigest;
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
const withFixture = (mutate, options) => {
  const directory = mkdtempSync(resolve(tmpdir(), 'trace-0d-v2-'));
  cpSync(source, directory, { recursive: true });
  try {
    mutate(directory);
    refreshDigests(directory, options);
    return runChecker(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};
const assertRejected = (result, pattern) => {
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(`${result.stderr}\n${result.stdout}`, pattern);
};

test('phase 0D correction package fixes the approved Julian start date without materializing it', () => {
  const result = runChecker();
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report, {
    package_id: 'lower_dvina_trace_phase_0d_v2',
    package_revision: 2,
    scenario_revision: 5,
    body_environment_revision: 2,
    exact_start: {
      calendar_system: 'Julian',
      year: '1230',
      month: '8',
      day: '20',
      local_minute_of_day: 420,
      local_time: '07:00',
      time_basis: 'local_mean_solar_time',
      season_id: 'late_summer',
      subminute: '0/1',
      derived_game_timestamp: {
        whole_minutes: '333060',
        subminute_numerator: '0',
        subminute_denominator: '1'
      }
    },
    content_digest: '22e19243ebdd2cb20ee847387a159d713d96a3e615d348ae8376b79154ff65a3'
  });
  const body = readJson(source, bodyFile);
  assert.equal(body.start_timestamp_specification.materialized_game_timestamp, null);
  assert.equal(body.start_timestamp_specification.calendar_date_contract.rng_consumption, 'forbidden');
});

test('exact start date contract fails closed for missing, changed, or selectable dates', async (t) => {
  await t.test('missing exact date', () => {
    const result = withFixture((directory) => mutateJson(directory, bodyFile, (body) => {
      delete body.start_timestamp_specification.calendar_date_contract.exact_date;
    }));
    assertRejected(result, /TRACE_0D_V2_EXACT_DATE/);
  });
  await t.test('unknown calendar system', () => {
    const result = withFixture((directory) => mutateJson(directory, bodyFile, (body) => {
      body.start_timestamp_specification.calendar_date_contract.calendar_system = 'Gregorian';
    }));
    assertRejected(result, /TRACE_0D_V2_CALENDAR_SYSTEM/);
  });
  for (const [component, value] of [['year', '1231'], ['month', '7'], ['day', '19']]) {
    await t.test(`changed ${component}`, () => {
      const result = withFixture((directory) => mutateJson(directory, bodyFile, (body) => {
        body.start_timestamp_specification.calendar_date_contract.exact_date[component] = value;
      }));
      assertRejected(result, /TRACE_0D_V2_APPROVED_DATE_MISMATCH/);
    });
  }
  await t.test('date outside calendar coverage', () => {
    const result = withFixture((directory) => mutateJson(directory, bodyFile, (body) => {
      body.start_timestamp_specification.calendar_date_contract.exact_date = {
        year: '1234',
        month: '1',
        day: '1'
      };
    }));
    assertRejected(result, /TRACE_0D_V2_CALENDAR_COVERAGE/);
  });
  await t.test('RNG consumption', () => {
    const result = withFixture((directory) => mutateJson(directory, bodyFile, (body) => {
      body.start_timestamp_specification.calendar_date_contract.rng_consumption = 'required';
    }));
    assertRejected(result, /TRACE_0D_V2_DATE_SELECTION_POLICY/);
  });
  await t.test('range-only contract', () => {
    const result = withFixture((directory) => mutateJson(directory, bodyFile, (body) => {
      const contract = body.start_timestamp_specification.calendar_date_contract;
      delete contract.exact_date;
      contract.year_range = ['1230', '1233'];
    }));
    assertRejected(result, /TRACE_0D_V2_EXACT_DATE/);
  });
});

test('exact local time, calendar pins, and body policy digest fail closed', async (t) => {
  await t.test('07:00 label disagrees with minute 420', () => {
    const result = withFixture((directory) => mutateJson(directory, bodyFile, (body) => {
      body.start_timestamp_specification.exact_local_time_label = '07:01';
    }));
    assertRejected(result, /TRACE_0D_V2_LOCAL_TIME/);
  });
  await t.test('minute 420 disagrees with 07:00 label', () => {
    const result = withFixture((directory) => mutateJson(directory, bodyFile, (body) => {
      body.start_timestamp_specification.exact_local_minute_of_day = 421;
    }));
    assertRejected(result, /TRACE_0D_V2_LOCAL_TIME/);
  });
  await t.test('start subminute numerator is not zero', () => {
    const result = withFixture((directory) => mutateJson(directory, bodyFile, (body) => {
      body.start_timestamp_specification.subminute_at_start.numerator = '1';
      body.start_timestamp_specification.subminute_at_start.denominator = '2';
    }));
    assertRejected(result, /TRACE_0D_V2_LOCAL_TIME/);
  });
  await t.test('start subminute denominator is not one', () => {
    const result = withFixture((directory) => mutateJson(directory, bodyFile, (body) => {
      body.start_timestamp_specification.subminute_at_start.denominator = '2';
    }));
    assertRejected(result, /TRACE_0D_V2_LOCAL_TIME/);
  });
  await t.test('GameTimestamp is materialized inside the correction package', () => {
    const result = withFixture((directory) => mutateJson(directory, bodyFile, (body) => {
      body.start_timestamp_specification.materialized_game_timestamp = {
        whole_minutes: '333060',
        subminute_numerator: '0',
        subminute_denominator: '1'
      };
    }));
    assertRejected(result, /TRACE_0D_V2_TIMESTAMP_DERIVATION/);
  });
  await t.test('calendar profile digest mismatch', () => {
    const result = withFixture((directory) => mutateJson(directory, bodyFile, (body) => {
      body.temporal_source_ref.dataset_sha256 = '0'.repeat(64);
    }));
    assertRejected(result, /TRACE_0D_V2_BODY_SCOPE|TRACE_0D_V2_CALENDAR_PROFILE_REF/);
  });
  await t.test('manifest calendar digest mismatch', () => {
    const result = withFixture((directory) => mutateJson(directory, manifestFile, (manifest) => {
      manifest.temporal_source_refs.approval.digest = '0'.repeat(64);
    }));
    assertRejected(result, /TRACE_0D_V2_CALENDAR_DIGEST/);
  });
  await t.test('definition body profile digest mismatch', () => {
    const result = withFixture((directory) => mutateJson(directory, definitionFile, (definition) => {
      definition.resolved_policy_refs.body_environment_profiles.digest = '0'.repeat(64);
    }), { synchronizeBodyRef: false });
    assertRejected(result, /TRACE_0D_V2_BODY_POLICY_REF/);
  });
  await t.test('body timestamp derivation loses its versioned owner contract', () => {
    const result = withFixture((directory) => mutateJson(directory, bodyFile, (body) => {
      delete body.start_timestamp_specification.game_timestamp_derivation.owner_contract_ref;
    }));
    assertRejected(result, /TRACE_0D_V2_TIMESTAMP_DERIVATION/);
  });
  await t.test('manifest owner entrypoint is desynchronized', () => {
    const result = withFixture((directory) => mutateJson(directory, manifestFile, (manifest) => {
      manifest.owner_contract_refs.exact_calendar_projection.public_entrypoint =
        '@rus/time-events-history/calendar:projectCalendar';
    }));
    assertRejected(result, /TRACE_0D_V2_TIME_OWNER_CONTRACT_REF/);
  });
});

test('revision 5 composes immutable v1 records and preserves its exact supersedes chain', () => {
  const definition = readJson(source, definitionFile);
  const manifest = readJson(source, manifestFile);
  assert.deepEqual(definition.supersedes_definition_ref, {
    id: 'lower_dvina_trace_v1',
    revision: 4,
    path: 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0d/definition.json',
    digest: legacyDigests['definition.json']
  });
  assert.equal(Object.keys(manifest.reused_content_refs).length, 8);
  assert.equal(manifest.base_package_ref.digest, legacyDigests['manifest.json']);
  assert.equal(definition.publication_status, 'unpublished');
  assert.equal(definition.concrete_party_selections.game_timestamp, null);
});

test('phase 0D v1 and legacy boatman artifacts remain byte-reproducible', () => {
  for (const [name, expected] of Object.entries(legacyDigests)) {
    assert.equal(digest(resolve(legacySource, name)), expected, `phase 0D v1 changed: ${name}`);
  }
  for (const [path, expected] of Object.entries(boatmanDigests)) {
    assert.equal(digest(resolve(path)), expected, `boatman artifact changed: ${path}`);
  }
  const legacyResult = spawnSync(process.execPath, [checker, '--legacy-v1'], { encoding: 'utf8' });
  assert.equal(legacyResult.status, 0, legacyResult.stderr);
});

test('correction manifest requires the exact legacy boatman regression ref set', () => {
  const result = withFixture((directory) => mutateJson(directory, manifestFile, (manifest) => {
    delete manifest.legacy_boatman_regression_refs.manifest;
  }));
  assertRejected(result, /TRACE_0D_V2_BOATMAN_REGRESSION/);
});
