import { AsyncLocalStorage } from 'node:async_hooks';
import { createNarrationService } from '@rus/narration';
import { worldKnowledgePromptData } from '@rus/turn';
import { serverError } from '../errors.js';
import { assembleNarrationAuditOutput, narrationAuditInstruction, WORLD_STORY_BOUNDARY } from
  './lower-dvina-trace-narration-audit.js';
import { isMovementVisibleObject } from './spatial-v3-movement-objects.js';
import { projectNpcCueFacts } from './authored-opening-narration.js';
import { projectKnownContext } from './lower-dvina-trace-player-safe-world.js';
import { findUnsafePlayerText, findUnsafePublishedText, playerSafeCalibrationText } from
  '../public-boundary.js';

export const NARRATION_WK_QUALIFIER_RULE = 'Сведения о мире уже переданы русскими фразами с оговорками. '
  + 'Сохраняй смысл и степень уверенности каждой оговорки рядом с её фактом; '
  + 'вывод, аналогия и реконструкция не становятся непосредственно установленным фактом. '
  + 'Справка не доказывает присутствие предмета или человека в текущей сцене.';

const PROSE_RULES = `Ты пишешь сцену исторического романа о Руси XIII века: живую русскую прозу в третьем лице и прошедшем времени, через восприятие, тело и мысли героя. Назови героя по имени из сведений; местоимение выбирай по его полу и только когда понятно, о ком речь. Даже короткий ход — пережитый момент, а не протокол. От одного до четырёх абзацев по весу сцены.

${WORLD_STORY_BOUNDARY}

Сколько прошло времени и сколько заняло действие, не называй. Покажи важное через взгляд героя, без списка сведений.

Точность текущего эпизода: передай каждое обязательное положение один раз, сохрани его смысл, уверенность и порядок совершённых действий. Не делай позднее действие ранним, одновременным или вложенным в раннее. Совершённое действие остаётся совершённым при неизвестном результате; не добавляй успеха или неудачи. Замысел не становится действием, наблюдением или ответом; несделанный шаг не рассказывай как событие. Переход героя между местами подтверждают только сведения о переходе. Не переноси признаки и действия названного человека на героя. Подтверждённую речь цитируй дословно и укажи говорящего. Если шагу помешала указанная причина, покажи её через переживание героя.

Сочини законченный эпизод: свяжи действие, внимание и внутренний отклик героя в живую сцену. Сведения — опоры этой сцены, а не фразы для пересказа. Дай восприятию и внутреннему движению место в ритме и образе; для этого не нужны новые события или сведения о мире.`;

const GROUNDING_RULES = `Фаза суток не доказывает источник света или видимость конкретного места. Название даёт имя, но не новый признак или действие.`;

const WRITER_SHAPE = 'Верни только JSON {"prose":"<цельная русская проза>"}. Сервер сам добавляет version, schema, output_id, action_options=[], used_references=[] и нейтральный self_check={}; эти поля не создавай.';

/** Per-run pack: ground once on writer; reuse for repair/auditor (F1). */
const narrationWkStore = new AsyncLocalStorage();

