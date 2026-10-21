> status: REFERENCE / DOMAIN GUIDE. Описывает устройство мира, его карту и историческую рамку в игре на CDDA. Норм не создаёт: при конфликте действуют AGENTS.md, CONTRACT_INDEX и профильные контракты. Состояние на 2026-10-21: main 181548e8; работа в неслитых ветках — по доске распорядителя на эту дату.

# 02. Мир, карта и историческая рамка

## Замысел

Игрок живёт в Руси 1230 года и исследует всю Землю; Новгородская земля — начальная область. Мир ограничен причинностью, исторической материальной культурой и знанием героя ([PRODUCT_CONSTITUTION.md:175–248](../../governance/PRODUCT_CONSTITUTION.md)).

1. Герой начинает в Вихтуе → идёт по улице → видит дворы → native движение, mapgen и старт покрыты **полностью** ([areas/06-movement-world-map.md:17,37–38](../../context/cdda-native-map/areas/06-movement-world-map.md)); наши данные задают историческое место.
2. Герой идёт в соседнее поселение → видит путь → `ACT_TRAVELLING` покрывает радиус четырёх overmap **полностью**, знание NPC — **частично** ([areas/06-movement-world-map.md:19–20](../../context/cdda-native-map/areas/06-movement-world-map.md)); наш слой хранит личное знание.
3. Герой покидает Новгородскую землю → ожидает связную Землю → плоская overmap покрывает её **частично**, без полюсов и шва ±180° ([areas/06-movement-world-map.md:31](../../context/cdda-native-map/areas/06-movement-world-map.md)); сопряжение исследуется.

## Что может игрок

- **02.01.** Начать игру в Вихтуе и обойти его улицы и дворы.
- **02.02.** Исследовать места Новгородской земли за пределами первого среза.
- **02.03.** Отправиться из Новгородской земли в другие земли мира.

## Родное CDDA

| Нужда | Покрытие и предел |
|---|---|
| Ходьба, улицы, постройки, старт | **Полное** для одного героя и родной геометрии; старт выбирается по типу местности ([areas/06-movement-world-map.md:17,34,37–38](../../context/cdda-native-map/areas/06-movement-world-map.md)). |
| Путешествие и известный путь | **Полное** в радиусе четырёх overmap; **частичное** для знания, поскольку путь NPC его не проверяет ([areas/06-movement-world-map.md:19–20](../../context/cdda-native-map/areas/06-movement-world-map.md)). |
| JSON-регионы и вся Земля | **Полное** для настроек региона; **частичное** для планетарной географии ([areas/06-movement-world-map.md:31–34](../../context/cdda-native-map/areas/06-movement-world-map.md)). |
| Историческое место и сохранённый мир | Special — **частичное**, точная расстановка требует C++; reality bubble/buffers — **полное в родной модели**, дальняя жизнь груба ([areas/06-movement-world-map.md:30,35](../../context/cdda-native-map/areas/06-movement-world-map.md)). |

## Наш слой и владелец

| Ответственность | Отношение и владелец |
|---|---|
| Физическая карта | **Используем** cells, overmap, mapgen и buffers. Целевой единственный физический владелец — CDDA fork, после проверенной миграции ([Native Earth Map:14–20](../../plans/Novgorod1230_Cataclysm_Native_Earth_Map_Discussion_2026-10-18.md)). |
| Историческое место и знание | **Расширяем** special: случайное размещение не даёт точной привязки ([areas/06-movement-world-map.md:35](../../context/cdda-native-map/areas/06-movement-world-map.md), [Native Earth Map:71–82](../../plans/Novgorod1230_Cataclysm_Native_Earth_Map_Discussion_2026-10-18.md)). До P7 сущности — [space-map/MODULE.md](../../../packages/space-map/MODULE.md), проекция — [visibility-knowledge-memory/MODULE.md:3–18](../../../packages/visibility-knowledge-memory/MODULE.md). |
| Региональные данные | **Используем** JSON-настройки (**полное**, [areas/06-movement-world-map.md:32](../../context/cdda-native-map/areas/06-movement-world-map.md)). Категории задают данные; [world-base/MODULE.md:3–17](../../../packages/world-base/MODULE.md) читает их, [world-knowledge/MODULE.md:5–39](../../../packages/world-knowledge/MODULE.md) даёт factual slice. |
| Земные координаты | **Расширение не выбрано**: overmap, layouts и LAT/LON не дают непрерывной Земли. CR сравнит модификацию CDDA и карты со стыками ([Native Earth Map:52–69](../../plans/Novgorod1230_Cataclysm_Native_Earth_Map_Discussion_2026-10-18.md)). |

