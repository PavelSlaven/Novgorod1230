import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const read = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));

test('nature successors cover every exact G4, season and applicable layer without current fauna assertions', () => {
  execFileSync(process.execPath, [resolve(root, 'scripts/generate-m2c-nature-successors.mjs'), '--check'], { cwd: root });
  const natural = read('data/world-catalogs/novgorod/m2c-natural/nature-successor-candidate-v2.json');
  const presentation = read('data/world-catalogs/novgorod/m2c-natural-presentation/nature-successor-candidate-v2.json');
  assert.equal(natural.natural_profiles.length, 32);
  assert.equal(presentation.presentation_profiles.length, 32);
  assert.equal(new Set(natural.natural_profiles.map((profile) => profile.g4_ref.id)).size, 32);
  assert.deepEqual(presentation.presentation_profiles.map((profile) => profile.g4_ref.id).sort(),
    natural.natural_profiles.map((profile) => profile.g4_ref.id).sort());
  for (const profile of natural.natural_profiles) {
    const layers = profile.natural_profile.layer_applicability;
    assert.equal(profile.profile_version, 2);
    assert.equal(layers.fauna.applicability, 'conditional');
    assert.ok(layers.fauna.alternatives.length);
    assert.deepEqual(Object.keys(profile.natural_profile.season_matrix), ['winter', 'spring', 'summer', 'autumn']);
    for (const season of Object.values(profile.natural_profile.season_matrix)) {
      assert.deepEqual(Object.keys(season).sort(), Object.keys(layers).sort());
      for (const [name, row] of Object.entries(season)) {
        if (row.applicability !== 'not_applicable') assert.ok(row.members.length, `${profile.g4_ref.id}/${name}`);
        for (const member of row.members) assert.ok(member.phase && member.eligibility);
      }
    }
    if (profile.g4_ref.id.endsWith('_driftwood_bar') || profile.g4_ref.id.endsWith('_shifting_shoal_field')) {
      assert.equal(layers.riparian_vegetation.applicability, 'not_applicable');
      assert.equal(layers.riparian_vegetation.alternatives, undefined);
    }
  }
  for (const profile of presentation.presentation_profiles) {
    assert.equal(profile.version, 2);
    const fauna = profile.layers.find((layer) => layer.layer === 'fauna');
    assert.equal(fauna.channel, 'none');
    assert.equal(fauna.clear_text, null);
    assert.deepEqual(fauna.member_phrases.map((phrase) => phrase.evidence), ['committed_static_trace', 'committed_ambient_sound']);
    assert.ok(fauna.member_phrases.every((phrase) => phrase.admission.includes('exact_current_')));
  }
  assert.equal(natural.approved, false);
  assert.equal(natural.import_authorized, false);
  assert.equal(natural.activation_authorized, false);
  assert.equal(presentation.approved, false);
  assert.equal(presentation.import_authorized, false);
  assert.equal(presentation.activation_authorized, false);
});
