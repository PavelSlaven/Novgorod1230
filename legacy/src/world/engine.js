import { isInventoryIntent } from './intent.js';
import { resolveItemAction } from './item-resolver.js';
import {
  buildAmbiguousResult,
  buildAttackResult,
  buildClaimResult,
  buildDefendResult,
  buildFleeResult,
  buildMoveResult,
  buildObservation,
  buildRestResult,
  buildStealResult,
  buildTreatResult,
  buildTalkResult,
  buildTradeResult,
  buildWaitResult,
  buildRouteInquiryResult,
} from './narration.js';
import { getCurrentLocation, travelReturn, travelWorld } from './location.js';
import { applySocialConsequence } from './social.js';
import { advanceWorld } from './timeline.js';
import { getActiveStateValue, mirrorBodyStateFields, upsertActiveState } from './profile-v2.js';
import { estimateIntentMinutes } from './master.js';
import { buildActionCheck, describeCheckOutcome } from './checks.js';
import { applyFieldCare, consumeMedicalSupplies, findHealerNpc, pickMedicalSupplies } from './medical.js';
import { recordRouteReconstruction } from './routes.js';
import { summarizeLegalAftermath } from './law.js';
import { recordWorldEvent } from './event-log.js';
import {
  armorCoverageSummary,
  combatHealthLossFromDamageScore,
  combatInjuryProfileFromDamageScore,
  deriveAttackFocus,
  combatQualityFromMargin,
  summarizeBattleExertion,
  summarizeBattleAftermath,
  summarizeArmorProtection,
  summarizeCombatEquipment,
  summarizeCombatVulnerability,
  summarizeActiveDefense,
  summarizeWeaponDanger
} from './combat-model.js';
import { allowsProceduralSemantics, queueSemanticPending } from './semantic-gate.js';

export { renderOpeningScene } from './narration.js';

export function commitWorldTransaction(world, draft) {
  if (!world || !draft || world === draft) return world;

  if (draft.player && world.player && typeof world.player === 'object') {
    Object.assign(world.player, draft.player);
    draft.player = world.player;
  }

  if (Array.isArray(draft.npcs) && Array.isArray(world.npcs)) {
    const byId = new Map(world.npcs.map((npc) => [npc?.id, npc]).filter(([id]) => id));
    draft.npcs = draft.npcs.map((npc) => {
      const existing = npc?.id ? byId.get(npc.id) : null;
      if (existing && typeof existing === 'object') {
        Object.assign(existing, npc);
        return existing;
      }
      return npc;
    });
  }

  for (const key of Object.keys(world)) {
    if (!(key in draft)) delete world[key];
  }
  Object.assign(world, draft);
  return world;
}

