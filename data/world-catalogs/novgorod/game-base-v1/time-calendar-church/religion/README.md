# religion — церковь, обряды, верования, жизненный цикл (candidate)

Обе таблицы генерирует `scripts/build_religion.py`, проверяет
`scripts/check_religion.py`. Руками не править.

```
cd scripts
python build_religion.py
python check_religion.py
```

## Источник и copyright

Основной источник — evidence группы `time-calendar-church`, домены
`religion_church` (162 строки) и часть строк `calendar_feasts_fasts`,
относящихся к жизненному циклу (крещение, радуница). Получено read-only:

```
ssh servak "cat /srv/novgorod-work/data/books/evidence/time-calendar-church.csv"
```

Основные авторы: Романов Б.А. («Люди и нравы Древней Руси», 2013, по
Вопрошанию Кирика Новгородца и другим источникам церковного права XII–XIII
вв.), Рыбаков Б.А. («Язычество Древней Руси», 1987), Леонтьева/Кобрин/Шорин
(«Вспомогательные исторические дисциплины», 2009), плюс отдельные записи по
Новгороду (монастыри, владыки, берестяные ярлыки).

Сборщик теперь читает версионированный
`data/world-catalogs/novgorod/sources/books-evidence-v1/time-calendar-church.csv`.
В выходные таблицы поле `quote` не переносится. Скрипт берёт для
`name_ru`/`note` только уже-перефразированное поле `value` из evidence
(описание факта своими словами верификатора), обрезая до ≤400 символов;
поле `quote` не используется вовсе. `source_refs` — библиографическая
ссылка (`book:<id> §<section_path> ¶<para_no>` + авторы/год), без цитаты.
Отклонённых верификатором строк для этой группы нет
(`time-calendar-church.rejected.csv` содержит только заголовок).

## church_practice.csv — 148 строк

Поля: `rl_id, kind (practice|rite|service|belief|institution), name_ru,
roles, pf_ids, calendar_refs, items_refs, sensory_cues, source_refs,
confidence, period, status, note`.

`kind` — детерминированная классификация скриптом по `fact_type` evidence и
ключевым словам в тексте (`build_religion.py:classify_kind`), не ручное
суждение по каждой из 148 строк:

| kind | строк | правило |
|---|---|---|
| practice | 70 | fact_type use/technique/description/presence_in_region, без institution/rite-ключей; Варлаам — биографическая запись |
| institution | 46 | ключи «монастырь, собор, владык, епитимь, суд, казна, десятин, устав, поставлен, избрание, низложение, изгнание, приход» + fact_type=event |
| belief | 23 | fact_type = taboo_or_custom; волхв 1071 г. — исторический фон |
| rite | 9 | ключи «исповед, причасти, погребен, крещен, венчан, постриг, отпеван, поминов» |

`sensory_cues` и `calendar_refs` — тоже скриптовые (небольшой словарь
ключевых слов → звон/пение/запах ладана; ссылки на движимые даты
`time/calendar_1230_1250.csv`), поэтому заполнены не у всех строк — это
честный охват по совпадению ключевых слов, а не разметка руками.
`roles`/`pf_ids`/`items_refs` — оставлены пустыми `[]` в этом проходе: у
evidence-строк нет структурированной привязки к конкретным ролям/местам/
предметам каталога, а угадывать её без источника значило бы выдумывать
(перечислено как gap ниже).

Пример статуса содержания (не выдумано, проверено скриптом-денылистом):
«отсутствие колоколен до XIV в.» и «звонница-перекладина» — обе строки
явно фиксируют ОТСУТСТВИЕ настоящей колокольни в 1230-х, `check_religion.py`
проверяет, что ни одна другая строка не описывает колокольню как
присутствующую вопреки этому.

## lifecycle_rites_burial.csv — 23 строки

Поля: `lr_id, rite_kind (birth|baptism|wedding|death|burial|commemoration),
name_ru, roles, pf_ids, calendar_refs, items_refs, visible_traces,
sensory_cues, attestation, source_refs, confidence, period, status, note`.

16 строк — из evidence (та же таблица, отфильтрована по ключевым словам
крещения/свадьбы/похорон/поминовения в `entity_ru`, скриптом
`classify_lifecycle`). 3 строки — approved claims WK
(`wk:social-institutions.json#claim:burial-plank-coffin-nails`,
`claim:burial-coffin-lid-transverse-plank`, `claim:burial-hollowed-log-container`),
привязаны к `pf_ids=["g4v3__gn_nov_g3_xp017_yp026_r2_zaostrovye_burial_area"]`
— закрывает явно названный в критике пробел: у стартового погребального
места G4 Заостровья теперь есть непустой пул содержимого с source_refs
(confidence C, археологическая аналогия).

Ещё 4 строки строятся из `places-binding/places/pf_local_additions.json`: три региональные формы `pf_burial_ground` по `book:638081 §1457`, `book:638081 §1463`, `book:438387 §482`; скудельница 1230 г. по `book:818352 §311` оставлена отдельным исключительным событием без привязки к типичному облику PF.

Свадьба (сватовство/ряд/приданое) как экономико-правовой институт уже
собрана в `households-psychology-speech/households_kinship/
marriage_inheritance_rules.csv` — здесь **не дублируется**; в этом файле
только обрядовая/видимая/сенсорная сторона свадьбы (поп на свадьбах и пирах,
венчание для бояр и князей).

Строки с `period=ethnographic_late`/`medieval_general` и три WK-аналога
получили `confidence=C` и `note` с явной оговоркой — проверено
`check_religion.py`. Проверен denylist на поздние надгробия
с надписями («надпись», «плита с надписью», «памятник») — 0 совпадений
среди 23 строк.

## Известные пробелы

- `roles`/`pf_ids`/`items_refs` почти всюду `[]` — нет источника,
  связывающего конкретную практику с конкретной ролью/местом/предметом
  каталога; заполнение этого — содержательная работа следующего прохода
  (сверка с `occupations-activities`, `places-binding`, `items-*`), не
  то, что можно вывести скриптом из имеющихся источников.
- Латинская церковь иноземных купцов представлена частично (церковь
  Св. Петра на Немецком дворе, священник, колокол Немецкого двора) — не
  найдено отдельного массива по литургической практике католиков на дворе,
  только присутствие институции.
- `region_id`/universal-флаг (critic_problems #1) не добавлен.
- Постриг взрослых (не княжеских детей), исповедь у смерти (соборование)
  как отдельный обряд не выделены отдельной строкой lifecycle — упомянуты
  только опосредованно внутри church_practice (`rite`).
