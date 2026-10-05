import { buildStage22NarratorInput, buildStage23AuditInput,
  validateStage23CommitHandoff, SELF_CHECK_FIELDS, STAGE23_CONCERN_CODES,
  STAGE23_REQUIRED_CHECKS,
  buildNarratorStartCodePrecheck, validateNarratorStartingProseOutput,
  buildNarratorProseCodePrecheck, validateNarratorProseAudit } from
  '@rus/new-game';
import { computeVisibleContextPackageDigest } from '@rus/contracts';
import { adaptApprovedOpeningNarration } from '@rus/narration';
import { serverError } from '../errors.js';
import { GAMEPLAY_LLM_CALL_TIMEOUT_MS } from './llm-turn-budget.js';
import { buildOpeningRejectionSnapshot } from './opening-rejection-snapshot.js';

const WRITER = `Верните только {"prose":"<полное вступление>"}. Напишите 2–4 связанных
абзаца сдержанной литературной прозы на русском языке во втором лице. Используйте только
переданный player-safe visible_context_package. Охватите каждую переданную запись must_include.
Неуказанные история, цели, обязанности, люди, строения и маршруты остаются неупомянутыми;
пустой список наблюдений не означает, что место пусто или тихо.
Свяжите переданные факты в сцену, а не в досье, журнал заданий,
список, меню команд или отчёт о состоянии. opening source_hint — лишь необязательная опора,
это не вся сцена. Не упоминайте предметы, людей, маршруты, звуки, погоду, воспоминания или
действия, которых нет в переданных сохранённых источниках.`;

const AUDITOR = `Верните только {"pass":<boolean>,"failed_checks":["<обязательная проверка>"],"concerns":[{"code":"<допустимый код>","severity":"warning|repairable|hard_block|upstream_block","message":"<причина>"}],"evidence":["<обоснованное свидетельство>"]}. Проверяйте вступление по visible_context_package, а не по правдоподобию. Оцените каждую обязательную проверку. В failed_checks могут появляться только эти точные названия фактических/технических проверок: ${STAGE23_REQUIRED_CHECKS.filter((key) => key !== 'literary_composition_check').join(', ')}. В concerns могут появляться только эти точные коды: ${STAGE23_CONCERN_CODES.join(', ')}. Перечисляйте только проваленные проверки, не проверки, которые пройдены, и не названия требований. Если провалена только литературная композиция, верните pass=true и failed_checks=[]. Установите pass=false, только если failed_checks называет проваленную фактическую или техническую проверку и concerns содержит соответствующее фактическое или техническое замечание. Не пропускайте pass, failed_checks или concerns; при pass=true не должно быть блокирующих проваленных проверок или замечаний. Отклоняйте фактические, скрытые, покрытие, технические или агентные дефекты. Если найдена только литературная проблема, досье, перечень или слабая композиция, сообщите NARRATOR_PROSE_WEAK_LITERARY_COMPOSITION в concerns; хост выводит literary_composition_check из этого замечания. Не помещайте literary_composition_check в failed_checks. Литературные замечания не меняют pass на false, когда все блокирующие проверки пройдены. Неподтверждённый отрицательный факт в прозе — это провал фактической проверки must_not_include_check: pass=false с NARRATOR_PROSE_MUST_NOT_INCLUDE_VIOLATION. Используйте severity repairable, если переписывание прозы по тому же видимому пакету может устранить дефект; используйте hard_block или upstream_block, если дефект нельзя исправить одной прозой. Используйте warning только для литературных замечаний. Свидетельства должны быть краткими и непустыми. Не переписывайте прозу и не включайте закрытое состояние.`;

const REPAIR_SEVERITY_LABELS = Object.freeze({
  warning: 'литературное замечание',
  repairable: 'исправимо по тем же фактам',
  hard_block: 'нужна проверка исходных данных',
  upstream_block: 'нужна правка исходной проекции'
});