function resolveIntent(world, intent, travel = null, check = null, routePlan = null) {
  switch (intent.type) {
    case 'observe':
      return { minutes: estimateIntentMinutes(intent.type), summary: 'осмотр', text: buildObservation(world, intent) };
    case 'wait':
      return { minutes: estimateIntentMinutes(intent.type), summary: 'ожидание', text: buildWaitResult(world) };
    case 'move':
      if (check?.required && check.degree === 'failure') {
        return {
          minutes: 15,
          summary: 'неудачная попытка движения',
          text: `${buildMoveResult(world, intent, null)} ${describeFailure(check)}`
        };
      }
      return {
        minutes: travel?.minutes ?? 45,
        summary: 'движение',
        text: buildMoveResult(world, intent, travel)
      };
    case 'return':
      return {
        minutes: travel?.minutes ?? 35,
        summary: 'возврат',
        text: travel?.text ?? 'Возврат по last_route_id сейчас невозможен.'
      };
    case 'talk':
      return {
        minutes: estimateIntentMinutes(intent.type),
        summary: 'разговор',
        text: appendCheck(
          intent.routeInquiry
            ? buildRouteInquiryResult(world, intent, routePlan)
            : buildTalkResult(world, intent),
          check
        )
      };
    case 'rest':
      return { minutes: estimateIntentMinutes(intent.type), summary: 'отдых', text: buildRestResult(world) };
    case 'heal':
      return resolveTreatment(world, intent, check);
    case 'defend':
      return { minutes: estimateIntentMinutes(intent.type), summary: 'оборона', text: appendCheck(buildDefendResult(world, intent), check) };
    case 'flee':
      return {
        minutes: travel?.minutes ?? 10,
        summary: 'побег',
        text: appendCheck(
          travel?.ok
            ? `${buildFleeResult(world, intent)} ${travel.text}`
            : buildFleeResult(world, intent),
          check
        )
      };
    case 'trade':
      return { minutes: estimateIntentMinutes(intent.type), summary: 'торг', text: appendCheck(buildTradeResult(world, intent), check) };
    case 'steal':
      return { minutes: estimateIntentMinutes(intent.type), summary: 'кража', text: appendCheck(buildStealResult(world, intent), check) };
    case 'attack':
      return { minutes: estimateIntentMinutes(intent.type), summary: 'насилие', text: appendCheck(buildAttackResult(world), check) };
    case 'claim':
      return { minutes: estimateIntentMinutes(intent.type), summary: 'сомнительное утверждение', text: appendCheck(buildClaimResult(world, intent), check) };
    default:
      if (isInventoryIntent(intent.type)) {
        const itemResult = resolveItemAction(world, intent, check);
        return {
          minutes: itemResult.minutes ?? estimateIntentMinutes(intent.type),
          summary: itemResult.summary,
          text: appendCheck(itemResult.text, check)
        };
      }
      if (intent.routeInquiry) {
        return {
          minutes: estimateIntentMinutes(intent.type),
          summary: 'спрос о дороге',
          text: appendCheck(buildRouteInquiryResult(world, intent, routePlan), check)
        };
      }
      return { minutes: estimateIntentMinutes(intent.type), summary: 'неясное намерение', text: buildAmbiguousResult(world) };
  }
}

function appendCheck(text, check) {
  if (!check?.required) return text;
  return `${text}\n${describeCheckOutcome(check)}`;
}

function describeFailure(check) {
  if (!check?.required) return '';
  if (check.degree === 'failure') return 'Проверка провалена, и мир не подстраивается под желание.';
  if (check.degree === 'partial') return 'Получается лишь частично, и цена этого заметна сразу.';
  return '';
}

export function buildMechanicsProposal(world, plan, intent, check) {
  const preview = structuredClone(world);
  const routePlan = plan.frame.travel?.routeReconstruction ?? null;
  if (shouldRecordRouteReconstruction(intent, routePlan)) {
    recordRouteReconstruction(preview, routePlan);
  }
  const travel = (intent.type === 'move' || intent.type === 'flee' || intent.type === 'return') && (!check.required || check.degree !== 'failure')
    ? (intent.type === 'return'
      ? travelReturn(preview)
      : travelWorld(preview, intent.target || intent.raw, routePlan))
    : null;
  const resolution = resolveIntent(preview, intent, travel, check, routePlan);
  const combatTarget = resolveCombatTarget(preview, intent);
  return {
    resolution,
    travel,
    combatTarget,
    routePlan,
    proposal: {
      intent: intent?.type ?? null,
      check: check?.required
        ? { roll: check.roll, dc: check.dc, total: check.total, degree: check.degree }
        : null,
      travel: travel
        ? {
          ok: travel.ok ?? null,
          minutes: travel.minutes ?? null,
          estimatedMinutes: travel.minutes ?? null,
          destinationId: preview.current_position?.location_id ?? null
        }
        : null,
      minutes: resolution.minutes ?? null,
      summary: resolution.summary ?? null
    }
  };
}

