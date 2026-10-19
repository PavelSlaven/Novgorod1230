# Reply-03f — P3 сдача

HEAD: `d4ad3ca6f5d83dcb99e748f45e2393240442038e`. Код заморожен после проверок, commit/push не выполнялись.

## Изменено

- `tools/cataclysm-prototype/p3-live-coordinator.mjs:88`: после уже применённого действия игрока typed `TURN_NPC_*` сообщает «Выбранный собеседник не ответил.». Сохраняет исходный typed code, `partially_achieved`, фактический счётчик применённых операций. Обработка ошибки не вызывает native operation.
- `tools/cataclysm-prototype/p3-live-coordinator.test.js:397`: fake socket E2E проходит реальный `createP3RoleRuntime` → production provider adapter → существующий NPC model/assembler → grounding auditor → existing turn repair. Подменён только execute transport, реальных HTTP/LLM вызовов нет.
- Два варианта: первый auditor reject, второй pass — native получает дословную repaired utterance; оба reject — typed `TURN_NPC_PLAN_INVALID`, тишина, всего одна native operation игрока. В обоих вариантах responder calls=2, auditor calls=2, planner calls=1; общий бюджет считает все 5. Проверяются исходный request, original_output.speech и semantic_grounding validation errors в repair payload.
- `tools/cataclysm-prototype/p3-boundary.test.js:148`: строгие полные argv для Windows/WSL и Linux, shell=false, Windows cwd/env отсутствуют, Linux cwd и mode/world env точны. Проверки усилены.
- `tools/cataclysm-prototype/p3-boundary.js:438,467`: existing request builder получает одну `memory.current_observations` запись: `observation_ref` равен existing `perceived_message.perception_result_ref`; exact `fact_text` — `NPC услышал реплику игрока <JSON-quoted utterance>.`. Этот же ref включён в existing `allowed_references.knowledge_refs`. Запись создаётся только после существующих selected target/identity/visibility/native heard gates. Содержимое услышанной речи не становится world truth; `knowledge` остаётся `{}`. Новых схем, prompt, packages, public fields и копий физики нет.
- Существующий live config передаёт `npcMaxRepairAttempts=1`; новый счётчик/лимит не добавлен.

## Linux CI

Read-only прочитан failed run `39202099140`. Ошибка: Linux запускал `/home/cdda/build/tests/cata_test`, assertion ожидал `wsl.exe` (`p3-boundary.test.js:147`). На текущем HEAD уже существует platform split: baseline WSL focused тест успешно прошёл до наших изменений. Дополнительный runtime fix не нужен; полные argv assertions теперь отдельно фиксируют корректное поведение обеих OS.

## Выполненные проверки

- Windows Node `v24.16.0`: `node --test tools/cataclysm-prototype/p3-boundary.test.js tools/cataclysm-prototype/p3-live-coordinator.test.js` — **59/59 PASS**, 0 skipped.
- WSL Node `/home/slaven/.local/share/novgorod/node-v22.23.3-linux-x64/bin/node`: тот же focused набор — **59/59 PASS**, 0 skipped.
- Исходные 56 проверок сохранены; добавлены родительский test и два subtest.
- `node scripts/check-syntax.mjs --base HEAD` для четырёх изменённых JS/MJS — **4 files, 0 failures**.
- `git diff --check` — PASS. Перед фиксацией восстановлены исходные LF окончания; поведение не менялось.
- CBM Verify: list_projects, index_status, get_architecture, search_graph, trace_path, detect_changes и check_index_coverage вызваны. Для relied paths нет recorded gaps, но freshness=metadata_changed; выводы сверены прямым чтением source/tests. Граф использован только для навигации.

Логи: `.tmp.driveupload/task03/reply03f-p3-windows.log`, `reply03f-p3-linux.log`, `reply03f-p3-linux-before.log`, `reply03f-p3-ci-failure.log`, `reply03f-p3-syntax.log`.

## Ограничения

- Native actor projection (`novgorod_semantic.cpp:148–162`) не передаёт имя. По уточнению ведущего использован честный dev status «Выбранный собеседник не ответил.». Native/C++/patch/public schema не менялись.
- Bounded schema проверка: `packages/npc-runtime/src/conversation-contracts.js:150–165` принимает plainRecord memory и existing knowledge refs, JSON-safe request валидирует existing builder. В apps текущая observation форма уже имеет `observation_ref`/`fact_text`; расширение схемы не требуется. Fake E2E теперь имеет дополнительного реально услышавшего witness: обе responder попытки относятся только к выбранному NPC 8, witness 9 получает **0 calls**. Проверяются exact observation ref/fact_text, его равенство perceived_message ref, единственный knowledge ref, пустой world knowledge. Existing witness/missing/unheard/vanished test также PASS.
- Fake E2E доказывает orchestration/role path, не подтверждает реальную native физику или качество живой модели. Real LLM, Docker, full suites не запускались. Независимый аудит и финальные gate проверки выполняет ведущий.
- Посторонняя находка для отдельного issue ведущего: `scripts/check-syntax.mjs:11` фильтрует первый явный путь, когда `--base` отсутствует (`baseIndex=-1`, `baseIndex+1=0`). В этой сдаче использован обход `--base HEAD`, реально проверены все 4 файла. Закрытие: explicit invocation без --base проверяет каждый переданный путь, включая первый; regression test на это условие. Не исправлялось вне scope.

## Замороженные SHA256

```text
36D79706C827FFEC1D373054EDDD3E15B0FF66ED08C1C8EEDDF645E8E1295AFE  tools/cataclysm-prototype/p3-boundary.js
8049D0217836331F1623A0535D94C95BD65E36E6FDA52E91E29C0EDFE9858F12  tools/cataclysm-prototype/p3-boundary.test.js
2504FD795C3FD4AB0617A14010981BF5F22C56B0D56FC4EB31F7EE2E9AE48775  tools/cataclysm-prototype/p3-live-coordinator.mjs
5F7B92CF89A31079711D2CCF104205DC906697D5B1A3F5D6197F9651D4417F37  tools/cataclysm-prototype/p3-live-coordinator.test.js
```
