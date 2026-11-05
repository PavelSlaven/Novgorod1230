# Прозаический тест данных: хватает ли данных
> Движок: старый (v17, integ-98).
> Даты: 2026-09-26 — 2026-10-07.
> Источник отчёта: /srv/novgorod-work/prose-test/runs-v4/RESULTS.md

## Вопрос
Может ли сильная модель написать сцену по игровому пакету без выдумок и достаточно ли в таком пакете данных о месте, предметах, людях и их занятиях?

## Метод
В первом прогоне модели получали тот же пакет, который предназначен для игровой LLM, и писали сцену; сравнивались русская подача «visible» и формат запроса рассказчика v17 с его системной инструкцией. Использовались Sonnet и Qwen 27B, а тексты оценивал Sonnet high ([source-readme.md](source-readme.md):3; [source-readme.md](source-readme.md):15; [source-readme.md](source-readme.md):18). Во втором прогоне проверили переделанную базу и детерминированную сборку пакетов; вариант v17 не повторяли ([source-readme-v2.md](source-readme-v2.md):3; [source-readme-v2.md](source-readme-v2.md):6; [source-readme-v2.md](source-readme-v2.md):8; [source-readme-v2.md](source-readme-v2.md):15).

В третьем прогоне сравнили пять способов подачи одинаковых данных модели Qwen 27B на делах C1–C5: полный пакет; отобранный кодом пакет; выбор фактов самой моделью; черновик с последующей проверкой и правкой; письмо по зонам. Для каждой пары «дело — стратегия» сделали по три текста при температуре 0,7; оценивание выполнялось отдельным слепым проходом ([source-runs-v3-readme.md](source-runs-v3-readme.md):3; [source-runs-v3-readme.md](source-runs-v3-readme.md):39; [source-runs-v3-readme.md](source-runs-v3-readme.md):47; [source-runs-v3-readme.md](source-runs-v3-readme.md):49). В четвёртом прогоне сравнили Qwen и опорные тексты Sonnet на расширенных пакетах; позднее отдельная калибровка пересудила тексты v3 и v4 общей рубрикой тремя слепыми судьями ([source-report.md](source-report.md):7; [source-runs-cal-results.md](source-runs-cal-results.md):5). В v5 проверили изменения сборщика на тех же делах с текстами v4 как якорем; на каждый текст приходилось по три слепых судьи Sonnet ([source-runs-v5-results.md](source-runs-v5-results.md):5).

## Ход
26 сентября описан первый прогон на семи делах: первый приход в пяти местах, разговор перевозчика с рыбаком и жизнь двора до полудня ([source-readme.md](source-readme.md):1; [source-readme.md](source-readme.md):7; [source-readme.md](source-readme.md):13). 27 сентября записан повтор после изменений базы и затем сравнение стратегий сборки и подачи ([source-readme-v2.md](source-readme-v2.md):1; [source-runs-v3-readme.md](source-runs-v3-readme.md):1). Дальнейшая последовательность материалов — расширенный v4, калибровка судей и v5; более точные даты для этих записей в самих итогах не сохранились.

## Результаты
Первый прогон признал данные частично достаточными во всех семи делах. Оценки в таблице указаны как «верность данным / качество текста»; по делам они были следующими ([source-readme.md](source-readme.md):22; [source-readme.md](source-readme.md):34):

| Дело | Sonnet visible | Qwen visible | Sonnet v17 | Qwen v17 | Источник |
|---|---:|---:|---:|---:|---|
| C1, берег | 3 / 5 | 2 / 3 | 4 / 4 | 3 / 1 | [source-readme.md](source-readme.md):26 |
| C2, бор | 3 / 5 | 2 / 3 | 4 / 3 | 3 / 2 | [source-readme.md](source-readme.md):27 |
| C3, двор | 3 / 4 | 2 / 3 | 4 / 3 | 1 / 2 | [source-readme.md](source-readme.md):28 |
| C4, пойма | 4 / 5 | 2 / 3 | 3 / 4 | 4 / 2 | [source-readme.md](source-readme.md):29 |
| C5, перевоз | 4 / 4 | 2 / 3 | 5 / 2 | 5 / 1 | [source-readme.md](source-readme.md):30 |
| C6, разговор | 5 / 3 | 2 / 4 | 5 / 2 | 2 / 4 | [source-readme.md](source-readme.md):31 |
| C7, жизнь двора | 4 / 4 | 3 / 3 | — | — | [source-readme.md](source-readme.md):32 |