function applyMechanicsAfterMaster(world, mechanics, plan, intent, check) {
  world.combat_exertion_applied = false;
  const { resolution, routePlan } = mechanics;
  if (shouldRecordRouteReconstruction(intent, routePlan)) {
    recordRouteReconstruction(world, routePlan);
  }
  if ((intent.type === 'move' || intent.type === 'flee' || intent.type === 'return') && (!check.required || check.degree !== 'failure')) {
    if (intent.type === 'return') {
      travelReturn(world);
    } else {
      travelWorld(world, intent.target || intent.raw, routePlan);
    }
  }
  const combatTarget = resolveCombatTarget(world, intent);
  applyCombatOutcome(world, intent, check, resolution, combatTarget, plan.frame.world.combat ?? null);
  const legalAftermath = summarizeLegalAftermath(world, intent, check, summarizeBattleAftermath(world, intent, plan.frame.world.combat ?? null, world.lastCombatOutcome ?? null));
  advanceWorld(world, resolution.minutes, intent);
  applyBattleExertion(world, intent, plan.frame.world.combat ?? null);
  applySocialConsequence(world, intent, resolution.text, legalAftermath);
  if (intent?.type === 'claim' && intent.raw) {
    if (!Array.isArray(world.player.claims)) world.player.claims = [];
    if (!world.player.claims.includes(intent.raw)) {
      world.player.claims.push(intent.raw);
    }
  }
  if (intent?.type === 'heal') {
    resolveTreatment(world, intent, check);
  }
  world.lastCombatAftermath = summarizeBattleAftermath(world, intent, plan.frame.world.combat ?? null, world.lastCombatOutcome ?? null);
  world.lastLegalAftermath = legalAftermath;
  if (!world.memory.masterNotes) world.memory.masterNotes = [];
  world.memory.masterNotes.unshift(plan.summary);
  world.memory.masterNotes = world.memory.masterNotes.slice(0, 20);
  return { combatTarget };
}

// ponytail: legacy alias for tests migrating off simulateTurnMechanics
export function simulateTurnMechanics(world, plan, intent, check) {
  const mechanics = buildMechanicsProposal(world, plan, intent, check);
  const draft = structuredClone(world);
  applyMechanicsAfterMaster(draft, mechanics, plan, intent, check);
  return { ...mechanics, draft };
}

function shouldRecordRouteReconstruction(intent, reconstruction) {
  if (!reconstruction) return false;
  if (!intent) return false;
  if (intent.type === 'move' || intent.type === 'flee') return true;
  if (intent.routeInquiry) return true;
  return false;
}

function resolveTreatment(world, intent, check) {
  const target = resolveTreatmentTarget(world, intent);
  const provider = target.kind === 'npc' ? findHealerNpc(world) ?? world.player : world.player;
  const supplies = pickMedicalSupplies(provider);
  const fieldCare = applyFieldCare(target.entity, supplies, check?.degree === 'success' ? 'strong' : 'normal');
  const labels = inferUsedMedicalItems(supplies, target.entity);
  const consumed = consumeMedicalSupplies(provider, labels);
  const targetName = target.kind === 'npc' ? target.entity.name : 'твоё тело';
  const sourceName = provider?.name ?? 'никто';

  if (target.kind === 'npc' && Array.isArray(target.entity.notes)) {
    target.entity.notes.unshift(`Лечение проведено: ${fieldCare.notes.join('; ') || 'без осложнений'}.`);
    target.entity.notes = target.entity.notes.slice(0, 6);
  }

  if (target.kind === 'npc' && target.entity.health !== undefined) {
    target.entity.mood = target.entity.bleeding > 0 ? 'недоверчив' : 'ослаблен';
  }

  if (target.kind === 'player' && fieldCare.notes.length > 0) {
    if (!Array.isArray(world.player.notes)) world.player.notes = [];
    world.player.notes.unshift(`Лечение: ${fieldCare.notes.join('; ')}`);
    world.player.notes = world.player.notes.slice(0, 6);
  }

  return {
    minutes: 30,
    summary: 'лечение',
    text: appendCheck(
      [
        buildTreatResult(world, intent),
        target.kind === 'npc'
          ? `Ты лечишь ${targetName}.`
          : `Ты лечишь себя.`,
        consumed.length > 0 ? `Израсходовано: ${consumed.join(', ')}.` : 'Лечение проводится без расхода заметных запасов.',
        `Источник ухода: ${sourceName}.`,
        fieldCare.notes.length > 0 ? fieldCare.notes.join(' ') : 'Уход ограничен тем, что есть под рукой.'
      ].join(' '),
      check
    )
  };
}

