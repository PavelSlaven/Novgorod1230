> status: REFERENCE / DOMAIN GUIDE. Поручения как часть причинного мира. Утверждённый дизайн не означает действующую реализацию; нормы и их статусы определяет CONTRACT_INDEX.

# 18. Поручения

## Для человека

### Какому столпу служит

«Я могу попробовать что угодно», «Люди живут без меня» и «Сделанное остаётся»: поручение возникает из нужды людей, а принятое слово меняет отношения и действия. ([VIS-028](../questionnaire.md); [VIS-051](../questionnaire.md); [D275/33](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))

### Что чувствует игрок

Дела возникают из причинного мира, а герой сам выбирает, во что ввязаться. (MEC-064, WLD-067, VIS-073) Просьба может остаться без ответа, другой человек способен решить дело сам, а сделанное отмечают проза и журнал. ([VIS-049](../questionnaire.md); [VIS-051](../questionnaire.md); [MEC-060](../questionnaire.md); [VIS-086](../questionnaire.md))

### Правила для игрока

Деления на основное и побочное нет; непринятая просьба не становится обязательством. У принятого поручения сохраняются точные условия. Нужный человек и предмет существуют в мире, завершение определяется реальным результатом и договорённостью. Можно опоздать или провалить дело из-за изменившихся обстоятельств; давление создают сроки поручений и голод. (VIS-050) ([VIS-051](../questionnaire.md); [MEC-058](../questionnaire.md); [MEC-060](../questionnaire.md); [MEC-061](../questionnaire.md); [D275/33](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275/34](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))

«След на Нижней Двине» — ситуация в Вихтуе для героя любого происхождения. События идут сами; личная цель возникает, если герой вовлечён. Исход этой истории не завершает игру. ([D276/2](../decision-log.md); [D277/4](../decision-log.md); [VIS-052](../questionnaire.md); [VIS-085](../questionnaire.md))

### Как игрок узнаёт о механике

Из разговора, слуха с источником, улики на месте и субъективного журнала с людьми, местами, обещаниями и событиями. Следы отвечают на конкретный вопрос, например показывают направление; журнал не раскрывает неизвестную дорогу и не управляет миром. Принятое поручение видно строкой в панели обязательств и записью в журнале, без целей и отметок «выполнено» как в списке заданий. (EXP-077) ([MEC-059](../questionnaire.md); [WLD-057](../questionnaire.md); [WLD-056](../questionnaire.md))

### Связи с другими механиками

