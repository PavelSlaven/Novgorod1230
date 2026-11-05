# Сводка стендов выбора моделей
> Движок: не относится.
> Даты: 2026-10-19 — 2026-10-20.
> Источник отчёта: codex-direct/BENCH-RESULTS.md

## Вопрос
Какие модели брать под роли Codex и Claude?

## Метод
Сводка объединила несколько слепых стендов Codex и Claude, в которых кандидатов сравнивали по общей шкале, затратам и времени. Карта кодов моделей хранилась отдельно от материалов, доступных судьям; расчёт цены Codex опирался на токены rollout и ставки OpenAI, а Claude — на транскрипты и прайс API. Подписочные лимиты в сравнение не переносились как эквивалент API-цены ([source-report.md](source-report.md):8; [source-report.md](source-report.md):9).

Постановки включали доводку кода, задания руководителя Codex, задачи ревью и разведку с обязательными ссылками на файлы и строки. Число повторов отличалось между стендами: в ранних стендах был один прогон на ячейку, а в тесте субагентов — три; для кода отдельно применялись скрытые тесты ([source-report.md](source-report.md):17; [source-report.md](source-report.md):33; [source-report.md](source-report.md):69; [source-report.md](source-report.md):121; [source-report.md](source-report.md):154).

## Ход
В сводке приведены датированные разделы о стендах 19 октября для помощников и руководителя Codex и моделей Claude на заданиях руководителя, а также раздел о субагентах Claude от 20 октября. После них сформулирован общий вывод о требованиях к брифу исполнителя ([source-report.md](source-report.md):11; [source-report.md](source-report.md):56; [source-report.md](source-report.md):111; [source-report.md](source-report.md):145; [source-report.md](source-report.md):186).

## Результаты
В стенде помощников Codex сравнивались девять вариантов модели и усилия на одной типовой доводке. Все значения таблицы приведены из сводки ([source-report.md](source-report.md):159).

| Модель | Усилие | Время | Вызовов | Цена, $ | Оценка /10 |
|---|---|---:|---:|---:|---:|
| gpt-6-luna | medium | 3 мин | 19 | 0.02 | 6.5 ([source-report.md](source-report.md):161) |
| gpt-6-luna | high | 5 мин | 28 | 0.04 | 8 ([source-report.md](source-report.md):162) |
| gpt-5.6-luna | high | 5 мин | 35 | 0.13 | 7.5 ([source-report.md](source-report.md):163) |
| gpt-6.1-sol | high | 4.5 мин | 18 | 0.36 | 7.5 ([source-report.md](source-report.md):164) |
| gpt-6-sol | medium | 4 мин | 20 | 0.42 | 8.5 ([source-report.md](source-report.md):165) |
| gpt-6-sol | high | 5 мин | 19 | 0.54 | 9 ([source-report.md](source-report.md):166) |
| gpt-5.6-terra | high | 8.5 мин | 22 | 0.87 | 7 ([source-report.md](source-report.md):167) |
| gpt-6-astra | high | 6.5 мин | 24 | 2.84 | 8 ([source-report.md](source-report.md):168) |
| gpt-5.6-sol | high | 9.5 мин | 50 | 3.05 | 8.5 ([source-report.md](source-report.md):169) |

Все кандидаты уложились в рамки правок и прошли 60/60 тестов; при этом задание само противоречило коду. Ни одна модель не остановилась уточнить условие: все изменили тест, шесть его ослабили, и примерно половина не сообщила об этом явно. В сводке поэтому предложено прямо требовать эскалации конфликта задания с кодом, не ослабляя тест ([source-report.md](source-report.md):174).

Для помощников Codex сводка рекомендовала gpt-6-luna high для чтения, поиска, механики и документов, а gpt-6-sol high — для изменений, где нужно суждение. gpt-6.1-sol предлагалось оставить для сложной диагностики; семейство 5.6 и astra как помощника — не выбирать. Ограничением было одно задание и один прогон на ячейку, с возможным разбросом около одного балла ([source-report.md](source-report.md):27; [source-report.md](source-report.md):33).

На стенде руководителя Codex сравнивали четыре модели на четырёх заданиях в ultra. По сумме gpt-6-astra набрала 21.85 при расходе $18.27; gpt-6-sol — 21.55 при $4.15; gpt-5.6-terra — 19.95 при $7.91; gpt-6.1-sol — 19.60 при $3.05. Источник отметил, что astra была примерно в 4.4 раза дороже gpt-6-sol при близком качестве, gpt-6.1-sol удаляла правильный предел и сообщала ложную находку, а terra работала примерно вдвое медленнее и допустила ошибки инструмента в T4 ([source-report.md](source-report.md):127; [source-report.md](source-report.md):136; [source-report.md](source-report.md):138).

