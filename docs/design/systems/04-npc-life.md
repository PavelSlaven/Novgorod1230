> status: REFERENCE / DOMAIN GUIDE. Глава описывает замысел личности, распорядка и жизни NPC и связь с CDDA. Норм не создаёт: при конфликте действуют AGENTS.md, CONTRACT_INDEX и профильные контракты. Состояние на 2026-10-21: main 181548e8; работа в неслитых ветках — по доске распорядителя на эту дату.

# 04. Люди: личность, распорядок, жизнь

## Замысел

Житель — конкретный человек с характером, потребностями, знанием и собственной жизнью ([PRODUCT_CONSTITUTION.md, §8–9](../../governance/PRODUCT_CONSTITUTION.md)). Владелец требует работы, памяти и собственных целей NPC ([scenario-spec.md:31](../../plans/sled-na-nizhney-dvine-scenario-spec.md)).

1. Герой ждёт сутки → наблюдает работу, еду, сон и новую смену → родные потребности, смены и исторический распорядок покрыты **частично** ([areas/02-npc-life.md:11–12,16](../../context/cdda-native-map/areas/02-npc-life.md)) → мод задаёт часы и посты.
2. Герой подходит к мастеру → говорит → видит его реакцию → native граница решений и индивидуальность покрыты **частично** ([areas/02-npc-life.md:17–18](../../context/cdda-native-map/areas/02-npc-life.md)) → модель получает личный контекст (глава 05).

## Что может игрок

- **04.01.** Наблюдать за мастером в течение полных суток: работу, еду, возвращение в избу, сон и новую работу утром, пока сторож держит двор ночью.
- **04.02.** Видеть переходы мастера между местом работы и избой.
- **04.03.** Сохранить игру в трёх разных точках дня и после каждого перезапуска увидеть продолжение распорядка с того же места.
- **04.04.** Увидеть, как мастер убегает от огня и после опасности возвращается к своему распорядку.
- **04.05.** Увидеть распорядок двух жителей Вихтуя в том месте, где началась новая игра.

## Родное CDDA

| Механизм | Покрытие и предел |
|---|---|
| Смены; работа и recurring EOC | **Частичное**: исторический распорядок собирается из постов, часов и данных ([areas/02-npc-life.md:11,14,16](../../context/cdda-native-map/areas/02-npc-life.md)). |
| Потребности и приоритеты | **Полное** native покрытие нужд и долга; исторический распорядок не входит ([areas/02-npc-life.md:12–13](../../context/cdda-native-map/areas/02-npc-life.md)). |
| Решения и личность | Граница решений — **полная**; личность — **частичная** ([areas/02-npc-life.md:17–18](../../context/cdda-native-map/areas/02-npc-life.md)). |

## Наш слой и владелец

