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

/** Keep approved descriptions as authored, including when visible exits share one label. */
export function withPassTargetDescriptions(rows) {
  return rows.map((candidate) => {
    const { pass_target_description: description, ...row } = candidate;
    delete row.editorial_choice_ordinal;
    return { ...row, display_label: description || row.display_label };
  });
}
