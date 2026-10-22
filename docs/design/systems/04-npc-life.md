> status: REFERENCE / DOMAIN GUIDE. Глава описывает замысел личности, распорядка и жизни NPC и связь с CDDA. Норм не создаёт: при конфликте действуют AGENTS.md, CONTRACT_INDEX и профильные контракты. Состояние на 2026-10-21: main 181548e8; работа в неслитых ветках — по доске распорядителя на эту дату.

# 04. Люди: личность, распорядок, жизнь


## Для человека

### Какому столпу служит

«Люди живут без меня»: жители заняты своим трудом, нуждами и обязательствами. Они имеют собственные цели, память и право отказаться; герой не управляет ими как дополнительными персонажами. ([VIS-019](../questionnaire.md); [VIS-027](../questionnaire.md); [VIS-028](../questionnaire.md); [D275/1](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275/35](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))

### Что чувствует игрок

Встреченный человек существует и вне разговора. Он помнит пережитое и может изменить отношение к герою; союзник может испугаться, отказать или уйти. Даже противник связан с людьми и нуждами своего мира. ([WLD-050](../questionnaire.md); [WLD-054](../questionnaire.md); [D275/26](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275/27](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))

### Правила для игрока

Занятия зависят от профессии, обязанностей, нужд, сезона и света. Профиль двора в срезе (первой проверочной части игры) задаёт мастеру окно 05:00–20:00, сторожу — 20:00–05:00; это не одинаковые часы всех людей. Спутник сам принимает поручение и исполняет принятое, пока существенное обстоятельство не потребует нового решения. ([WLD-063](../questionnaire.md); [D275/1](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275/35](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))

Обычный человек может стать важным из-за связи, обязательства или действий героя. При этом сохраняются его личность и история; меньшая подробность дальнейшей жизни не стирает записи разговоров. ([WLD-070](../questionnaire.md); [D277/8](../decision-log.md))

### Как игрок узнаёт о механике

Игрок наблюдает людей в ближайшей сцене, читает их поступки и речь. Собственный журнал хранит знакомых людей и действительно доступные герою события. Чужое решение и тайное намерение не выдаются как известный герою факт. ([WLD-056](../questionnaire.md); [EXP-007](../questionnaire.md); [EXP-028](../questionnaire.md); [D275/5](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))

### Связи с другими механиками

[Время](03-time-calendar.md) меняет занятия; [разговор](05-conversation.md) и значимые события оставляют память; [торговец и наставник](20-trade.md) остаются обычными людьми. Группы возникают из родства, двора и службы без заранее заданного отношения к герою. ([WLD-051](../questionnaire.md); [WLD-053](../questionnaire.md); [WLD-063](../questionnaire.md); [D275/26](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275/27](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))

### Примеры ситуаций

- Герой возвращается во двор ночью → вместо дневного труда видит ночную смену сторожа; сон мастера подчинён его реальным нуждам. ([WLD-063](../questionnaire.md); [D275/1](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))
- Герой предлагает знакомому пойти с ним → тот принимает или отвергает просьбу по своим причинам; принятое поручение становится его делом. ([VIS-019](../questionnaire.md); [WLD-053](../questionnaire.md); [D275/35](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))
- Герой помогает жителю в значимом событии и встречает его позже → пережитое оставляет у этого человека память и может повлиять на последующую реакцию. ([WLD-054](../questionnaire.md); [D275/27](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))

## Для разработчика и нейросети

### Замысел

Житель — конкретный человек с характером, потребностями, знанием и собственной жизнью ([PRODUCT_CONSTITUTION.md, §8–9](../../governance/PRODUCT_CONSTITUTION.md)). Владелец требует работы, памяти и собственных целей NPC ([scenario-spec.md:31](../../plans/sled-na-nizhney-dvine-scenario-spec.md)).

1. Герой ждёт сутки → наблюдает работу, еду, сон и новую смену → родные потребности, смены и исторический распорядок покрыты **частично** ([areas/02-npc-life.md:11–12,16](../../context/cdda-native-map/areas/02-npc-life.md)) → мод задаёт часы и посты.
2. Герой подходит к мастеру → говорит → видит его реакцию → native граница решений и индивидуальность покрыты **частично** ([areas/02-npc-life.md:17–18](../../context/cdda-native-map/areas/02-npc-life.md)) → модель получает личный контекст (глава 05).

### Что может игрок

- **04.01.** Наблюдать за мастером в течение полных суток: работу, еду, возвращение в избу, сон и новую работу утром, пока сторож держит двор ночью.
- **04.02.** Видеть переходы мастера между местом работы и избой.
- **04.03.** Сохранить игру в трёх разных точках дня и после каждого перезапуска увидеть продолжение распорядка с того же места.
- **04.04.** Увидеть, как мастер убегает от огня и после опасности возвращается к своему распорядку.
- **04.05.** Увидеть распорядок двух жителей Вихтуя в том месте, где началась новая игра.