В первом пакете на двор выпадало около 630 вещей, а на перевоз — 258; среди находок были отходы ремесленных мастерских, обломки судна во дворе и предметы без причины появления. На перевозе не было лодки или плота, во дворе — построек; также не хватало данных о воде, рельефе, погоде, запахах, расположении вещей и людях ([source-readme.md](source-readme.md):39; [source-readme.md](source-readme.md):40; [source-readme.md](source-readme.md):44; [source-readme.md](source-readme.md):45; [source-readme.md](source-readme.md):46). Подача содержала английские коды и служебные поля, не ранжировала сотни строк, могла называть совместимые по времени наблюдения «видимыми», теряла рыбу и видимых зверей в формате v17 и давала несогласованные признаки места ([source-readme.md](source-readme.md):48; [source-readme.md](source-readme.md):49; [source-readme.md](source-readme.md):50; [source-readme.md](source-readme.md):58; [source-readme.md](source-readme.md):54). Qwen чаще противоречил пакету, чем Sonnet: в материалах отмечены ошибки со словами «сухо», временем, датой, ценами и именами ([source-readme.md](source-readme.md):68).

Во втором прогоне все семь дел снова получили оценку «частично». Таблица показывает оценки Sonnet и Qwen до и после изменения базы ([source-readme-v2.md](source-readme-v2.md):34):

| Дело | Sonnet, было → стало | Qwen, было → стало | Источник |
|---|---:|---:|---|
| C1, берег | 3/5 → 4/4 | 2/3 → 3/3 | [source-readme-v2.md](source-readme-v2.md):26 |
| C2, бор | 3/5 → 4/5 | 2/3 → 2/3 | [source-readme-v2.md](source-readme-v2.md):27 |
| C3, двор | 3/4 → 3/4 | 2/3 → 2/3 | [source-readme-v2.md](source-readme-v2.md):28 |
| C4, пойма | 4/5 → 4/4 | 2/3 → 2/3 | [source-readme-v2.md](source-readme-v2.md):29 |
| C5, перевоз | 4/4 → 3/4 | 2/3 → 2/3 | [source-readme-v2.md](source-readme-v2.md):30 |
| C6, разговор | 5/3 → 4/4 | 2/4 → 2/3 | [source-readme-v2.md](source-readme-v2.md):31 |
| C7, жизнь двора | — → 5/4 | — → 3/2 | [source-readme-v2.md](source-readme-v2.md):32 |

На дворе число предметов снизилось с 630 до 314 после броска, из них видимыми были 13; на берегу C1 осталось 5 предметов, и противоречие между сухим грунтом и илом ушло ([source-readme-v2.md](source-readme-v2.md):38). При этом на летнем перевозе не выпал единственный перевозчик с вероятностью 25%, в C7 не было жителей, в C4 не оказалось скота, а лес C2 остался пустым ([source-readme-v2.md](source-readme-v2.md):45; [source-readme-v2.md](source-readme-v2.md):46; [source-readme-v2.md](source-readme-v2.md):47; [source-readme-v2.md](source-readme-v2.md):48; [source-readme-v2.md](source-readme-v2.md):49). Запахи были только в 24 из 61 ячейки «место × сезон», а у 72% строк предметов не было правила размещения ([source-readme-v2.md](source-readme-v2.md):57; [source-readme-v2.md](source-readme-v2.md):59). Новые главные объекты и блок ощущений появились, а переносные вещи получили причину, но по-прежнему не хватало достоверного присутствия людей, описаний воды и объектов, связи голосов животных со временем суток и корректных отношений персонажей ([source-readme-v2.md](source-readme-v2.md):38; [source-readme-v2.md](source-readme-v2.md):39; [source-readme-v2.md](source-readme-v2.md):40; [source-readme-v2.md](source-readme-v2.md):41; [source-readme-v2.md](source-readme-v2.md):43; [source-readme-v2.md](source-readme-v2.md):52; [source-readme-v2.md](source-readme-v2.md):55; [source-readme-v2.md](source-readme-v2.md):57; [source-readme-v2.md](source-readme-v2.md):63; [source-readme-v2.md](source-readme-v2.md):64).

