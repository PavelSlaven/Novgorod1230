import { readFileSync } from 'node:fs';

// Read directly, like the other m2c label catalogs (LW-075). There is no runtime digest gate:
// "the file is the approved content" is checked by the repository test
// `test/spatial-v3/m2c-pass-target-labels-attestation.test.js` (AI §17, LW-075).
const catalog = JSON.parse(readFileSync(new URL('./candidate.json', import.meta.url)));

export const passagePhrases = Object.freeze(catalog.passage_phrases);

/** The one catalog row of an expansion slot, or null when the catalog has none. */
export function passTargetRowForSlot(slotRef) {
  const rows = catalog.labels.filter((row) => row.expansion_slot_ref?.id === slotRef?.id
    && row.expansion_slot_ref?.version === slotRef?.version);
  return rows.length === 1 ? rows[0] : null;
}

/** Same description text at one disclosed position is ambiguous; disambiguate with the
 * already-approved editorial_choice_ordinal from m2c-exit-labels, never a new number. */
export function withPassTargetDisambiguation(rows) {
  const counts = new Map();
  for (const row of rows) if (row.pass_target_description) {
    counts.set(row.pass_target_description, (counts.get(row.pass_target_description) ?? 0) + 1);
  }
  return rows.map(({ pass_target_description: description, editorial_choice_ordinal: ordinal,
    ...row }) => ({ ...row, display_label: description
      ? counts.get(description) > 1 ? `${description} (${ordinal})` : description
      : row.display_label }));
}
