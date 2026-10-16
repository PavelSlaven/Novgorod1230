import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { passTargetRowForSlot, withPassTargetDisambiguation } from '../../../data/world-catalogs/novgorod/m2c-pass-target-labels/approved-labels.mjs';
import { loadApprovedExitLineLabels } from
  '../../../data/world-catalogs/novgorod/m2c-exit-line-labels/approved-labels.mjs';
import { hasExitOrdinalLabel, loadApprovedLegacyExitLabels, resolveSpatialV3ExitLabels } from
  '../src/infrastructure/postgres/spatial-v3-exit-label-policy.js';

const lineLabels = loadApprovedExitLineLabels();
const legacyLabels = loadApprovedLegacyExitLabels();

test('F3 chooses a unique pass target, then approved line, then the existing approved label', () => {
  const rows = [
    { directional_exit_id: 'target', directional_exit_version: 1,
      direction_context_id: 'ctx-target', _exit_canonical_digest: 'digest-target',
      pass_target_description: 'к руслу' },
    { directional_exit_id: 'line', directional_exit_version: 1,
      direction_context_id: 'ctx-line', _exit_canonical_digest: 'digest-line',
      pass_target_description: null },
    { directional_exit_id: 'legacy', directional_exit_version: 1,
      direction_context_id: 'ctx-legacy', _exit_canonical_digest: 'digest-legacy',
      pass_target_description: null }
  ];
  const revisions = { worldRevisionId: 'revision', g4Id: 'g4', placeId: 'place' };
  const exactRow = (row, display_label) => ({ ...row, display_label,
    world_revision_id: 'revision', g4_ref: { id: 'g4' },
    directional_exit_ref: { id: row.directional_exit_id,
      version: row.directional_exit_version, canonical_digest: row._exit_canonical_digest },
    direction_context_ref: { id: row.direction_context_id } });
  const lines = new Map([['line@1', exactRow(rows[1], 'тропой к гряде')]]);
  const legacy = new Map([['legacy@1', exactRow(rows[2], 'Продолжить путь — выход 3')]]);
  const selected = resolveSpatialV3ExitLabels(rows, { ...revisions,
    lineLabels: lines, legacyLabels: legacy });
  assert.deepEqual(selected.map((row) => row.display_label),
    ['к руслу', 'тропой к гряде', 'Продолжить путь — выход 3']);
  assert.ok(selected.every((row) => !Object.hasOwn(row, '_exit_canonical_digest')));
  assert.ok(selected.every((row) => !Object.hasOwn(row, 'pass_target_description')));
});

test('missing every approved source is a typed gap with place and exit diagnostics', () => {
  assert.throws(() => resolveSpatialV3ExitLabels([{ directional_exit_id: 'exit',
    directional_exit_version: 1, direction_context_id: 'ctx',
    _exit_canonical_digest: 'digest', pass_target_description: null }], {
    lineLabels: new Map(), legacyLabels: new Map(), worldRevisionId: 'revision',
    g4Id: 'g4', placeId: 'g5' }), (error) => error.details?.reason === 'approved_exit_label_required'
      && error.details?.directional_exit_id === 'exit' && error.details?.place_id === 'g5');
});

