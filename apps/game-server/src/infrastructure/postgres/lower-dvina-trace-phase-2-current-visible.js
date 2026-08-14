import { canonicalDigest } from '@rus/materialization';
import { validateVisibleContext } from '@rus/visibility-knowledge-memory';
import { assertLowerDvinaTracePublicScreen } from
  '../../runtime/lower-dvina-trace-opening.js';
import { phase2IntegrityError } from './lower-dvina-trace-phase-2-read.js';

const ARRAY_FIELDS = [
  'visible_changes', 'sensory_details', 'visible_npc', 'visible_objects',
  'known_context', 'uncertainties', 'allowed_tensions', 'do_not_imply'
];

export function phase2InitialCurrentVisibleContext({
  screen,
  openingScreenDigest
}) {
  try {
    assertLowerDvinaTracePublicScreen(screen);
  } catch {
    throw phase2IntegrityError();
  }
  if (canonicalDigest(screen) !== openingScreenDigest) {
    throw phase2IntegrityError();
  }
  const visibleContext = screen.visible_context;
  const environmentFacts = visibleContext?.environment?.facts;
  return requirePhase2CurrentVisibleContext({
    version: 1,
    schema: 'visible_context_package',
    visible_scene: visibleContext?.place,
    visible_changes: [],
    sensory_details: Array.isArray(environmentFacts)
      ? environmentFacts.filter((value) =>
          typeof value === 'string' && value.length > 0)
      : [],
    visible_npc: [],
    visible_objects: [],
    known_context: [visibleContext?.place, visibleContext?.calendar]
      .filter((value) => typeof value === 'string' && value.length > 0),
    uncertainties: [],
    allowed_tensions: [],
    do_not_imply: []
  });
}

export function requirePhase2CurrentVisibleContext(value) {
  const validation = validateVisibleContext(value);
  if (!validation.ok
      || ARRAY_FIELDS.some((field) => !Array.isArray(value?.[field]))) {
    throw phase2IntegrityError();
  }
  return structuredClone(value);
}

export function withPhase2CurrentVisibleContext(state, currentVisibleContext) {
  return {
    ...state,
    current_visible_context:
      requirePhase2CurrentVisibleContext(currentVisibleContext)
  };
}

export function withoutPhase2CurrentVisibleContext(state) {
  delete state.current_visible_context;
  return state;
}
