# #774: веточная причина контрольного падения

HEAD: `c246e6c4b4eafd7853c2053d3268095efa3054b4`. Закреплённый upstream: `0d8843f1c500052c3e026e3da6f8edaf5e00b626`.

## Воспроизведение

Точная команда старого Task01: `native-smoke.ps1 -Controls`; контрольный процесс имел filter `[item],[json],[pickup]`, seed 17, отдельный userdir. Лог: `artifacts/2026-10-19/task01/native-smoke-20261019-052735/existing-controls.raw.log`. Неудача: `item_colony_ser_deser`, секция `identical items are collapsed`, строки upstream `tests/json_test.cpp:894,898`: 10 отдельных JSON-объектов вместо одного и отсутствует RLE run length 10.

Текущий финальный Task01 binary существует; его SHA256 совпадает с `evidence/task01-native/native-result.json`: `d43a6aefb936f50db2fb7389a0736c04eb62a7240634f6c5e8b4edfaf24a0a5f`. Из корня worktree:

```powershell
$base='/mnt/c/Users/Slaven/.codex/worktrees/cataclysm-recovery/Novgorod'
wsl.exe --cd "$base/artifacts/2026-10-19/nativebuild/cataclysm-source" --exec "$base/artifacts/2026-10-19/nativebuild/build-release/tests/cata_test" --rng-seed 17 "--user-dir=$base/artifacts/2026-10-19/task02/native774/branch-isolated-user" item_colony_ser_deser
```

`branch-isolated.log`: 1 case FAIL, 15 assertions, 13 PASS / 2 FAIL, 52.9798 секунды. Предшествующие item/pickup tests не нужны для воспроизведения; это не доказательство отсутствия иных order dependencies. Второй запуск с filter `item_colony_ser_deser,Novgorod RLE preserves distinct item identities`, тем же seed и новым `branch-confirm-user` — `branch-confirm.log`; exit 2, 2 cases (1 PASS / 1 FAIL), 18 assertions (16 PASS / 2 FAIL), 59.3579 секунды; exit code отдельно в `branch-confirm.exit.txt`.

## Причина

В main пять overlays. Ни один не изменяет `src/json.h`; isolated main control ранее прошёл 15/15. В ветке шестой overlay `native-semantic-input.patch:299–311`, особенно строка 308, добавляет в native `JsonOut::write(cata::colony<item>)` условие окончания серии `it->uid() != nxt->uid()`. Применённая строка: `artifacts/2026-10-19/nativebuild/cataclysm-source/src/json.h:925`. Поэтому похожие предметы с разными UID пишутся отдельно независимо от seed и порядка тестов. До test-only исправления `tests/json_test.cpp` в main и веточной build copy был побайтно одинаков — хеши в `source-identity.json`.

Это веточное изменение serializer, а не старое падение main. Main PASS относится только к изолированному control, не к полному suite.

До исправления `Novgorod RLE preserves distinct item identities` (`novgorod_semantic_test.cpp:960–994`) использовал backpack с содержимым. Native `item::same_for_rle` уже отклоняет непустое содержимое (`src/item.cpp:617–619`), поэтому этот тест сам по себе не проверял запрет сжатия пустых stackable items с разными UID.

## Test-only исправление и проверки

Исполнитель Codex сохранил уже существующий UID guard в рамках явного поручения исправить веточный failure #774. Обоснование изменения тестов по WR §24.2 записано **до правок** в [test-change-rationale.md](test-change-rationale.md); исполнитель включает его в PR; это не решение внешней архитектурной приёмки. Правило требует обоснования, а не отдельного разрешения для каждой test-only правки.

`native-control-tests.patch` меняет только upstream `tests/json_test.cpp`: пустые stackable `test_rag`, положительное `same_for_rle`, уникальность каждого UID, полная cardinality и совпадение каждого UID после deserialize. Different-item и malformed JSON assertions сохранены. Новая секция проверяет legacy RLE без UID: три экземпляра с разными UID. Semantic regression теперь также использует пустые `test_rag` с положительным `same_for_rle` и разными UID.

README build plumbing применяет test-only overlay после semantic patch с проверкой наличия UID guard. `.gitattributes` разрешает обязательные blank context prefixes только в новом patch. `postfix-identity.json` подтверждает воспроизведение overlay из исходного test, совпадение repo/build semantic test и неизменность runtime header и semantic patch.

| Проверка | Результат | Evidence |
|---|---|---|
| Release Clang19 rebuild cata_test, parallel 8 | exit 0; два test translation units и линковка | `build.log` |
| `item_colony_ser_deser,Novgorod RLE preserves distinct item identities`, seed17 | **43 assertions / 2 cases PASS**, exit 0 | `postfix-focused.log` |
| Исходный filter `[item],[json],[pickup]`, seed17 | **164792 assertions / 161 cases PASS**, exit 0 | `postfix-controls.log` |
| Negative mutation без UID guard | **34/36 assertions**, exit 2; падают число записей и точное сохранение original UID vector | `mutation.log` |

Mutation без полной header-пересборки: обновлённый `json_test.cpp` скомпилирован против неизменённых main headers без UID guard и слинкован с существующими main objects в отдельный binary. Main `src/json.h` отличается от веточного только UID guard. Original main source/build/binary сохранены. Метод: `artifacts/2026-10-19/task02/native774/build-mutation.py`, точные compile/link команды — соседний `mutation-commands.txt`; временные инструменты не входят в постоянный test plumbing. Первой компиляции копии недоставало include path upstream `tests`; после добавления сборка успешна.

Rebuild: `wsl.exe --cd $base --exec cmake --build "$base/artifacts/2026-10-19/nativebuild/build-release" --target cata_test --parallel 8`. Focused/control используют тот же source cwd и binary, что pre-fix команда выше, новые userdirs `postfix-focused-user` / `postfix-controls-user` и приведённые filters. Mutation: cwd main native source, отдельный `native774/mutation-cata_test`, seed17, filter `item_colony_ser_deser`, `mutation-user`. Все exit codes сохранены отдельно.

CBM Verify: discovery, detect_changes и coverage выполнены; C++ test macro partial, metadata changed, artifacts excluded; решающие строки прочитаны напрямую. Docker, LLM/Qwen, sealed и gameplay не запускались. Посторонние generated manifest и TASK02.md не менялись исполнителем. Это техническая проверка, не внешняя приёмка.