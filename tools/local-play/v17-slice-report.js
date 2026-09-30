// Report side of the v17 slice driver (v17-slice-run.mjs): secret redaction, verdict, Markdown playtest skeleton.
// Deterministic text only: facts from the run, no diagnosis (WR §24.1; docs/playtests/README.md).

export const LEG_IDS = Object.freeze(['start', 'walk', 'meet', 'talk', 'take', 'make']);
export const LEG_TITLES = Object.freeze({
  start: 'start', walk: 'walk out', meet: 'meet', talk: 'talk', take: 'take', make: 'make'
});

/** Replaces every secret value and generic credential shape in `text`. Values shorter than 4 chars are ignored. */
export function createRedactor(secrets = []) {
  const values = [...new Set(secrets.filter((value) => typeof value === 'string' && value.length >= 4))]
    .sort((a, b) => b.length - a.length);
  return (text) => {
    let out = String(text);
    for (const value of values) out = out.split(value).join('[redacted]');
    return out
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gu, 'Bearer [redacted]')
      .replace(/\b(?:sk|pk)-[A-Za-z0-9_-]{12,}/gu, '[redacted]');
  };
}

/** Secret values worth stripping from a stored llm-settings record (never its contents in the report). */
export function secretsOfLlmSettings(record) {
  const settings = record?.settings ?? {};
  const secrets = [settings.api_key, settings.base_url];
  try { const url = new URL(settings.base_url); secrets.push(url.host, url.hostname); } catch { /* not a URL */ }
  return secrets.filter(Boolean);
}

export function verdictOf(legs) {
  const statuses = legs.map(({ status }) => status);
  if (statuses.every((status) => status === 'pass')) return 'PASS';
  return statuses.includes('pass') ? 'PARTIAL' : 'FAIL';
}

/** 0 every leg passed, 1 at least one leg failed or is blocked. Usage 2, preflight 3, infrastructure 4 are set by the driver. */
export function exitCodeOf(legs) {
  return legs.every(({ status }) => status === 'pass') ? 0 : 1;
}

const fence = (value) => `\`\`\`\n${value}\n\`\`\``;
const quote = (value) => String(value ?? '').split('\n').map((line) => `> ${line}`).join('\n');
const json = (value) => JSON.stringify(value);

/** What a turn changed, from the two SQL snapshots. */
export function describeDelta(before, after) {
  if (before == null || after == null || before.error || after.error) {
    return `снимок недоступен (${before?.error ?? after?.error ?? 'нет данных'})`;
  }
  const parts = [];
  const place = (snap) => `${snap.position?.canonical_g5 ?? snap.position?.generated_template ?? snap.position?.site_id ?? '?'}@${snap.position?.slot ?? '?'}`;
  parts.push(place(before) === place(after) ? `позиция без изменений (${place(after)})` : `позиция ${place(before)} → ${place(after)}`);
  parts.push(`state_version ${before.state_version} → ${after.state_version}`);
  const here = (snap) => (snap.placements_here ?? []).map((row) => `${row.entity_kind}:${row.entity_id}`).sort();
  if (json(here(before)) !== json(here(after))) parts.push(`размещения в G6 игрока: ${here(before).length} → ${here(after).length}`);
  const statements = (after.npc_statements?.length ?? 0) - (before.npc_statements?.length ?? 0);
  if (statements !== 0) parts.push(`реплик NPC в снимке: ${statements > 0 ? '+' : ''}${statements}`);
  const nodes = (snap) => Object.fromEntries((snap.resource_nodes ?? []).map((row) => [row.resource_node_id, row.quantity_numerator]));
  for (const [id, quantity] of Object.entries(nodes(after))) {
    const was = nodes(before)[id];
    if (was !== quantity) parts.push(`запас ${id}: ${was ?? '—'} → ${quantity}`);
  }
  const items = (snap) => new Set((snap.items ?? []).map((row) => row.item_id));
  const added = [...items(after)].filter((id) => !items(before).has(id));
  if (added.length > 0) parts.push(`новые предметы: ${added.join(', ')}`);
  return parts.join('; ');
}

function turnSection(turn) {
  const lines = [`### Ход ${turn.n} · нога ${LEG_TITLES[turn.leg] ?? turn.leg}`, '',
    `- Ввод игрока: «${turn.input}»`,
    `- HTTP: ${turn.http_status}${turn.error ? `, ошибка ${turn.error.code}${turn.error.turn_commit_status ? ` (turn_commit_status ${turn.error.turn_commit_status})` : ''}` : ''}`,
    `- Commit-state: ${turn.committed ? 'committed' : 'не committed'}${turn.recovered ? '; текст получен через presentation-recovery' : ''}`,
    `- Domain outcome (SQL): ${describeDelta(turn.before, turn.after)}`,
    ...(turn.server_errors?.length > 0 ? [`- Причина на сервере (в HTTP скрыта за TEMPORARY_ACTION_UNAVAILABLE): ${turn.server_errors.map((e) => `${e.code}: ${e.message}${e.validation ? ` [${e.validation.join('; ')}]` : ''}`).join(' | ')}`] : []),
    `- Вызовов LLM за ход: ${turn.llm_calls} · ${Math.round(turn.ms / 1000)} с`, '',
    'Что увидел игрок (дословно):', '',
    turn.prose ? quote(turn.prose) : '> (текста нет)'];
  if (turn.route_labels?.length > 0) lines.push('', `Проходы на экране: ${turn.route_labels.map((label) => `«${label}»`).join(', ')}`);
  if (turn.people_labels?.length > 0) lines.push('', `Люди на экране: ${turn.people_labels.map((label) => `«${label}»`).join(', ')}`);
  return lines.join('\n');
}

