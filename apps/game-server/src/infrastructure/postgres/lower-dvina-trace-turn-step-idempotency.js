import { canonicalDigest } from '@rus/materialization';
import {
  deriveLowerDvinaTraceTurnStepVisibleDependencyPins
} from './lower-dvina-trace-turn-step-state.js';

export function bindLowerDvinaTraceTurnStepIdempotency({
  envelope,
  inputDigest,
  semanticCommandSnapshot,
  semanticCommandDigest,
  semanticDependencyPins,
  visibleDependencyPins,
  deriveVisiblePinsFromEnvelope = false
}) {
  if (envelope == null) {
    return {
      semantic_command_snapshot: semanticCommandSnapshot,
      semantic_command_digest: semanticCommandDigest,
      semantic_dependency_pins: semanticDependencyPins
    };
  }
  const expectedVisiblePins = deriveVisiblePinsFromEnvelope
    ? deriveLowerDvinaTraceTurnStepVisibleDependencyPins(envelope)
    : visibleDependencyPins;
  if (deriveVisiblePinsFromEnvelope
      && canonicalDigest(visibleDependencyPins)
        !== canonicalDigest(expectedVisiblePins)) {
    const error = new Error(
      'Visible dependency pins do not match the committed turn-step.'
    );
    error.code = 'TRACE_TURN_STEP_DEPENDENCY_PIN_MISMATCH';
    throw error;
  }
  return {
    semantic_command_snapshot: {
      ...semanticCommandSnapshot,
      turn_step_commit_digest: canonicalDigest(envelope)
    },
    semantic_command_digest: normalizeDigest(canonicalDigest({
      input_digest: inputDigest,
      turn_step_commit: envelope
    })),
    semantic_dependency_pins: turnStepDependencyPins({
      envelope, visibleDependencyPins: expectedVisiblePins
    })
  };
}

export function bindLowerDvinaTraceFactualTurnStepIdempotency({
  envelope,
  inputDigest,
  factual,
  semanticCommandDigest,
  semanticDependencyPins,
  visibleDependencyPins,
  schema = 'rus.lower_dvina_trace_command_snapshot.v2'
}) {
  return bindLowerDvinaTraceTurnStepIdempotency({
    envelope,
    inputDigest,
    semanticCommandSnapshot: {
      schema,
      input_digest: inputDigest,
      raw_text: factual.player_input.raw_text,
      action_set_digest:
        factual.mode_resolution.decision_trace.action_set_digest,
      selected_option_id: factual.mode_resolution.option_id,
      semantic_trace: factual.mode_resolution.decision_trace
    },
    semanticCommandDigest,
    semanticDependencyPins,
    visibleDependencyPins
  });
}

export function validLowerDvinaTraceTurnStepReplayEvidence({
  record,
  payload,
  visibleDependencyPins
}) {
  try {
    const envelope = payload?.last_turn?.turn_step_commit;
    if (envelope == null) return true;
    const inputDigest = payload.last_turn.input_digest;
    const expectedVisiblePins = record?.operation_kind === 'trace_turn_step'
      ? deriveLowerDvinaTraceTurnStepVisibleDependencyPins(envelope)
      : visibleDependencyPins;
    return record?.semantic_command_snapshot?.turn_step_commit_digest
        === canonicalDigest(envelope)
      && normalizeDigest(record.semantic_command_digest)
        === normalizeDigest(canonicalDigest({
          input_digest: inputDigest,
          turn_step_commit: envelope
        }))
      && (record.operation_kind !== 'trace_turn_step'
        || canonicalDigest(visibleDependencyPins)
          === canonicalDigest(expectedVisiblePins))
      && canonicalDigest(record.semantic_dependency_pins)
        === canonicalDigest(turnStepDependencyPins({
          envelope, visibleDependencyPins: expectedVisiblePins
        }));
  } catch {
    return false;
  }
}

function turnStepDependencyPins({ envelope, visibleDependencyPins }) {
  const pins = structuredClone(visibleDependencyPins?.pins ?? []);
  for (const request of envelope?.checks?.requests ?? []) {
    const pin = request?.policy_profile_pin;
    if (typeof pin?.artifact_id !== 'string'
        || !Number.isSafeInteger(pin.revision)) continue;
    pins.push({
      dependency_role: 'source_authoring',
      entity_ref: {
        entity_kind: 'policy_profile',
        entity_id: pin.artifact_id
      },
      version_pin: {
        pin_kind: 'authoring_version',
        authoring_version: String(pin.revision),
        state_version: null
      }
    });
  }
  const unique = new Map(pins.map((pin) => [canonicalDigest(pin), pin]));
  const normalized = [...unique.values()].sort((left, right) =>
    canonicalDigest(left).localeCompare(canonicalDigest(right)));
  return {
    pins: normalized,
    canonical_digest: canonicalDigest(normalized)
  };
}

const normalizeDigest = (value) =>
  `sha256:${String(value).replace('sha256:', '')}`;