[Разговор](05-conversation.md) устанавливает согласие; [вещи](08-items-property.md), [путь](11-movement-travel.md) и [время](03-time-calendar.md) определяют возможность исполнения; [самостоятельные люди](04-npc-life.md) действуют без героя, [слухи](19-rumors-remote-world.md) разносят последствия. После отдельной истории игра продолжается. ([MEC-058](../questionnaire.md); [MEC-060](../questionnaire.md); [MEC-061](../questionnaire.md); [D275/33](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275/35](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [VIS-052](../questionnaire.md))

### Примеры ситуаций

- Житель просит принести вещь → герой проходит мимо → обязательство не принято, мир продолжает жить. ([VIS-051](../questionnaire.md); [D275 §4.4](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))
- Герой соглашается помочь → задерживается в дороге → за это время другой человек решает дело, и исход поручения меняется. ([MEC-060](../questionnaire.md); [D275 §4.4](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))
- Герой вмешивается в состоявшееся нападение → у пострадавшего возникает просьба о помощи или возмещении из реального ущерба и его собственного решения. ([D275 §4.4](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))

## Для разработчика и нейросети

### Замысел

Два направления причинности: реальная нужда рождает просьбу с минимальным ядром ситуации; состоявшееся событие порождает новую просьбу, долг или конфликт. Не требуется полная предыстория всех участников до появления потребности. ([D275/33](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275/34](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275 §4.4](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))

### Что может игрок

- **18.01.** Принять или отклонить просьбу, затем исполнить её реальным действием и увидеть последствия. Целевое поведение; не начато. ([D275/33](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275 §4.4](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))
- **18.02.** Узнать, что дело изменилось или решено другим человеком, пока герой отсутствовал. Целевое поведение; не начато. ([MEC-060](../questionnaire.md))

### Родное CDDA

Есть `mission_type`, дедлайн, `goal_condition`, эффекты start/end/fail и `MGOAL_CONDITION`. Native опоры: `MGOAL_CONDITION` — `src/mission.h:76`, `goal_condition` — `src/mission.h:226`; также `src/missiondef.cpp:182–199` и `src/mission.cpp:189,423,467`. По карте покрытие частичное: миссии привязаны к игроку/квестодателю, произвольного графа обещаний нет. ([карта EOC, обязательства](../../context/cdda-native-map/areas/09-eoc-scripting.md); [карта NPC, миссии](../../context/cdda-native-map/areas/02-npc-life.md))

### Наш слой и владелец

Используем native предметы, акторов, действия, условия и эффекты там, где они подходят. Наш смысловой слой связывает реальную нужду, согласие и точные условия; CDDA исполняет физическое действие. Журнал отражает факты и знание, рассказчик не устанавливает успех. Отдельный движок обязательных стадий и глобальные сюжетные флаги для обычных ситуаций не вводятся. Точная интеграция native mission с открытыми обещаниями требует отдельного CR; наличие mission не доказывает её готовность. ([D275/2](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275/33](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275/34](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275 §4.4](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275 §11](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [карта EOC](../../context/cdda-native-map/areas/09-eoc-scripting.md))

### Решения владельца

Поручения действуют в обе стороны между нуждой и событием; достаточно минимального правдоподобного ядра, установленное прошлое не переписывается, значимые и скрытые факты требуют своего права утверждения. Союзник вправе отказаться и исполняет принятую задачу самостоятельно до существенного изменения. «След» доступен любому герою как ситуация мира. ([D275/33](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275/34](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275/35](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D276/2](../decision-log.md); [D277/4](../decision-log.md))

### Расхождения и открытые вопросы

Не решено — см. [open-questions.md, MEC-058, VIS-052, WLD-055, WLD-057, WLD-058](../open-questions.md).

### Источники

[Пакет D275](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md), §4.4, решения 33–35; [журнал D276/2 и D277/4](../decision-log.md); [анкета](../questionnaire.md), [VIS-049](../questionnaire.md), [VIS-051](../questionnaire.md), [MEC-058](../questionnaire.md)–061; [native NPC](../../context/cdda-native-map/areas/02-npc-life.md), [native EOC](../../context/cdda-native-map/areas/09-eoc-scripting.md); [PC §8.1](../../governance/PRODUCT_CONSTITUTION.md).

### Этап

Поручения входят в целевой полноценный первый регион. Текущая страница описывает принятый дизайн, реализацию не утверждает. Нормативный перенос предшествует расширению после среза; общий порядок — [глава 11 GDD](../GDD.md). ([D275/37](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D276/3](../decision-log.md))

### Данные и числа

Своих утверждённых чисел нет; общая сводка — [таблица главы 4 GDD](../GDD.md). Время и физические ограничения — родное CDDA. Экономические параметры и сроки нельзя выводить из примера native миссии. ([D275/2](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275/33](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))

### Состояния и события

Нужда или committed событие → решение человека обратиться → просьба → возможное согласие и точные условия → реальные действия и изменения мира → исполнение, изменение обстоятельств или провал. Это причинный ход, не обязательная лестница сюжетных стадий. Непринятая просьба обязательства не создаёт. ([D275 §4.4](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [VIS-049](../questionnaire.md); [VIS-051](../questionnaire.md); [MEC-060](../questionnaire.md); [MEC-061](../questionnaire.md))

### Что сохраняется

Участники, реальное ядро, точные условия принятого обещания, фактические последствия и субъективное знание входят в целую точку мира. Журнал не создаёт состояние исполнения. ([D275 §4.4](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275 §7.4](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))

### Чек-лист

- Сохранение: обязательства и исполнение совпадают с миром после reload. ([D275 §7.4](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))
- Перевод: русский интерфейс и литературный текст. ([EXP-044](../questionnaire.md); [EXP-045](../questionnaire.md))
- Звук: проза называет только слышимое героем; отдельных сигналов опасности нет. ([EXP-017](../questionnaire.md)) Подписи звуков не решены — см. [open-questions.md, EXP-043](../open-questions.md).
- Подсказка и управление: свободное согласие или отказ, разговор, строка в панели обязательств и запись в журнале без целей и отметок «выполнено». (EXP-077) ([VIS-051](../questionnaire.md); [MEC-059](../questionnaire.md))
- Доступность: родные средства CDDA, крупная проза, смысл не только цветом. ([EXP-040](../questionnaire.md))

### Как проверить готовность

По сквозным сценариям T15, T16 и T20 (D275 §10) проверить рождение просьбы из нужды и из реально произошедшего события; отказ без обязательства; существование требуемой вещи; изменение исхода без героя; завершение реальным действием и продолжение игры. Отдельно сохранить/загрузить согласие и исполнение. Нестандартный порядок действий не должен блокироваться отсутствием сюжетной стадии. ([D275 §4.4](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275 §7.4](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [MEC-058](../questionnaire.md); [MEC-060](../questionnaire.md); [MEC-061](../questionnaire.md))