const NPC_TRANSLATIONS = Object.freeze({
  sex: { male: 'мужчина', female: 'женщина' },
  age: { young: 'молодой', young_adult: 'молодой', adult: 'взрослый',
    middle_aged: 'средних лет', old: 'пожилой' },
  age_female: { young: 'молодая', young_adult: 'молодая', adult: 'взрослая',
    middle_aged: 'средних лет', old: 'пожилая' },
  build: { slim: 'стройное', lean: 'стройное', average: 'обычное', stocky: 'крепкое' },
  skin_tone: { pale: 'бледная', light: 'светлая', warm: 'смуглая',
    brown: 'коричневая' },
  face_shape: { oval: 'овальные', round: 'круглые', broad: 'широкие',
    angular: 'угловатые', long: 'вытянутые' },
  eye_color: { blue: 'голубые', gray: 'серые', green: 'зелёные',
    brown: 'карие', dark: 'тёмные' },
  hair_color: { blond: 'русые', light_brown: 'светло-каштановые',
    dark_brown: 'тёмно-каштановые', black: 'чёрные', auburn: 'рыжие',
    gray: 'седые', white: 'белые' },
  hair_length: { bald: 'лысина', short: 'короткие', medium: 'средней длины',
    long: 'длинные' },
  hair_style: { straight: 'прямые', wavy: 'волнистые', loose: 'распущенные',
    braided: 'заплетённые' },
  facial_hair: { none: null, moustache: 'усы', short_beard: 'короткая борода',
    full_beard: 'густая борода' },
  clothing_fabric: { light_linen: 'тонкий лён', wool: 'шерсть',
    undyed_linen: 'неокрашенный лён', coarse_wool: 'грубая шерсть',
    furred: 'мех', leather: 'кожа' },
  clothing_color: { undyed_linen: 'цвета неокрашенного льна',
    dark_blue: 'тёмно-синего цвета', forest_green: 'зелёного цвета',
    madder_red: 'красного цвета', ochre: 'охряного цвета',
    brown: 'коричневого цвета', charcoal: 'угольно-серого цвета',
    blue: 'синего цвета', gray: 'серого цвета', red: 'красного цвета',
    white: 'белого цвета', black: 'чёрного цвета' },
  neckline: { not_applicable: null, round: 'круглый вырез',
    slit_round: 'круглый вырез с разрезом', v_slit: 'V-образный вырез с разрезом',
    high_closed: 'закрытый высокий ворот' },
  sleeve: { narrow: 'узкие рукава', wide: 'широкие рукава', not_applicable: null },
  outer_form: { none: null, not_applicable: null, wrap: 'запашная верхняя одежда',
    front_open: 'распашная верхняя одежда', shoulder_drape: 'накидка на плечах',
    sleeveless_overlayer: 'верхняя одежда без рукавов',
    low_leather_shoe: 'низкие кожаные башмаки',
    straight_lower_garment: 'прямая нижняя одежда',
    'long lower-body-covering garment': 'длинная одежда, закрывающая ноги' },
  trim: { none: null, edge_band: 'отделка по краю', braid: 'тесьма',
    fur_edge: 'меховая опушка' },
  headwear: { none: null, linen_cap: 'льняная шапка',
    headscarf: 'платок', fur_hat: 'меховая шапка' },
  slot: { footwear: 'Обувь', foot_layer: 'Обмотки для ног', insole: 'Стельки',
    leg_wrap: 'Обмотки для ног', base_garment: 'Нижняя одежда',
    lower_garment: 'Одежда ниже пояса', outer_garment: 'Верхняя одежда',
    over_garment_winter: 'Зимняя верхняя одежда', outer: 'Верхняя одежда',
    cloak: 'Плащ', waist: 'Пояс', headwear: 'Головной убор' }
});

