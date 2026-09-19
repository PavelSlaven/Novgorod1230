import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { applyAuthoredTurnCompatibility } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2-initial-state.js';

const fixtureUrl = new URL(
  '../../../test/fixtures/m2a-5f7e83cd-authored-internal.json', import.meta.url);
const catalogUrl = new URL(
  '../../../data/world-catalogs/novgorod/live-world-runtime-v1/authored-starts.json',
  import.meta.url);

test('exact accepted M2a snapshot gains only its pinned turn compatibility',
  async () => {
    const raw = await readFile(fixtureUrl);
    assert.equal(createHash('sha256').update(raw).digest('hex'),
      '88c6d7452f1a84cb3d224ddedff7ee30c4abb942e50138dcd7314ae451ea331f');
    const fixture = JSON.parse(raw);
    const catalog = JSON.parse(await readFile(catalogUrl, 'utf8'));
    const compatibility = catalog.bindings.find(({ revision }) =>
      revision === 3).turn_compatibility;
    assert.equal(fixture.player.dossier.attributes, undefined);
    assert.equal(fixture.items.every((item) =>
      item.state.inventory_profile_snapshot == null), true);

    const migrated = applyAuthoredTurnCompatibility(fixture, compatibility);
    assert.equal(fixture.player.dossier.attributes, undefined);
    assert.equal(migrated.player.dossier.attributes.strength.value, 10);
    assert.equal(migrated.materialization_trace.run_id,
      fixture.materialization_trace.run_id);
    assert.equal(migrated.materialization_trace.result_digest,
      fixture.materialization_trace.result_digest);
    const mechanics = Object.fromEntries(migrated.items.map((item) => [
      item.template_id, item.state.inventory_profile_snapshot
    ]));
    assert.equal(mechanics.item_tpl_nov_rope_v1.packing_slot_cost, 6);
    assert.equal(mechanics.item_tpl_nov_rope_v1.packing_bundle_size, 1);
    assert.equal(mechanics.item_tpl_nov_linen_shirt_v1.packing_slot_cost, 3);
    assert.equal(mechanics.item_tpl_nov_linen_shirt_v1.packing_bundle_size, 1);
  });
