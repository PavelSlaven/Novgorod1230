# Продолжение blind gameplay: новый чат и новая ветка

**Назначение:** точка входа для CHIEF и разработчиков. **Не передавать PLAYER.**
**Основной PR:** [#93](https://github.com/PavelSlaven/Novgorod1230/pull/93).
**Полный план:** [v6 — автономная приёмка](blind-gameplay-autonomous-plan.md).
**Статус:** продолжение реализации; готовность игры не подтверждена.

## Короткое поручение для нового чата

Скопировать как сообщение пользователя; таким образом цель и разрешённые действия
явно поступают в новую задачу. Документ сам по себе не является новым разрешением
от владельца.

> $codebase-design
>
> $ponytail full
>
> $caveman full
>
> Начни автономное исполнение плана Novgorod1230 по docs/plans/blind-gameplay-handoff.md и
> docs/plans/blind-gameplay-autonomous-plan.md. Получи актуальный HEAD PR #93 с GitHub;
> новую ветку начинай от него, пока PR не смержен. CHIEF — SOL High; модели и reasoning
> остальных агентов выбирает CHIEF по сложности, Astra запрещена. Максимум 10 дочерних
> агентов одновременно, плюс CHIEF. Прочитай установленный SKILL.md каждого указанного
> навыка и действующий AGENTS.md. Применяй навыки к работе команды разработки:
> codebase-design — глубокие Module у существующих owners; ponytail full — минимальное
> системное решение всего класса проблем; caveman full — краткие отчёты без сокращения
> исследования, реализации и проверок. Художественная проза игры подчиняется своим
> контрактам. Работай автономно:
> диагностика, исправления, проверки, разрешённая настройка локального inference на
> GPU0, commits, push и обновление PR. Сохрани существующие локальные изменения.
> Не выполняй merge, deployment игры и изменения AGENTS.md. Требуются полное слепое
> прохождение, живой мир, художественная проза и измеренное время полного хода около
> 30 секунд. Контекст, ограничения и незакрытые критерии находятся в указанных файлах;
> история старого чата не требуется. До включения reasoning сравни подходящие кванты
> без thinking на той же GPU0; сохраняй обязательный контекст, качество и бюджет хода.
> Назначь отдельного RPG / D&D Mechanics & Dice Auditor: параметры, значимые checks,
> броски в коде и корректная интерпретация переданного результата локальной LLM.
> Добавь в UI видимый бросок, его сложность, результат и расшифровку modifiers из
> code-owned результата; сохраняй эту информацию при reload/retry.

Это команда-поручение для нового чата Codex, не PowerShell-скрипт. Имена навыков
разрешаются через установленный каталог среды; локальные пользовательские пути к
SKILL.md в GitHub не копируются. В задания агентов передаются применимые правила
навыков; PLAYER по-прежнему не получает developer handoff и скрытое покрытие.

## С чего начать

1. Проверить фактические branch/status и GitHub PR; не доверять локальной ветке с
   похожим именем. Прочитать [AGENTS.md](../../AGENTS.md) и
   [CONTRACT_INDEX.md](../../data/knowledge-source/corpus/DOCUMENTS/CONTRACT_INDEX.md).
2. Прочитать этот handoff, полный план и существующий progress-комментарий PR
   с маркером **blind-gameplay-progress:v1**.
3. Установить текущие active profiles, sources и relevant MODULE.md; не считать
   proposed reasoning/multi-model/deadline policy уже реализованной.
4. Выдать агентам короткие самостоятельные задания. PLAYER получает только URL,
   интерфейс и техническую инструкцию правильного ввода; этот handoff, план,
   observations, tests и скрытые условия ему не передаются.
5. Закрывать первый доказанный важный дефект; не повторять весь прежний аудит.

Внешний файл universal orchestrator и Desktop-план v3 не нужны: необходимые
требования включены в репозиторный план. Информация в нём о baseline — исторический
снимок, а не постоянно обновляемый статус running server.

## Git: как не потерять предыдущую работу

До merge PR #93 ветка main не содержит все его изменения. На последней проверке
main был ad68f0be988c9be3cf06e89b3e6b38df150eda96; кодовый baseline PR —
fea106a80290c270443eb64336bfc41484274f8a. **Текущий HEAD всегда читать из GitHub.**

Локальная ветка codex/blind-gameplay-diagnostics ранее оказалась старее remote
одноимённой ветки. Прежние 485 записей status (545 файлов) разобраны отдельной
задачей уборки 11 сентября 2026 года: основной checkout приведён к чистому main,
старые stash удалены по прямому указанию владельца. Остатки старых копий и архивов
не являются рабочим baseline и не должны восстанавливаться в PR. Текущее состояние
всегда проверять заново; новые незакоммиченные изменения защищены AGENTS.md.

Временные ресурсы исполнения убирать по AGENTS.md §26.1: тестовые контейнеры
вместе с их томами — после каждого прогона; ненужные worktree, процессы и ветки —
после подтверждённого merge. Архивирование по умолчанию не требуется.

Read-only проверка актуального PR:

~~~powershell
git status --short --branch
git remote get-url origin
gh pr view 93 --repo PavelSlaven/Novgorod1230 --json state,headRefName,headRefOid,baseRefName,isDraft,statusCheckRollup,url
~~~

Создание новой изолированной ветки из **текущего открытого PR**, выполняемое CHIEF.
Имена ниже — пример для нового свободного каталога и отсутствующей ветки.
При совпадении имени выбрать другое, не удаляя прежнее:

~~~powershell
$repoName = 'PavelSlaven/Novgorod1230'
$prInfo = gh pr view 93 --repo $repoName --json state,headRefOid,headRefName | ConvertFrom-Json
if ($prInfo.state -ne 'OPEN') { throw 'Check merged/closed PR state before selecting the base' }
git fetch origin refs/pull/93/head
if ($LASTEXITCODE -ne 0) { throw 'PR fetch failed' }
$startCommit = (git rev-parse FETCH_HEAD).Trim()
if ($startCommit -ne $prInfo.headRefOid) { throw 'PR head changed; re-read GitHub before continuing' }
$nextBranch = 'codex/blind-gameplay-next'
$nextCheckout = Join-Path (Split-Path (Get-Location).Path -Parent) 'Novgorod-gameplay-next'
if (Test-Path -LiteralPath $nextCheckout) { throw 'Use another empty checkout path' }
git worktree add -b $nextBranch $nextCheckout $startCommit
if ($LASTEXITCODE -ne 0) { throw 'Worktree creation failed; keep existing work untouched' }
~~~

После перехода в новый checkout сверить HEAD с выбранным startCommit и убедиться,
что присутствуют handoff, полный план и observations. Если PR успел измениться,
переоценить base до реализации.

- Продолжение того же PR: перед push перечитать remote HEAD, проверить отсутствие
  чужих новых commits и fast-forward; использовать явное назначение
  **git push origin HEAD:codex/blind-gameplay-diagnostics**. Push в новую ветку
  сам по себе не обновляет PR #93.
- Если пользователь просит отдельный следующий PR до merge родителя: новая ветка
  начинается от текущего head родителя, а base нового PR — ветка PR #93; явно
  указать зависимость. Не делать второй независимый PR с копией того же diff.
- Если #93 уже смержен: получить свежий main и проверить наличие этих документов
  и реализованных изменений. Не требовать ancestry старого head при squash merge;
  сверять merge result и содержание. Если PR закрыт без merge, его изменения не
  считать частью main.
- Не переписывать общую историю и не делать force-push. При новых upstream commits
  сначала установить зависимости и безопасно интегрировать их.

## Что доказано и что открыто

Последний полный CI для кодового baseline fea106a8:
[успешный run](https://github.com/PavelSlaven/Novgorod1230/actions/runs/34562718377).
PostgreSQL acceptance 5/5 и Chromium E2E 3/3 относятся к техническим проверкам того
кандидата. Они **не доказывают** качество реальной локальной модели и полное слепое
прохождение. CI нового published HEAD проверяется отдельно:

~~~powershell
gh pr checks 93 --repo PavelSlaven/Novgorod1230
~~~

| Осталось | Первое полезное действие и критерий |
|---|---|
| Обязательный смысл потерян, auditor ложно принимает прозу | Проследить required current beat → writer → audit по опубликованному случаю; квалифицировать пропуски внутри одного source, не считать coverage source id доказательством всего смысла |
| Медленный составной ход | Построить реальный critical path, убрать повторную семантику у существующих owners; измерять browser submit → ready DOM |
| Runtime policy ещё старая | Согласовать planned context/reasoning/role bindings с llm-runtime, settings, launcher и WK contracts; не включать target молча |
| Кванты без thinking ещё не сравнены по новому протоколу | Проверить перспективные fitting quants одной исходной модели при одинаковых context/KV/template/sampling, затем качество на holdout и целый браузерный ход; см. раздел 11.3 плана |
| RPG / D&D: сквозная приёмка бросков | Отдельный Mechanics & Dice Auditor проверяет параметры/checks/code-owned RNG, доставку результата и его интерпретацию реальной LLM; технические tests не заменяют browser evidence; см. раздел 16.1 плана |
| UI: прозрачная проверка | Показывать player-relevant roll, сложность/DC, modifiers с источниками, итог и исход из code-owned projection; согласовать visibility contracts и persistence/reload; см. раздел 16.3 плана |
| Достаточность observation/materialization | Различить допустимую неизвестность и незавершённую механику восприятия; не зафиксировать blanket unknown как решение |
| Литературная и игровая приёмка | Полный независимый blind UI-run и отдельно локальный explorer; проза, время и мир проверяются целиком |
| Финальная серия | Один полный сюжетный путь с эпилогом + две длительные alternative campaigns; outcomes и покрытие задать до запуска |

Сначала подтвердить причину, затем дать FIXER один bounded packet. Для первого
дефекта можно проверить гипотезу о чрезмерно сложной упаковке нескольких обязательных
смыслов в один source. Это **гипотеза**, а не предписанный fix. Не добавлять phrase
branches или parser, который узнаёт только опубликованную фразу.

Корректный вызов «Онисим!» не является дефектом кавычек. Не открывать его заново без
нового свидетельства потери exact speech или изменения поведения.

## Проверено по RPG / D&D и карточке броска

Read-only аудит кода 850568c223f0b5d7b69e9f6a5f8ab7e18bcf8640 подтвердил
code-owned d20, параметры/modifiers, выбор outcome и проверки commit. Это
D&D-подобная система; конкретная редакция D&D не установлена. Текущая deployed DB
и реальная интерпретация локальной LLM в этом аудите не проверялись.

| Область | Результат и следующий шаг |
|---|---|
| Механика кода | VERIFIED кодом и 55 профильными tests; это не полный аудит всех боевых правил |
| Persistence/replay | VERIFIED на unit/contract уровне; live PostgreSQL в этом аудите NOT RUN |
| Доставка/интерпретация LLM | NOT VERIFIED: проследить фактический safe input для generic check и последующий ответ выбранной модели |
| UI | NOT IMPLEMENTED: check есть в public turn response, но отсутствует в screen, который сохраняет web-клиент |
| UI/boundary tests | 34/34 PASS существующих tests; они не проверяют ещё отсутствующую карточку |

Карта существующих владельцев:

- [checks-rng](../../packages/checks-rng/src/index.js): код владеет DC, RNG/d20,
  attribute bonus, суммой modifiers, total, margin и outcome bands; private audit
  содержит внутренние RNG-данные;
- [actor-step](../../packages/turn/src/turn-step-actor-step.js) и
  [scenario modifiers](../../apps/game-server/src/runtime/lower-dvina-trace-turn-step-generic-owners.js):
  admission, actor parameters/body/load и code-owned выбор outcome branch;
- [commit validator](../../packages/turn/src/turn-step-commit-validator.js):
  binding, арифметика и band независимо перепроверяются;
- [public result projection](../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-2-projection.js)
  уже выдаёт generic check отдельно от screen; conversation check лежит в другом
  поле. Существующая фильтрация удаляет private audit. Значит UI gap нельзя
  ошибочно описать как полное отсутствие DC/roll в HTTP;
- [persisted turn state](../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-turn-step-state.js)
  проецирует в last_turn только первый request/result через [0]. Проверить полноту
  нескольких checks: это риск неполной public projection, а не доказательство
  отсутствия остальных результатов в committed envelope/БД;
- [web bootstrap](../../apps/game-web/src/app/bootstrap.js) сохраняет result.screen;
  GET reload также возвращает screen. Top-level check в текущую историю не входит;
- [narration stage](../../packages/turn/src/stages/narration.js) формирует узкий
  context.outcome с movement marker. Сам по себе этот участок не доказывает
  отсутствие смысла check во всём visible_context: проверить реальный payload,
  выбранную branch и owner-visible consequences до назначения fix.

Следующий packet по UI: существующий server/presentation owner строит единый
упорядоченный player-safe список checks внутри persisted pending/ready/historical
screen. Имя нового поля выбирается при согласовании schema; отдельный store/service
не нужен. Сохранить actor/action binding, исходные значения/модификаторы и безопасные
понятные подписи их источников. Web только отображает этот результат. Generic,
conversation и combat не должны перекладывать сборку карточки на разные UI callers.
Не публиковать все NPC/combat rows без проверки perception scope.

Числовая карточка UI и художественная prose — разные представления. Существующий
запрет raw DC/roll в narration не является запретом на явно запрошенную карточку.
Обновить screen schema/visibility contract/consumers/tests, сохранив grounding прозы.
Проверить ту же карточку после retry, pending-presentation recovery, reload и
historical replay; для реального LLM verdict нужен новый browser trace.

Фактически выполненные команды (код после этого менялся только в plan/handoff):

~~~powershell
node --test packages/checks-rng/test/domain.test.js packages/turn/test/turn-step-generic-domain-outcome.test.js apps/game-server/test/lower-dvina-trace-turn-step-generic-owners.test.js apps/game-server/test/lower-dvina-trace-turn-step-commit.test.js apps/game-server/test/lower-dvina-trace-narration-wire.test.js
node --test apps/game-server/test/lower-dvina-trace-phase-2-public-boundary.test.js apps/game-web/test/game-web.test.js apps/game-web/test/turn-submission.test.js
~~~

Эти известные tests — техническая regression-база, не скрытые приёмочные случаи
для PLAYER и не замена полной игры.

## Переносимые свидетельства

[blind-gameplay-observations.json](blind-gameplay-observations.json) хранит выбранные
безопасные поля двух исторических server turns, итоговую прозу, role waterfall и
парный Qwen writer/auditor probe. Это известные случаи для regression, не holdout.

**Исправление прежнего отчёта:** 30,563 и 78,687 с — server turn duration.
Историческое время browser submit → ready DOM независимо не зафиксировано.
Нельзя переписать эти числа в browser E2E или вычислить E2E суммой LLM calls.

В коротком случае required change содержит выполненную минутную попытку и
неустановленный результат наблюдения. Проза сохраняет действие, опускает второй
смысл и перечисляет фон. Model auditor поставил PASS; независимый verdict — FAIL.
Структура JSON и готовый экран не доказывают смысловое качество.

Qwen pair относится к двум конкретным запросам, не целому ходу: 13,314 с против
8,029 с двух соответствующих Gemma calls. Q4 и прежний Q5 не закрыли квалификацию
в проверенных конфигурациях; это не запрет на их испытание после изменения задачи.

Private traces, test-party DB, веса, ключи и пользовательские operator settings
не входят в Git. Их отсутствие в новом clone не мешает читать план и исправлять
код. Не выдумывать старые prompts и состояние партии: использовать committed
fixtures/runner, создавать новую test party и честно помечать новый replay.

Полезные исходники и проверки:

- [narration current-beat fixture](../../apps/game-server/test/fixtures/narration-current-beat.json);
- [проверка wire](../../apps/game-server/test/lower-dvina-trace-narration-wire.test.js);
- [проверка coverage](../../apps/game-server/test/lower-dvina-trace-narration-coverage.test.js);
- [причинная сцена](../../apps/game-server/test/lower-dvina-trace-narration-causal-scene.test.js);
- [factual commit before narration](../../apps/game-server/test/lower-dvina-trace-factual-commit-before-narration.test.js);
- [frozen role requests](../../data/model-evals/llm-runtime/frozen-role-requests-v1.json);
- [LLM evaluation runner](../../tools/llm-runtime-eval/src/cli.mjs);
- [browser acceptance runner](../../tools/local-play/local-gemma-acceptance.mjs);
- [правила runner и resume](../../tools/local-play/MODULE.md).

Fixture current-beat относится к отдельному раннему составному случаю; не выдавать
его за exact input последнего server turn. Опубликованные fixtures не могут быть
sealed holdout. Полные runtime prompts брать из актуального кода и нового privately
captured запроса; не восстанавливать их догадками из этой выжимки.

## Runtime и доступ: не запустить другую модель случайно

Исторически настроен внешний локальный endpoint Gemma 4 26B A4B Q6_K,
alias gemma-4-26b-a4b-it, context 34816, один slot, GPU0 RTX 3090 Ti, thinking off
через OmniRoute. Health на момент старого восстановления не является текущей
readiness: перед новым запуском проверить доступ и фактический model route.

**Репозиторный managed preset другой:** Gemma Q4_K_P, context 32768. Команда
npm run play:local по умолчанию не воспроизводит исторический Q6_K/GPU0 профиль.
В режиме сохранённого custom provider launcher не должен запускать дополнительную
managed Gemma; подтвердить выбор до provisioning.

Host prerequisites для текущего launcher: Node 22+, Windows x64, подходящая NVIDIA
GPU, RAM и место по [managed-runtime](../../tools/local-play/managed-runtime.js);
Chrome/Chromium для UI runner, при необходимости RUS_CHROMIUM_PATH. Browser-harness
— capability среды, а не файл репозитория. При его отсутствии найти установленный
skill/поддерживаемое управление браузером; прямой gameplay REST не заменяет приёмку.

Для установки зависимостей использовать npm ci. Lockfile сохраняет версии и
integrity пакетов и использует публичный npm registry. Нужен доступ к реестру либо
подготовленный package cache; Git не поставляет node_modules, browser и model weights.

Настройки/доступ искать в разрешённой локальной operator configuration и штатном
llm-settings.json, описанном в [LLM_PROVIDERS.md](../setup/LLM_PROVIDERS.md).
Не выводить ключи и private адреса, не публиковать конфигурационные файлы и не
просить пользователя повторять уже доступные credentials.

External acceptance использует:
RUS_ACCEPTANCE_LLM_BASE_URL, RUS_ACCEPTANCE_LLM_MODEL,
RUS_ACCEPTANCE_LLM_API_KEY_FILE и обязательные backend/runtime/hardware metadata
по [MODULE.md](../../tools/local-play/MODULE.md). В документах перечислены имена,
а значения берутся из разрешённой конфигурации. На новой машине без такого доступа
readiness остаётся непроверенной; не подменять сервер случайным доступным provider.

После проверки prerequisites и действующего профиля штатный CLI:

~~~powershell
npm run gameplay:acceptance:local -- <private-output-directory> <focus> completion
~~~

Angle-bracket значения — параметры, которые CHIEF заполняет сам, не команда для
буквального запуска. Focus не должен выдавать PLAYER скрытый маршрут. Runner resume
через RUS_ACCEPTANCE_RESUME продолжает ту же кампанию, а не создаёт новую unseen.

Расширенные reasoning/multi-model/deadline настройки из плана ещё требуют
реализации и versioned cutover. Не добавлять выдуманные environment variables
в startup script и не объявлять готовой комбинацию, которую текущий runner
не умеет воспроизвести. GPU1–3 вне scope.

## Завершение каждой передачи контекста

- Сохранить незакоммиченную работу без потери и точно обозначить её; для переносимого
  результата необходимые изменения должны быть committed и pushed.
- Обновить один progress-комментарий PR: HEAD, проверенные результаты и их scope,
  незакрытые gates, последний опровергнутый подход и следующий bounded шаг.
- Проверить GitHub blob-ссылки на plan/handoff/observations, remote branch head и CI.
- Приёмку игры и CI указывать раздельно. Не переносить PASS со старого HEAD или
  с fixture suite на реальную локальную модель.
- Ничего из developer handoff не передавать Blind PLAYER. Новый разработчик может
  читать все эти материалы; слепой игрок должен оставаться новым и независимым.
