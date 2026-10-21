> status: REFERENCE / DOMAIN GUIDE. Объясняет сохранение мира, продолжение партии и честное восстановление после сбоя. Норм не создаёт: при конфликте действуют AGENTS.md, CONTRACT_INDEX и профильные контракты. Состояние на 2026-10-21: main 181548e8; работа в неслитых ветках — по доске распорядителя на эту дату.

# 15. Сохранения

## Замысел

После продолжения партии вещи, люди, время и разговор принадлежат одному сохранённому миру. Фиксацией владеет код ([PRODUCT_CONSTITUTION.md:130–158](../../governance/PRODUCT_CONSTITUTION.md)). После аварии игра сообщает момент отката; память NPC возвращается к тому же моменту, что физический мир ([план среза:202–204](../../plans/Novgorod1230_Cataclysm_Vertical_Slice_Implementation_Plan_2026-10-19.md)).

1. Разговор закончен → игрок сохраняет, выходит и возвращается → видит прежний мир и журнал → CDDA сохраняет мир и строки `Messages` (полное покрытие ручного действия и журнала; quicksave игнорирует результат: [areas/08-save-state.md:12–13,22](../../context/cdda-native-map/areas/08-save-state.md)) → наш слой связывает память разговора с этим сохранением. Базовый возврат описан в [TASK03-DELIVERY-RESULT.md:31–36](../../../tools/cataclysm-prototype/TASK03-DELIVERY-RESULT.md); память разговора — работа [PR #793](https://github.com/PavelSlaven/Novgorod1230/pull/793).
2. Игра упала → игрок запускает её → видит предложение целого сохранения и момент отката → CDDA загружает физический мир, но не гарантирует атомарности всего набора (частичное покрытие, откат отсутствует: [areas/08-save-state.md:15,25](../../context/cdda-native-map/areas/08-save-state.md)) → наш слой выбирает принятый комплект и сообщает о потерянном интервале. Целевой путь части 7 связан с [#781](https://github.com/PavelSlaven/Novgorod1230/issues/781).

## Что может игрок

- **15.01.** Сохранить игру через меню, выйти и после повторного запуска увидеть прежний мир и журнал.
- **15.02.** Сохранить разговор, выйти и после перезапуска продолжить его с прежней историей и журналом.
- **15.03.** Сохранить найденные обычные вещи и после перезапуска увидеть их без дублей.
- **15.04.** После сбоя открыть экран восстановления, узнать об откате и продолжить мир с последнего целого поколения.
- **15.05.** Сохранить игру не дольше пяти секунд и запустить её с нуля не дольше двадцати секунд на машине приёмки.
- **15.06.** Дождаться очередного игрового часа не раньше пяти реальных минут после прошлого автосохранения и увидеть, что CDDA сохранила мир автоматически.

## Родное CDDA

Карта описывает upstream `0d8843f`, до наших патчей; оценки относятся к отдельным нуждам ([areas/08-save-state.md:3–4](../../context/cdda-native-map/areas/08-save-state.md)).

| Механизм | Оценка карты и ограничение |
|---|---|
| `ACTION_QUICKSAVE` → `game::quicksave()` → `save()`; `ACTION_SAVE` сохраняет и выходит ([areas/08-save-state.md:12–13](../../context/cdda-native-map/areas/08-save-state.md)). | Полное для ручных действий. Quicksave отбрасывает результат; save-and-quit проверяет его. При ошибке пути выхода различаются. |
| Autosave проверяет игровые ходы и реальные минуты ([areas/08-save-state.md:14](../../context/cdda-native-map/areas/08-save-state.md)). | Частичное для часа: upstream допускает максимум 1000 ходов, час равен 3600; реальный гейт может пропустить часовой рубеж. Наружу результат autosave не возвращается. |
| `game::save()` записывает набор файлов, каждый через temp+rename ([areas/08-save-state.md:15,25](../../context/cdda-native-map/areas/08-save-state.md)). | Частичное для целого мира; для отката к целому набору покрытие «нет». Атомарность отдельного файла не делает атомарным весь каталог; fsync и резервная копия этим путём не обеспечены. |
| `global_variables`, `Creature::values`, `item::item_vars` ([areas/08-save-state.md:16–18](../../context/cdda-native-map/areas/08-save-state.md)). | Полное для этих полей. `global_vals` уходят в кладбище при смерти; значения существа зависят от его жизни; разные item vars мешают стекированию. |
| Очереди событий и `Messages` ([areas/08-save-state.md:19–20,22](../../context/cdda-native-map/areas/08-save-state.md)). | Полное для очередей и строк журнала; смысловую память NPC журнал не заменяет. |

## Наш слой и владелец

| Механизм | Отношение к родному и владелец |
|---|---|
| Ручная запись и продолжение | **Используем** native save/load; физическое состояние принадлежит CDDA. Dev launcher в `tools/cataclysm-prototype` выбирает собственный постоянный профиль ([MODULE.md, раздел «Граница»](../../../tools/cataclysm-prototype/MODULE.md)). |
| Часовое автосохранение | **Расширяем** диапазон родного `AUTOSAVE_TURNS` до 3600; сохраняем гейт `AUTOSAVE_MINUTES=5` по D219. Проверенный пробел upstream — предел 1000 ([areas/08-save-state.md:14](../../context/cdda-native-map/areas/08-save-state.md)). Владелец изменения — наш патч CDDA; настройки профиля задаёт launcher. Именно такой профиль описан в [PLAY.md:24–26](../../../tools/cataclysm-prototype/PLAY.md). |
| Память и метки вещей | **Используем** native хранилища ([areas/08-save-state.md:16–18](../../context/cdda-native-map/areas/08-save-state.md)). Полное покрытие относится к записи значений, а не к готовой памяти разговора. Отдельный файл допустим после доказанного пробела ([план среза:192](../../plans/Novgorod1230_Cataclysm_Vertical_Slice_Implementation_Plan_2026-10-19.md)). |
| Принятие целого поколения | **Новое** минимальное ядро поверх успешного native save. Проверены temp+rename и `game::save()`; они не дают атомарности набора ([areas/08-save-state.md:15,25](../../context/cdda-native-map/areas/08-save-state.md)). Единственный владелец принятия — ядро поколений; место — конец успешного `game::save()` в C++ по D219 и [#781](https://github.com/PavelSlaven/Novgorod1230/issues/781). Координатор опыта владеет только исследовательской реализацией ([MODULE.md, раздел «Граница»](../../../tools/cataclysm-prototype/MODULE.md)). |
| Экран восстановления | **Новое**: native temp+rename не хранит целый откат и его момент ([areas/08-save-state.md:25](../../context/cdda-native-map/areas/08-save-state.md)). Launcher показывает выбранное ядром поколение; общий путь проверяется в [#781](https://github.com/PavelSlaven/Novgorod1230/issues/781). |

Смена UID после загрузки из первого P4 исправлена native deserialization в [PR #768](https://github.com/PavelSlaven/Novgorod1230/pull/768); #759 закрыт. Механизм принят, но warm-замер исключал загрузку модов ([P4 recovery:15–25,29–44,54–73](../../implementation/cataclysm-p4-recovery-results.md)). Это не приёмка живого P4a/P4b ([план среза:186–199](../../plans/Novgorod1230_Cataclysm_Vertical_Slice_Implementation_Plan_2026-10-19.md)).

## Решения владельца

- **Решение владельца от 23.09.2026, номер D не присвоен.** Запись решения в [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5800359503): совместимость со старыми версиями и сохранениями не требуется, миграции и адаптеры для них не создаются; пользовательские сохранения не удаляются. Это изложение записи решения, без оформления прямой речью.
- **D215, 2026-10-19.** Запрос игрока и час задают сохранение. Слова владельца: «Сохранение каждого хода - избыточно, нужно только для отладки.» Запись владельца от этой даты ([план среза:184,194](../../plans/Novgorod1230_Cataclysm_Vertical_Slice_Implementation_Plan_2026-10-19.md)).
- **D216, 2026-10-19.** На откат к последнему целому сохранению владелец ответил: «Принять, честно сказать». Запись владельца от этой даты. Также заморожено развитие тёплого host; эта часть заменяет вариант «А+Б» D215 ([план среза:184–186](../../plans/Novgorod1230_Cataclysm_Vertical_Slice_Implementation_Plan_2026-10-19.md)).
- **D219, 2026-10-19.** Слова владельца: «Встроенное автосохранение cdda тоже можно оставить»; выбран вариант «Родное: час + 5 мин». Запись владельца от этой даты: приём поколения — в конце успешного `game::save()`; родной autosave с 3600 ходами и минимумом пяти реальных минут заменяет предложение отключить autosave и добавить отдельный часовой триггер. Такой профиль зафиксирован в [PLAY.md:26](../../../tools/cataclysm-prototype/PLAY.md).

## Расхождения и открытые вопросы

- **Действующие контракты и целевой native save.** До P7 продолжает действовать набор [DB/persistence:163](../../../data/knowledge-source/corpus/DOCUMENTS/CONTRACT_INDEX.md): DDL, `party-store`/`game-server` MODULEs и проверки transaction/idempotency/replay. Объявление CDDA владельцем физического save описывает целевой путь; P7 определит перенос гарантий и судьбу прежних контрактов. Цель — [P4a](../../plans/Novgorod1230_Cataclysm_Vertical_Slice_Implementation_Plan_2026-10-19.md).
- **Путь восстановления.** [PLAY.md:36](../../../tools/cataclysm-prototype/PLAY.md) прямо отмечает неготовность поколений и экрана восстановления. Исторический coordinator в опыте P4 проверял свой путь; он не доказывает восстановление через обычный launcher. Доставку конца `game::save()` → целое поколение → выбор при запуске → экран игрока проверяет [#781](https://github.com/PavelSlaven/Novgorod1230/issues/781). Требует решения обработка ошибок ручного save, quicksave и autosave при публикации поколения: родные пути по-разному обрабатывают результат ([areas/08-save-state.md:12–15](../../context/cdda-native-map/areas/08-save-state.md)).
- **Совместимость.** Решение 23.09 и P8–P9 [плана миграции](../../plans/Novgorod1230_Cataclysm_Audit_and_Migration_2026-10-18.md) требуют сверки на P7. Save/load текущей версии должен оставаться корректным. [Решение 23.09](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5800359503).

## Источники

- [PRODUCT_CONSTITUTION.md](../../governance/PRODUCT_CONSTITUTION.md) — владение состоянием.
- [areas/08-save-state.md](../../context/cdda-native-map/areas/08-save-state.md) — механизмы и ограничения.
- [План среза](../../plans/Novgorod1230_Cataclysm_Vertical_Slice_Implementation_Plan_2026-10-19.md) — P4a/P4b и пределы приёмки.
- [P4 results](../../implementation/cataclysm-p4-results.md) и [P4 recovery](../../implementation/cataclysm-p4-recovery-results.md) — пределы выводов опытов.
- [PLAY.md](../../../tools/cataclysm-prototype/PLAY.md) и [TASK03-DELIVERY-RESULT.md](../../../tools/cataclysm-prototype/TASK03-DELIVERY-RESULT.md) — профиль autosave и живой save/reload основы.

## Этап

Этап 0 проверяет ручное сохранение и autosave. В этапе 1 часть 1 проверяет память разговора, часть 3 — вещи, часть 7 — восстановление. Бюджеты: save ≤5 с, холодный запуск/recovery ≤20 с, поколение ≤512 МиБ, включая копирование, fsync, публикацию и загрузку модов ([план среза:195–199](../../plans/Novgorod1230_Cataclysm_Vertical_Slice_Implementation_Plan_2026-10-19.md)). Аварии процесса не доказывают устойчивость к отключению питания. Критерии и доказательства — в [GDD.md](../GDD.md).
