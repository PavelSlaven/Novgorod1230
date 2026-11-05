## REVIEW-goal-r5

**FAIL по полноте приёмочного покрытия.** Обход доказательства цели в проверенных формах не найден, но четыре запрошенные границы не закреплены отдельными тестами.

1. **Атаки на доказательство цели.** Основной барьер — точный шаблон [check-codex-input.py:65](/srv/novgorod-work/worktrees/input-check-review-r5/check-codex-input.py:65) и последовательные `.match` без поиска дальше в строке на [строке 78](/srv/novgorod-work/worktrees/input-check-review-r5/check-codex-input.py:78).

   | Случай | Вывод и покрытие |
   |---|---|
   | `create_goal` внутри `//` или `/* */` после `update_goal` | Отвергается: комментарий останавливает распознавание. Оба вида покрыты [тестом комментариев:3360](/srv/novgorod-work/worktrees/input-check-review-r5/test_input_check.py:3360), включая настоящий вызов с другой целью. |
   | `create_goal` внутри строки после `update_goal` | Отвергается шаблонами на строках 62–65 и `.match` на строке 80. [Прежний тест:3168](/srv/novgorod-work/worktrees/input-check-review-r5/test_input_check.py:3168) проверяет строку без `update_goal`; нужной комбинации нет. Находка 1. |
   | Другой статус, поля, внутренние пробелы или кавычки в `update_goal` | Все отклонения отвергаются точным шаблоном строки 65. Статусы покрыты [тестом:3345](/srv/novgorod-work/worktrees/input-check-review-r5/test_input_check.py:3345), поля — [тестом:3352](/srv/novgorod-work/worktrees/input-check-review-r5/test_input_check.py:3352). Внутренние пробелы и другие кавычки не покрыты. Находка 2. |
   | Посторонний оператор между разрешёнными операторами | Отвергается на строках 78–80. Между `update_goal` и `create_goal` покрыт [тестом:3371](/srv/novgorod-work/worktrees/input-check-review-r5/test_input_check.py:3371); между двумя `update_goal` — нет. Находка 3. |
   | Вызов в том же ходе, что и контекст | Исключён условием `< self.turn` на [check-codex-input.py:1128](/srv/novgorod-work/worktrees/input-check-review-r5/check-codex-input.py:1128). Новая цепочка покрыта [тестом:3380](/srv/novgorod-work/worktrees/input-check-review-r5/test_input_check.py:3380). |
   | Два `create_goal` в одном `exec` | На строках 80–86 учитывается только первый распознанный вызов. Для последовательности A→B доказывается A, а B не доказывается; второй вызов игнорируется. Это соответствует заявленному доказательству существования более раннего вызова с нужной целью. Отдельного теста нет. Находка 4. |

2. **Честные формы.** Дословная цепочка проходит по коду и закреплена [тестом:3333](/srv/novgorod-work/worktrees/input-check-review-r5/test_input_check.py:3333). Четыре прежние формы без `update_goal` сохранены: `GOAL_CALL` одинаков в [старой версии:60](/srv/novgorod-work/worktrees/input-check-review-r5/check-codex-input.old.py:60) и [новой:60](/srv/novgorod-work/worktrees/input-check-review-r5/check-codex-input.py:60); формы и положительный тест находятся в [test_input_check.py:3223](/srv/novgorod-work/worktrees/input-check-review-r5/test_input_check.py:3223).

3. **Ничего лишнего.** По [fix.diff:7](/srv/novgorod-work/worktrees/input-check-review-r5/fix.diff:7) и [fix.diff:16](/srv/novgorod-work/worktrees/input-check-review-r5/fix.diff:16) изменения ограничены новой константой и `goal_created`.

4. **Комментарии.** Добавленных пояснительных комментариев нет. `//` и `/* */` в [test_input_check.py:3362](/srv/novgorod-work/worktrees/input-check-review-r5/test_input_check.py:3362) являются тестовыми данными. Нарушений правила нет.

**Находки:**

- **1 — test_input_check.py:3168.** Нет проверки строкового литерала после разрешённого `update_goal`. Ожидается отрицательный тест этой комбинации. **Причина: приёмочный тест.**
- **2 — test_input_check.py:3345.** Нет отрицательных случаев с внутренними пробелами и другими кавычками в `update_goal`. Ожидается закрепить их отклонение. **Причина: приёмочный тест.**
- **3 — test_input_check.py:3371.** Нет последовательности `update_goal → посторонний оператор → update_goal → create_goal`. Ожидается отрицательный тест. **Причина: приёмочный тест.**
- **4 — test_input_check.py:3162.** Тест остатка после вызова не проверяет второй `create_goal`. Ожидается закрепить выбор первого вызова для обеих перестановок разных целей. **Причина: приёмочный тест.**

**Не проверено:** фактическое прохождение тестового набора — по заданию тесты не запускались. Дополнительно проверены вызовы `goal_created` на входах в памяти; результаты согласуются с выводами выше. Файлы не создавались и не изменялись.