test('approved row composition covers every v17 exit; 12 held distinctions use old approved labels', () => {
  assert.equal(lineLabels.size, 70);
  assert.equal(legacyLabels.size, 86);
  const attestation = JSON.parse(readFileSync(new URL(
    '../../../data/world-catalogs/novgorod/m2c-exit-line-labels/approval-attestation.json', import.meta.url)));
  const candidate = JSON.parse(readFileSync(new URL(
    '../../../data/world-catalogs/novgorod/m2c-exit-line-labels/candidate.json', import.meta.url)));
  const slots = JSON.parse(readFileSync(new URL(
    '../../../data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1/datasets/spatial_v3_expansion_slots.json', import.meta.url)));
  const labels = new Map(candidate.labels.map((row) => [row.directional_exit_ref.id, row]));
  const slotByExit = new Map(slots.map((row) => [row.directional_exit_id,
    { id: row.id, version: row.version }]));
  const rows = [...attestation.approved_rows, ...attestation.withheld_rows.rows].map((approval) => {
    const label = labels.get(approval.directional_exit_id);
    const target = passTargetRowForSlot(slotByExit.get(approval.directional_exit_id));
    return { place: approval.from_place,
      row: { directional_exit_id: approval.directional_exit_id,
        directional_exit_version: label.directional_exit_ref.version,
        direction_context_id: label.direction_context_ref.id,
        _exit_canonical_digest: label.directional_exit_ref.canonical_digest,
        pass_target_description: target?.display_label ?? null },
      source: label };
  });
  const byPlace = new Map();
  for (const item of rows) byPlace.set(item.place, [...(byPlace.get(item.place) ?? []), item]);
  const previousByExit = new Map();
  for (const items of byPlace.values()) {
    const previous = withPassTargetDisambiguation(items.map(({ row }) => {
      const legacy = legacyLabels.get(`${row.directional_exit_id}@${row.directional_exit_version}`);
      return { ...row, display_label: legacy?.display_label,
        editorial_choice_ordinal: legacy?.editorial_choice_ordinal };
    }));
    for (let index = 0; index < items.length; index += 1) {
      previousByExit.set(items[index].row.directional_exit_id, previous[index].display_label);
    }
  }
  const collisionExpectations = new Map([
    ['g4exitv3__g4dirv3f__g3route_gn_nov_g2_xp017_yp026_r2_central_main_channel_1', 'к руслу (1)'],
    ['g4exitv3__g4dirv3f__cross_g4_16', 'к гряде (2)'],
    ['g4exitv3__g4dirv3f__g3route_gn_nov_g2_xp017_yp026_r2_small_stream_network_1', 'к руслу (1)'],
    ['g4exitv3__g4dirv3r__cross_g4_14', 'к руслу (2)']
  ]);
  for (const [exitId, expected] of collisionExpectations) {
    assert.equal(previousByExit.get(exitId), expected,
      `${exitId}: existing approved pass-target composition`);
  }
  let legacyFallbacks = 0;
  let total = 0;
  const selectedByExit = new Map();
  const exactApprovedRow = (approved, source) => approved?.world_revision_id === candidate.world_revision_id
    && approved.g4_ref?.id === source.g4_ref?.id
    && approved.directional_exit_ref?.id === source.directional_exit_ref?.id
    && approved.directional_exit_ref?.version === source.directional_exit_ref?.version
    && approved.directional_exit_ref?.canonical_digest === source.directional_exit_ref?.canonical_digest
    && approved.direction_context_ref?.id === source.direction_context_ref?.id;
  for (const items of byPlace.values()) {
    const g4Id = items[0].source.g4_ref.id;
    const disclosures = items.map((item) => item.row);
    const selected = resolveSpatialV3ExitLabels(disclosures, { lineLabels, legacyLabels,
      worldRevisionId: candidate.world_revision_id, g4Id, placeId: items[0].place });
    total += selected.length;
    for (let index = 0; index < items.length; index += 1) {
      const row = items[index].row;
      const descriptionCount = disclosures.filter((other) =>
        row.pass_target_description && other.pass_target_description === row.pass_target_description).length;
      const source = items[index].source;
      const key = `${row.directional_exit_id}@${row.directional_exit_version}`;
      const line = exactApprovedRow(lineLabels.get(key), source);
      const legacy = exactApprovedRow(legacyLabels.get(key), source);
      const uniqueTarget = descriptionCount === 1 && Boolean(row.pass_target_description);
      const lineIsOrdinal = line && hasExitOrdinalLabel(lineLabels.get(key).display_label);
      const previousLabel = previousByExit.get(row.directional_exit_id);
      const previousIsOrdinal = hasExitOrdinalLabel(previousLabel ?? '');
      const expected = uniqueTarget ? row.pass_target_description
        : line && (!lineIsOrdinal || !previousLabel || previousIsOrdinal)
          ? lineLabels.get(key).display_label
          : previousLabel ?? legacyLabels.get(key)?.display_label ?? lineLabels.get(key)?.display_label ?? null;
      assert.equal(selected[index].display_label, expected,
        `${items[index].place}/${row.directional_exit_id}: F3 selected the exact approved source`);
      selectedByExit.set(row.directional_exit_id, selected[index].display_label);
      const isFallback = !uniqueTarget && !line && legacy;
      if (isFallback) {
        legacyFallbacks += 1;
        assert.equal(selected[index].display_label, previousLabel);
      }
    }
  }
  assert.equal(byPlace.size, 46);
  assert.equal(total, 86);
  assert.equal(legacyFallbacks, 12);
  for (const [exitId, expected] of collisionExpectations) {
    assert.equal(selectedByExit.get(exitId), expected,
      `${exitId}: policy preserves the real approved composition`);
  }
});

test('ordinal detector recognizes Cyrillic terms with Unicode boundaries', () => {
  assert.equal(hasExitOrdinalLabel('Продолжить путь — выход 2'), true);
  assert.equal(hasExitOrdinalLabel('невыход 2'), false);
  assert.equal(hasExitOrdinalLabel('выход 2а'), false);
});