function resolveTreatmentTarget(world, intent) {
  if (intent?.target) {
    const targetName = intent.target.toLowerCase();
    const npc = (world.npcs ?? []).find((item) => item.name.toLowerCase().includes(targetName) || targetName.includes(item.name.toLowerCase()));
    if (npc) return { kind: 'npc', entity: npc };
  }
  return { kind: 'player', entity: world.player };
}

function inferUsedMedicalItems(supplies, targetEntity) {
  const labels = [];
  const itemLabels = (Array.isArray(supplies) ? supplies : []).map((item) => String(item?.label ?? item).toLowerCase());
  if (itemLabels.some((item) => /бинт|повяз|полотн|ткан|лен/i.test(item))) labels.push('чистая ткань');
  if (itemLabels.some((item) => /вода|вино|уксус/i.test(item))) labels.push('вода');
  if (itemLabels.some((item) => /трав|мёд|мед/i.test(item))) labels.push('травы');
  if ((targetEntity?.injuries?.length ?? 0) > 0 && itemLabels.some((item) => /палк|шина|кож/i.test(item))) labels.push('шина');
  return labels;
}

function queueCombatMechanicalCandidate(world, payload) {
  if (!Array.isArray(world.pendingMechanicalDiffs)) world.pendingMechanicalDiffs = [];
  world.pendingMechanicalDiffs.unshift({
    source: 'mechanics',
    requires_semantic_confirmation: true,
    at: world.clock ? { ...world.clock } : null,
    ...payload
  });
  world.pendingMechanicalDiffs = world.pendingMechanicalDiffs.slice(0, 24);
}

function mechanicalInjuryLabel(severity = 1) {
  return `injury_severity_${severity}`;
}