В третьем прогоне результаты пяти стратегий для Qwen были такими: верность / качество / сцена / выдумок на текст / тексты без ошибок / каталогов ([source-runs-v3-results.md](source-runs-v3-results.md):7):

| Стратегия | Результаты | Источник |
|---|---|---|
| A, полный пакет | 3,33 / 3,40 / 3,60 / 1,53 / 0% / 2 | [source-runs-v3-results.md](source-runs-v3-results.md):9 |
| B, пакет отобран кодом | 3,47 / 3,67 / 4,00 / 0,67 / 20% / 0 | [source-runs-v3-results.md](source-runs-v3-results.md):10 |
| C, модель сначала выбирает детали | 2,73 / 3,13 / 3,53 / 1,27 / 7% / 0 | [source-runs-v3-results.md](source-runs-v3-results.md):11 |
| D, проверка и правка | 3,67 / 3,53 / 3,67 / 0,47 / 27% / 1 | [source-runs-v3-results.md](source-runs-v3-results.md):12 |
| E, подача по зонам | 2,93 / 3,27 / 3,13 / 1,00 / 20% / 0 | [source-runs-v3-results.md](source-runs-v3-results.md):13 |

В отчёте по слепому судейству указано 75 текстов и 180 вызовов; описание конвейера при том же числе текстов приводит 260 суммарных вызовов. Материалы это расхождение не объясняют ([source-runs-v3-results.md](source-runs-v3-results.md):4; [source-runs-v3-readme.md](source-runs-v3-readme.md):85). В методическом отчёте перечислены 5 стратегий, 3 текста на комбинацию и отдельная схема вызовов по стратегии ([source-runs-v3-readme.md](source-runs-v3-readme.md):39; [source-runs-v3-readme.md](source-runs-v3-readme.md):49). Рекомендация того отчёта на тот момент — B по умолчанию, D как необязательная проверка, а C и E не использовать; противоречия оставались близки между стратегиями ([source-runs-v3-results.md](source-runs-v3-results.md):21; [source-runs-v3-results.md](source-runs-v3-results.md):23; [source-runs-v3-results.md](source-runs-v3-results.md):25; [source-runs-v3-results.md](source-runs-v3-results.md):38; [source-runs-v3-results.md](source-runs-v3-results.md):39; [source-runs-v3-results.md](source-runs-v3-results.md):40).

В v4 расширенные пакеты принесли сведения о людях, предметах, воде и животных. Для C1–C5 порог CR был верностью не ниже 4 и не более 0,67 выдумки на текст. Qwen получил верность 3,03, 3,67 выдумок и 0,87 противоречия на текст; ни один из 15 текстов не уложился в порог выдумок, а верность не ниже 4 получили 4 из 15. Sonnet получил верность 4,10, качество 4,30 и 3,20 выдумки на текст ([source-report.md](source-report.md):21; [source-report.md](source-report.md):25; [source-report.md](source-report.md):26; [source-report.md](source-report.md):29). По отдельным делам у Qwen результаты были следующими (верность / выдумок / противоречий) ([source-report.md](source-report.md):33):