## Решения владельца

- **D3, 2026-09-26, пересказ.** Код сохраняет броски наличия при первом прибытии в место; контейнер — при первом открытии ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5839745154)).
- **D4, 2026-09-26, пересказ.** Единый носитель наличия по scope и региону использует уже собранные данные ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5844115406)).
- **D6, 2026-09-26, пересказ.** Сезонные категории бросаются заново при первом прибытии нового сезона; прежние факты остаются ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5839745154)).
- **D18, 2026-09-26, пересказ.** Будущие события и должности отсекаются по текущей дате партии ещё до входа модели. ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5846025182))
- **D19, 2026-09-26, пересказ.** Историческая фаза голода начинается 14.09.1230 ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5846311836)).
- **D22, 2026-09-26, пересказ.** Голод длится по 31.12.1231 включительно ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5848564249)).
- **D26, 2026-09-27, пересказ.** Семейства мест PF — единственный слой типов мест в world_base, к нему привязывается наличие. ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5856342800))
- **D30, 2026-09-28, пересказ.** Стартовые типы мест наполняются полностью; прочие применимые типы получают явный пробел и план заполнения. ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5866721387))
- **D38, 2026-09-28, пересказ.** Обыденный мир заполняется логической необходимостью в пределах эпохи; реконструкция не выдаётся за исторический источник. ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5873359387))
- **D40, 2026-09-28, пересказ.** Включение определяется существованием, а не пользой; иноземное не исключается из-за редкости. ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5873540762))
- **D51, 2026-09-30, пересказ.** Сомнения в региональной частоте не запрещают редкость или импорт; блокируются лишь сомнения в исторической допустимости для региона и периода. ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5905464818))
- **D53, 2026-09-30, пересказ.** У посадочных мест лодки не применяется правило речной переправы. ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5913630707))
- **D56, 2026-09-30, пересказ.** Длительность пути берётся из геометрии; потолок 30 минут снят, разворот возможен посреди линии, точки ставятся только у реальных ориентиров. ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5916869226))
- **D59, 2026-10-01, пересказ.** Исходный мир историчен, а незнакомое эпохе изобретение игрока проверяется по физической возможности. ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5926596803))
- **D66, 2026-10-01, пересказ.** Сценарий задаёт сюжет и людей, а общая механика мира принадлежит общим владельцам ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5937121450)).
- **D106, 2026-10-06, пересказ.** Название места на экране описывает воспринятое; топоним показывается только при знании персонажа. ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6014376079))
- **D107, 2026-10-06, пересказ.** Утверждены семь естественных названий стартов v17; у всех начальные known_places пусты. ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6015162786))
- **D108, 2026-10-06, пересказ.** Можно создать любого персонажа в любом месте; игра объясняет, почему и зачем он там. ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6015580813))
- **D110, 2026-10-06, пересказ.** Регион и сезон задают мир, занятие и положение — пожелания о герое; роль приказчика ограничена квестом Нижней Двины. ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6015910253))
- **D111, 2026-10-06, пересказ.** Утверждена норма независимости героя от места старта; объяснение присутствия входит во вступление. ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6015937590))
- **D112, 2026-10-06, пересказ.** Природные названия приняты с формами «У заводи» и «протока»; однообразие требует дальнейшего наполнения. ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6016124789))
- **D114, 2026-10-06, пересказ.** У места 1–3 устойчивых ориентира; временные следы, дым, свет и шум могут открывать поселение издали при реалистичном восприятии. ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6016481884))
- **D116, 2026-10-06, пересказ.** Дальний сигнал сначала даёт направление и область без числа клеток; дым и следы принадлежат владельцам процессов и следов. ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6016976260))
- **D118, 2026-10-06, пересказ.** Названия forest_tract и burial_area — «В лесу» и «У места погребения». ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6017204398))
- **D138, 2026-10-07, пересказ.** Вступление показывает выходы и описания местности так же, как стартовый экран. ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6116723787))
- **D139, 2026-10-07, пересказ.** Вступление объясняет прибытие, нынешнее положение и нужду героя по его запросу и утверждённым данным. ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6116723787))
- **D140, 2026-10-07, пересказ.** Недостающие постройки реконструируются и связываются с обществом, экономикой и местами. ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6116723787))
- **D148, 2026-10-07, пересказ.** Наличие людей бросается при первом входе; профиль места может требовать хотя бы одного человека ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6116723787)).
- **D220, 2026-10-19, пересказ.** Мир [dda, novgorod] очищается от неисторичного исходного содержимого; изобретения игрока не запрещаются, рецепты не прячутся.
- **Запись решений владельца в #133 от 2026-09-25** ([комментарий 5836830425](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5836830425)). Модель мира общемировая: универсальные категории дополняются региональными разрешениями; `novgorod_world` заполняется максимально полно. Это запись решений, сделанная по решению владельца, а не его прямая цитата.

