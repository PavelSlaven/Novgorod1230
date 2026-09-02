import { validateFirstGameScreen } from '@rus/presentation';
import { detectHiddenLeaks } from '@rus/visibility-knowledge-memory';

const FORBIDDEN_KEYS = new Set([
  'hidden_truth',
  'culprit',
  'motive',
  'hidden_sequence',
  'sealed_selections',
  'clue_placements',
  'lies_and_statements',
  'private_knowledge',
  'materialization_trace',
  'policy_profile_pins',
  'completion_state',
  'epilogue_state'
]);

export function buildLowerDvinaTraceOpeningScreen({
  visible,
  approvedProjection
} = {}) {
  assertVisibleSource(visible, approvedProjection);
  const projection = approvedProjection.opening_projection;
  const screen = {
    version: projection.version,
    schema: projection.schema,
    screen_status: 'ready',
    party_id: visible.party_id,
    scenario_id: approvedProjection.scenario_id,
    main_prose: projection.opening_prose,
    visible_context: {
      place: projection.place_label,
      calendar: projection.calendar_label,
      timestamp: structuredClone(visible.timestamp),
      environment: { facts: structuredClone(visible.environment.facts) }
    },
    action_panel: { suggested_actions: [] },
    panels: {
      character: {
        visible: true,
        data: {
          name: visible.player.name,
          role: visible.player.social_status.display_name,
          health: visible.body.health,
          energy: visible.body.energy,
          satiety: visible.body.satiety
        }
      },
      route: {
        visible: true,
        data: { current_place: projection.place_label }
      }
    },
    input_panel: {
      free_text_enabled: false,
      input_contract: 'gameplay_not_available'
    },
    delivery_state: {
      message_id: `opening:${visible.party_id}`,
      ready: true
    }
  };
  assertLowerDvinaTracePublicScreen(screen);
  return freezeDeep(screen);
}

export function assertLowerDvinaTracePublicScreen(screen) {
  const validation = validateFirstGameScreen(screen);
  const leaks = explicitLeaks(screen);
  if (!validation.ok || detectHiddenLeaks(screen).length > 0
    || leaks.length > 0) {
    fail(
      'TRACE_PHASE_1B_OPENING_SCREEN_INVALID',
      'Trace opening screen failed presentation or hidden-boundary validation.',
      { errors: validation.errors, leaks }
    );
  }
  return screen;
}

function assertVisibleSource(visible, approvedProjection) {
  if (!visible || typeof visible !== 'object' || Array.isArray(visible)
    || visible.party_id == null
    || !visible.player?.name
    || !visible.player?.social_status?.display_name
    || !visible.position?.g4_id
    || !visible.position?.g5_node_id
    || !visible.position?.g5_anchor_id
    || !visible.timestamp?.whole_minutes
    || !Number.isFinite(Number(visible.body?.health))
    || !Number.isFinite(Number(visible.body?.energy))
    || !Number.isFinite(Number(visible.body?.satiety))
    || !visible.environment?.environment_profile_id
    || !Array.isArray(visible.environment?.facts)) {
    fail(
      'TRACE_PHASE_1B_VISIBLE_STATE_INCOMPLETE',
      'Committed visible state is incomplete for the approved opening projection.'
    );
  }
  const allowlist =
    approvedProjection?.opening_projection?.visible_field_allowlist;
  if (!Array.isArray(allowlist)
    || JSON.stringify(allowlist) !== JSON.stringify([
      'party_id',
      'player.name',
      'player.social_status',
      'position',
      'timestamp',
      'body',
      'environment'
    ])) {
    fail(
      'TRACE_PHASE_1B_VISIBLE_ALLOWLIST_INVALID',
      'Opening projection allowlist is missing or incompatible.'
    );
  }
  const allowedRoots = new Set(allowlist.map((path) => path.split('.')[0]));
  if (Object.keys(visible).some((key) => !allowedRoots.has(key))
    || detectHiddenLeaks(visible).length > 0
    || explicitLeaks(visible).length > 0) {
    fail(
      'TRACE_PHASE_1B_VISIBLE_STATE_HIDDEN_LEAK',
      'Opening projection source contains a forbidden or unapproved field.',
      { leaks: explicitLeaks(visible) }
    );
  }
}

function explicitLeaks(value, path = [], leaks = []) {
  if (!value || typeof value !== 'object') return leaks;
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      explicitLeaks(entry, [...path, index], leaks));
    return leaks;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
      leaks.push([...path, key].join('.'));
    }
    explicitLeaks(nested, [...path, key], leaks);
  }
  return leaks;
}

function fail(code, message, details = {}) {
  throw Object.assign(new Error(message), {
    code,
    status: 409,
    details
  });
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}