export function createLowerDvinaTraceNarrationService({ roleRunner,
  worldKnowledgeGrounder = null, telemetry = null } = {}) {
  if (typeof roleRunner?.run !== 'function') throw serverError(
    'TRACE_PHASE_2_DEPENDENCY_MISSING', 'Configured LLM role runner is required.', { status: 503 });
  const runRole = (roleId, instruction) => async (request) =>
    runNarrationRole(roleRunner, roleId, instruction, request,
      worldKnowledgeGrounder, telemetry);
  const ports = {
    writer: { generate: runRole('gameplay_narrator',
      `${WRITER_SHAPE} ${PROSE_RULES} ${GROUNDING_RULES}`) },
    formatRepairer: { repair: runRole('gameplay_narrator_format_repair',
      `${WRITER_SHAPE} Исправь форму отклонённого ответа, сохранив подтверждённый смысл. ${PROSE_RULES} ${GROUNDING_RULES}`) },
    auditor: { audit: runRole('gameplay_narrator_auditor',
      null) },
    semanticRepairer: { repair: runRole('gameplay_narrator_semantic_repair',
      `Return only {"replacements":[{"prose":"<complete repaired Russian prose>"}]} with exactly one replacement. «Отрывки исходной прозы» поясняют замечания; замени только цельную прозу. Rebuild the whole scene and fix all concerns, not isolated phrases. Replacement must differ from rejected prose. Preserve every proposition from «Обязательные положения текущего эпизода» and its certainty once, performed-action order, and confirmed speech verbatim with its NPC speaker. A performed attempt with unknown observation stays performed and unknown. An unperformed intent remains silent and never becomes a performed event. Judge the entire scene, avoiding protocol, checklists and static inventories; use scene support selectively. Do not report elapsed time. Apply the writer's world/prose boundary and style: ${PROSE_RULES} ${GROUNDING_RULES} If no supported meaning remains, return empty prose. The server assembles the segment identifier.`) }
  };
  const service = createNarrationService(ports);
  return Object.freeze({
    // F1/F3/F7/N7: authoritative only via options/ALS, never request body.
    run(request, options = {}) {
      const authoritative = options.worldKnowledgeAuthoritative ?? null;
      const {
        world_knowledge_authoritative: _auth,
        ...cleanRequest
      } = request ?? {};
      return narrationWkStore.run({ authoritative, pack: null,
        actor: cleanRequest.actor ?? null }, () =>
        service.run(cleanRequest, { ...options,
          outputAdmission: prose => findUnsafePlayerText(prose, { generatedProse: true }) }));
    }
  });
}

function safeNarrationText(value, path) {
  if (typeof value !== 'string') return value;
  const finding = findUnsafePlayerText(value, { label: true, generatedProse: true });
  if (finding == null) return value;
  console.error('[game-server] suppressed unsafe narration input', {
    field_path: path, category: finding.category
  });
  return undefined;
}

function safeNarrationTextList(value, path, field = '') {
  if (!Array.isArray(value)) return [];
  return value.map((entry, index) => {
    const itemPath = `${path}[${index}]`;
    if (typeof entry === 'string') return safeNarrationText(entry, itemPath);
    if (entry == null || typeof entry !== 'object') return undefined;
    const finding = findUnsafePublishedText(entry, field);
    if (finding != null) {
      console.error('[game-server] suppressed unsafe narration input', {
        field_path: finding.path, category: finding.category
      });
      return undefined;
    }
    return structuredClone(entry);
  }).filter((entry) => typeof entry === 'string' && entry.trim()
    || entry != null && typeof entry === 'object');
}

/** Strip service-only fields from nested writer clone (F3). Keep WK prompt-data (F2). */
export function narrationWorldKnowledgePromptData(value) {
  if (value == null) return value;
  // Shared WK owner strips only the duplicate compact context; this adapter owns
  // the narrower projection of reviewed factual prose for narration (D72).
  const slice = worldKnowledgePromptData(value);
  function project(entry, path) {
    if (Array.isArray(entry)) return entry.map((row, index) =>
      project(row, `${path}[${index}]`)).filter(row => row !== undefined);
    if (entry == null || typeof entry !== 'object') return entry;
    if (typeof entry.runtime_text === 'string') {
      entry.runtime_text = playerSafeCalibrationText(entry.runtime_text);
      const finding = findUnsafePlayerText(entry.runtime_text, { generatedProse: true });
      if (finding != null) {
        console.error('[game-server] suppressed unsafe narration input', {
          field_path: `${path}.runtime_text`, category: finding.category
        });
        // Do not discard machine-owned constraints, qualifiers or source refs.
        delete entry.runtime_text;
      }
    }
    for (const [key, nested] of Object.entries(entry)) {
      if (nested != null && typeof nested === 'object') entry[key] = project(nested, `${path}.${key}`);
    }
    return entry;
  }
  return project(slice, 'world_knowledge');
}

