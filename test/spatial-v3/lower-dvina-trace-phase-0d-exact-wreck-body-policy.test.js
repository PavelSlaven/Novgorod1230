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

const source = resolve('data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0d-v3');
const v2Source = resolve('data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0d-v2');
const checker = resolve('tools/world-catalog-workflow/src/lower-dvina-trace-phase-0d-check.mjs');
const bodyFile = 'body-environment-profiles.json';
const definitionFile = 'definition.json';
const manifestFile = 'manifest.json';
const v2Digests = {
  'manifest.json': '6045bb534353657a19da6656d781930a456a7d845121d46355e8237ed6e21bb0',
  'definition.json': '2d4c940867a34a292435915a0e201d986346c10f1eddc31423fe019025dbc6c0',
  'body-environment-profiles.json': 'f8437ef19a77cccaceb4607695c95f528ffe5f09ec2287befe3772841de16227'
};
const boatmanDigests = {
  'data/world-catalogs/novgorod/first-playable-v1/scenario.json':
    '50f00903cad0075edabd24bd69c9eaa6d88ee967a19eabb69de7c23c1898598f',
  'data/world-catalogs/novgorod/first-playable-v1/manifest.json':
    '0ce7b06b6a3706810976bc0dd7ac20695cb502594bf8e200b4e6d67e3e2162cb'
};

const digest = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const readJson = (directory, name) => JSON.parse(readFileSync(resolve(directory, name), 'utf8'));
const writeJson = (directory, name, value) => {
  writeFileSync(resolve(directory, name), `${JSON.stringify(value, null, 2)}\n`);
};
const mutateJson = (directory, name, mutate) => {
  const value = readJson(directory, name);
  mutate(value);
  writeJson(directory, name, value);
};
const wreckEffect = (body) => body.effect_profiles.find(
  ({ effect_profile_id }) => effect_profile_id === 'trace_ld_v1_body_wreck_inspection_15m'
);
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
const runChecker = ({ directory = null, historicalV2Directory = null } = {}) => {
  const args = [checker, '--legacy-v3'];
  if (directory || historicalV2Directory) args.push('--validation-only');
  if (directory) args.push('--directory', directory);
  if (historicalV2Directory) args.push('--historical-v2-directory', historicalV2Directory);
  return spawnSync(process.execPath, args, { encoding: 'utf8' });
};
const withFixture = (mutate, { refresh = true } = {}) => {
  const directory = mkdtempSync(resolve(tmpdir(), 'trace-0d-v3-'));
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

test('phase 0D v3 admits the single approved wreck inspection body effect', () => {
  const result = runChecker();
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.package_id, 'lower_dvina_trace_phase_0d_v3');
  assert.equal(report.package_revision, 3);
  assert.equal(report.scenario_revision, 6);
  assert.equal(report.body_environment_revision, 3);
  assert.deepEqual(report.wreck_inspection_effect, {
    exact_deltas: {
      health: 0,
      satiety: 0,
      energy: -1
    },
    condition_outcomes: [
      {
        condition_profile_ref: 'trace_ld_v1_condition_wet_clothing',
        from: 'wet',
        to: 'wet',
        outcome: 'persists'
      },
      {
        condition_profile_ref: 'trace_ld_v1_condition_cold_shivering',
        from: 'cold_with_possible_shivering',
        to: 'mild_shivering',
        outcome: 'worsens'
      }
    ],
    selection_policy: 'fixed_approved_effect',
    rng_consumption: 'forbidden'
  });

  const body = readJson(source, bodyFile);
  const wreck = wreckEffect(body);
  assert.equal(Object.hasOwn(wreck, 'delta_bounds'), false);
  assert.equal(Object.hasOwn(wreck, 'condition_transitions'), false);
  assert.deepEqual(body.applied_effects, []);
});

test('each approved wreck inspection delta is immutable after resealing', async (t) => {
  for (const [metric, value] of [['health', -1], ['satiety', -1], ['energy', -2]]) {
    await t.test(metric, () => {
      const result = withFixture((directory) => mutateJson(directory, bodyFile, (body) => {
        wreckEffect(body).exact_deltas[metric] = value;
      }));
      assertRejected(result, /TRACE_0D_V3_WRECK_DELTA/);
    });
  }
});

test('ambiguous wreck inspection execution policies fail closed', async (t) => {
  await t.test('bounds-only effect', () => {
    const result = withFixture((directory) => mutateJson(directory, bodyFile, (body) => {
      const wreck = wreckEffect(body);
      delete wreck.exact_deltas;
      delete wreck.condition_outcomes;
      delete wreck.selection_policy;
      delete wreck.rng_consumption;
      wreck.delta_bounds = {
        health: [-2, 0],
        satiety: [-1, 0],
        energy: [-3, -1]
      };
      wreck.condition_transitions = ['cold_may_worsen', 'wet_persists'];
    }));
    assertRejected(result, /TRACE_0D_V3_WRECK_EXACT_EFFECT/);
  });

  await t.test('cold_may_worsen returns beside exact outcomes', () => {
    const result = withFixture((directory) => mutateJson(directory, bodyFile, (body) => {
      wreckEffect(body).condition_transitions = ['cold_may_worsen'];
    }));
    assertRejected(result, /TRACE_0D_V3_WRECK_EXACT_EFFECT|TRACE_0D_V3_WRECK_AMBIGUOUS_SEMANTICS/);
  });

  await t.test('RNG selection', () => {
    const result = withFixture((directory) => mutateJson(directory, bodyFile, (body) => {
      wreckEffect(body).rng_consumption = 'required';
    }));
    assertRejected(result, /TRACE_0D_V3_WRECK_SELECTION_POLICY/);
  });
});