**Используем** native тело, движение и нужды; решения исполняет `npc::move` ([areas/02-npc-life.md:12–13,17](../../context/cdda-native-map/areas/02-npc-life.md)). Распорядок **расширяем** через `work_hours`, `guard_pos` и recurring EOC: готовой последовательности мест нет ([areas/02-npc-life.md:11,16](../../context/cdda-native-map/areas/02-npc-life.md)); путь — [#834](https://github.com/PavelSlaven/Novgorod1230/issues/834).

До P7 proposals старого runtime принадлежат [npc-runtime/MODULE.md:5–25](../../../packages/npc-runtime/MODULE.md); физическим движением владеет CDDA. Knowledge owner ограничивает знание NPC.

## Решения владельца

- **D15, 2026-09-26, пересказ.** Речи доступны знания человека эпохи; полный доступ решений к WK заменён D167 ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5846022014)).
- **25.09.2026, без D, пересказ.** LLM может создавать NPC в заданных лимитах; последующее решение D8 уточняет, что создаёт код ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5836830425)).
- **2026-10-06, без D, замысел владельца.** Люди работают, помнят поступки, защищают имущество и преследуют цели ([scenario-spec.md:31](../../plans/sled-na-nizhney-dvine-scenario-spec.md)).
- **D5, 2026-09-26, пересказ.** Материализация создаёт жителей; распорядок перемещает их, приезжие приходят через события. ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5839745154))
- **D8, 2026-09-26, пересказ.** LLM выбирает роль/занятие; код создаёт по сохранённому броску и лимиту, без переброса. ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5839745154))
- **D23, 2026-09-27, пересказ.** Люди следуют распорядкам; отношения и обращения учитываются, животные зависят от фазы суток. ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5853027101))
- **D29, 2026-09-28, пересказ.** Темперамент — 4–6 черт, ценности — 5–7; веса равны, сдвиг по занятию требует источника. ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5866721387))
- **D47, 2026-09-29, пересказ.** Скомороху точечно доступны гусляр, певец и сказитель; общий архетип не меняется. ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5884226430))
- **D49, 2026-09-29, пересказ.** В срезе: темперамент, две ценности, 1–2 цели, страх; люди есть сразу. ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5889785976))
- **D51, 2026-09-30, пересказ.** У народов отдельные пулы имён, без русского запасного пула. ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5905464818))
- **D60, 2026-10-01, пересказ.** Анахронизмы и будущее исключаются из знания и действий NPC. ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5928266458))
- **D61, 2026-10-01, пересказ.** Карельские имена — по календарному правилу; германские и готландские гости профиля — мужчины. ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5931406104))
- **D62, 2026-10-01, пересказ.** NPC общаются через LLM без скриптованных фраз; игрок может учиться у них ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5937121450)).
- **D63, 2026-10-01, пересказ.** Скот — по головам, птица — стаей с числом; нужны наличие, хозяин, фазы дня, видимость, звуки и реакция собаки. Голод и смерть — позже ([#223](https://github.com/PavelSlaven/Novgorod1230/issues/223)).
- **D69, 2026-10-01, пересказ.** Знание и память NPC — до животных, навыки и обучение — после боя; яркое событие помнится дольше.
- **D87, 2026-10-05, пересказ.** По умолчанию обычный день; особый задаёт календарь, ночную работу — назначение.
- **D94, 2026-10-06, пересказ.** Манера зависит от темперамента, занятия, положения и отношений, проверяется по речи. ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6010079905))
- **D100, 2026-10-06, пересказ.** Речь живая, без архаики и канцелярита; положение задаёт словарь, отношения — тон. ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6013130412))
- **D115, 2026-10-06, пересказ.** Повышение фонового NPC до сценического и ключевого и понижение сохраняют память. ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6016650365))
- **D119, 2026-10-06, пересказ.** Связь с ключевым NPC устойчива; обязательства не вытесняются, свёртка меняет только вход модели. ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6017493748))
- **D121, 2026-10-06, пересказ.** Утверждён §15.3: повышение, понижение, история из источников. ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6018172831))
- **D122, 2026-10-06, пересказ.** actors ведёт двор, родство и старшинство; возраст не равен старшинству, владение — держанию. ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6018220559))
- **D124, 2026-10-06, пересказ.** Стартовый двор полон; пробелы закрывает помеченная реконструкция. ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6019676864))
- **D125, 2026-10-06, пересказ.** Реконструируются брак, наследование, военные и городские дворы; уточняет D122. ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6020145069))
- **D126, 2026-10-06, пересказ.** Дополнить реконструкцию общества недостающими связями и дворами ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6020967708)).
- **D127, 2026-10-06, пересказ.** Общество фиксирует положение, двор, связи, должность и обязанности; процессы — позже. ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6020967708))
- **D128, 2026-10-06, пересказ.** Утверждена норма семьи и двора: конкретные люди вместо переноса поздних институтов. ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6021565957))
- **D148, 2026-10-07, пересказ.** Наличие бросается при первом входе; профиль места может требовать хотя бы одного человека. ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6116723787))
- **D152, 2026-10-08, пересказ.** Облысение: мужчины среднего/старшего возраста, около 15%, без цвета и стиля волос. ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6116723787))
- **D165, 2026-10-08, пересказ.** Код ограничивает доступ к знаниям по конкретным NPC. ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6116723787))
- **D167, 2026-10-08, пересказ.** Доступ ограничивает также решения; разрешение D15 видеть всю WK заменено, биография — позже. ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6116723787))
- **D187, 2026-10-12, пересказ.** Издали — пол, силуэт и крупный цвет; лицо, возраст, занятие скрыты, положение — лишь от кода. ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6138438723))
- **D229, 2026-10-20, пересказ.** Жирко имеет личность и тайну о кресале; голода на старте нет, знания — общей проекцией.
- **2026-09-25, [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5838829348), без D.** Имя выбирает код из регионального пула.
- **D1, 2026-09-26, пересказ.** Код сохраняет психологию; LLM пишет манеру и биографию по его фактам ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5839745154)).
- **D260, 2026-10-21, пересказ.** Родной голод включён; еда входит в срез, час сна не гарантирован.
- **D261, 2026-10-21, пересказ.** Второй житель — сторож с ночной сменой.
- **D262, 2026-10-21, пересказ.** Работа зависит от света; N часов не выбрано.
- **D263, 2026-10-21, пересказ.** Постройка — изба с печью, столом, постелью; мастер работает снаружи.
- **D264, 2026-10-21, пересказ.** По поручению владельца распорядитель выбрал 20.08.1230, юлианский календарь, 07:00 местного среднего солнечного времени.
- **D266, 2026-10-21, пересказ.** Жирко: 05–20, изба с 19:00, 42 dry_fish, колодец в шести клетках; Прокша: 20–05 у ворот. Пополнение еды — позже.

