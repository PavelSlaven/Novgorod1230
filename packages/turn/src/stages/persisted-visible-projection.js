import {
  buildSafeNarratorPackage,
  validateVisibleContext
} from '@rus/visibility-knowledge-memory';
import { assertValid } from '../validators.js';
import { freezeOutput } from './shared.js';

export async function loadPersistedVisibleProjectionStage({
  playerInput,
  modeResolution,
  commit,
  expectedVisibleContext,
  persistedVisibleReader
}) {
  const candidate = await persistedVisibleReader.read({
    party_id: playerInput.party_id,
    turn_id: modeResolution.turn_id,
    commit: structuredClone(commit),
    expected_visible_digest:
      expectedVisibleContext.canonical_digest ?? null
  });
  assertValid('visible_context_package', validateVisibleContext(candidate));
  const safe = buildSafeNarratorPackage(candidate);
  if (!safe.ok) {
    const error = new Error(
      `persisted visible context security gate failed: ${safe.errors.join('; ')}`
    );
    error.code = 'TURN_PERSISTED_VISIBLE_CONTEXT_REJECTED';
    throw error;
  }
  return freezeOutput(safe.package);
}