## Расхождения и открытые вопросы

- **Земля и плоская сетка.** Цель требует морей, шва ±180° и полюсов ([Native Earth Map:14–20,52–69](../../plans/Novgorod1230_Cataclysm_Native_Earth_Map_Discussion_2026-10-18.md)), native покрытие **частичное** ([areas/06-movement-world-map.md:31](../../context/cdda-native-map/areas/06-movement-world-map.md)). Какой способ сопряжения обеспечит непрерывность, сохранение, путь и ориентацию?
- **Историческая привязка.** Special размещается случайно ([areas/06-movement-world-map.md:35](../../context/cdda-native-map/areas/06-movement-world-map.md)); целевая историческая identity требует источника и точности ([Native Earth Map:71–82](../../plans/Novgorod1230_Cataclysm_Native_Earth_Map_Discussion_2026-10-18.md)). Достаточны ли данные для привязки Вихтуя?
- **Дальний мир.** NPC-путь не проверяет знание, дальняя жизнь груба ([areas/06-movement-world-map.md:20,30](../../context/cdda-native-map/areas/06-movement-world-map.md)); замысел требует личного знания и самостоятельной жизни мира ([PRODUCT_CONSTITUTION.md:175–234](../../governance/PRODUCT_CONSTITUTION.md)). Как согласовать эти границы?

## Источники

- [PRODUCT_CONSTITUTION.md](../../governance/PRODUCT_CONSTITUTION.md) — мир, знание и эпоха.
- [Novgorod1230_Cataclysm_Native_Earth_Map_Discussion_2026-10-18.md](../../plans/Novgorod1230_Cataclysm_Native_Earth_Map_Discussion_2026-10-18.md) — варианты географии Земли.
- [Novgorod1230_Cataclysm_Mechanics_Reuse_Strategy_2026-10-18.md](../../plans/Novgorod1230_Cataclysm_Mechanics_Reuse_Strategy_2026-10-18.md) — повторное использование CDDA.
- [areas/06-movement-world-map.md](../../context/cdda-native-map/areas/06-movement-world-map.md) — механизмы карты и их пределы.

## Этап

Срез начинается в Вихтуе; более дальняя география подключается при расширении мира. Общие категории и региональные разрешения действуют для всех регионов. 02.01–02.03 идут от части 5 к поздним этапам; статусы ведутся только в хабе.
