# Ключи конфига Codex 0.163.0-alpha.10.2: точная семантика

Источники: исходники openai/codex, тег rust-v0.163.0-alpha.10.2 (копии: scratchpad/codexspend/apply-tmp/src/, core/ = 499 файлов crate core + config); строки внутри codex.exe (смещения ниже); ~/.codex/models_cache.json; ~/.codex/logs_2.sqlite (ro); ~/.codex/sessions/2026/10 (1016 rollout, ro). Ничего не менялось, модель не вызывалась.

## 1. model_context_window
- 500000 для gpt-6-astra допустим. Кламп: min(cfg, max_context_window); у astra max_context_window=872000 (models_cache.json). Уверенность высокая.
  Доказательство: openai/models.rs `with_config_overrides`; у gpt-6.1-sol в каталоге родной context_window=500000.
- Каталог astra: context_window=272000, effective_context_window_percent=95. Живой лог (logs_2.sqlite, feedback_tags): model_context_window="unset", model_context_window_effective=258400 (=272000*95%), model_context_window_override=false.
- Порог автосжатия по коду: `ModelInfo::auto_compact_token_limit()` (R_openai_models.rs:529-540) = min(model_auto_compact_token_limit, ctx*9/10); без ключа = ctx*9/10. Для 272000 это 244 800; при 500000 это 450 000. Отдельный жёсткий потолок full_context_window_limit = ctx*effective_pct/100 (258 400; при 500000 будет 475 000) (session/context_window.rs:60-135). Уверенность высокая.
- Почему сжатие шло около 178K при окне 272K: по коду НЕ объясняется. Факты: 147 событий `compacted` в rollout октября, токены перед ним (last_token_usage.total_tokens): min 139 488, Q1 169 487, медиана 180 001, Q3 192 833, max 225 403; model_context_window в событиях везде 258 400. Порог по коду 244 800, то есть сжатие идёт заметно раньше.
  Проверено и ОПРОВЕРГНУТО: async_compaction (порог 65% от 272000 = 176 800 совпал бы по числу) выключен: в логах feature.async_compaction=false, remote_compaction_v2=false, context_management=false, token_budget=false, subagent_default_context_limits=false. new_context_window не вызывался (0 вхождений в rollout). Хуки token-guard логики сжатия не содержат.
  Остаются гипотезы (не доказаны): расхождение счёта токенов (оценка хвоста с запасом); сжатие по другой причине (смена модели/comp_hash, ручные /compact, прерывания). Уверенность в причине: низкая. Практика: явный model_auto_compact_token_limit может только ЗАНИЗИТЬ порог (min с 90% окна); поднять порог выше 90% окна ключом нельзя.

## 2. Сжатие
- model_auto_compact_token_limit (число токенов): итоговый порог = min(значение, ctx*9/10). В логе сейчас unset.
- model_auto_compact_token_limit_scope: `total` (по умолчанию, в логе "total") считает весь активный контекст; `body_after_prefix` считает только токены, добавленные после начального префикса (prefill_input_tokens окна), при этом лимит берётся из ключа как есть, без min с 90% (context_window.rs:77-94). Строки enum в exe около смещений 263586991, 265300421.
- model_post_turn_compact_threshold_percent: u8 0..100, >100 отклоняется (core/config/mod.rs:3310). Default = 0 (`unwrap_or_default`, mod.rs:4418). 0 отключает сжатие в конце хода (turn.rs:782 требует >0); при >0 сжатие в конце хода, если active_context*100 >= full_context_window_limit*percent. Уверенность: высокая по коду; живым запуском не проверено.
- model_async_compact_threshold_percent лежит в `[features.async_compaction]` (default 65, нужен remote_compaction V2); фича выключена, на текущее поведение не влияет.

