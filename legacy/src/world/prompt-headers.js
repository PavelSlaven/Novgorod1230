function joinSections(sections) {
  return sections.filter((line) => line != null && line !== '').join('\n');
}

export function buildAgentPromptHeader({ role, task, sources, facts, visible, hidden, constraints, format, criteria, extra = [] }) {
  const lines = [
    '# Роль',
    role,
    '# Задача',
    task,
    '# Доступные источники',
    sources,
    '# Уже установленные факты партии',
    facts,
    '# Видимый контекст',
    visible
  ];
  if (hidden != null && String(hidden).trim()) {
    lines.push('# Скрытая информация', hidden);
  }
  lines.push(
    '# Ограничения',
    constraints,
    '# Формат ответа',
    format,
    '# Критерии успеха',
    criteria,
    ...extra,
    ''
  );
  return joinSections(lines);
}

export function buildVisibilityPromptHeader(fields) {
  return buildAgentPromptHeader({
    ...fields,
    hidden: fields.hidden ?? 'Полное состояние и скрытые процессы доступны только для отбора видимого пакета.'
  });
}

export function buildProsePromptHeader(fields) {
  return buildAgentPromptHeader({
    ...fields,
    hidden: null
  });
}

export function buildStructuredShapePromptHeader(fields) {
  return joinSections([
    '# Роль',
    fields.role,
    '# Задача',
    fields.task,
    '# Вход',
    fields.sources ?? fields.input ?? 'Принятое содержание и схема ответа.',
    '# Схема',
    fields.format ?? fields.schema ?? 'Строгий JSON по контракту.',
    '# Формат ответа',
    fields.format ?? fields.schema ?? 'Строгий JSON по контракту.',
    '# Ограничения',
    fields.constraints ?? 'Не придумывай новые факты; только структурируй уже принятое содержание.',
    '# Критерии успеха',
    fields.criteria ?? 'Ответ валиден по схеме и не добавляет смысл.',
    ...(fields.extra ?? []),
    ''
  ]);
}

export function buildRepairPromptHeader(fields) {
  return joinSections([
    '# Роль',
    fields.role,
    '# Задача',
    fields.task ?? 'Исправь только нарушения контракта без новых фактов.',
    '# Источник',
    fields.sources ?? 'sourceResponse, validationErrors и утверждённый dossier/audit.',
    '# Ограничения',
    fields.constraints ?? 'Новые факты запрещены. Если исправить нельзя без них — repair_possible=false.',
    '# Формат ответа',
    fields.format,
    '# Критерии успеха',
    fields.criteria ?? 'Контракт соблюдён или явно указано repair_possible=false.',
    ...(fields.extra ?? []),
    ''
  ]);
}

export function buildMemoryPromptHeader(fields) {
  return buildAgentPromptHeader({
    role: fields.role ?? 'Ты — агент памяти и журнала исторической RPG XIII века.',
    task: fields.task ?? 'Выбери значимые факты для журнала персонажа и внутренней памяти мира.',
    sources: fields.sources ?? 'master_narrative, state_delta, visible_package, player_input.',
    facts: fields.facts ?? 'Не записывай декоративный шум прозы.',
    visible: fields.visible ?? 'Разделяй character_journal и world_memory.',
    hidden: fields.hidden ?? 'Скрытые изменения мира — только в world_memory, не в журнал персонажа.',
    constraints: fields.constraints ?? 'Слухи помечай certainty=rumor; скрытое не попадает в character_journal.',
    format: fields.format ?? 'JSON: character_journal[], world_memory[], discarded_as_noise[].',
    criteria: fields.criteria ?? 'Только причинно значимые записи.',
    extra: fields.extra ?? []
  });
}

// ponytail: legacy alias — narrator stages that still need hidden block use buildAgentPromptHeader directly
export function buildNarratorPromptHeader(fields) {
  return buildAgentPromptHeader(fields);
}