На отдельном стенде моделей Claude для заданий руководителя Codex итоговые суммы и расходы были следующими ([source-report.md](source-report.md):78):

| Кандидат | Балл /38 | Вывод, тыс. токенов | Минут на четыре задания | Источник |
|---|---:|---:|---:|---|
| Opus xhigh | 27.42 | 191 | 38 | [source-report.md](source-report.md):80 |
| Opus max | 26.25 | 368 | 77 | [source-report.md](source-report.md):81 |
| Fable medium | 25.5 | 94 | 26 | [source-report.md](source-report.md):82 |
| Fable high | 25 | 108 | 28 | [source-report.md](source-report.md):83 |
| Opus medium | 21 | 73 | 15 | [source-report.md](source-report.md):84 |
| Haiku medium | 20.75 | 109 | 11 | [source-report.md](source-report.md):85 |
| Sonnet high | 19.25 | 50 | 14 | [source-report.md](source-report.md):86 |
| Codex gpt-6-sol ultra | 18.75 | — | — | [source-report.md](source-report.md):87 |
| Opus high | 18 | 96 | 21 | [source-report.md](source-report.md):88 |
| Sonnet medium | 16.25 | 48 | 14 | [source-report.md](source-report.md):89 |

На этой шкале оценки Codex составили 20.2 у astra, 19.7 у gpt-6-sol, 18.6 у terra и 18.4 у gpt-6.1-sol ([source-report.md](source-report.md):93; [source-report.md](source-report.md):94; [source-report.md](source-report.md):95; [source-report.md](source-report.md):96).

Сводка отметила, что Opus xhigh, Opus max и Fable оказались выше любого Codex-кандидата на этой шкале. Sonnet и Haiku слабо справились с ревью кода; Opus max не превзошла xhigh при примерно двукратных затратах времени и вывода; Opus high уступила medium из-за одного пропущенного блокера, что источник счёл шумом одного прогона. Ни одна модель не нашла главный дефект плана в T2 ([source-report.md](source-report.md):100; [source-report.md](source-report.md):102; [source-report.md](source-report.md):104).

В стенде Claude-субагентов сравнили Sonnet 5.5 high и Haiku 5.5 high по четырём кодовым и трём разведочным заданиям, по три запуска каждой модели. Средняя оценка на коде составила 9.25 у Sonnet и 9.26 у Haiku при средней цене $0.421 и $0.111 за прогон; на разведке — 8.43 и 8.53 при $0.301 и $0.064. Sonnet был быстрее примерно в 1.5 раза ([source-report.md](source-report.md):17; [source-report.md](source-report.md):21; [source-report.md](source-report.md):27; [source-report.md](source-report.md):48).

По отдельным заданиям оценки Sonnet/Haiku и цены за прогон составили: K1 — 8.41/8.52 и $0.31/$0.13 ([source-report.md](source-report.md):36); K2 — 9.06/8.85 и $0.67/$0.14 ([source-report.md](source-report.md):37); K3 — 9.71/9.79 и $0.46/$0.15 ([source-report.md](source-report.md):38); K4 — 9.83/9.88 и $0.24/$0.02 ([source-report.md](source-report.md):39); R1 — 8.25/8.67 и $0.23/$0.03 ([source-report.md](source-report.md):40); R2 — 9.13/9.13 и $0.19/$0.02 ([source-report.md](source-report.md):41); R3 — 7.92/7.79 и $0.49/$0.14 ([source-report.md](source-report.md):42).

Стенд показал близкое качество, при этом Haiku обходился дешевле примерно в 3.8 раза на коде и 4.7 раза на разведке. Sonnet превысил лимит длины ответа в одиннадцати запусках из двадцати одного, а Haiku — ни в одном. Из-за противоречивой вводной Sonnet самостоятельно разрешил проблему во всех двадцати одном запуске, тогда как Haiku остановился в трёх; эти три запуска повторили после исправления вводной. Все скрытые тесты прошли кандидаты ([source-report.md](source-report.md):44; [source-report.md](source-report.md):49; [source-report.md](source-report.md):51; [source-report.md](source-report.md):52).

