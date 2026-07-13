import { findForbiddenPublicKeys } from '../world/json-contracts.js';
import { buildSceneActionHints } from './scene-hints.js';
import { getPlayerAlertTags, getPlayerVitals } from './vitals.js';

function cleanText(value) {
  return String(value ?? '').trim();
}

export function buildActionHintsInput(world = {}) {
  const player = world.player ?? {};
  const vitals = getPlayerVitals(player);
  const items = player.items ?? {};
  const inventorySummary = items.summaryText
    ?? `В руках: ${(items.weapons ?? []).length ? 'есть' : 'пусто'} · Груз: ${items.load_category ?? 'неизвестно'}`;

  return {
    visible_scene: cleanText(world.visibleScene?.prose ?? world.lastNarratorProse ?? ''),
    last_prose: cleanText(world.lastNarratorProse ?? world.visibleScene?.prose ?? ''),
    player_status: cleanText(player.visibleStatus ?? player.status ?? ''),
    vitals: {
      health: vitals.health,
      satiety: vitals.satiety,
      vigor: vitals.vigor
    },
    alert_tags: getPlayerAlertTags(player),
    inventory_summary: inventorySummary,
    known_obligations: Array.isArray(player.obligations) ? player.obligations.slice(0, 6) : [],
    known_risks: Array.isArray(world.scene?.hazards) ? world.scene.hazards.slice(0, 6) : [],
    uncertainties: Array.isArray(world.visibleScene?.markup?.notes)
      ? world.visibleScene.markup.notes.slice(0, 6)
      : [],
    markup: world.visibleScene?.markup ?? {}
  };
}

export function buildFallbackActionHints(input = {}) {
  const hints = buildSceneActionHints(input.markup ?? {});
  return hints.slice(0, 5).map((hint) => ({
    text: hint.command,
    tone: null,
    risk_hint: null,
    action: hint.action ?? null
  }));
}

export function assertActionHintsInputIsVisibleOnly(input) {
  const violations = findForbiddenPublicKeys(input);
  if (violations.length > 0) {
    throw new Error(`Action hints input leaks forbidden keys: ${violations.slice(0, 8).join(', ')}`);
  }
  return true;
}

export async function resolveActionHints(input = {}, options = {}) {
  assertActionHintsInputIsVisibleOnly(input);
  const generate = options.generate;
  if (typeof generate === 'function') {
    try {
      const agentHints = await generate(input);
      if (Array.isArray(agentHints) && agentHints.length > 0) {
        return {
          source: 'agent',
          hints: agentHints.slice(0, 5).map((hint) => ({
            text: cleanText(hint?.text ?? hint?.command ?? ''),
            tone: hint?.tone ?? null,
            risk_hint: hint?.risk_hint ?? null,
            action: hint?.action ?? null
          })).filter((hint) => hint.text)
        };
      }
    } catch {
      // ponytail: agent unavailable → procedural fallback
    }
  }
  return {
    source: 'fallback',
    hints: buildFallbackActionHints(input)
  };
}