test('wreck inspection condition transitions are exact and approved', async (t) => {
  await t.test('unknown source condition state', () => {
    const result = withFixture((directory) => mutateJson(directory, bodyFile, (body) => {
      body.condition_profiles.find(
        ({ condition_profile_id }) => condition_profile_id === 'trace_ld_v1_condition_wet_clothing'
      ).state = 'unknown_wet_state';
    }));
    assertRejected(result, /TRACE_0D_V3_WRECK_CONDITION_STATE/);
  });

  await t.test('strong shivering instead of approved mild shivering', () => {
    const result = withFixture((directory) => mutateJson(directory, bodyFile, (body) => {
      wreckEffect(body).condition_outcomes[1].to = 'strong_shivering';
    }));
    assertRejected(result, /TRACE_0D_V3_WRECK_CONDITION_OUTCOME/);
  });
});

test('revision 6 and package v3 exact-supersede immutable revision 5 and package v2', async (t) => {
  const definition = readJson(source, definitionFile);
  const manifest = readJson(source, manifestFile);
  const body = readJson(source, bodyFile);
  assert.deepEqual(definition.supersedes_definition_ref, {
    id: 'lower_dvina_trace_v1',
    revision: 5,
    path: 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0d-v2/definition.json',
    digest: v2Digests['definition.json']
  });
  assert.equal(manifest.superseded_package_ref.digest, v2Digests['manifest.json']);
  assert.equal(body.supersedes_ref.digest, v2Digests['body-environment-profiles.json']);

  await t.test('superseded definition digest mutation', () => {
    const result = withFixture((directory) => mutateJson(directory, manifestFile, (value) => {
      value.superseded_definition_ref.digest = '0'.repeat(64);
    }), { refresh: false });
    assertRejected(result, /TRACE_0D_V3_SUPERSEDED_DEFINITION_REF/);
  });

  await t.test('body owner contract digest mutation', () => {
    const result = withFixture((directory) => mutateJson(directory, manifestFile, (value) => {
      value.owner_contract_refs.exact_body_effect.digest = '0'.repeat(64);
    }), { refresh: false });
    assertRejected(result, /TRACE_0D_V3_BODY_OWNER_CONTRACT_REF/);
  });

  await t.test('content digest mutation', () => {
    const result = withFixture((directory) => mutateJson(directory, manifestFile, (value) => {
      value.content_digest = '0'.repeat(64);
    }), { refresh: false });
    assertRejected(result, /TRACE_0D_V3_CONTENT_DIGEST/);
  });
});

test('mutation of historical body/environment revision 2 is detected', () => {
  const historicalDirectory = mkdtempSync(resolve(tmpdir(), 'trace-0d-v2-mutated-'));
  cpSync(v2Source, historicalDirectory, { recursive: true });
  try {
    const historicalBodyPath = resolve(historicalDirectory, bodyFile);
    writeFileSync(historicalBodyPath, `${readFileSync(historicalBodyPath, 'utf8')}\n`);
    const historicalBodyDigest = digest(historicalBodyPath);
    const historicalDefinition = readJson(historicalDirectory, definitionFile);
    historicalDefinition.resolved_policy_refs.body_environment_profiles.digest = historicalBodyDigest;
    writeJson(historicalDirectory, definitionFile, historicalDefinition);
    const historicalDefinitionDigest = digest(resolve(historicalDirectory, definitionFile));
    const historicalManifest = readJson(historicalDirectory, manifestFile);
    historicalManifest.files[bodyFile] = historicalBodyDigest;
    historicalManifest.files[definitionFile] = historicalDefinitionDigest;
    historicalManifest.content_refs.body_environment_profiles.digest = historicalBodyDigest;
    historicalManifest.content_refs.definition.digest = historicalDefinitionDigest;
    const aggregate = Object.entries(historicalManifest.files)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, value]) => `${name}:${value}`)
      .join('\n') + '\n';
    historicalManifest.content_digest = createHash('sha256').update(aggregate).digest('hex');
    writeJson(historicalDirectory, manifestFile, historicalManifest);
    const result = runChecker({ directory: source, historicalV2Directory: historicalDirectory });
    assertRejected(result, /TRACE_0D_V3_V2_REGRESSION/);
  } finally {
    rmSync(historicalDirectory, { recursive: true, force: true });
  }
});

test('body-state v2 contract remains generic and boatman artifacts remain immutable', () => {
  const ownerContract = JSON.parse(
    readFileSync(resolve('packages/body-state/src/declarative-content-contracts.v2.json'), 'utf8')
  );
  assert.equal(ownerContract.owner, '@rus/body-state');
  assert.equal(ownerContract.scenario_specific_ids_or_counts, 'forbidden');
  assert.equal(JSON.stringify(ownerContract).includes('trace_ld_v1'), false);
  for (const [path, expected] of Object.entries(boatmanDigests)) {
    assert.equal(digest(resolve(path)), expected, `boatman artifact changed: ${path}`);
  }
  for (const [name, expected] of Object.entries(v2Digests)) {
    assert.equal(digest(resolve(v2Source, name)), expected, `phase 0D v2 changed: ${name}`);
  }
});