export function createAuthoredOpeningNarrationService({ roleRunner,
  llmDiagnostics = null } = {}) {
  if (typeof roleRunner?.run !== 'function') throw new TypeError(
    'Authored opening narration requires the configured role runner.');
  const role = (roleId, instruction, assemble = (output) => output) => async (input,
    feedback = null) => {
    llmDiagnostics?.turnBudget?.assertWithinDeadline?.();
    const { payload, fact_key_map: factKeyMap } =
      projectOpeningRoleInput(input, roleId);
    const call = { scope: 'turn_runtime', role_id: roleId,
      request_identity: input.request_id,
      messages: [{ role: 'system', content: feedback?.length
        ? `${instruction}\nИсправь формат предыдущего ответа аудита с ошибками: ${feedback.join(', ')}. Верни все обязательные поля.`
        : instruction },
        { role: 'user', content: JSON.stringify(payload) }],
      overrides: { temperature: roleId.includes('repair') ? 0.2 : 0 } };
    const response = await roleRunner.run(call);
    if (!response?.output || typeof response.output !== 'object') throw serverError(
      'AUTHORED_OPENING_PROVIDER_INVALID', 'Opening role returned no JSON object.',
      { status: 503 });
    llmDiagnostics?.turnBudget?.assertWithinDeadline?.();
    return assemble(response.output, input, factKeyMap);
  };
  const proseOutput = (output, input) => ({ version: 1,
    schema: 'narrator_starting_prose', request_id: input.request_id,
    prose_status: 'drafted', prose: output.prose, action_options: [],
    used_visible_context_refs: [], block_reason: null,
    self_constraints_check: Object.fromEntries(SELF_CHECK_FIELDS.map((key) =>
      [key, true])) });
  const writer = role('gameplay_narrator', WRITER, proseOutput);
  const auditOutput = (output, input, factKeyMap) => {
    factKeyMap ??= buildOpeningFactKeyMap(input.visible_context_package);
    const failed = new Set(output.failed_checks);
    const concerns = output.concerns;
    if (concerns.some(({ code }) => code ===
      'NARRATOR_PROSE_WEAK_LITERARY_COMPOSITION')) {
      failed.add('literary_composition_check');
    } else {
      failed.delete('literary_composition_check');
    }
    const pass = output.pass;
    return { version: 1, schema: 'narrator_prose_audit',
      request_id: input.request_id, pass,
      checks: Object.fromEntries(STAGE23_REQUIRED_CHECKS.map((key) => [key,
        { pass: !failed.has(key) }])), concerns,
      evidence: mapEvidenceKeys(output.evidence, factKeyMap),
      repair_route: null,
      commit_permission: { can_show_to_player: pass,
        can_write_player_visible_message: pass,
        can_mark_opening_scene_presented: pass } };
  };
  const auditor = role('gameplay_narrator_auditor', AUDITOR);
  const semanticRepairer = role('gameplay_narrator_semantic_repair',
    `${WRITER} Исправьте каждое переданное замечание Stage 23.`, proseOutput);
  // A STAGE23_HANDOFF_* refusal follows an audit that still fails after the one semantic repair.
  // The repair is claimed once per request, so the second attempt runs without it: it delivers
  // or fails with the audit's own concerns, which are not retried. Two attempts is the ceiling.
  const OPENING_AUDIT_OUTER_ATTEMPTS = 2;
  return Object.freeze({
    async run({ partyId, requestId, visibleContextPackage,
      visibleContextApproval, initialMaterializationGaps = [] }) {
      const execute = async () => {
        if (Array.isArray(initialMaterializationGaps) && initialMaterializationGaps.length > 0) {
          try {
            llmDiagnostics?.recordGameplayTrace?.({
              event: 'initial_materialization_presence_gaps',
              presence_gaps: structuredClone(initialMaterializationGaps)
            });
          } catch { /* Diagnostics must not affect opening. */ }
        }
        const repair = { spent: false };
        for (let attempt = 0; attempt < OPENING_AUDIT_OUTER_ATTEMPTS; attempt += 1) {
          try {
            return await runBoundedOpening({ requestId,
              visibleContextPackage, visibleContextApproval, writer, auditor,
              auditOutput, semanticRepairer, repair, llmDiagnostics });
          } catch (error) {
            const handoffRetry = error?.code === 'AUTHORED_OPENING_AUDIT_REJECTED'
              && Array.isArray(error?.details?.codes)
              && error.details.codes.some((code) => typeof code === 'string'
                && code.startsWith('STAGE23_'));
            if (!handoffRetry || attempt + 1 >= OPENING_AUDIT_OUTER_ATTEMPTS
              || !canAffordAnotherCall(llmDiagnostics?.turnBudget)) {
              throw error;
            }
            try {
              llmDiagnostics?.recordGameplayTrace?.({
                event: 'opening_audit_retry',
                party_id: partyId,
                request_id: requestId,
                attempt: attempt + 1,
                codes: error?.details?.codes ?? null
              });
            } catch { /* diagnostics must not affect opening */ }
          }
        }
      };
      if (typeof llmDiagnostics?.runTurn === 'function') {
        return await llmDiagnostics.runTurn({ party_id: partyId,
          request_id: requestId }, execute);
      }
      return await execute();
    }
  });
}