| Дело | Верность / выдумок / противоречий | Источник |
|---|---:|---|
| C1, берег | 3,67 / 2,00 / 0,33 | [source-report.md](source-report.md):35 |
| C2, зимний лес | 2,67 / 3,33 / 1,00 | [source-report.md](source-report.md):36 |
| C3, усадьба | 2,67 / 5,00 / 1,67 | [source-report.md](source-report.md):37 |
| C4, разлив | 3,17 / 3,33 / 0,67 | [source-report.md](source-report.md):38 |
| C5, перевоз | 3,00 / 4,67 / 0,67 | [source-report.md](source-report.md):39 |
| C8, зимний перевоз | 3,00 / 1,33 / 0,67 | [source-report.md](source-report.md):40 |
| C6, разговор | 3,33 / 2,33 / 0,33 | [source-report.md](source-report.md):41 |

У зимнего перевоза сборщик впервые сформировал январский случай без специальных правок; в пакете были лёд, лодки на берегу и тропа, а течение подо льдом, ширина реки и другой берег были обозначены как пробелы. У Qwen там в среднем 1,33 выдумки, но верность была 3,0; модель пропускала растения и искажала формулировки о частоте и звуке ([source-report.md](source-report.md):71; [source-report.md](source-report.md):72; [source-report.md](source-report.md):73; [source-report.md](source-report.md):74; [source-report.md](source-report.md):76; [source-report.md](source-report.md):78; [source-report.md](source-report.md):79; [source-report.md](source-report.md):80). В C6 Qwen получил верность 3,33 и оценку сцены 3,17, Sonnet — верность 4,5; сторож исчезал в двух текстах из четырёх, а писатели добавляли приказ, рябь и направление ветра ([source-report.md](source-report.md):88; [source-report.md](source-report.md):96; [source-report.md](source-report.md):91; [source-report.md](source-report.md):93; [source-report.md](source-report.md):94).

Из 448 ячеек покрытия воды 140 имели менее трёх признаков без явного пробела; в C4 не попали в пакет пробелы течения и льда. По другим пунктам приёмки в исходном отчёте: дневные дела не проверяли рассвет, сумерки и ночь; материал у избы и плетня был, но состояние конкретного экземпляра и возраст не задавались; у перевоза не было материала, состояния и размера; на усадьбе присутствовали хозяин и дворовый слуга, но пахарь, ребёнок и хозяйка оставались пробелами ([source-report.md](source-report.md):62; [source-report.md](source-report.md):63; [source-report.md](source-report.md):64; [source-report.md](source-report.md):65). В C6 имелись место, погода и облик, но не отношения и форма обращения между перевозчиком и рыбаком; C8 работал на тех же данных, хотя его описание зимнего пустого места требовало отличать ожидаемую пустоту от отсутствующих правил ([source-report.md](source-report.md):66; [source-report.md](source-report.md):67; [source-report.md](source-report.md):84).

Калибровка общей рубрикой изменила сравнение v3 и v4. В ней Qwen v3 получил верность 2,44, 5,24 всех выдумок, 3,78 жёстких выдумок и 1,49 противоречия на текст; Qwen v4 — 3,04, 4,82, 2,62 и 1,16 соответственно; Sonnet v4 — 3,97, 3,80, 2,13 и 0,47 ([source-runs-cal-results.md](source-runs-cal-results.md):11; [source-runs-cal-results.md](source-runs-cal-results.md):12; [source-runs-cal-results.md](source-runs-cal-results.md):13). Судьи совпали по верности в 70 из 105 парных оценок, а 103 из 105 разошлись не более чем на один балл; абсолютное число жёстких выдумок на одном тексте в среднем различалось на 1,7 между самым строгим и самым мягким судьёй ([source-runs-cal-results.md](source-runs-cal-results.md):29; [source-runs-cal-results.md](source-runs-cal-results.md):30). В пересчёте этой рубрики порог 0,67 всех выдумок предложено отменить; вместо него были предложены пороги по жёстким выдумкам, противоречиям и верности. В отчёте это прямо названо предложением для ревьюера, а не решением ([source-runs-cal-results.md](source-runs-cal-results.md):34; [source-runs-cal-results.md](source-runs-cal-results.md):44; [source-runs-cal-results.md](source-runs-cal-results.md):46; [source-runs-cal-results.md](source-runs-cal-results.md):50; [source-runs-cal-results.md](source-runs-cal-results.md):51; [source-runs-cal-results.md](source-runs-cal-results.md):52).