function narrationVisibleDescriptions(records, path) {
  if (!Array.isArray(records)) return [];
  const refsByLabel = new Map();
  for (const record of records) {
    if (typeof record?.display_label !== 'string' || record.entity_ref == null) continue;
    const label = record.display_label.trim();
    if (!refsByLabel.has(label)) refsByLabel.set(label, new Map());
    const ref = JSON.stringify([
      record.entity_ref.entity_kind, record.entity_ref.entity_id
    ]);
    const refs = refsByLabel.get(label);
    if (!refs.has(ref)) refs.set(ref, refs.size + 1);
  }
  return records.flatMap((record, index) => {
    if (typeof record === 'string') {
      const safe = safeNarrationText(record, path + '[' + index + ']');
      return safe && /\p{Script=Cyrillic}/u.test(safe) ? [safe] : [];
    }
    if (record == null || typeof record !== 'object') return [];
    const cues = record.observable_cues;
    const candidates = [
      record.display_label, record.visible_status,
      cues?.identity?.display_name,
      ...projectNpcCueFacts(cues),
      ...Object.values(cues?.outward_presentation ?? {}),
      cues?.ordinary_remainder?.ordinary_descriptor,
      cues?.ordinary_remainder?.ordinary_activity
    ];
    const descriptions = candidates.flatMap((value, detailIndex) => {
      const safe = safeNarrationText(value,
        path + '[' + index + '].description[' + detailIndex + ']');
      return typeof safe === 'string' && /\p{Script=Cyrillic}/u.test(safe)
        ? [safe.trim()] : [];
    });
    if (!descriptions.length) return [];
    const description = descriptions.filter((value, position) =>
      descriptions.indexOf(value) === position).join(' ');
    const distinct = record.entity_ref != null
      && refsByLabel.get(record.display_label?.trim())?.size > 1;
    const ref = JSON.stringify([
      record.entity_ref?.entity_kind, record.entity_ref?.entity_id
    ]);
    const marker = refsByLabel.get(record.display_label?.trim())?.get(ref);
    return [distinct ? `Отдельный объект №${marker}: ${description}` : description];
  });
}

function narrationWorldKnowledgeFacts(value) {
  if (value == null) return [];
  const slice = narrationWorldKnowledgePromptData(value);
  const directness = { direct: '', inferred: 'По имеющимся сведениям можно предположить: ',
    analogical: 'По ограниченной аналогии можно предположить: ',
    editorial: 'Возможная реконструкция: ',
    unknown: 'Степень прямой подтверждённости неизвестна: ' };
  const confidence = { high: '', medium: 'Уверенность неполная.',
    low: 'Уверенность низкая.', unknown: 'Уверенность неизвестна.' };
  const typicality = { common: '', attested: 'Засвидетельствован отдельный случай.',
    uncommon: 'Это нечастый случай.', exceptional: 'Это исключительный случай.',
    unknown: 'Насколько это типично, неизвестно.' };
  const claimText = (claim) => {
    if (typeof claim?.runtime_text !== 'string' || !claim.runtime_text.trim()) return null;
    const qualifiers = claim.qualifiers ?? {};
    return [directness[qualifiers.directness] ?? '',
      claim.runtime_text.trim(), confidence[qualifiers.confidence] ?? '',
      typicality[qualifiers.typicality] ?? ''].filter(Boolean).join(' ');
  };
  return [
    ...slice.hard_constraints.map(claimText),
    ...slice.facts.map(claimText),
    ...slice.disputes.flatMap((dispute) =>
      (dispute.claims ?? []).map(claimText).filter(Boolean)
        .map((text) => `Сведения расходятся: ${text}`)),
    ...slice.gaps.flatMap((gap) => {
      const text = gap?.runtime_text ?? gap?.text ?? gap?.summary;
      return typeof text === 'string' && text.trim()
        ? [`Сведений недостаточно: ${text.trim()}`] : [];
    })
  ].filter(Boolean);
}

function narrationOutcomeFacts(outcome) {
  if (outcome == null) return [];
  const facts = [];
  if (outcome.movement_committed === true) facts.push('Переход совершён.');
  if (outcome.movement_blocked === true) facts.push('Переход не состоялся.');
  if (outcome.qualitative_assessment === true) facts.push('Дана качественная оценка.');
  for (const check of outcome.check_outcomes ?? []) {
    const action = typeof check.action === 'string' ? check.action : 'Действие';
    const result = ({ clean_success: 'полный успех', success: 'успех',
      success_with_cost: 'частичный успех с платой',
      failure_with_consequence: 'неудача с последствиями',
      severe_failure: 'тяжёлая неудача' })[check.band]
      ?? (check.success === true ? 'удалось'
        : check.success === false ? 'не удалось' : 'исход неизвестен');
    facts.push(`${action}: ${result}.`);
    if (check.cost_required === true) facts.push(`${action}: исход требует платы.`);
    if (check.severe_failure === true) facts.push(`${action}: тяжёлая неудача.`);

  }
  return facts;
}