function projectOpeningRoleInput(input, roleId) {
  const factKeyMap = Object.create(null);
  const source = input.visible_context_package;
  const factKeyed = ['gameplay_narrator_auditor',
    'gameplay_narrator_semantic_repair'].includes(roleId);
  const sourceRefToFactKey = new Map();
  const projectedFacts = projectOpeningFacts(source);
  const projectedFactKeyMap = buildOpeningFactKeyMap(source, projectedFacts);
  const modelFacts = projectedFacts.map((fact, index) => {
    const key = `f${index + 1}`;
    if (factKeyed) {
      factKeyMap[key] = projectedFactKeyMap[key];
      for (const ref of fact.source_refs) {
        if (!sourceRefToFactKey.has(ref)) sourceRefToFactKey.set(ref, key);
      }
      return { ключ: key, текст: fact.text, npc_index: fact.npc_index };
    }
    return { текст: fact.text, npc_index: fact.npc_index };
  });
  const renderFact = (fact) => factKeyed ? {
    ключ: fact.ключ, текст: fact.текст } : fact.текст;
  const sceneFacts = modelFacts.filter((fact) => fact.npc_index == null)
    .map(renderFact);
  const people = (source?.visible_npcs ?? []).map((npc, npcIndex) => ({
    имя: typeof npc?.label === 'string' && npc.label.trim()
      ? npc.label.trim() : `Человек ${npcIndex + 1}`,
    факты: modelFacts.filter((fact) => fact.npc_index === npcIndex
      && (factKeyed || (fact.текст ?? fact.text)
        .normalize('NFC').trim().toLocaleLowerCase('ru')
          !== (typeof npc?.label === 'string' ? npc.label : `Человек ${npcIndex + 1}`)
            .normalize('NFC').trim().toLocaleLowerCase('ru')))
      .map(renderFact)
  })).filter((npc, npcIndex) =>
    modelFacts.some((fact) => fact.npc_index === npcIndex));
  const projectedPackage = {
    ...(sceneFacts.length ? { факты: sceneFacts } : {}),
    ...(people.length ? { персонажи: people } : {}),
    ...(factKeyed ? { обязательные_ключи: projectedFacts.map((_, index) => `f${index + 1}`) } : {}),
    граница: 'Каждое утверждение должно иметь опору в фактах; отсутствие сведений не доказывает отсутствие чего-либо.'
  };
  const result = { сцена: projectedPackage };
  const currentProse = input.narrator_starting_prose?.prose
    ?? input.stage22_result?.narrator_starting_prose?.prose;
  if (typeof currentProse === 'string') {
    result.проверяемая_проза = currentProse;
  }
  if (input.failed_narrator_starting_prose) {
    result.отклонённая_проза = input.failed_narrator_starting_prose.prose;
    const concerns = (input.prose_audit_concerns ?? []).map(
      ({ severity, message }) => ({
        исправимость: REPAIR_SEVERITY_LABELS[severity] ?? 'исправимость не уточнена',
        причина: sanitizeFactRefs(message, sourceRefToFactKey) }));
    const evidence = (input.prose_audit_evidence ?? []).map(
      (entry) => sanitizeFactRefs(entry, sourceRefToFactKey));
    if (concerns.length) result.замечания_проверки = concerns;
    if (evidence.length) result.свидетельства_проверки = evidence;
  }
  return { payload: result, fact_key_map: factKeyMap };
}

function buildOpeningFactKeyMap(source, projectedFacts = projectOpeningFacts(source)) {
  const result = Object.create(null);
  for (const [index, fact] of projectedFacts.entries()) {
    result[`f${index + 1}`] = {
      fact_id: fact.fact_ids[0] ?? `opening:projected:${index + 1}`,
      source_refs: fact.source_refs
    };
  }
  return result;
}

function projectOpeningFacts(source) {
  const facts = [];
  const seenByScope = new Map();
  const npcIndexByRef = new Map((source?.visible_npcs ?? []).map((npc, index) =>
    [npc?.npc_instance_id, index]).filter(([ref]) => typeof ref === 'string' && ref));
  const add = (text, factId = null, refs = [], npcIndex = null) => {
    if (typeof text !== 'string') return;
    const normalized = text.normalize('NFC').replace(/\s+/gu, ' ').trim();
    if (!normalized) return;
    const key = normalized.replace(/[.!?。！？]+$/u, '').toLocaleLowerCase('ru');
    const scope = npcIndex == null ? 'scene' : `npc:${npcIndex}`;
    const seen = seenByScope.get(scope) ?? new Map();
    const existing = seen.get(key);
    if (existing) {
      if (factId) existing.fact_ids.push(factId);
      existing.source_refs.push(...refs.filter((ref) => !existing.source_refs.includes(ref)));
      return;
    }
    const fact = { key, text: normalized, fact_ids: factId ? [factId] : [],
      source_refs: [...new Set(refs.filter((ref) => typeof ref === 'string' && ref))] };
    if (npcIndex != null) fact.npc_index = npcIndex;
    seen.set(key, fact);
    seenByScope.set(scope, seen);
    facts.push(fact);
  };
  for (const fact of source?.visible_scene_facts ?? []) {
    const npcIndexes = [...new Set((fact.source_refs ?? [])
      .map((ref) => npcIndexByRef.get(ref)).filter(Number.isInteger))];
    add(fact.text, fact.fact_id, fact.source_refs ?? [],
      npcIndexes.length === 1 ? npcIndexes[0] : null);
  }
  for (const entry of source?.known_context ?? []) add(entry?.text, null,
    entry?.basis_refs ?? []);
  for (const entry of source?.touch_body_context ?? []) add(entry?.text);
  const containsFact = (text, npcIndex = null) => typeof text === 'string' && text.trim().length > 2
    && facts.some((fact) => fact.npc_index === npcIndex
      && fact.text.toLocaleLowerCase('ru')
      .includes(text.trim().toLocaleLowerCase('ru')));
  for (const [npcIndex, npc] of (source?.visible_npcs ?? []).entries()) {
    if (!containsFact(npc?.label, npcIndex)) add(npc?.label, null,
      [npc?.npc_instance_id], npcIndex);
    add(npc?.current_activity, null, [npc?.npc_instance_id], npcIndex);
    for (const fact of projectNpcCueFacts(npc?.observable_cues)) {
      add(fact, null, [npc?.npc_instance_id], npcIndex);
    }
  }
  for (const item of source?.visible_items ?? []) {
    if (!containsFact(item?.label)) add(item?.label, null, [item?.item_instance_id]);
    add(item?.visible_status, null, [item?.item_instance_id]);
  }
  for (const anchor of source?.visible_anchors ?? []) {
    if (!containsFact(anchor?.label)) add(anchor?.label);
  }
  for (const exit of source?.visible_exits ?? []) {
    if (!containsFact(exit?.label)) add(exit?.label);
  }
  for (const collection of [source?.audible_context, source?.smell_context]) {
    for (const entry of collection ?? []) add(entry?.text);
  }
  for (const [index, entry] of (source?.uncertain_context ?? []).entries()) {
    add(typeof entry?.text === 'string' ? `Не подтверждено: ${entry.text}` : null,
      `opening:uncertain:${index + 1}`, entry?.inference_basis_refs ?? []);
  }
  for (const entry of source?.rumor_context ?? []) {
    add(typeof entry?.text === 'string' ? `Это слух: ${entry.text}` : null);
  }
  for (const entry of source?.weather_light_context ?? []) {
    if (typeof entry?.text === 'string') add(entry.text);
    for (const fact of projectWeatherFacts(entry?.weather_state)) {
      add(fact.text, fact.fact_id, fact.source_refs);
    }
  }
  for (const fact of projectWeatherFacts(source?.frame?.weather_state)) {
    add(fact.text, fact.fact_id, fact.source_refs);
  }
  for (const text of projectedFrameFacts(source?.frame,
    source?.weather_light_context)) add(text, `opening:frame:${facts.length + 1}`);
  return facts;
}

