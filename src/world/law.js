import { buildHistoricalContext } from './historical-context.js';

export function buildLegalContext(world) {
  const historical = buildHistoricalContext(world);
  const status = normalizeStatus(world.player?.status);
  const authority = pickAuthority(world);
  const recentAftermath = world.lastLegalAftermath ?? null;

  return {
    era: historical.era,
    year: historical.year,
    authority,
    status,
    standing: statusStanding(status),
    rules: [
      ...historical.lawContext.slice(0, 4),
      `Player standing: ${statusStanding(status)}.`,
      'Witnesses, household, and ownership determine whether an act is treated as tolerated, disputed, or punishable.'
    ],
    punishments: historical.punishmentContext.slice(0, 3),
    ownershipRule: 'Known property belongs to its owner unless transferred or abandoned in a way the world can witness.',
    witnessRule: 'A witnessed act is harder to deny and more costly to explain.',
    propertyRisk: 'Taking visible property from a known owner usually triggers suspicion, restitution, and retaliation.',
    recentAftermath
  };
}

export function assessLegalPressure(world, intent, check = null, combatAftermath = null) {
  const context = buildLegalContext(world);
  const witnesses = world.social?.recentWitnesses?.length ?? 0;
  const playerStatus = normalizeStatus(world.player?.status);
  const carriedPropertyRisk = assessCarriedPropertyRisk(world.player, intent);
  const locationAccessRisk = assessLocationAccessRisk(world, intent);
  const severity = calculateSeverity(intent, witnesses, playerStatus, check, combatAftermath, carriedPropertyRisk, locationAccessRisk);
  return {
    context,
    severity,
    label: severityLabel(severity),
    consequences: consequencesForSeverity(severity, context)
  };
}

export function summarizeLegalAftermath(world, intent, check = null, combatAftermath = null) {
  const action = String(intent?.type ?? '').toLowerCase();
  if (!['attack', 'defend', 'flee', 'steal', 'claim'].includes(action) && !combatAftermath) {
    return null;
  }

  const assessment = assessLegalPressure(world, intent, check, combatAftermath);
  const suspicion = Math.max(
    0,
    assessment.severity
      + Math.max(0, Number(combatAftermath?.suspicion ?? 0))
      + (Number(combatAftermath?.witnessed ?? 0) > 0 ? 1 : 0)
      + (Number(combatAftermath?.fear ?? 0) > 0 ? 1 : 0)
  );

  return {
    label: assessment.label,
    severity: assessment.severity,
    suspicion,
    fear: Math.max(0, Number(combatAftermath?.fear ?? 0)),
    debts: Math.max(0, Number(combatAftermath?.debts ?? 0)),
    rumors: Math.max(0, Number(combatAftermath?.rumors ?? 0)),
    witnessed: Boolean(combatAftermath?.witnessed),
    consequences: assessment.consequences,
    context: assessment.context
  };
}

function calculateSeverity(intent, witnesses, status, check, combatAftermath, carriedPropertyRisk = 0, locationAccessRisk = 0) {
  let severity = 0;
  if (intent.type === 'attack') severity += 3;
  if (intent.type === 'claim') severity += 1;
  if (intent.type === 'trade') severity += 1;
  if (intent.type === 'steal') severity += 4;
  if (witnesses > 0) severity += 1;
  if (status === 'чужой') severity += 1;
  if (check?.required && check.degree === 'failure') severity += 1;
  severity += carriedPropertyRisk;
  severity += locationAccessRisk;
  if (combatAftermath) {
    if (combatAftermath.witnessed) severity += 1;
    if (Number(combatAftermath.suspicion ?? 0) > 1) severity += 1;
    if (Number(combatAftermath.fear ?? 0) > 0) severity += 1;
    if (Number(combatAftermath.rumors ?? 0) > 0) severity += 1;
    if (Number(combatAftermath.damageScore ?? 0) >= 4 || Number(combatAftermath.healthLoss ?? 0) >= 12) severity += 1;
  }
  return Math.max(0, Math.min(4, severity));
}

function assessLocationAccessRisk(world, intent) {
  const action = String(intent?.type ?? '').trim().toLowerCase();
  if (!['claim', 'trade', 'talk', 'move', 'steal', 'attack'].includes(action)) return 0;

  const accessText = `${world?.scene?.access ?? ''} ${world?.scene?.accessRules?.join(' ') ?? ''}`.toLowerCase();
  if (!accessText.trim()) return 0;

  if (/(закрыт|закрыто|по приглаш|по разреш|дозвол|под надзор|сторож|контрол|чужого сперва расспрашивают)/i.test(accessText)) {
    return 1;
  }
  return 0;
}

function assessCarriedPropertyRisk(player, intent) {
  const action = String(intent?.type ?? '').trim().toLowerCase();
  if (!['claim', 'trade', 'talk', 'move', 'flee'].includes(action)) return 0;

  const items = player?.items && typeof player.items === 'object' ? player.items : {};
  const carried = [
    ...(Array.isArray(items.carried_items) ? items.carried_items : []),
    ...(Array.isArray(items.borrowed_items) ? items.borrowed_items : []),
    ...(Array.isArray(items.foreign_items_with_character) ? items.foreign_items_with_character : [])
  ];

  const riskyItem = carried.find((item) => isDisputedOrForeignItem(item));
  return riskyItem ? 1 : 0;
}

function isDisputedOrForeignItem(item) {
  if (!item || typeof item !== 'object') return false;
  const access = String(item.access ?? '').trim().toLowerCase();
  const legalStatus = String(item.legal_status ?? item.legalStatus ?? '').trim().toLowerCase();
  const ownerId = String(item.owner_id ?? item.ownerId ?? '').trim();
  const holderId = String(item.holder_id ?? item.holderId ?? '').trim();

  if (access === 'borrowed' || access === 'held_for_others' || access === 'restricted') return true;
  if (legalStatus === 'disputed' || legalStatus === 'restricted') return true;
  if (ownerId && holderId && ownerId !== holderId) return true;
  return false;
}

function severityLabel(severity) {
  if (severity >= 4) return 'severe';
  if (severity >= 3) return 'hard';
  if (severity >= 2) return 'moderate';
  if (severity >= 1) return 'light';
  return 'none';
}

function consequencesForSeverity(severity, context) {
  if (severity === 0) return ['No legal consequence beyond ordinary scrutiny.'];
  if (severity === 1) return [context.punishments[0], 'Social memory is the main cost.'];
  if (severity === 2) return [context.punishments[1], 'Reputation and access can shrink immediately.'];
  if (severity === 3) return [context.punishments[2], 'Household or local authority may intervene.'];
  return ['Retaliation, seizure, arrest, or expulsion are plausible.'];
}

function pickAuthority(world) {
  const region = world.region ?? {};
  const politics = Array.isArray(region.politics) ? region.politics : [];
  if (politics.length > 0) return politics[0];
  return 'местный староста и домохозяин';
}

function normalizeStatus(status) {
  return String(status ?? 'чужой').toLowerCase();
}

function statusStanding(status) {
  if (/свой|местн|дом|род/.test(status)) return 'protected';
  if (/торг|куп/.test(status)) return 'commercial';
  if (/чуж|проезж/.test(status)) return 'vulnerable';
  if (/служ|завис|подмаст/.test(status)) return 'dependent';
  return 'ordinary';
}