export function narrationWire(request, { roleId } = {}) {
  const original = request?.request ?? request;
  const visible = original?.visible_context ?? request?.visible_context;
  const actor = narrationWkStore.getStore()?.actor ?? original?.actor ?? request?.actor;
  const changes = safeNarrationTextList(visible.visible_changes,
    'visible_context.visible_changes', 'visible_changes');
  const uncertainties = safeNarrationTextList(visible.uncertainties,
    'visible_context.uncertainties');
  const referenced = roleId === 'gameplay_narrator_auditor'
    || roleId === 'gameplay_narrator_semantic_repair';
  const meaning = (value) => typeof value === 'string' ? value : value.summary;
  const uncertainty = (value) => typeof value === 'string' ? value
    : value.status === 'result_unknown'
      ? `Исход неизвестен: ${meaning(value)}` : meaning(value);
  const required = [
    ...changes.map((text, index) => referenced
      ? `visible_change_${index + 1}: ${meaning(text)}` : meaning(text)),
    ...uncertainties.map((text, index) => referenced
      ? `uncertainty_${index + 1}: ${uncertainty(text)}` : uncertainty(text))
  ];
  const known = [...new Set([
    ...safeNarrationTextList(visible.known_context, 'visible_context.known_context'),
    ...safeNarrationTextList(projectKnownContext(actor), 'actor.known_context')
  ])];
  const scene = safeNarrationText(visible.visible_scene, 'visible_context.visible_scene');
  const support = {
    ...(typeof scene === 'string' ? { 'Место': scene } : {}),
    'Ощущения': safeNarrationTextList(visible.sensory_details,
      'visible_context.sensory_details'),
    'Известное герою': known,
    'Люди': narrationVisibleDescriptions(visible.visible_npc,
      'visible_context.visible_npc'),
    'Предметы и ориентиры': narrationVisibleDescriptions(
      (visible.visible_objects ?? []).filter((row) =>
        !(row?.entity_ref?.entity_kind === 'item'
            && row.label_gap?.code === 'player_safe_item_label_required')
          && (!isMovementVisibleObject(row)
            || row.entity_ref.entity_kind !== 'scene_movement_edge'
              && findUnsafePlayerText(row.display_label,
                { label: true, generatedProse: true }) == null)),
      'visible_context.visible_objects')
  };
  const worldKnowledge = request?.world_knowledge ?? original?.world_knowledge;
  const outcome = original?.context?.outcome ?? request?.confirmed_outcome;
  const wire = {
    'Обязательные положения текущего эпизода': required,
    'Переданные сведения об обстановке': support,
    'Границы рассказа': {
      'Не утверждать': safeNarrationTextList(visible.do_not_imply,
        'visible_context.do_not_imply'),
      'Допустимое напряжение': safeNarrationTextList(visible.allowed_tensions,
        'visible_context.allowed_tensions')
    },
    'Подтверждённый исход': narrationOutcomeFacts(outcome),
    'Сведения о мире': narrationWorldKnowledgeFacts(worldKnowledge)
  };
  if (visible.current_light_phase != null) {
    wire['Переданные сведения об обстановке']['Фаза суток'] =
      ({ daylight: 'День.', civil_dawn: 'Рассвет.',
        civil_dusk: 'Сумерки.', night: 'Ночь.' })[visible.current_light_phase];
  }
  if (roleId === 'gameplay_narrator_auditor') {
    const intent = request?.action_intent_context?.attempt?.text;
    if (typeof intent === 'string') wire['Контекст намерения для проверки'] = intent;
    wire['Отрывки прозы'] = (request.segments ?? []).map(({ segment_id, prose }) =>
      ({ segment_id, prose }));
    wire['Проверяемая проза'] = request.output?.prose;
  }
  if (roleId === 'gameplay_narrator_semantic_repair') {
    wire['Отклонённая проза'] = request.segments?.[0]?.prose;
    wire['Замечания'] = request.concerns?.map(({ reason }) => reason);
    wire['Отрывки исходной прозы'] = request.source_segments?.map(
      ({ segment_id, prose }) => ({ segment_id, prose }));
  }
  if (roleId === 'gameplay_narrator_format_repair') {
    wire['Отклонённая проза'] = request.invalid_output?.prose;
    wire['Замечание'] = 'Ответ не соответствовал требуемой форме JSON.';
  }
  return wire;
}