function projectNpcCueFacts(cues) {
  if (Array.isArray(cues)) return cues.flatMap((cue) =>
    typeof cue?.text === 'string' ? [cue.text] : []);
  if (!cues || typeof cues !== 'object' || Array.isArray(cues)) return [];
  const facts = [];
  const identity = cues.identity;
  if (identity && typeof identity === 'object') {
    const sex = translateOpeningValue(identity.sex_category, NPC_TRANSLATIONS.sex,
      'identity.sex_category');
    const age = translateOpeningValue(identity.age_category,
      identity.sex_category === 'female'
        ? NPC_TRANSLATIONS.age_female : NPC_TRANSLATIONS.age,
      'identity.age_category');
    if (sex) {
      const verb = identity.sex_category === 'female' ? 'Видна' : 'Виден';
      const descriptor = identity.age_category === 'middle_aged'
        ? `${sex} средних лет` : [age, sex].filter(Boolean).join(' ');
      facts.push(`${verb} ${descriptor}.`);
    }
    const appearance = identity.appearance ?? {};
    for (const [field, label, translations] of [
      ['build', 'Телосложение', NPC_TRANSLATIONS.build],
      ['skin_tone', 'Кожа', NPC_TRANSLATIONS.skin_tone],
      ['face_shape', 'Черты лица', NPC_TRANSLATIONS.face_shape]
    ]) {
      const value = translateOpeningValue(appearance[field], translations,
        `identity.appearance.${field}`);
      if (value) facts.push(`${label}: ${value}.`);
    }
    const eyes = translateOpeningValue(appearance.eyes?.color,
      NPC_TRANSLATIONS.eye_color, 'identity.appearance.eyes.color');
    if (eyes) facts.push(`Глаза: ${eyes}.`);
    const hair = appearance.hair ?? {};
    const hairLength = translateOpeningValue(hair.length,
      NPC_TRANSLATIONS.hair_length, 'identity.appearance.hair.length');
    if (hairLength === 'лысина') facts.push('Лысина.');
    else {
      const hairDetails = [hairLength,
        translateOpeningValue(hair.color, NPC_TRANSLATIONS.hair_color,
          'identity.appearance.hair.color'),
        translateOpeningValue(hair.style, NPC_TRANSLATIONS.hair_style,
          'identity.appearance.hair.style')]
        .filter(Boolean);
      if (hairDetails.length) facts.push(`Волосы: ${hairDetails.join(' ')}.`);
    }
    const facialHair = translateOpeningValue(hair.facial_hair,
      NPC_TRANSLATIONS.facial_hair, 'identity.appearance.hair.facial_hair');
    if (facialHair) facts.push(`${facialHair[0].toLocaleUpperCase('ru')}${facialHair.slice(1)}.`);
  }
  for (const item of Array.isArray(cues.equipment) ? cues.equipment : []) {
    const visual = item?.visual_profile_snapshot;
    if (!visual || typeof visual !== 'object') continue;
    const slot = translateOpeningValue(item.equipment_slot_category_id
      ?? visual.equipment_slot, NPC_TRANSLATIONS.slot,
      'equipment.equipment_slot_category_id');
    const details = [...new Set([
      translateOpeningValue(visual.outer_form, NPC_TRANSLATIONS.outer_form,
        'equipment.visual_profile_snapshot.outer_form'),
      translateOpeningValue(visual.visible_fabric, NPC_TRANSLATIONS.clothing_fabric,
        'equipment.visual_profile_snapshot.visible_fabric'),
      translateOpeningValue(visual.neckline, NPC_TRANSLATIONS.neckline,
        'equipment.visual_profile_snapshot.neckline'),
      translateOpeningValue(visual.sleeve_form, NPC_TRANSLATIONS.sleeve,
        'equipment.visual_profile_snapshot.sleeve_form'),
      translateOpeningValue(visual.trim, NPC_TRANSLATIONS.trim,
        'equipment.visual_profile_snapshot.trim'),
      translateOpeningValue(visual.main_visible_color, NPC_TRANSLATIONS.clothing_color,
        'equipment.visual_profile_snapshot.main_visible_color'),
      translateOpeningValue(visual.secondary_visible_color, NPC_TRANSLATIONS.clothing_color,
        'equipment.visual_profile_snapshot.secondary_visible_color'),
      translateOpeningValue(visual.headwear_kind, NPC_TRANSLATIONS.headwear,
        'equipment.visual_profile_snapshot.headwear_kind')
    ].filter(Boolean))];
    if (details.length) facts.push(`${slot ?? 'Снаряжение'}: ${details.join(', ')}.`);
  }
  return facts;
}

