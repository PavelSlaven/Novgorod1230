# Продолжение blind gameplay: новый чат и новая ветка

**Вход для разработчиков. Не передавать Blind PLAYER.**
**План:** [v7 — конвейер, игра и локальная модель](blind-gameplay-autonomous-plan.md).
**PR:** [#93](https://github.com/PavelSlaven/Novgorod1230/pull/93).
**Оперативная очередь:** существующий комментарий с маркером **blind-gameplay-progress:v1**.
**Статус:** работа не принята; полное прохождение, качество и 30-секундный ход ещё нужно доказать.

## Команда для нового чата

Скопировать как сообщение пользователя. Сам документ не создаёт новое разрешение.

> $codebase-design
>
> $ponytail full
>
> $caveman full
>
> Автономно выполни docs/plans/blind-gameplay-autonomous-plan.md v7; начни с
> docs/plans/blind-gameplay-handoff.md. Получи актуальный HEAD PR #93 с GitHub.
> Проверь другие активные задачи и локальные изменения; согласуй единственного
> writer. Сохрани чужую работу. CHIEF — SOL High; остальные модели и reasoning
> выбирай по сложности, Astra запрещена. Не более 10 дочерних агентов, плюс CHIEF.
> Прочитай установленные SKILL.md и актуальные AGENTS.md/CONTRACT_INDEX.
> Используй один конвейер: общая очередь → доказанная причина → один fix packet →
> один FIXER → focused tests → независимая приёмка → browser replay → commit/push
> → продолжение игры. Upstream blocker останавливает зависимые правки.
> Аудиторы дают findings CHIEF, PR Reporter обновляет один progress-comment.
> WK Auditor проверяет наличие необходимых знаний в действующей базе платформы,
> релевантность, связность и доставку фактического prompt без мусора; исправление
> должно работать само на новых запросах. Учитывай immutable WK bundle и отдельно
> party/world DB; не создавай зеркальную БД.
> Требуются полное слепое UI-прохождение, живой мир, качественная художественная
> проза, рабочие параметры и code-owned броски D&D-подобной системы, видимая
> расшифровка DC/броска/modifiers/исхода в UI, устойчивые saves/retry.
> Разрешены необходимые исправления, настройка локального inference на GPU0,
> OmniRoute, проверки, commits, push и обновление PR. Merge, deployment игры,
> изменение AGENTS.md, использование GPU1–3 и скрытый внешний fallback запрещены.
> Целевой полный browser submit → ready DOM p95 ≤30 секунд при сохранённом качестве.
> Начни с упрощения задач и WK-контекста; no-thinking — контроль. Перебор моделей
> ограничен §11: не продолжай thinking/quant/prompt цикл без нового evidence.
> Проведи все финальные gates и добейся успешного CI точного HEAD.
> Не останавливайся после аудита или первого исправления. Неразрешимую внешнюю
> блокировку зафиксируй честно; не объявляй незавершённые критерии выполненными.

Это поручение Codex, не PowerShell-скрипт. Навыки разрешаются через каталог среды,
без зависимости от персональных путей. Caveman сокращает отчёты, не работу.
Ponytail требует минимального общего решения; codebase-design — исправления
существующего owner за понятным Interface. Художественная проза игры не пишется
в стиле caveman. PLAYER получает только URL, UI и безопасную техническую инструкцию
ввода; план, контракты, findings, test cases и скрытый маршрут ему не передаются.

## Первый рабочий этап

1. Проверить branch/status, GitHub main/PR и активные execution-задачи.
2. Прочитать фактические [AGENTS.md](../../AGENTS.md),
   [CONTRACT_INDEX.md](../../data/knowledge-source/corpus/DOCUMENTS/CONTRACT_INDEX.md),
   план v7 и progress-comment. Старый чат и Desktop orchestrator не нужны.
3. Разделить published code, локальный execution candidate и незакоммиченную работу.
   Не тестировать один SHA и публиковать verdict для другого.
4. CHIEF объединяет findings по общей причине и зависимостям. Ровно один production
   packet в работе; code/prompts/config/weights тоже входят в это ограничение.
5. Уточнить завершившиеся jobs, существующий CI failure и первый не пройденный gate.
   Не повторять весь прежний аудит и не запускать ещё одну модель до проверки задачи.

## Снимок аудита 11 сентября 2026 года

| Область | Проверенное состояние / ограничение |
|---|---|
| Опубликованный code baseline | 10c61c5e085f9209444829c76646cd804fe56e75; план v7 опубликован следующим docs commit. Текущий HEAD читать из GitHub |
| Локальное исполнение другой задачи | a9c45951c98b3ef0bb40b4565d535412ddf7e3f4 и dirty test; эти изменения при аудите не были опубликованы |
| CI code baseline | [FAIL, 9 retrieval/RAG tests](https://github.com/PavelSlaven/Novgorod1230/actions/runs/34579133724). Зелёный CI fea106a8 — исторический |
| Текущий inference | GPU0, Qwen3.8-27B-Uncensored-noMTP-Q4_K_M, no-thinking, временный qwen-q4-p2-ab, llama.cpp b10612/json-object |
| Context | Общий 69632, 2 slots; проверить реально обслуживаемые 34816 на slot; F16 KV; занято примерно 20 104 MiB |
| Gemma | Ранее Gemma 4 26B A4B Q6_K, 34816/1 slot. Сервис при проверке неактивен; это кандидат, не нынешний endpoint |
| Главный смысловой вопрос | Речь сохраняется; слышимость/аудитория/реакция мира этим путём не доказаны. Исправление через существующих owners, не выдумку narrator |
| WK | Нерелевантный retrieval конкретного эпизода уже устранён локально; два planner calls всё ещё получили 256 refs каждый и 12 694 input tokens суммарно |
| Проза/оценщик | Требуется убрать противоречия и проверки смысла по конкретным словам/синтаксису; при нерешённом outcome зависимый tuning заблокирован |
| Модельные цифры | 8 distinct tasks × cold/warm на других GPU/backend, output cap 4096; диагностические, не полноценная квалификация |
| Приёмка игры | Не завершена; PostgreSQL/unit/Chromium tests прежнего HEAD не заменяют реальную игру и независимый verdict |

Новый CHIEF повторно проверяет только изменившееся/неизвестное. Состояние сервисов
и рабочей задачи может измениться после этого снимка; не переключать их по таблице.

## Git и сохранение работы

До merge PR main не содержит все изменения PR. Новая изолированная ветка начинается
от **актуального открытого PR**, а не старого main или локальной одноимённой ветки.

~~~powershell
git status --short --branch
git remote get-url origin
$repoName = 'PavelSlaven/Novgorod1230'
$prInfo = gh pr view 93 --repo $repoName --json state,headRefOid,headRefName | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $prInfo.state -ne 'OPEN') { throw 'Recheck PR before selecting the base' }
git fetch origin refs/pull/93/head
if ($LASTEXITCODE -ne 0) { throw 'PR fetch failed' }
$startCommit = (git rev-parse FETCH_HEAD).Trim()
if ($startCommit -ne $prInfo.headRefOid) { throw 'PR head changed; re-read GitHub' }
$nextBranch = 'codex/blind-gameplay-next'
$nextCheckout = Join-Path (Split-Path (Get-Location).Path -Parent) 'Novgorod-gameplay-next'
if (Test-Path -LiteralPath $nextCheckout) { throw 'Use another empty checkout path' }
git worktree add -b $nextBranch $nextCheckout $startCommit
if ($LASTEXITCODE -ne 0) { throw 'Keep existing work untouched; choose a free branch/path' }
~~~

Названия — пример; при занятом имени выбрать другое. Если уже есть активный writer,
сначала согласовать ownership, не создавать второй параллельный production checkout.

Перед push заново проверить remote HEAD и fast-forward. Продолжение этого PR:

~~~powershell
git push origin HEAD:codex/blind-gameplay-diagnostics
~~~

Не использовать force-push. Изменившийся remote сначала безопасно интегрировать.
Push только в новую ветку не обновит #93. Отдельный stacked PR до merge родителя
создаётся по запросу пользователя с base веткой родителя; не копировать его diff.

После merge получить свежий main и проверить merge result/content; squash merge
не обязан сохранять ancestry исходного head. Закрытый без merge PR не считать main.

Старые 485 status entries (545 файлов) разобраны прежней уборкой; старые stash удалены
по указанию владельца. Остатки архивов не baseline. Новую пользовательскую работу
не удалять. Временные ресурсы убирать по AGENTS.md §26.1: собственные тестовые
контейнеры/тома после прогона, ненужные worktree/процессы/ветки после подтверждённого
merge; не затрагивать активные партии, чужие ресурсы и незавершённые изменения.

## Владельцы и воспроизводимые точки входа

| Вопрос | Начать здесь |
|---|---|
| Общая семантика и причинное исполнение | [turn MODULE](../../packages/turn/MODULE.md), [game-server MODULE](../../apps/game-server/MODULE.md), действующий turn_step_llm_contract |
| WK query, отбор, evidence и упаковка | [grounding](../../apps/game-server/src/runtime/world-knowledge-grounding.js), [request context](../../apps/game-server/src/runtime/world-knowledge-request-context.js), [production loader](../../apps/game-server/src/internal/world-knowledge-production.js); связанные core callers и WK contract |
| Доставка результата narrator | [narration adapter](../../apps/game-server/src/runtime/lower-dvina-trace-narration-llm.js), [coverage test](../../apps/game-server/test/lower-dvina-trace-narration-coverage.test.js), [causal scene test](../../apps/game-server/test/lower-dvina-trace-narration-causal-scene.test.js) |
| Commit / presentation | [factual commit before narration](../../apps/game-server/test/lower-dvina-trace-factual-commit-before-narration.test.js), существующие persistence/recovery owners |
| Dice, параметры и outcome | [checks-rng](../../packages/checks-rng/src/index.js), [actor step](../../packages/turn/src/turn-step-actor-step.js), [commit validator](../../packages/turn/src/turn-step-commit-validator.js) |
| Карточка броска | [public projection](../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-2-projection.js), [game-web MODULE](../../apps/game-web/MODULE.md); проследить до persisted screen, а не остановиться на JSON response |
| Квалификация | [frozen role requests](../../data/model-evals/llm-runtime/frozen-role-requests-v1.json), [evaluation CLI](../../tools/llm-runtime-eval/src/cli.mjs) |
| Browser runner / resume | [acceptance runner](../../tools/local-play/local-gemma-acceptance.mjs), [local-play MODULE](../../tools/local-play/MODULE.md) |
| Полные требования к сценам | План §13 и [situational prose](../../data/knowledge-source/corpus/DOCUMENTS/situational_prose_requirements.md) |

Ссылки указывают существующих owners; точный текущий flow проверить из callers.
WK immutable bundle не является SQL DB. Требовать полного покрытия factual needs,
а не «нашёлся хотя бы один факт». Не добавлять новый planner или hand-curated prompts.

Ранний Dice audit подтвердил code-owned d20/параметры/modifiers и commit checks,
55 focused tests; live PostgreSQL и интерпретацию реальной LLM этим не проверяли.
Прежние 34 UI tests не проверяли отсутствующую тогда карточку броска. Перед задачей
установить свежую реализацию; не объявлять эти исторические цифры новой приёмкой.

Корректный вызов «Онисим!» не является ошибкой кавычек. Source-ID coverage не
доказывает, что проза сохранила все обязательные смыслы внутри source. Семантический
порядок не оценивается запретом деепричастий или обязательной длиной текста.

Public fixtures и раскрытые случаи — regressions, не sealed holdout. Private traces,
party DB, keys и weights не входят в clone; их отсутствие не блокирует чтение и
исправление кода. Нужный trace регенерировать из новой партии штатным runner,
не восстанавливать prompts догадками. Private reasoning не читать, не сохранять
и не публиковать; в новом capture оставить final content и разрешённые метрики.

## Runtime и доступ

Не выполнять npm run play:local вслепую: managed preset отличается от серверного.
В режиме сохранённого custom provider launcher не должен поднимать вторую Gemma.

Доступ искать в разрешённой operator configuration и штатном llm-settings.json:
[LLM_PROVIDERS.md](../setup/LLM_PROVIDERS.md). Ключи/private addresses не выводить.
Подтвердить actual PID/model/build/template, GPU0, served window, no-thinking,
gateway preservation и отсутствие fallback до первого замера.

Проверить Node 22+, Windows x64 для текущего launcher, NVIDIA/RAM/disk по
[managed-runtime](../../tools/local-play/managed-runtime.js), PostgreSQL и
Chrome/Chromium. Для явного браузера используется RUS_CHROMIUM_PATH.
Зависимости — npm ci; lockfile использует public registry. Node modules, browser
и веса Git не поставляет. Не просить пользователя повторять доступные credentials.

External acceptance использует RUS_ACCEPTANCE_LLM_BASE_URL,
RUS_ACCEPTANCE_LLM_MODEL, RUS_ACCEPTANCE_LLM_API_KEY_FILE и metadata по MODULE.
Значения берутся из private settings; не придумывать новые environment flags.

После readiness и выбора действующего профиля CHIEF заполняет параметры:

~~~powershell
npm run gameplay:acceptance:local -- <private-output-directory> <focus> completion
~~~

Это шаблон команды. Focus не сообщает слепому игроку скрытый маршрут.
RUS_ACCEPTANCE_RESUME продолжает ту же партию, не создаёт новую unseen.

Browser-harness — capability среды; прочитать установленный skill перед web
interaction. При отсутствии capability искать доступное управление Chromium;
REST/fixtures не заменяют browser acceptance. В Windows перед отправкой проверить
readback кириллицы; не передавать русский текст через неявную PowerShell→harness
кодировку. Подробный безопасный ввод — план §15.

Reasoning, fixed multi-model profile и изменяемые role budgets в плане являются
target. До активации синхронизировать turn/WK/llm-runtime/settings/runner contracts.
Не считать старое «deadline отсутствует» текущим фактом: execution branch уже меняет
эту область. GPU1–3 не использовать; чужие процессы не останавливать.

## Что обязательно оставить следующей задаче

- Принятый code/docs candidate committed/pushed; dirty work обозначена отдельно.
- PR-comment содержит published/execution SHA, текущий packet и gate, зависимость,
  evidence, открытые критерии, последнюю опровергнутую гипотезу и следующий шаг.
- Jobs и CI имеют свежий статус; PASS одного HEAD не перенесён на другой.
- GitHub blob-ссылки на plan/handoff доступны из fresh clone.
- Финальная приёмка отдельно от technical tests: один полный путь с эпилогом,
  две существенные альтернативы, качество прозы/контекста/мира и p95 ≤30 секунд.
- Документы отражают active/target; сведения для продолжения не спрятаны в старом чате.