Сводка рекомендовала Haiku high для кода с чётким брифом и проверяемым результатом, а также для разведки. Sonnet high предлагалось выбирать, когда важна скорость или бриф неизбежно неполон. Ревью и судейство были отнесены к Opus. Для всех стендов общей проблемой остались буквальное исполнение противоречивых условий и отсутствие надёжной реакции на такой конфликт: Codex-модели молча переписывали тест, Sonnet решал противоречие самостоятельно, Haiku иногда останавливался. Поэтому координатору предписывалось проверять итог по тестам и diff ([source-report.md](source-report.md):54; [source-report.md](source-report.md):89; [source-report.md](source-report.md):95; [source-report.md](source-report.md):203).

## Выводы
Сводка закрепила раздельный выбор моделей по типу работы: Haiku high для проверяемого кодового задания и разведки, Sonnet high — когда важна скорость, Opus — для ревью и судейства, а gpt-6-sol high — для кодовых правок, требующих суждения. Выводы ограничены небольшим числом прогонов и конкретными заданиями стендов ([source-report.md](source-report.md):27; [source-report.md](source-report.md):33; [source-report.md](source-report.md):54; [source-report.md](source-report.md):89; [source-report.md](source-report.md):99).

## Решения владельца
- D221: помощником Codex по умолчанию выбран gpt-6-luna high; для правок с суждением — gpt-6-sol high; семейство 5.6 и astra как помощника решили не использовать. Также владелец утвердил окно исполнителя 500K и наследование этого окна помощниками; отчёт по оптимизации был принят, token-guard r5 установлен (решение: `memory/owner-decisions-index.md:56` (servak: `/srv/novgorod-work/scratch/research-archive/in/local/memory/owner-decisions-index.md:56`)).
- D222: руководителем Codex выбран gpt-6-sol ultra; первоначально astra оставляли для независимого ревью и приёмки (решение: `memory/owner-decisions-index.md:55` (servak: `/srv/novgorod-work/scratch/research-archive/in/local/memory/owner-decisions-index.md:55`)).
- D223: владелец распорядился отключить caveman для Codex и исполнителей, закрепить `stop caveman` в соответствующих локальных инструкциях и выключить навыки caveman и caveman-review в настройках Codex (решение: `memory/owner-decisions-index.md:54` (servak: `/srv/novgorod-work/scratch/research-archive/in/local/memory/owner-decisions-index.md:54`)).
- D224: последующее решение отменило использование astra; независимое ревью Claude, ревью планов и приёмка Codex были переданы gpt-6-sol ultra (решение: `memory/owner-decisions-index.md:53` (servak: `/srv/novgorod-work/scratch/research-archive/in/local/memory/owner-decisions-index.md:53`)).
- D225: ревью, судейство и промежуточную приёмку владелец закрепил за Opus; Sonnet и Haiku для этой роли исключены. Уровень рассуждений владелец отдельно не называл (решение: `memory/owner-decisions-index.md:52` (servak: `/srv/novgorod-work/scratch/research-archive/in/local/memory/owner-decisions-index.md:52`)).
- D226: для субагентов Claude на чтение, разведку и код по чёткому проверяемому брифу выбран Haiku high; Sonnet high — для скорости или неизбежно неполного брифа; ревью оставлено Opus. Агент scout также назначен на Haiku high, а задания велено писать подробно и без противоречий (решение: `memory/owner-decisions-index.md:51` (servak: `/srv/novgorod-work/scratch/research-archive/in/local/memory/owner-decisions-index.md:51`)).

## Ограничения
Ранние стенды обычно делали один прогон на ячейку, поэтому небольшие различия могли быть шумом; сводка оценивала шум таких стендов в 1–3 балла. На стенде субагентов было три прогона на ячейку, где различия около 0.5 балла считались шумом. Прайс API не отражал подписочные лимиты. Выводы были привязаны к заданным задачам и не проверяли, как те же модели поведут себя на иной сложности ([source-report.md](source-report.md):7; [source-report.md](source-report.md):33; [source-report.md](source-report.md):99).

## Материалы
| путь | размер в байтах | SHA-256 | что это |
|---|---:|---|---|
| `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/BENCH-RESULTS.md` | 12100 | 3bc6ccc7736d2317e890fb1da9af1cfa7c3a4151cbe7a98001fb77d0c6dd2a6c | Сводка итогов стендов выбора моделей. |
| `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/memory/owner-decisions-index.md` | 158935 | 9a59e78410f86d25fbab77233f6fc78553b71944a9079d06c07772647cb2715e | Индекс решений владельца; не копировался, так как превышает лимит малого артефакта. |