В v5 сравнивались 15 текстов Qwen v5 и 15 якорных текстов Qwen v4 для C1–C5. Пороговые значения не были пройдены ни по одной из пяти проверок, и aggregate также сохраняет `pass: false` ([source-runs-v5-results.md](source-runs-v5-results.md):5; [source-v5-blind-aggregate.json](source-v5-blind-aggregate.json):65; [source-v5-blind-aggregate.json](source-v5-blind-aggregate.json):71). Для v5 верность составила 2,87 при пороге 3,5, жёстких выдумок было 3,76 при пороге 2,0, противоречий — 1,42 при пороге 0,6 ([source-runs-v5-results.md](source-runs-v5-results.md):13; [source-runs-v5-results.md](source-runs-v5-results.md):14; [source-runs-v5-results.md](source-runs-v5-results.md):15). Худший текст имел 7,33 жёстких выдумки и 3,67 противоречия; тексты с верностью не ниже 3,5 — 1 из 15 ([source-runs-v5-results.md](source-runs-v5-results.md):16; [source-runs-v5-results.md](source-runs-v5-results.md):17; [source-runs-v5-results.md](source-runs-v5-results.md):19). Качество и сцена составили 3,62 и 3,69 ([source-runs-v5-results.md](source-runs-v5-results.md):20).

Сопоставление по делам (верность / жёстких выдумок / противоречий) дало следующие значения ([source-runs-v5-results.md](source-runs-v5-results.md):22):

| Дело | v5 | v4 | Источник |
|---|---:|---:|---|
| C1, берег | 2,78 / 3,56 / 1,22 | 2,44 / 4,56 / 1,67 | [source-runs-v5-results.md](source-runs-v5-results.md):24 |
| C2, зимний лес | 3,00 / 5,11 / 0,89 | 3,33 / 2,33 / 0,56 | [source-runs-v5-results.md](source-runs-v5-results.md):25 |
| C3, усадьба | 2,44 / 3,33 / 2,78 | 2,56 / 4,11 / 2,33 | [source-runs-v5-results.md](source-runs-v5-results.md):26 |
| C4, разлив | 2,67 / 4,22 / 1,11 | 3,22 / 3,56 / 0,44 | [source-runs-v5-results.md](source-runs-v5-results.md):27 |
| C5, перевоз | 3,44 / 2,56 / 1,11 | 2,89 / 5,67 / 1,22 | [source-runs-v5-results.md](source-runs-v5-results.md):28 |
| C6, разговор | 2,22 / 4,22 / 2,56 | — | [source-runs-v5-results.md](source-runs-v5-results.md):29 |
| C8, зимний перевоз | 2,78 / 3,44 / 1,11 | — | [source-runs-v5-results.md](source-runs-v5-results.md):30 |

В относительном сравнении v5 с v4 по 15 парам различие в верности составило −0,02 ± 0,16, в жёстких выдумках −0,29 ± 0,54, в противоречиях +0,18 ± 0,16; отчет заключает, что v5 не лучше v4. Отдельно отмечено, что судьи v5 нашли в якорных текстах v4 в 1,5 раза больше жёстких выдумок, тогда как верность и противоречия оценивали примерно так же ([source-runs-v5-results.md](source-runs-v5-results.md):45; [source-runs-v5-results.md](source-runs-v5-results.md):48). Разбор ошибок отнёс 11 случаев в C1–C5 и вклад 0,56 к классу, где признак приписан не тому предмету; далее шли свет и время, неверные слова, явные факты пакета и превращение пробела данных в утверждение ([source-runs-v5-results.md](source-runs-v5-results.md):54; [source-runs-v5-results.md](source-runs-v5-results.md):56; [source-runs-v5-results.md](source-runs-v5-results.md):57; [source-runs-v5-results.md](source-runs-v5-results.md):58; [source-runs-v5-results.md](source-runs-v5-results.md):59; [source-runs-v5-results.md](source-runs-v5-results.md):60).