## 3. ГЛАВНОЕ: наследование helpers
- spawn_agent: ребёнок клонирует Config родителя (agent/control/spawn.rs, child_config.rs 95-200), включая model_context_window, model_auto_compact_token_limit, tool_output_token_limit. Исключение: feature `subagent_default_context_limits` (default false; в логах false): при включении окно и auto_compact у детей сбрасываются в модельные дефолты (None); tool_output_token_limit наследуется ВСЕГДА. Уверенность высокая.
- Роли (~/.codex/agents/*.toml, `[agents.<role>].config_file`) переопределяют только: model, reasoning effort, summary, verbosity, personality, service_tier, developer_instructions, часть features, skills (agent/role.rs). Окно/сжатие/tool_output в роль НЕ входят: «окно только для главного потока» через роль задать нельзя. Уверенность высокая по коду.
- `[agents]`: enabled, default_subagent_model, default_subagent_reasoning_effort, interrupt_message, max_concurrent_threads_per_session, max_depth (V1), job_max_runtime_seconds; `[agents.<role>]`: config_file, description, nickname_candidates. Для astra в каталоге: multi_agent_version=v2, multi_agent_reasoning_effort=xhigh.
- Профили v2: `-p NAME` читает `$CODEX_HOME/NAME.config.toml`; legacy `[profiles.*]`/`profile=` даёт ошибку. Профиль и -c действуют на весь процесс и затем клонируются детям. `codex exec resume`: есть -c, флага -p нет (help/*.txt в scratchpad).
- Путь «широкое окно у главного, дефолт у детей»: окно в конфиге/профиле процесса + `[features] subagent_default_context_limits = true` (feature under development; поведение выведено из кода, живым запуском не подтверждено). Дети тогда получают дефолты модели (для astra 272000 / порог 244 800). Уверенность средняя-высокая.

## 4. tool_output_token_limit
- Заменяет `truncation_policy.limit` модели (в каталоге: mode=tokens, limit=10000): усечение вывода одного вызова инструмента перед попаданием в контекст. Не лимит контекста и не лимит ввода; заменяет, не суммируется; наследуется детьми (п.3). Уверенность высокая по model_info.rs; детали усечения по обработчикам инструментов не изучались.
- Разумное значение: оставить 10000 или 6000-8000 ради экономии на шумных логах; ниже 4000 риск потерять нужный хвост вывода. Это рекомендация, не факт.

## 5. include_collaboration_mode_instructions
- Ключ существует: config.schema.json:7819, `Option<bool>` в config_toml.rs:263 и profile_toml.rs:56 (можно в профиле); default true (config/mod.rs:4131-4132). Описание: «Whether to inject the <collaboration_mode> developer block.»
- Единственное использование: session/world_state.rs:242 (секция CollaborationModeState). Убирает блок «# Collaboration Mode: Default» (около 300 токенов; exe-смещение 270847555): про request_user_input и режимы Default/Plan. Описание ролей multi_agent (root/child, spawn_agent, followup_task) лежит отдельно в model_messages.multi_agent, регистрация инструментов от ключа не зависит, поэтому spawn_agent/multi-agent не ломается. Побочно: пропадёт совет «в Default-режиме предпочитай допущения вопросам»; в Plan-режиме блок терять нельзя. Уверенность высокая по коду; живой запуск не делался.

## 6. Отключение плагина
- Синтаксис: `[plugins."имя@маркет"]` + `enabled = false` (PluginConfig.enabled: «Explicit activation override. Omission inherits the installed-plugin default», config.schema.json:3714-3724; общий дефолт — `[plugins._default]`). Текущий config.toml использует эту форму с enabled = true (13 плагинов).
- На `codex exec` действует: тот же загрузчик config-слоёв; выключенные id попадают в disabled_plugin_ids хода (codex_thread.rs, hook_runtime.rs:364), дети наследуют (agent/control/spawn.rs:745-754). Эмпирически (debug prompt-input с временным CODEX_HOME) не проверялось: плагины берутся из кеша ~/.codex, во временном доме их нет. Уверенность средняя-высокая.
- В каталоге astra include_skills/plugin/apps_usage_instructions=False, поэтому экономия от отключения плагинов — в списке навыков/инструментов; размер оценить не удалось.

## 7. Надбавка выше 272K для astra
- API, официально: https://developers.openai.com/api/docs/models/gpt-6-astra.md — окно 1 050 000 (max input 922 000), max output 128 000; промпты свыше 272K входных токенов оцениваются в 2x по input и cache и 1.5x по output на весь запрос (не только на превышение).
- Подписочный Codex: на https://learn.chatgpt.com/docs/pricing (редирект с developers.openai.com/codex/pricing) про 272K и long-context надбавку нет ни слова; есть только множитель Ultrafast (8x подписка / 6x кредиты). Страница help.openai.com/en/articles/20001516 отдала 403, не прочитана. Вторичные источники противоречат: codex.danielvaughan.com (2026-09-04) утверждает 2x/1.5x и советует auto_compact_token_limit около 200K; другой вторичный — что в Codex надбавки нет. Вывод: для API надбавка есть официально; для Codex по подписке официального подтверждения ни в ту, ни в другую сторону нет. Уверенность: высокая для API, низкая для Codex.
- Каталог Codex держит окно astra 272000 (max 872000), то есть ровно на ценовом пороге API; окно выше 272000 заходит в зону надбавки (если она применима в Codex).