function translateOpeningValue(value, translations, field) {
  if (value == null) return null;
  if (typeof value !== 'string' || !Object.hasOwn(translations, value)) {
    throw serverError('OPENING_APPEARANCE_TRANSLATION_UNSUPPORTED',
      'Не удалось подготовить видимые сведения об облике персонажа для вступления.',
      { status: 500, details: { field } });
  }
  return translations[value];
}

function projectedFrameFacts(frame, weatherLightContext = []) {
  if (!frame || typeof frame !== 'object') return [];
  const context = weatherLightContext.find((entry) => entry && typeof entry === 'object') ?? {};
  const contextText = [context.text, ...(context.facts ?? [])]
    .filter((value) => typeof value === 'string').join(' ');
  const season = russianSeason(context.season ?? frame.season);
  const dayPart = russianDayPart(context.day_part ?? frame.day_part);
  const light = russianLight(context.light_state ?? context.light_profile
    ?? frame.light_profile);
  const current = [];
  if (season && !/лет|зим|весн|осен/iu.test(contextText)) current.push(season);
  if (dayPart && !/рассвет|утр|днём|вечер|сумерк|ночью/iu.test(contextText)) current.push(dayPart);
  if (light && !(dayPart === 'День.' && light === 'Стоит светлое время дня.')
    && !/светл|темн|сумерк|рассвет/iu.test(contextText)) current.push(light);
  return current;
}

function russianSeason(value) {
  return ({ spring: 'Весна.', early_spring: 'Ранняя весна.', late_spring: 'Поздняя весна.',
    summer: 'Лето.', early_summer: 'Начало лета.', late_summer: 'Позднее лето.',
    late_summer_open_water: 'Позднее лето.', autumn: 'Осень.', early_autumn: 'Ранняя осень.',
    late_autumn: 'Поздняя осень.', winter: 'Зима.', early_winter: 'Начало зимы.',
    late_winter: 'Конец зимы.' })[value] ?? null;
}

function russianDayPart(value) {
  return ({ dawn: 'Рассвет.', sunrise: 'Восход.', morning: 'Утро.', daylight: 'День.',
    noon: 'Полдень.', afternoon: 'После полудня.', sunset: 'Закат.', evening: 'Вечер.',
    twilight: 'Сумерки.', night: 'Ночь.', late_night: 'Поздняя ночь.' })[value] ?? null;
}

function russianLight(value) {
  return ({ daylight: 'Стоит светлое время дня.', clear: 'Светло.', dim: 'Сумеречно.',
    twilight: 'Сумерки.', dark: 'Темно.', civil_dusk: 'Сгущаются сумерки.' })[value] ?? null;
}