## Выводы
В исходных итогах повторяются выводы, что переделка базы убрала археологический мусор и сделала материализацию реалистичнее, но не решила главную нехватку сведений о том, кто находится на месте и чем занят ([source-readme-v2.md](source-readme-v2.md):72; [source-readme-v2.md](source-readme-v2.md):74). В v3 лучше всего оценили пакет, отобранный кодом; проверка и правка уменьшали число выдумок, но увеличивали время и снижали часть оценок, а выбор деталей самой моделью и письмо по зонам оказались хуже в этом прогоне ([source-runs-v3-results.md](source-runs-v3-results.md):16; [source-runs-v3-results.md](source-runs-v3-results.md):21; [source-runs-v3-results.md](source-runs-v3-results.md):23; [source-runs-v3-results.md](source-runs-v3-results.md):24).

В v4 рост выдумок относительно прежнего результата нельзя было напрямую приписать пакетам из-за разной строгости судей; калибровка показала, что судьи v3 были мягче. По общей рубрике данные v4 улучшили верность Qwen относительно v3, но противоречия оставались, а новые сведения о людях и вещах давали модели дополнительные поводы дополнять сцену. Итоги указывали на проблемы пакета, данных и проверки текста, а не только на выбор модели ([source-report.md](source-report.md):47; [source-report.md](source-report.md):49; [source-report.md](source-report.md):52; [source-runs-cal-results.md](source-runs-cal-results.md):18; [source-runs-cal-results.md](source-runs-cal-results.md):19; [source-runs-cal-results.md](source-runs-cal-results.md):24; [source-runs-v5-results.md](source-runs-v5-results.md):3).

В v5 изменения исправили отдельные целевые случаи — например, исчезла реплика о другом береге, а выбор пола и одежды хозяина усадьбы стал согласованнее, — но общий результат не стал лучше v4; основной оставшийся класс ошибок возникал при переносе признака с одного предмета на соседний ([source-runs-v5-results.md](source-runs-v5-results.md):7; [source-runs-v5-results.md](source-runs-v5-results.md):48). В материалах v5 предложено давать состояние рядом с именем каждого отдельного предмета, явно указывать пробелы данных, задавать свет словами и проверять текст кодом после писателя; это рекомендации исходного отчёта, не зафиксированные здесь как новое решение владельца ([source-runs-v5-results.md](source-runs-v5-results.md):98; [source-runs-v5-results.md](source-runs-v5-results.md):99; [source-runs-v5-results.md](source-runs-v5-results.md):100).

## Решения владельца
- D1: Код задаёт NPC темперамент, ценности, 1–3 цели/страха и мотивы из утверждённых профилей занятия или роли при создании. Источник: `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/memory/novgorod-game-vision.md:16`.
- D297: до повторной авторизации CLI прозаические пробы проводить с Claude-субагентами: писатель Haiku 5.5, судьи Sonnet 5.5; учитывать, что дополнительный контекст Claude делает измерение нечистым, и указывать это в отчётах. (`C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/memory/owner-decisions-index.md`:134)
- D298: переделать пакет и указания и повторить ту же пробу; не указывать расстояние для каждой вещи; первый фрагмент передавать целиком, а каждый следующий — только изменениями относительно предыдущего; состояние героя включать лишь при его изменении. (`C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/memory/owner-decisions-index.md`:135)
- D299: разрешить рассказчику выдумывать детали окружения, не влияющие на механику, и описывать предметы только в пределах имеющихся характеристик; недостающую характеристику считать пунктом плана расширения данных. (`C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/memory/owner-decisions-index.md`:136)

D25: текст решения не найден