function applyCombatOutcome(world, intent, check, resolution, combatTarget = null, combatFrame = null) {
  if (!intent) return;
  world.lastCombatOutcome = null;

  if (intent.type === 'attack') {
    if (check?.degree === 'success') {
      const impact = resolveAttackImpact(world, intent, check, combatTarget, combatFrame);
      world.lastCombatOutcome = impact;
      if (impact.healthLoss > 0) {
        const injuryPayload = {
          id: `injury:${Date.now()}:target`,
          label: allowsProceduralSemantics(world)
            ? (combatTarget?.name
              ? `рана после атаки ${combatTarget.name}`
              : (intent.target ? `рана после атаки ${intent.target}` : 'рана после удара'))
            : mechanicalInjuryLabel(impact.injury?.severity ?? 2),
          severity: impact.injury?.severity ?? 1,
          bleeding: impact.injury?.bleeding ?? 0,
          healthLoss: impact.healthLoss,
          source: 'attack',
          at: { ...world.clock }
        };
        queueCombatMechanicalCandidate(world, {
          type: 'combat_damage_candidate',
          target_id: combatTarget?.id ?? null,
          damage_score: impact.damageScore,
          health_loss: impact.healthLoss,
          injury_severity: impact.injury?.severity ?? 1,
          injury_candidate: injuryPayload
        });
        if (allowsProceduralSemantics(world)) {
          woundTargetNpc(world, combatTarget, injuryPayload);
          recordCombatTraces(world, intent, combatTarget, combatFrame);
        } else {
          queueSemanticPending(world, 'combat_injury_label', {
            target_id: combatTarget?.id ?? null,
            damage_score: impact.damageScore,
            injury_severity: impact.injury?.severity ?? 1
          });
        }
      }
    } else if (check?.degree === 'partial') {
      world.lastCombatOutcome = {
        damageScore: 0,
        healthLoss: 0,
        injury: null,
        focus: combatFrame?.attackFocus ?? null
      };
    } else if (check?.degree === 'failure') {
      const margin = Number(check?.total ?? 0) - Number(check?.dc ?? 0);
      const heavyFailure = margin <= -5 || Number(check?.roll ?? 0) === 1;
      world.lastCombatOutcome = {
        damageScore: heavyFailure ? 1 : 0,
        healthLoss: heavyFailure ? 5 : 0,
        injury: heavyFailure ? {
          severity: 2,
          bleeding: 1,
          healthLoss: 5,
          label: allowsProceduralSemantics(world) ? 'ушиб после неудачной атаки' : mechanicalInjuryLabel(2)
        } : null,
        focus: combatFrame?.attackFocus ?? null
      };
      if (heavyFailure) {
        const playerInjury = {
          id: `injury:${Date.now()}:wound`,
          label: allowsProceduralSemantics(world) ? 'полученная в бою рана' : mechanicalInjuryLabel(2),
          severity: 2,
          bleeding: 1,
          healthLoss: 5,
          source: 'failed-attack',
          at: { ...world.clock }
        };
        queueCombatMechanicalCandidate(world, {
          type: 'combat_damage_candidate',
          target_id: 'player',
          damage_score: 1,
          health_loss: 5,
          injury_severity: 2,
          injury_candidate: playerInjury
        });
        if (allowsProceduralSemantics(world)) {
          addInjury(world, playerInjury, true);
        }
      }
    }
  }

  if (intent.type === 'defend') {
    world.lastCombatOutcome = {
      damageScore: 0,
      healthLoss: 0,
      injury: null,
      focus: combatFrame?.attackFocus ?? null
    };
    if (check?.degree === 'success') {
      reduceBleeding(world, 1);
    } else if (check?.degree === 'partial') {
      maybeAddBruise(world, 1);
    } else {
      maybeAddBruise(world, 2);
    }
  }

  if (intent.type === 'flee') {
    world.lastCombatOutcome = {
      damageScore: 0,
      healthLoss: 0,
      injury: null,
      focus: combatFrame?.attackFocus ?? null
    };
    if (check?.degree === 'failure') {
      const fleeInjury = {
        id: `injury:${Date.now()}:flee`,
        label: allowsProceduralSemantics(world) ? 'рана при попытке бегства' : mechanicalInjuryLabel(1),
        severity: 1,
        bleeding: 1,
        source: 'flee',
        at: { ...world.clock }
      };
      queueCombatMechanicalCandidate(world, {
        type: 'combat_damage_candidate',
        target_id: 'player',
        damage_score: 0,
        health_loss: 1,
        injury_severity: 1,
        injury_candidate: fleeInjury
      });
      if (allowsProceduralSemantics(world)) {
        addInjury(world, fleeInjury, true);
      }
    } else if (check?.degree === 'success') {
      reduceBleeding(world, 1);
    }
  }

  if (intent.type === 'heal') {
    if (check?.degree === 'success') {
      reduceBleeding(world, 2);
      treatOldestInjury(world);
    } else if (check?.degree === 'partial') {
      reduceBleeding(world, 1);
      treatOldestInjury(world, true);
    }
  }
}

export function resolveCombatTarget(world, intent) {
  const targetText = String(intent?.target ?? '').trim().toLowerCase();
  const npcs = Array.isArray(world.npcs) ? world.npcs : [];
  const currentLocationId = getCurrentLocation(world)?.id ?? world.current_position?.location_id ?? world.place?.id ?? null;
  if (targetText) {
    const explicitTarget = npcs.find((npc) => {
      const name = String(npc?.name ?? '').toLowerCase();
      return Boolean(name) && (name.includes(targetText) || targetText.includes(name));
    });
    if (explicitTarget) return explicitTarget;
  }

  if (!currentLocationId) return null;

  const nearbyTarget = npcs.find((npc) => {
    if (!npc) return false;
    const npcLocationId = npc.current_position?.location_id ?? npc.locationId ?? npc.homeLocation ?? null;
    return npcLocationId === currentLocationId;
  });

  return nearbyTarget ?? null;
}

