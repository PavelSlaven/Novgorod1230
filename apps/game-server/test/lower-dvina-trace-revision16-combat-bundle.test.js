import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { loadLowerDvinaTraceMaterializationBundle } from
  '../src/internal/lower-dvina-trace-phase-1a-bundle.js';
import { loadLowerDvinaTraceRevision16CombatBundle } from
  '../src/internal/lower-dvina-trace-combat-bundle.js';

const SCENARIO = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';

test('revision 16 loader pins combat and player combat binding artifacts', async () => {
  const bundle = await loadLowerDvinaTraceMaterializationBundle({
    rootDir: process.cwd(),
    scenarioDefinitionRevision: 16
  });
  assert.equal(bundle.definition_revision, 16);
  assert.equal(bundle.turn_step_bindings.domain_bindings.length, 13);
  assert.equal(bundle.combat_semantic_bindings.phase_8.actor_slot,
    'zhdanko_storehouse_controller');
  assert.equal(bundle.combat_semantic_bindings.phase_4.execution_profiles.length, 4);
  assert.equal(
    bundle.phase_1a_manifest.package_id,
    'lower_dvina_trace_phase_1a_v12'
  );
});

test('revision 16 rejects coordinated mutation outside its publication pin',
  async (t) => {
    const root = await mkdtemp(resolve(tmpdir(), 'trace-revision16-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    await cp(resolve(process.cwd(), SCENARIO), resolve(root, SCENARIO), {
      recursive: true
    });
    const historical = await loadLowerDvinaTraceMaterializationBundle({
      rootDir: process.cwd(), scenarioDefinitionRevision: 15
    });
    const contentRoot = resolve(root, SCENARIO, 'phase-m4-content');
    const combatPath = resolve(contentRoot, 'combat-semantic-bindings.json');
    const definitionPath = resolve(contentRoot, 'definition.json');
    const manifestPath = resolve(contentRoot, 'manifest.json');
    const phase1aPath = resolve(root, SCENARIO, 'phase-1a-v12/manifest.json');
    const combat = await json(combatPath);
    combat.exchange_timing_profile.duration_minutes = 3;
    await writeJson(combatPath, combat);
    const combatDigest = await digest(combatPath);
    const definition = await json(definitionPath);
    definition.resolved_policy_refs.combat_semantic_bindings.digest =
      combatDigest;
    await writeJson(definitionPath, definition);
    const definitionDigest = await digest(definitionPath);
    const manifest = await json(manifestPath);
    manifest.content_refs.combat_semantic_bindings.digest = combatDigest;
    manifest.content_refs.definition.digest = definitionDigest;
    manifest.files['combat-semantic-bindings.json'] = combatDigest;
    manifest.files['definition.json'] = definitionDigest;
    manifest.content_digest = digestFiles(manifest.files);
    await writeJson(manifestPath, manifest);
    const manifestDigest = await digest(manifestPath);
    const phase1a = await json(phase1aPath);
    phase1a.base_definition_ref.digest = manifestDigest;
    await writeJson(phase1aPath, phase1a);
    await assert.rejects(() => loadLowerDvinaTraceRevision16CombatBundle({
      rootDir: root,
      historicalBundle: historical
    }), /TRACE_REVISION_16_COMBAT_CONTENT_INVALID/);
  });

const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const digest = async (path) => createHash('sha256')
  .update(await readFile(path)).digest('hex');
const writeJson = (path, value) => writeFile(path,
  `${JSON.stringify(value, null, 2)}\n`);
function digestFiles(files) {
  const payload = Object.entries(files)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}:${value}`).join('\n').concat('\n');
  return createHash('sha256').update(payload).digest('hex');
}