async function runNarrationRole(roleRunner, roleId, instruction, request,
  worldKnowledgeGrounder = null, telemetry = null) {
  const store = narrationWkStore.getStore();
  const grounded = await resolveNarrationGrounded(roleId, request, store,
    worldKnowledgeGrounder, telemetry);
  const systemInstruction = roleId === 'gameplay_narrator_auditor'
    ? [narrationAuditInstruction(request),
      ...(grounded?.world_knowledge == null ? [] : [NARRATION_WK_QUALIFIER_RULE])].join(' ')
    : [instruction,
      ...(grounded?.world_knowledge == null ? [] : [NARRATION_WK_QUALIFIER_RULE])].join(' ');
  const modelRequest = grounded;
  const response = await roleRunner.run({ scope: 'turn_runtime', role_id: roleId,
    request_identity: request.request_id ?? request.request?.request_id,
    messages: [{ role: 'system', content: systemInstruction },
      { role: 'user', content: JSON.stringify(narrationWire(modelRequest, { roleId })) }],
    overrides: { temperature: roleId === 'gameplay_narrator_semantic_repair' ? 0.2 : 0 } });
  if (!response?.output || typeof response.output !== 'object') throw serverError(
    'TRACE_PHASE_2_DEPENDENCY_MISSING',
    `Narration role ${roleId} returned no JSON object.`, { status: 503 });
  return assembleNarrationRoleOutput(roleId, response.output, request);
}

async function resolveNarrationGrounded(roleId, request, store,
  worldKnowledgeGrounder, telemetry = null) {
  // F1: ground once on writer narration_request; reuse pack; never re-ground repair/auditor.
  if (roleId === 'gameplay_narrator' && worldKnowledgeGrounder != null) {
    try {
      const authoritative = store?.authoritative ?? null;
      const grounded = await worldKnowledgeGrounder.ground(request, 'narration', {
        clock: authoritative?.clock ?? null,
        historical_events: Array.isArray(authoritative?.historical_events)
          ? authoritative.historical_events : [],
        actor_facets: authoritative?.actor_facets ?? {}
      });
      if (store) store.pack = grounded?.world_knowledge ?? null;
      return grounded;
    } catch (error) {
      // §73/B2: degrade on WK/turn-WK codes or provider failure; never on turn budget.
      const code = typeof error?.code === 'string' ? error.code : '';
      const budgetExhausted = code === 'LLM_TURN_BUDGET_EXHAUSTED';
      const wkFailure = code.startsWith('WORLD_KNOWLEDGE_')
        || code.startsWith('TURN_WORLD_KNOWLEDGE_');
      const providerFailure = error?.llm_provider_failure === true;
      if (!budgetExhausted && (wkFailure || providerFailure)) {
        const requestId = request?.request_id ?? request?.request?.request_id
          ?? null;
        const degradation = Object.freeze({
          schema: 'world_knowledge_narration_degradation_v1',
          event: 'world_knowledge_narration_degraded',
          code: code || 'LLM_ROLE_FAILED',
          purpose: 'narration',
          request_identity: requestId,
          request_id: requestId
        });
        if (store) store.pack = null;
        // A4/B5: ALS store dies after run(); telemetry keeps the §73 trace.
        telemetry?.onGameplayTrace?.(degradation);
        telemetry?.onDetail?.(degradation);
        return request;
      }
      throw error;
    }
  }
  if (store?.pack != null) {
    return { ...request, world_knowledge: store.pack };
  }
  return request;
}

export function assembleNarrationRoleOutput(roleId, output, request) {
  if (['gameplay_narrator', 'gameplay_narrator_format_repair']
    .includes(roleId)) return {
    version: 1, schema: 'narration_output',
    output_id: request.request_id ?? request.request?.request_id,
    prose: output.prose, action_options: [], used_references: [],
    self_check: {}
  };
  if (roleId === 'gameplay_narrator_auditor') {
    return assembleNarrationAuditOutput(output, request);
  }
  if (roleId === 'gameplay_narrator_semantic_repair') return {
    version: 1, schema: 'narration_semantic_repair',
    replacements: Array.isArray(output.replacements)
      ? output.replacements.map((replacement, index) => ({
          segment_id: request.segments?.[index]?.segment_id,
          prose: replacement.prose
        })) : output.replacements
  };
  return output;
}