### Родное CDDA

| Механизм | Покрытие и предел |
|---|---|
| Смены; работа и recurring EOC | **Частичное**: исторический распорядок собирается из постов, часов и данных ([areas/02-npc-life.md:11,14,16](../../context/cdda-native-map/areas/02-npc-life.md)). |
| Потребности и приоритеты | **Полное** native покрытие нужд и долга; исторический распорядок не входит ([areas/02-npc-life.md:12–13](../../context/cdda-native-map/areas/02-npc-life.md)). |
| Решения и личность | Граница решений — **полная**; личность — **частичная** ([areas/02-npc-life.md:17–18](../../context/cdda-native-map/areas/02-npc-life.md)). |

### Наш слой и владелец

**Используем** native тело, движение и нужды; решения исполняет `npc::move` ([areas/02-npc-life.md:12–13,17](../../context/cdda-native-map/areas/02-npc-life.md)). Распорядок **расширяем** через `work_hours`, `guard_pos` и recurring EOC: готовой последовательности мест нет ([areas/02-npc-life.md:11,16](../../context/cdda-native-map/areas/02-npc-life.md)); путь — [#834](https://github.com/PavelSlaven/Novgorod1230/issues/834).

До P7 proposals старого runtime принадлежат [npc-runtime/MODULE.md:5–25](../../../packages/npc-runtime/MODULE.md); физическим движением владеет CDDA. Knowledge owner ограничивает знание NPC.

### Решения владельца

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
- **D69, 2026-10-01, пересказ.** Знание и память NPC — до животных, навыки и обучение — после боя; яркое событие помнится дольше. Недельное окно и разная длительность памяти заменены: после разговора остаётся краткая запись, сложного забывания нет ([D276/1](../decision-log.md); [D275/26](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md)).
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

### Расхождения и открытые вопросы

Уточнение 22.10.2026: смена яруса сохраняет существующую личность; [D277/8](../decision-log.md) заменяет сжатие истории и узкое правило повышения D119. Темперамент и ценности сохраняются по [D277/7](../decision-log.md), а память описывается [D275/26](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md)–27. Старые формулировки выше, в разделе «Решения владельца», оставлены для прослеживаемости. Недельное окно и разная длительность памяти из D69 заменены ([D276/1](../decision-log.md); [D275/26](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md)). ([D277/7](../decision-log.md); [D277/8](../decision-log.md); [WLD-069](../questionnaire.md); [WLD-070](../questionnaire.md))

- **Нормы и часть 2.** ACTIVE [temporal](../../../data/knowledge-source/corpus/DOCUMENTS/temporal_world_and_interruptible_activities.md) и [NPC](../../../data/knowledge-source/corpus/DOCUMENTS/npc_autonomous_decision_contract.md) используют proposals; [#780](https://github.com/PavelSlaven/Novgorod1230/issues/780) требует native EOC/посты. Перенос — [#822](https://github.com/PavelSlaven/Novgorod1230/issues/822), [PR #829](https://github.com/PavelSlaven/Novgorod1230/pull/829); до P7 действует ACTIVE. Нерешённая реализация — см. [открытые вопросы](../open-questions.md), SYS-04-01.
- **Свет и часы.** [D262/D266](../SOURCES.md): восход/закат против окна 05–20 и избы с 19:00; native свет зависит от места и времени ([areas/01-time.md:18–19](../../context/cdda-native-map/areas/01-time.md)). Для мастера и сторожа среза часы утверждены; не заданы распорядки остальных жителей и других сезонов — см. [открытые вопросы](../open-questions.md), WLD-063, и [главу 03](03-time-calendar.md).
- **Нужды при посте.** Карта не обещает исход ([areas/02-npc-life.md:12](../../context/cdda-native-map/areas/02-npc-life.md)); [D260](../SOURCES.md) сохраняет голод без точного часа сна. Нерешённая реализация — см. [открытые вопросы](../open-questions.md), SYS-04-03.
- **Догон.** Вне пузыря нет полного тика и догона сна ([areas/02-npc-life.md:15,20](../../context/cdda-native-map/areas/02-npc-life.md)). [Часть 2](https://github.com/PavelSlaven/Novgorod1230/issues/780) проверяет двор, 04.05 — двух жителей Вихтуя. Нерешённая реализация — см. [открытые вопросы](../open-questions.md), SYS-04-04.
- **Ярусы NPC.** [Профиль:183–231](../../../data/knowledge-source/corpus/DOCUMENTS/npc_generation_profiles.txt) и [D119/D121](../SOURCES.md) требуют смены яруса с памятью; native индивидуальность **частична** ([areas/02-npc-life.md:18](../../context/cdda-native-map/areas/02-npc-life.md)). Перенос — P7. Нерешённая реализация — см. [открытые вопросы](../open-questions.md), SYS-04-05.

### Источники

- [Анкета](../questionnaire.md), [журнал решений](../decision-log.md) и [видение](../vision.md) — решённые ответы и утверждённые ориентиры.
- [Пакет D275](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md) — целевой дизайн от 22.10.2026, справочный до отдельной нормативной приёмки.

- [PRODUCT_CONSTITUTION.md](../../governance/PRODUCT_CONSTITUTION.md), [scenario-spec.md](../../plans/sled-na-nizhney-dvine-scenario-spec.md) — замысел.
- [npc_autonomous_decision_contract.md](../../../data/knowledge-source/corpus/DOCUMENTS/npc_autonomous_decision_contract.md), [temporal contract](../../../data/knowledge-source/corpus/DOCUMENTS/temporal_world_and_interruptible_activities.md) — active границы.
- [npc_generation_profiles.txt](../../../data/knowledge-source/corpus/DOCUMENTS/npc_generation_profiles.txt) — аудит #243.
- [NPC Daily Life Discussion](../../plans/Novgorod1230_Cataclysm_NPC_Daily_Life_Schedules_and_Behavior_Discussion_2026-10-18.md), [Vertical Slice Plan](../../plans/Novgorod1230_Cataclysm_Vertical_Slice_Implementation_Plan_2026-10-19.md), [areas/02-npc-life.md](../../context/cdda-native-map/areas/02-npc-life.md) — native механизмы и перенос.

### Этап

Часть 2: сутки, 3 сохранения с загрузкой, пожар (04.01–04.04, #834); часть 5 — жители Вихтуя (04.05). Приёмка — [глава 11 GDD](../GDD.md).

### Данные и числа

Нет своих чисел тела и физического хода NPC: родное CDDA. Окна профиля среза: мастер — 05:00–20:00, сторож — 20:00–05:00. Они входят в таблицу [главы 4 GDD](../GDD.md). Распорядки остальных жителей не решены — см. [открытые вопросы](../open-questions.md), WLD-063. Темперамент и ценности остаются по [D277/7](../decision-log.md); конкретные шкалы жителей не утверждены. См. [главу 4 GDD](../GDD.md). ([MEC-016](../questionnaire.md); [WLD-063](../questionnaire.md); [WLD-069](../questionnaire.md); [D277/7](../decision-log.md))

### Состояния и события

Повседневность исполняется кодом; LLM нужна на значимой границе решения. Принятое поручение, новое существенное обстоятельство, завершённый разговор и пережитое значимое событие могут изменить намерение или память. Повышается существующий человек; понижение уменьшает подробность симуляции. ([D275/1](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275/26](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275/27](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275/35](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [WLD-070](../questionnaire.md))

### Что сохраняется

Личность, отношения, профессия, принятое намерение и субъективная память продолжающего существовать человека сохраняются. Записи разговоров не сжимаются; физическое тело остаётся у CDDA. Смена подробности не создаёт копию NPC. ([WLD-050](../questionnaire.md); [WLD-070](../questionnaire.md); [D275 §2.1](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D277/8](../decision-log.md))

### Чек-лист

- Проверить смену мастера и сторожа в утверждённых окнах двора; разговор и смена подробности NPC не стирают личность и память. (WLD-063, WLD-070; D277/8)

- Сохранение: восстановить ту же точку физического мира вместе с относящейся к ней памятью и последствиями. ([D275/31](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))
- Перевод: проверить русские тексты и официальный русский интерфейс CDDA; литературная проза пишется сразу по-русски. ([EXP-044](../questionnaire.md); [EXP-045](../questionnaire.md))
- Звук: проверять лишь слышимое герою, смысл звука должен быть назван прозой; отдельного сигнала опасности нет. ([EXP-017](../questionnaire.md))
- Подсказка: доступна по запросу и опирается только на знания героя, примеры не закрывают свободу. ([EXP-035](../questionnaire.md); [EXP-037](../questionnaire.md))
- Управление: свободная фраза — основной ввод, клавиатура и мышь; переназначение — родное CDDA, удержание не требуется. ([EXP-042](../questionnaire.md); [EXP-048](../questionnaire.md); [EXP-049](../questionnaire.md))
- Доступность: крупная проза и смысл, выраженный словами, а не одним цветом; начать с родных возможностей CDDA. ([EXP-040](../questionnaire.md))

### Как проверить готовность

Наблюдать полный день двора, проверить продолжение после сохранений и реальную реакцию на опасность. В дальнейшей приёмке NPC должен принимать или отвергать просьбу по своим причинам, помнить участие и сохранять личность при смене значимости. Это критерии, не отчёт о выполненном прогоне. ([VIS-003](../questionnaire.md); [WLD-054](../questionnaire.md); [WLD-070](../questionnaire.md); [D275/35](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275 §10](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))