## Расхождения и открытые вопросы

- **Нормы и часть 2.** ACTIVE [temporal](../../../data/knowledge-source/corpus/DOCUMENTS/temporal_world_and_interruptible_activities.md) и [NPC](../../../data/knowledge-source/corpus/DOCUMENTS/npc_autonomous_decision_contract.md) используют proposals; [#780](https://github.com/PavelSlaven/Novgorod1230/issues/780) требует native EOC/посты. Перенос — [#822](https://github.com/PavelSlaven/Novgorod1230/issues/822), [PR #829](https://github.com/PavelSlaven/Novgorod1230/pull/829); до P7 действует ACTIVE.
- **Свет и часы.** [D262/D266](../SOURCES.md): восход/закат против окна 05–20 и избы с 19:00; native свет зависит от места и времени ([areas/01-time.md:18–19](../../context/cdda-native-map/areas/01-time.md)). Общее правило или профиль среза? См. [главу 03](03-time-calendar.md).
- **Нужды при посте.** Карта не обещает исход ([areas/02-npc-life.md:12](../../context/cdda-native-map/areas/02-npc-life.md)); [D260](../SOURCES.md) сохраняет голод без точного часа сна.
- **Догон.** Вне пузыря нет полного тика и догона сна ([areas/02-npc-life.md:15,20](../../context/cdda-native-map/areas/02-npc-life.md)). [Часть 2](https://github.com/PavelSlaven/Novgorod1230/issues/780) проверяет двор, 04.05 — двух жителей Вихтуя.
- **Ярусы NPC.** [Профиль:183–231](../../../data/knowledge-source/corpus/DOCUMENTS/npc_generation_profiles.txt) и [D119/D121](../SOURCES.md) требуют смены яруса с памятью; native индивидуальность **частична** ([areas/02-npc-life.md:18](../../context/cdda-native-map/areas/02-npc-life.md)). Перенос — P7.

## Источники

- [PRODUCT_CONSTITUTION.md](../../governance/PRODUCT_CONSTITUTION.md), [scenario-spec.md](../../plans/sled-na-nizhney-dvine-scenario-spec.md) — замысел.
- [npc_autonomous_decision_contract.md](../../../data/knowledge-source/corpus/DOCUMENTS/npc_autonomous_decision_contract.md), [temporal contract](../../../data/knowledge-source/corpus/DOCUMENTS/temporal_world_and_interruptible_activities.md) — active границы.
- [npc_generation_profiles.txt](../../../data/knowledge-source/corpus/DOCUMENTS/npc_generation_profiles.txt) — аудит #243.
- [NPC Daily Life Discussion](../../plans/Novgorod1230_Cataclysm_NPC_Daily_Life_Schedules_and_Behavior_Discussion_2026-10-18.md), [Vertical Slice Plan](../../plans/Novgorod1230_Cataclysm_Vertical_Slice_Implementation_Plan_2026-10-19.md), [areas/02-npc-life.md](../../context/cdda-native-map/areas/02-npc-life.md) — native механизмы и перенос.

## Этап

Часть 2: сутки, 3 сохранения с загрузкой, пожар (04.01–04.04, #834); часть 5 — жители Вихтуя (04.05). Приёмка — [хаб](../GDD.md).
