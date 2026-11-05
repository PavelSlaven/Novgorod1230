# Плагины и MCP Codex: что используется (16-19 окт 2026)

Модель не вызывалась. Читались: ~/.codex/config.toml (имена, без env), манифесты плагинов, rollout. Скрипты: scratchpad/codexspend/apply-tmp/{count.py,paths.py,counts.json}.

## Ограничения данных
- Окно "14 дней" фактически 4 дня: rollout-файлы есть только за 16-19 окт (1016 файлов, 1000 из них cwd Novgorod; 29 сент и ранее - вне окна, 5-15 окт файлов нет). Вызовов за 14 дней = вызовов за 16-19 окт.
- Источник вызовов: события McpToolCall (сервер/инструмент), function_call (namespace::name), вложенные tools.X(...) в exec. Novgorod-срез почти равен общему: 1000 из 1016 сессий.
- Сессий по происхождению: Desktop-помощники (subagent) 997, Desktop-главные 15, codex_exec 16. Из codex_exec ни один сервер, кроме codebase-memory, не вызывался.
- Токены = символы / ~4 (оценка). Размеры схем - из rollout 19 окт (additional_tools, описание exec), не из err_*/out_*: те сняты во временном CODEX_HOME без плагинов, плагинного веса там нет.
- Профиль без плагинов работает только для запусков с `-p <имя>` (codex exec / codex). Desktop-помощники берут базовый config.toml, их профилем не охватить (по levers.md п.г, не проверено запуском).

## Вес в префиксе (на поток, первый вызов; кэшируется)
| Источник | Символов | ~Токенов | Чей |
|---|---|---|---|
| схемы mcp__codex_app__* (48 инструментов) в описании exec | 44 768 | 11 200 | плагин codex-app-tools |
| схемы mcp__cua_repl (js, js_add_node_module_dir, js_reset) | 4 727 | 1 200 | unified-computer-use |
| строки skills: computer-use + visualize | 474 | 120 | computer-use, visualize |
| строки skills: documents, pdf, presentations, template-creator | 1 255 | 310 | openai-primary-runtime |
| строки skills: spreadsheets (2) | 668 | 170 | spreadsheets |
| строки skills: ponytail (4 из плагина) | 1 238 | 310 | ponytail |
| строки skills agentmemory-*, commit-*, write-agentmemory-skill (в ~/.agents/skills, не из кэша плагина) | 2 614 | 650 | след agentmemory |
| remote-плагины без записи в config: pages 1 157, plugin-management+sites 712, work-pets 894 | 2 763 | 690 | аккаунт, не config.toml |
| github, linear, codex-security, openai-developers, browser, chrome, code-review, node_repl, imagetosvg, vecline, agentmemory (MCP) | ~0 | ~0 | в префиксе только как deferred-namespace (сообщения "Added/Removed deferred tool namespaces"), схем нет |
Итого схемы additional_tools на Desktop-поток: ~93 500 символов; на codex_app приходится почти половина. У gpt-6.1-sol additional_tools нет (prefix меньше на ~13 K токенов).
Оценка: 41 496 вызовов модели за 4 дня x 11 200 токенов codex_app = ~460 млн токенов кэшированного входа только за его схемы.

