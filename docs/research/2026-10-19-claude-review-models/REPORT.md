# Claude-модели для ревью и судейства; стенды лидов и моделей
> Движок: не относится.
> Даты: 2026-10-19 — 2026-10-19.
> Источник отчёта: codex-direct/claude-bench/judging.md

## Вопрос

Можно ли поручать ревью и судейство кому-то кроме Opus, и какие модели показали себя в роли руководителя Codex и на стенде исполнителей?

## Метод

Основной стенд сравнивал Claude на четырёх заданиях: исправление ошибки в хуке, ревью плана, ревью кода и механические правки. Проверялись сочетания моделей и уровней рассуждения; запуски Claude шли через Workflow без вложенных помощников, а оценивание было слепым. Каждого кандидата оценивали два Sonnet high и Codex gpt-6-sol ultra, затем Opus high сводил оценки и разбирал спорные места. В таблицу добавили ответ gpt-6-sol со старого стенда как якорь для сравнения ([claude-bench/judging.md](claude-bench/judging.md):5, [claude-bench/judging.md](claude-bench/judging.md):10, [claude-bench/judging.md](claude-bench/judging.md):16, [claude-bench/judging.md](claude-bench/judging.md):18, [claude-bench/judging.md](claude-bench/judging.md):20, [claude-bench/judging.md](claude-bench/judging.md):21, [claude-bench/judging.md](claude-bench/judging.md):22).

Сводка стенда руководителя Codex описывает четыре задания и четыре модели на ultra, по одному запуску на ячейку, с двумя судьями Sonnet high и калибровщиком Opus high. Отдельная сводка model-bench калибрует оценки исполнителей A–I; в ней отсутствует сопоставление этих меток с именами моделей ([lead-bench/judging.md](lead-bench/judging.md):3, [model-bench/judging.md](model-bench/judging.md):3).

## Ход

Материалы датируют стенд Claude и сопоставляемые сводки 19 октября 2026 года. Сначала выполнялись задания T1–T4 и слепое оценивание ответов, затем Opus калибровал разногласия и составил итоговую сводку. Для стендов лидов и исполнителей сохранены отдельные сводки результатов и расходов; более подробная хронология отдельных прогонов не сохранилась ([claude-bench/judging.md](claude-bench/judging.md):1, [lead-bench/judging.md](lead-bench/judging.md):1, [model-bench/judging.md](model-bench/judging.md):3).

## Результаты

На стенде Claude Opus xhigh получил итог **27.42 из 38** и занял первое место; Opus max получил 26.25, Fable medium — 25.5, Fable high — 25, а Sonnet high — 19.25 ([claude-bench/judging.md](claude-bench/judging.md):33, [claude-bench/judging.md](claude-bench/judging.md):34, [claude-bench/judging.md](claude-bench/judging.md):35, [claude-bench/judging.md](claude-bench/judging.md):36, [claude-bench/judging.md](claude-bench/judging.md):39). Opus max не улучшил результат xhigh при примерно вдвое большем расходе вывода и времени; автор сводки отмечает убывающую отдачу ([claude-bench/judging.md](claude-bench/judging.md):65).

Ревью плана T2 почти не различало кандидатов: главный дефект не обнаружил никто, а оценки в этой задаче лежали в диапазоне от 0 до 3.5 ([claude-bench/judging.md](claude-bench/judging.md):69). В ревью кода T3 Sonnet получил 0.5 на medium и 3.75 на high, Haiku — 4; в исходной сводке Sonnet и Haiku названы слабыми именно в этой задаче ([claude-bench/judging.md](claude-bench/judging.md):68). Сравнение с Codex ограничено тем, что запуск Claude был без помощников, тогда как Codex использовал помощников в T4 ([claude-bench/judging.md](claude-bench/judging.md):90).

В стенде руководителя Codex gpt-6-astra набрал 21,85 из 40, а gpt-6-sol — 21,55 из 40; автор сводки счёл качество сопоставимым в пределах шума одного запуска. При этом astra стоил в 4,4 раза дороже ([lead-bench/judging.md](lead-bench/judging.md):7). У gpt-6.1-sol и gpt-6-sol была лучшая цена за балл — соответственно 6,4 и 5,2 балла за доллар; сводка также отмечает две ошибки «перестраховки» у gpt-6.1-sol и 22 ошибки инструмента у terra в T4 ([lead-bench/judging.md](lead-bench/judging.md):8, [lead-bench/judging.md](lead-bench/judging.md):9). Единственное преимущество astra в качестве, отмеченное в этом сравнении, — верный вердикт по T2 без ложных находок, хотя оценочная шкала дала всем ноль ([lead-bench/judging.md](lead-bench/judging.md):10).