export function renderPlaytestMarkdown(report, redact = (text) => text) {
  const { identity, preconditions, legs, turns, opening, readback, infra_error: infraError } = report;
  const verdict = verdictOf(legs);
  const out = [];
  out.push(`# rt-harness: живой прогон среза D49 на v17 (${identity.scenario_id})`, '');
  out.push('Заготовка собрана скриптом из фактов прогона. Findings ниже — факты по ногам; диагноз и выводы дописывает ревьюер.', '');
  out.push('## Identity', '',
    `- Ветка \`${identity.branch}\`, HEAD \`${identity.head}\`${identity.dirty ? ' (рабочее дерево с незакоммиченными правками)' : ''}.`,
    `- Прогон \`${identity.run_id}\`: ${identity.started_at} — ${identity.ended_at} (${Math.round(identity.duration_ms / 1000)} с).`,
    `- Сценарий \`${identity.scenario_id}\`; драйвер \`tools/local-play/v17-slice-run.mjs\`; ходы идут по публичному HTTP-API (\`createGameHttpServer\` на loopback).`,
    `- Модель: \`${identity.model}\` через OpenAI-совместимый шлюз локальной Qwen; файл настроек \`${identity.llm_settings_path}\` (содержимое, URL и ключ не публикуются).`, '');
  out.push('## Preconditions', '',
    `- PostgreSQL: docker \`${preconditions.postgres_image}\` через pg-slot, свежая пара \`novgorod_world_v17\` / \`novgorod_party_v17\`, стандартный bootstrap v17 (включая импорт волны NPC, D27) с **фикстурными attestation** (\`isolated-postgres-test-fixture\`): данные одноразовые и не утверждают развёртывание.`,
    `- World Knowledge энкодер: **${preconditions.wk_encoder === 'stub' ? 'ЗАГЛУШКА (нулевые векторы 1024)' : 'реальный Giga'}**${preconditions.wk_encoder === 'stub' ? ' — векторный поиск WK не работает, привязка речи NPC к World Knowledge ослаблена; нога talk оценивается с этой оговоркой' : ''}.`,
    `- Бюджет: ${preconditions.max_turns} ходов (из них ${preconditions.reserve_make} зарезервированы под make), дедлайн ${preconditions.deadline_min} мин.`,
    `- Квалификация модели при старте: ${preconditions.qualification}.`, '');
  out.push('## Gameplay transcript', '');
  if (opening) {
    out.push('### Открытие партии', '',
      `- Партия \`${opening.party_id ?? '—'}\`; попыток new-game: ${opening.attempts}; отказов открытия (AUTHORED_OPENING_AUDIT_REJECTED): ${opening.rejections}.`, '',
      'Что увидел игрок (дословно):', '', opening.prose ? quote(opening.prose) : '> (текста нет)', '');
  }
  for (const turn of turns) out.push(turnSection(turn), '');
  out.push('## Persistence/readback', '',
    `LLM-вызовы за прогон: ${report.llm.total} (ошибок транспорта/статуса: ${report.llm.failed}); по ролям:`, '',
    fence(Object.entries(report.llm.by_role).map(([role, count]) => `${count}× ${role}`).join('\n') || '(нет)'), '');
  if (readback) out.push('Финальный SQL-снимок партии (позиция, размещения в G6 игрока, предметы, запасы):', '', fence(JSON.stringify(readback, null, 1)), '');
  out.push('## Findings', '', '| нога | итог | причина |', '|---|---|---|');
  for (const leg of legs) out.push(`| ${LEG_TITLES[leg.id]} | ${leg.status} | ${String(leg.reason ?? '').replaceAll('|', '/')} |`);
  out.push('');
  for (const leg of legs.filter(({ status, detail }) => status !== 'pass' || detail)) {
    if (leg.detail) out.push(`- **${LEG_TITLES[leg.id]}**: ${leg.detail}`);
  }
  if (infraError) out.push('', `- Сбой стенда: ${infraError}`);
  out.push('', '## Result', '', `**${verdict}**: ${legs.map((leg) => `${LEG_TITLES[leg.id]} — ${leg.status}`).join('; ')}.`, '');
  return redact(out.join('\n'));
}

export const playtestFileName = ({ date, head, runId }) => `${date}_rt-harness_${head.slice(0, 8)}_v17-slice-${runId}.md`;