function projectWeatherFacts(state) {
  if (!state || typeof state !== 'object') return [];
  const facts = Array.isArray(state.facts)
    ? state.facts.filter((text) => typeof text === 'string')
      .map((text) => ({ text, fact_id: null, source_refs: [] })) : [];
  const translated = {
    sky: { clear: 'Небо ясное.', overcast: 'Небо затянуто облаками.',
      obscured: 'Небо не видно.', variable: 'Состояние неба меняется.' },
    precipitation: { none: 'Осадков нет.', rain: 'Идёт дождь.', snow: 'Идёт снег.' },
    visibility: { normal: 'Видимость обычная.', reduced: 'Видимость снижена.',
      poor: 'Видимость плохая.', normal_or_reduced: 'Видимость обычная или сниженная.' },
    wind: { calm_or_light: 'Ветер отсутствует или слабый.',
      light_or_moderate: 'Ветер слабый или умеренный.', strong: 'Сильный ветер.' }
  };
  for (const [field, values] of Object.entries(translated)) {
    const text = values[state[field]];
    if (text) facts.push({ text, fact_id: `opening:weather:${field}`,
      source_refs: [] });
  }
  return facts;
}

function mapEvidenceKeys(evidence, factKeyMap = {}) {
  if (!Array.isArray(evidence)) return [];
  return evidence.map((entry) => typeof entry === 'string'
    ? entry.replace(/\bf(\d+)\b/gu, (key) => factKeyMap[key]
      ? `${key} (${factKeyMap[key].fact_id})` : key) : entry);
}

function sanitizeFactRefs(value, sourceRefToFactKey) {
  if (typeof value !== 'string') return value;
  let result = value.replace(/\bf\d+\s*\([^)]*\)/gu, (value) =>
    value.match(/^f\d+/u)?.[0] ?? value);
  for (const [sourceRef, factKey] of sourceRefToFactKey) {
    if (sourceRef) result = result.split(sourceRef).join(factKey);
  }
  return result;
}

function canAffordAnotherCall(turnBudget) {
  const remaining = turnBudget?.remaining?.();
  return !remaining || remaining.deadline_ms > GAMEPLAY_LLM_CALL_TIMEOUT_MS;
}

async function runBoundedOpening({ requestId, visibleContextPackage,
  visibleContextApproval, writer, auditor, auditOutput, semanticRepairer, repair,
  llmDiagnostics = null }) {
      const stage22Input = buildStage22NarratorInput({ request_id: requestId,
        visible_context_package: visibleContextPackage,
        visible_context_package_digest:
          computeVisibleContextPackageDigest(visibleContextPackage),
        visible_context_approval: visibleContextApproval,
        narrator_policy: { max_opening_paragraphs: 4, max_action_options: 0 } });
  let stage22 = stage22Result(stage22Input, await writer(stage22Input), []);
  const audit = async () => {
    const input = buildStage23AuditInput({ request_id: requestId,
          visible_context_package: visibleContextPackage,
          visible_context_approval: visibleContextApproval,
          stage22_result: stage22 });
    let validation = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const raw = await auditor(input, validation.map(({ code }) => code));
      validation = validateRawAudit(raw);
      if (validation.length === 0) {
        const value = auditOutput(raw, input);
        validation = validateNarratorProseAudit(value, input, {
          allowRouteMissing: value.pass === false
        });
        if (validation.length === 0) return { input,
          result: stage23Result(input, value) };
      }
    }
    openingError('AUTHORED_OPENING_AUDIT_INVALID', validation);
  };
  let stage23 = await audit();
  const originalStage23Audit = structuredClone(
    stage23.result.narrator_prose_audit);
  let preRepairWriterProse = null;
  if (stage23.result.pass !== true) {
    preRepairWriterProse = stage22.narrator_starting_prose?.prose;
    if (stage23.result.narrator_prose_audit.concerns.some(({ severity }) =>
      ['hard_block', 'upstream_block'].includes(severity))) {
      throwOpeningAuditRejected({ stage22, stage23, repair,
        outcome: null });
    }
    if (repair.spent) {
      throwOpeningAuditRejected({ stage22, stage23, repair,
        outcome: 'still_rejected' });
    }
    repair.spent = true;
    stage22 = stage22Result(stage22Input,
      await semanticRepairer({ ...stage22Input,
        failed_narrator_starting_prose: stage22.narrator_starting_prose,
        prose_audit_concerns: originalStage23Audit.concerns,
        prose_audit_evidence: originalStage23Audit.evidence }), [{
          role: 'semantic_repair', value: stage22.narrator_starting_prose
        }]);
    stage23 = await audit();
  }
      const handoff = validateStage23CommitHandoff({ request_id: requestId,
        visible_context_package: visibleContextPackage,
        stage22_result: stage22, stage23_result: stage23.result });
      if (handoff.length > 0) throw serverError('AUTHORED_OPENING_AUDIT_REJECTED',
        'Stage 23 rejected the authored opening.', { status: 409,
          details: {
            codes: handoff.map(({ code }) => code),
            opening_rejection: buildOpeningRejectionSnapshot({
              prose: stage22.narrator_starting_prose?.prose,
              audit: stage23.result.narrator_prose_audit,
              codes: handoff.map(({ code }) => code),
              repair: { attempted: repair.spent === true, outcome: 'handoff_blocked' }
            })
          } });
  const flow = adaptApprovedOpeningNarration({ stage22Result: stage22,
    stage23Result: stage23.result });
      try {
        llmDiagnostics?.recordOpeningAttempt?.(buildOpeningRejectionSnapshot({
          prose: flow.approved_output.prose,
          audit: stage23.result.narrator_prose_audit,
          repair: { attempted: repair.spent === true },
          ...(repair.spent === true && preRepairWriterProse != null ? {
            preRepair: { prose: preRepairWriterProse, audit: originalStage23Audit }
          } : {})
        }));
      } catch { /* diagnostics must not affect opening */ }
      return Object.freeze({ prose: flow.approved_output.prose,
        literary_pass: stage23.result.narrator_prose_audit
          .checks.literary_composition_check.pass,
        flow, stage22_result: structuredClone(stage22),
        stage23_result: structuredClone(stage23.result),
        original_stage23_audit: originalStage23Audit });
}