## Ограничения
Первый прогон проходил вне репозитория, а второй был сделан только в формате visible без v17; обе особенности ограничивают перенос результатов на игровой путь ([source-readme.md](source-readme.md):3; [source-readme-v2.md](source-readme-v2.md):15). В v3 итоговая выборка содержала 15 текстов на стратегию, по одному судье на дело; 41 из 150 цитат не нашлась дословно, поэтому сами оценки выдумок были обозначены как ориентир ([source-runs-v3-results.md](source-runs-v3-results.md):43; [source-runs-v3-results.md](source-runs-v3-results.md):44). В v4 было по 15 текстов Qwen и только по одному тексту Sonnet на дело, цитаты судей находились не все; все дела относились к дневной фазе, исследование проводилось на стенде, а не на реальном пути v17 ([source-report.md](source-report.md):16; [source-report.md](source-report.md):17; [source-report.md](source-report.md):54; [source-report.md](source-report.md):105). Калибровка отмечала низкую надёжность метрики противоречий и заметный разброс числа жёстких выдумок между судьями ([source-runs-cal-results.md](source-runs-cal-results.md):30; [source-runs-cal-results.md](source-runs-cal-results.md):31). В v5 один судья перепутал пакеты двух текстов C2; исключение этих оценок не меняло записанный вывод, но исходный отчёт отдельно фиксирует эту подмену ([source-runs-v5-results.md](source-runs-v5-results.md):32).

## Материалы
| путь | размер в байтах | SHA-256 | что это |
|---|---|---|---|
| `/srv/novgorod-work/prose-test` | 8507591 | каталог | файлов: 1312; исходная папка прозаического теста и прогонов |
| `/srv/novgorod-work/prose-test/README.md` | 8234 | 7b4c2b989ed9cd00acf0a39b0cb8ff7d5099dbda313706a3d22e58593dbaa5a7 | описание первого прогона и его выводы |
| `/srv/novgorod-work/prose-test/README-v2.md` | 6848 | cd196c396e020d8e90141da659e4262384d7e3243cc725388a86182f7ecc10fd | описание второго прогона и оценки после изменения базы |
| `/srv/novgorod-work/prose-test/runs-v3/README.md` | 10864 | e8eacbc0fba3330784ec85bc5bee138985f420664c31780fffcdf26441dc9daf | метод сравнения стратегий и объективные метрики v3 |
| `/srv/novgorod-work/prose-test/runs-v3/RESULTS.md` | 4537 | 5d6ed69c4cdea6e439bef1cf58e6942ffeeca89c00ec4a57ca326cbd5dcc58ef | результат слепого судейства v3 |
| `/srv/novgorod-work/prose-test/runs-v4/RESULTS.md` | 26060 | 90f5ede1a833f737485d1a1286dc5b4090c16ba1c8d44a825217d98f68aff3ac | итоги расширенного прогона v4 |
| `/srv/novgorod-work/prose-test/runs-v5/RESULTS.md` | 19704 | 366fbdf2303f22f7494ed82947f5c15fb88d0a39b951cb73f7e4949a859d9d18 | сравнение v5 и v4, разбор ошибок и предложения |
| `/srv/novgorod-work/prose-test/runs-cal/RESULTS.md` | 10742 | cbee161af8ec0f93897236435e50fd3bf3a4dedd46a3b188f9da8094fc6547ee | калибровка общей рубрики и судей |
| `/srv/novgorod-work/prose-test/runs-v5-blind/aggregate.json` | 23789 | fbdfa9fd6e942cd15693b1844880bbac0deb03e77edccebcd067259c8764181e | агрегированные слепые оценки v5, включая признаки прохождения порогов |
| `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/memory/owner-decisions-index.md` | 158935 | 9a59e78410f86d25fbab77233f6fc78553b71944a9079d06c07772647cb2715e | индекс решений владельца; оставлен внешним из-за размера |
| `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/memory/novgorod-game-vision.md` | 11034 | b981ab93e413e5923f8befd68166923950a2625bf6ba1686952c183f2acf5f81 | Текст решения владельца; неизменённая копия — novgorod-game-vision.md. |