function addInjury(world, injury, bleeding = false) {
  if (!Array.isArray(world.player.injuries)) world.player.injuries = [];
  if (!world.player.injuries.some((item) => item.id === injury.id)) {
    world.player.injuries.unshift(injury);
  }
  if (bleeding) {
    world.player.bleeding = Math.max(world.player.bleeding ?? 0, injury.bleeding ?? 1);
  }
  const healthLoss = Number(injury.healthLoss ?? injury.loss ?? injury.severity ?? 1);
  world.player.health = Math.max(0, (world.player.health ?? 100) - Math.max(1, healthLoss));
  if (!world.player.states || typeof world.player.states !== 'object') {
    world.player.states = {};
  }
  world.player.states.health = world.player.health;
  if (world.player.body && typeof world.player.body === 'object') {
    world.player.body.health = world.player.health;
  }
  if (world.player.needs && typeof world.player.needs === 'object') {
    world.player.needs.health = world.player.health;
  }
  mirrorBodyStateFields(world.player);
  const currentFear = getActiveStateValue(world.player, 'fear') ?? 0;
  upsertActiveState(world.player, 'fear', 'страх', Math.min(100, currentFear + 4), 'derived');
  mirrorBodyStateFields(world.player);
}

function reduceBleeding(world, amount) {
  world.player.bleeding = Math.max(0, (world.player.bleeding ?? 0) - amount);
}

function treatOldestInjury(world, partial = false) {
  if (!Array.isArray(world.player.injuries) || world.player.injuries.length === 0) return;
  const injury = world.player.injuries[0];
  injury.treated = true;
  injury.bleeding = Math.max(0, (injury.bleeding ?? 0) - (partial ? 0 : 1));
  injury.severity = Math.max(0, (injury.severity ?? 1) - (partial ? 0 : 1));
  if (injury.severity === 0) {
    world.player.injuries.shift();
  }
}

function maybeAddBruise(world, severity) {
  addInjury(world, {
    id: `injury:${Date.now()}:bruise`,
    label: allowsProceduralSemantics(world) ? 'ушиб и синяк' : mechanicalInjuryLabel(severity),
    severity,
    bleeding: 0,
    source: 'defend-or-flee',
    at: { ...world.clock }
  }, false);
}

function woundTargetNpc(world, npc, injury) {
  if (!npc) return false;
  if (!Array.isArray(npc.injuries)) npc.injuries = [];
  npc.injuries.unshift(injury);
  npc.bleeding = Math.max(npc.bleeding ?? 0, injury.bleeding ?? 0);
  const healthLoss = Number(injury.healthLoss ?? injury.loss ?? injury.severity ?? 1);
  npc.health = Math.max(0, (npc.health ?? 100) - Math.max(1, healthLoss));
  if (!npc.states || typeof npc.states !== 'object') {
    npc.states = {};
  }
  npc.states.health = npc.health;
  if (npc.body && typeof npc.body === 'object') {
    npc.body.health = npc.health;
  }
  if (npc.needs && typeof npc.needs === 'object') {
    npc.needs.health = npc.health;
  }
  mirrorBodyStateFields(npc);
  if (!Array.isArray(npc.notes)) npc.notes = [];
  if (allowsProceduralSemantics(world)) {
    npc.notes.unshift(`Рана: ${injury.label}`);
    npc.notes = npc.notes.slice(0, 6);
  }
  npc.mood = 'ранен';
  return true;
}

function recordCombatTraces(world, intent, combatTarget, combatFrame = null) {
  const equipment = summarizeCombatEquipment(world.player ?? {}, 'attack', combatFrame?.attackFocus ?? null);
  const usedWeapon = Array.isArray(equipment.items) && equipment.items.length > 0 ? equipment.items[0]?.item : null;
  if (usedWeapon) {
    markCombatItemTrace(world.player, usedWeapon, combatTarget);
  }
  recordLocationCombatTrace(world, intent, combatTarget);
}