function stage22Result(input, output, history) {
  const precheck = buildNarratorStartCodePrecheck(input);
  const concerns = validateNarratorStartingProseOutput(output, input, precheck);
  if (concerns.length > 0) openingError('AUTHORED_OPENING_WRITER_INVALID',
    concerns);
  return { version: 1, schema: 'stage22_narrator_prose_result',
    request_id: input.request_id, pass: true,
    visible_context_package_digest: input.visible_context_package_digest,
    narrator_start_code_precheck: precheck,
    narrator_starting_prose: structuredClone(output),
    generation_history: structuredClone(history), diagnostics: {
      bounded_opening_calls: true },
    handoff_permission: { can_send_to_prose_audit: true } };
}

function stage23Result(input, audit) {
  const precheck = buildNarratorProseCodePrecheck(input);
  const pass = audit.pass === true;
  return { version: 1, schema: 'stage23_narrator_prose_audit_result',
    request_id: input.request_id, pass,
    visible_context_package_digest: input.visible_context_package_digest,
    narrator_starting_prose_digest: input.narrator_starting_prose_digest,
    narrator_prose_code_precheck: precheck,
    narrator_prose_audit: structuredClone(audit), repair_route: null,
    audit_history: [], diagnostics: { bounded_opening_calls: true },
    commit_permission: { can_show_to_player: pass,
      can_write_player_visible_message: pass,
      can_mark_opening_scene_presented: pass } };
}

function validateRawAudit(output) {
  const issues = [];
  if (typeof output.pass !== 'boolean') issues.push({ code:
    'STAGE23_AUDIT_PASS_INVALID' });
  if (!Array.isArray(output.failed_checks) || output.failed_checks.some((key) =>
    !STAGE23_REQUIRED_CHECKS.includes(key))) issues.push({ code:
    'STAGE23_AUDIT_CHECK_INVALID' });
  if (!Array.isArray(output.concerns) || output.concerns.some((item) =>
    !item || typeof item !== 'object' || Array.isArray(item))) issues.push({ code:
    'STAGE23_AUDIT_CONCERNS_INVALID' });
  if (issues.length > 0) return issues;
  const blockingChecks = output.failed_checks.filter((key) =>
    key !== 'literary_composition_check');
  const blockingConcerns = output.concerns.filter(({ code }) =>
    code !== 'NARRATOR_PROSE_WEAK_LITERARY_COMPOSITION');
  if (output.pass && blockingChecks.length > 0) issues.push({ code:
    'STAGE23_AUDIT_CHECK_FAILED_ON_PASS' });
  if (output.pass && blockingConcerns.length > 0) issues.push({ code:
    'STAGE23_AUDIT_CONCERNS_ON_PASS' });
  if (!output.pass && blockingChecks.length === 0) issues.push({ code:
    'STAGE23_AUDIT_NO_FAILED_CHECK' });
  if (!output.pass && blockingConcerns.length === 0) issues.push({ code:
    'STAGE23_AUDIT_CONCERNS_MISSING' });
  return issues;
}

function openingError(code, concerns) {
  throw serverError(code, 'Authored opening narration failed closed.', {
    status: 409, details: { codes: concerns.map(({ code: item }) => item) }
  });
}

function throwOpeningAuditRejected({ stage22, stage23, repair, outcome }) {
  const audit = stage23.result.narrator_prose_audit;
  const codes = audit.concerns.map(({ code }) => code);
  throw serverError('AUTHORED_OPENING_AUDIT_REJECTED',
    'Authored opening narration failed closed.', {
      status: 409,
      details: {
        codes,
        opening_rejection: buildOpeningRejectionSnapshot({
          prose: stage22.narrator_starting_prose?.prose,
          audit,
          codes,
          repair: { attempted: repair.spent === true || outcome === 'still_rejected',
            ...(outcome ? { outcome } : {}) }
        })
      }
    });
}