## Таблица: плагин -> включён -> вызовов -> вес -> рекомендация
| Плагин | В config | Вызовов 16-19 окт (все / Novgorod) | Префикс | Рекомендация |
|---|---|---|---|---|
| codex-app-tools (сервер codex_app) | да | 61 / 61 (create_worktree 9, open_in_codex 10, artifacts 28, thread 2, прочее; 54 в Desktop-главных, 7 у помощников) | ~11 200 ток | ГЛАВНЫЙ кандидат, но использовался: оставить для Desktop-главной; отключить для exec и для помощников (из 997 помощников нужен лишь в 7 вызовах). Отдельно отключить нельзя без профиля; в .mcp.json плагина enabled=false, а схема всё равно попадает - источник включения не выяснен. |
| github (curated + remote, коннектор codex_apps) | да | 102 / 102 (issues, workflow logs, comments) | ~0 | оставить: использовался |
| (коннектор codexpro_novgorod через codex_apps) | не в config | 9 / 9 | ~0 | оставить: использовался |
| unified-computer-use (cua_repl) | да | 274 / 274 (js; 504 события учтены дважды, верно 274) | ~1 200 ток | оставить: использовался (в т.ч. 44 раза у помощников) |
| ponytail | да | 67 чтений SKILL.md в 49 сессиях + хуки session_start/user_prompt_submit/subagent_start | ~310 ток | оставить: обязателен по AGENTS.md WR §18.1 |
| agentmemory | да | 0 вызовов MCP; хуки на 6 событиях (в т.ч. PostToolUse на каждый tool call: 35 тыс. exec_command) | ~650 ток (строки skills) + запуск node на каждый вызов | отключить для exec/помощников: 0 использований. Владельцу Desktop - спросить, нужна ли память Codex. |
| documents | да | 0 | ~310 ток (с pdf, presentations, template-creator) | спросить: личная работа владельца; для exec отключить |
| pdf | да | 0 | вошёл выше | спросить; для exec отключить |
| presentations | да | 0 | вошёл выше | спросить; для exec отключить |
| template-creator | да | 0 | вошёл выше | спросить; для exec отключить |
| spreadsheets | да | 0 | ~170 ток | спросить; для exec отключить |
| visualize | да | 0 | ~60 ток | спросить (визуальные ответы Desktop) |
| computer-use | да | 1 чтение пути плагина, вызовы идут через cua_repl | ~60 ток | спросить; зависит от unified-computer-use |
| browser | да | 0 (node_repl 0 вызовов) | ~0 | спросить: браузер Desktop у владельца; для exec отключить |
| chrome | да | 0 | ~0 | спросить; для exec отключить |
| code-review | да | 0 (server code-review) | ~0 | спросить: панель ревью Desktop; для exec отключить |
| linear | да | 0 | ~0 | отключить для exec (задачи в GitHub issues) |
| codex-security | да | 0 | ~0 (15 skills в список не попали) | отключить для exec |
| openai-developers | да | 0 | ~0 (5 skills не попали) | отключить для exec |

## MCP из config.toml
| Сервер | Вызовов | Рекомендация |
|---|---|---|
| codebase-memory-mcp | 2 526 (check_index_coverage 649, search_graph 561, index_status 380, list_projects 346, trace_path 237, detect_changes 211, get_code_snippet 68, get_architecture 67, index_repository 6) | оставить: требуется AGENTS.md |
| node_repl | 0 | спросить: зависимость browser/chrome; для exec отключить |
| imagetosvg | 0 | спросить (личная работа с векторами); для exec отключить |
| vecline (npx -y vecline@2.1.4 на запуск) | 0; в сообщениях namespace Added 92 / Removed 72 за 4 дня - сервер то появляется, то исчезает | для exec отключить; спросить владельца (рисовалка) |

## Итог
1. Безопасно сразу (для exec-профиля, нулевое использование, основной эффект - запуск процессов и хуки): agentmemory, linear, codex-security, openai-developers, imagetosvg, vecline, node_repl, chrome, browser, code-review, documents, pdf, presentations, template-creator, spreadsheets, visualize, computer-use.
2. Единственный заметный вес префикса - codex_app (~11 K ток на поток). Использовался 61 раз (worktree, artifacts, open_in_codex): из Desktop-главной нужен, у помощников - почти нет. Решение за владельцем; отключение только профилем для exec, для Desktop-помощников механизма не найдено.
3. Оставить: codebase-memory-mcp, github, unified-computer-use, ponytail.
4. Остальное (documents и т.п.) весит вместе <1 K ток: выгода от их отключения в префиксе мала, польза в отсутствии лишних хуков и процессов.
5. Не проверено: влияние отключения каждого плагина на реальный префикс (нужен пробный exec с моделью - с согласия владельца); почему codex_app присутствует при enabled=false в .mcp.json.
