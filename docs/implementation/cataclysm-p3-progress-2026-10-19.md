# Cataclysm P3: отчёт о ходе работы — 2026-10-19

**Статус: P3/P4/P5/P6 не завершены; P3 semantic acceptance — OPEN.** Снимок опубликован из активного checkout `codex/cataclysm-p3-semantic` на базе `25e705074e6741944cc36d38ce05ac2cbc8f3fff` (PR #768). Ветка публикации: `codex/cataclysm-p3-progress`, PR #769 остаётся draft. Сценарный native прогон не вызывает платную модель; подтверждённых платных вызовов нет. Нативные результаты — ограниченный preflight, не acceptance и не основание для P5/P6 или P7 cutover. Протокол: [эксперимент P3](cataclysm-p3-experiment.md); CR: [#767](https://github.com/PavelSlaven/Novgorod1230/issues/767).

## Что вошло в этот snapshot

- Семантическая граница и runner P3 используют существующие owners хода/NPC, native операции и evidence. В текущем коде readback отдельно сопоставляет `goal_result` и `native_effect.effect_status`, сохраняет совместимость с legacy top-level result и fail-closed поведение при отсутствующем результате. Причина фактического прерывания NPC включается только если её отдал native owner.
- P3→P4 coordinator проверяет полный запрос и хеш, запрещает повтор с изменённым payload, сохраняет результат для replay и применяет staged native действие до публикации. Речевая связка берёт conversation/state identity из проверенного semantic `owner_context`, а physical speaker, текст, heard IDs и elapsed time — из native readback.
- Item-target варианты формируются из текущего наблюдения; выбранная immutable operation гидратируется без мутации исходного кандидата. Валидированная точная `player_utterance` доходит до существующего native speech operation и далее до conversation owner один раз.
- Добавлен helper применения готовой проекции аудитории в существующем conversation owner; production caller продолжает строить её сам.
- Native patch сохраняет UID при переносе целого предмета после рекурсивной проверки дерева, не меняя формат и reader; RLE writer не объединяет предметы с разными UID. Snapshot включает native test source, fixture исправлен на `NPC_debug` через `spawn_npc`; это убирает shopkeeper restock doctor-класса и 129 лишних наземных предметов.

## Фактические проверки и evidence

В активном source checkout на идентичных опубликованным JS-файлах выполнено: `node --test tools/cataclysm-prototype/p3-boundary.test.js` — 30/30 PASS; `node --test apps/game-server/test/lower-dvina-trace-m2-player-audience-owner.test.js` — 2/2 PASS. Python в publication worktree/WSL: `python3 -m unittest tools/cataclysm-prototype/test_generations.py` — 19 тестов PASS. В publication worktree: `npm run docs:check` — 8 generated files, 0 activation findings; `npm run architecture:check` — PASS.

Прямой запуск JS focused suite из publication worktree сначала завершился `ERR_MODULE_NOT_FOUND: @rus/turn`, так как worktree не содержит `node_modules`. Повторный запуск тестов прошёл в source checkout; хеши опубликованных JS-файлов сверяются с source, source оставался read-only. Полный `npm test`, native build/run и live provider вызовы при публикации не запускались.

Ограниченные raw native request/readback/reload logs и SHA-256 манифест добавлены в [новый набор clean-fixture evidence](../../tools/cataclysm-prototype/evidence/p3-clean-fixture-20261019/README.md). Предыдущие evidence и неудачные локальные запуски сохранены; userdir, saves, caches, бинарники и секреты не публиковались. Native evidence от 2026-10-19 фиксирует чистый fixture, pickup, firestarter, NPC progress/interrupt и физическую речь длительностью 3 секунды с реально слышавшими listener IDs. Отдельный безцелевой flashlight transform достиг `flashlight_on`, но выдал новый UID. Штатность этого UID не принята ведущим: это открытая находка; T07/identity acceptance — **NOT PASS** до расследования.

Ранее полученный P3→P4 cold join доказал доставку реальной речи до native и её физический результат, но coordinator завершился `P3_NATIVE_SPEECH_READBACK_INVALID`; социальный bridge не сработал. Исправление JS связки вошло в snapshot и focused tests проходят, однако native join rerun отсутствует. Поэтому общий physical + social checkpoint, точный reload/replay и P3→P4 acceptance остаются OPEN.

Текущие SHA-256: native `cata_test` `1fb26fee69f83705f77486bee9748c00fda431df140bbb2824979d8d2e3f174b`; `novgorod_semantic_test.cpp` `fb346b06e9e6ca2bf2d1ad6ab88320cabc43a4e9bf97fbb7f0bf90f3b92f0ef9`; P3 core patch `fd4c8bae5199ce5bbf31e8c0e753bc409204de9d84e34d02396db1e720318384`. Core patch не менялся в ходе snapshot.

## Незакрытые проблемы и критерии приёмки

- **Flashlight UID:** новая identity после transform не объяснена/не принята; сохранить как OPEN finding. T07 и identity acceptance остаются NOT PASS.
- **P3→P4 speech:** выполнить native join rerun после JS bridge fix. Требуются одна staged native apply, точная физическая и социальная запись через существующий owner, общий checkpoint, точное состояние после reload и replay без повторного native эффекта или provider call; изменённый payload должен быть отвергнут.
- **T11/T12:** настоящая semantic/player speech приёмка не выполнена. Требуются точная реплика, native длительность/слышимость, одна social запись существующего conversation owner, reload и replay без дублирования.
- **T06/T07/T09:** wire/case pack остаётся provisional/stale. Закрепить adapters и независимые контрольные входы; закрыть T06–T10 в утверждённых лимитах. T09 требует реального initial NPC choice, replay без второго решения, настоящего interruption с причиной/статусом после reload и следующего owner для того же NPC.
- Нет итогового Contract Auditor и CI на финальной голове после всех fixes. P5 не начинать до P3 и T11/T12 gates; P6 требует полной T01–T18 матрицы, метрик и verdict. Полная цель P0–P6 остаётся незавершённой. P7 cutover не выполнять.

Связанные материалы: план — [#754](https://github.com/PavelSlaven/Novgorod1230/pull/754), CR — [#767](https://github.com/PavelSlaven/Novgorod1230/issues/767), речевые блокеры — [#758](https://github.com/PavelSlaven/Novgorod1230/issues/758) и [#762](https://github.com/PavelSlaven/Novgorod1230/issues/762), технический P4 — [#768](https://github.com/PavelSlaven/Novgorod1230/pull/768), текущая публикация — [#769](https://github.com/PavelSlaven/Novgorod1230/pull/769).