function markCombatItemTrace(player, usedWeapon, combatTarget) {
  const targetName = typeof combatTarget?.name === 'string' && combatTarget.name.trim()
    ? combatTarget.name.trim()
    : 'противника';
  const trace = `кровь после удара по ${targetName}`;
  addItemMark(usedWeapon, trace);

  const weaponId = typeof usedWeapon.id === 'string' ? usedWeapon.id : null;
  if (!weaponId) return;
  for (const collection of Object.values(player?.items ?? {})) {
    if (!Array.isArray(collection)) continue;
    for (const item of collection) {
      if (item && item !== usedWeapon && item.id === weaponId) {
        addItemMark(item, trace);
      }
    }
  }
}

function addItemMark(item, mark) {
  if (!item || typeof item !== 'object') return;
  if (!Array.isArray(item.marks)) item.marks = [];
  if (!item.marks.includes(mark)) item.marks.push(mark);
  item.visible = item.visible !== false;
}

function recordLocationCombatTrace(world, intent, combatTarget) {
  const location = getCurrentLocation(world);
  if (!location) return;
  if (!Array.isArray(location.recentTraces)) location.recentTraces = [];
  const targetName = typeof combatTarget?.name === 'string' && combatTarget.name.trim()
    ? combatTarget.name.trim()
    : (typeof intent?.target === 'string' && intent.target.trim() ? intent.target.trim() : 'противником');
  location.recentTraces.unshift({
    text: `следы крови и борьбы после удара по ${targetName}`,
    at: { ...world.clock }
  });
  location.recentTraces = location.recentTraces.slice(0, 12);
}

function resolveAttackImpact(world, intent, check, combatTarget, combatFrame) {
  const playerWeaponProfile = summarizeWeaponDanger(world.player ?? {});
  const focus = combatFrame?.attackFocus ?? deriveAttackFocus(intent, { input: intent?.raw ?? '' });
  const targetArmorProfile = combatFrame?.target?.armorProtection !== undefined
    ? { value: Number(combatFrame.target.armorProtection) || 0, label: String(combatFrame.target.armorLabel ?? 'нет') }
    : summarizeArmorProtection(combatTarget ?? {}, focus);
  const vulnerability = combatFrame?.target
    ? Number(combatFrame.target.vulnerability ?? summarizeCombatVulnerability(combatTarget ?? {}))
    : summarizeCombatVulnerability(combatTarget ?? {});
  const margin = Number(check?.total ?? 0) - Number(check?.dc ?? 0);
  const quality = combatQualityFromMargin(margin);
  let damageScore = Math.max(0, quality + playerWeaponProfile.value + vulnerability - targetArmorProfile.value);
  const shieldProfile = summarizeActiveDefense(combatTarget ?? {}, focus);
  const hitAbsorbedByShield = Boolean(
    combatFrame?.hit_absorbed_by_shield
    ?? (shieldProfile.shield_ready && focus.direction === 'front' && (focus.zone === 'body' || focus.zone === 'arms'))
  );
  if (hitAbsorbedByShield) {
    damageScore = Math.max(0, damageScore - 2);
  }
  const injury = combatInjuryProfileFromDamageScore(damageScore);
  const healthLoss = combatHealthLossFromDamageScore(damageScore);

  return {
    quality,
    weaponDanger: playerWeaponProfile.value,
    vulnerability,
    armorProtection: targetArmorProfile.value,
    shieldReduction: hitAbsorbedByShield ? 2 : 0,
    damageScore,
    healthLoss,
    injury,
    focus
  };
}

function applyBattleExertion(world, intent, combatFrame = null) {
  if (world.combat_exertion_applied) return;
  const exertion = summarizeBattleExertion(world, intent, combatFrame);
  if (!exertion || exertion.value <= 0) return;
  if (!world.player.states || typeof world.player.states !== 'object') {
    world.player.states = {};
  }
  const currentVigor = Number(world.player.states.vigor ?? world.player.vigor ?? 100);
  const nextVigor = Math.max(0, currentVigor - exertion.value);
  world.player.states.vigor = nextVigor;
  if (world.player.body && typeof world.player.body === 'object') {
    world.player.body.vigor = nextVigor;
  }
  world.player.vigor = nextVigor;
  world.combat_exertion_applied = true;
  mirrorBodyStateFields(world.player);
}