В таблице калибровки model-bench кандидат F получил 9 из 10, а кандидат B — 6.5 и был назван слабейшим; авторы сочли, что всем кандидатам достаточно мелкой доработки ([model-bench/judging.md](model-bench/judging.md):9, [model-bench/judging.md](model-bench/judging.md):17, [model-bench/judging.md](model-bench/judging.md):43). Имена моделей для меток A–I в этой сводке не указаны.

## Выводы

Итог Claude-стенда ставит Opus xhigh выше остальных проверенных ячеек в этой выборке, но отдельно предупреждает о шуме одного запуска и неполной рубрике. Сводка рекомендует Opus xhigh для длительных задач руководителя, medium для простых разговоров, high как компромисс при ограничении расхода и не рекомендует max; это историческая рекомендация автора исследования, а не описание текущих настроек ([claude-bench/judging.md](claude-bench/judging.md):78, [claude-bench/judging.md](claude-bench/judging.md):80, [claude-bench/judging.md](claude-bench/judging.md):81, [claude-bench/judging.md](claude-bench/judging.md):82, [claude-bench/judging.md](claude-bench/judging.md):83).

Сопоставляемый стенд лидов показывает близкий итог astra и gpt-6-sol при существенно меньшей цене gpt-6-sol ([lead-bench/judging.md](lead-bench/judging.md):7). Сводка model-bench ранжирует буквенные метки, но не позволяет связать этот порядок с именами моделей ([model-bench/judging.md](model-bench/judging.md):41).

## Решения владельца

D225: ревью, судейство и промежуточную приёмку, в том числе работы Codex в роли «2», поручать только Opus; Sonnet и Haiku не использовать для этих ролей. Уровень рассуждения владелец не назвал; в стенде лучший итог был у xhigh. Путь к крупному внешнему индексу решения: `memory/owner-decisions-index.md:52`.

## Ограничения

На основном стенде был один прогон на ячейку; различия меньше 2–3 баллов суммарно автор не считает значимыми. Рубрика T3 была неполной, T2 почти не различал модели, а Codex-судья не смог запустить тесты T1 из-за ограничения песочницы. Цены Claude в долларах не пересчитывались. Карта кодов к моделям хранилась за пределами стенда ([claude-bench/judging.md](claude-bench/judging.md):45, [claude-bench/judging.md](claude-bench/judging.md):88, [claude-bench/judging.md](claude-bench/judging.md):89, [claude-bench/judging.md](claude-bench/judging.md):91, [claude-bench/judging.md](claude-bench/judging.md):92).

## Материалы

| путь | размер в байтах | SHA-256 | что это |
|---|---|---|---|
| `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/claude-bench/judging.md` | 10808 | b11add00d776efdb8b54f34572c8cc9be9ec3c123c462ca58e365b2a1932ecc6 | Итоговая сводка Claude-стенда, метод, результаты и ограничения. |
| `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/claude-bench` | 3403404 | каталог | файлы: 145; исходные материалы Claude-стенда. |
| `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/lead-bench/judging.md` | 15176 | 9d7bf365b843cf48f5b1dbe874a94bd0c8052c30501140eb915653e0be2a6b24 | Итоговая сводка стенда руководителя Codex. |
| `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/lead-bench/metrics.md` | 2217 | 3c5a20330846dd67c76334be5bdfa27b5d4829b336a52707b62d3da9b836a08e | Расход и время запусков стенда руководителя. |
| `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/lead-bench` | 13049904 | каталог | файлов: 118; исходные материалы стенда руководителя Codex. |
| `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/model-bench/judging.md` | 7102 | 498912fcfeaa0364aee25e4050935940b76d516dd9804c1a2f75d1d4a8e8cd98 | Сводка калибровки оценок model-bench. |
| `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/model-bench` | 5136915 | каталог | файлов: 56; исходные материалы model-bench. |
| `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/memory/owner-decisions-index.md` | 158935 | 9a59e78410f86d25fbab77233f6fc78553b71944a9079d06c07772647cb2715e | Большой внешний индекс; решение D225, файл не копировался. |
