import { approachPhraseForRow, passagePhrases, passTargetRowForSlot } from
  '../../../../data/world-catalogs/novgorod/m2c-pass-target-labels/approved-labels.mjs';
import { serverError } from '../errors.js';

/** Exit -> its approved expansion slot. An exit with several slots resolves to the slot with
 * the lowest (id, version) - the same answer for every reader, whatever the row order. */
export function slotByExitOf(slots = []) {
  const byExit = new Map();
  for (const slot of [...slots].sort((left, right) => left.id.localeCompare(right.id)
    || left.version - right.version)) {
    if (!byExit.has(slot.directional_exit_id)) {
      byExit.set(slot.directional_exit_id, { id: slot.id, version: slot.version });
    }
  }
  return byExit;
}

/** The approved pass-target text and way-of-going phrase of one revealed exit. An exit that
 * has no expansion slot has neither; a slot the approved catalog does not know is a typed
 * gap, never a silent fallback to the generic exit label. */
export function passTargetDisclosureForExit(slotByExit, exitId) {
  const slotRef = slotByExit?.get(exitId);
  if (slotRef == null) return { pass_target_description: null };
  const row = passTargetRowForSlot(slotRef);
  if (row == null) {
    throw serverError('SPATIAL_V3_VISIBLE_CONTEXT_DATA_GAP',
      'Complete current player-visible facts are required.',
      { status: 409, details: { reason: 'approved_pass_target_label_required' } });
  }
  return { pass_target_description: row.display_label ?? null,
    approach_phrase: approachPhraseForRow(row) };
}

export const NEUTRAL_APPROACH_PHRASE = passagePhrases.approach.neutral;
