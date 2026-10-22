> status: REFERENCE / DOMAIN GUIDE. Нативная физическая торговля и свободный торг с самостоятельными людьми. Утверждённый дизайн не означает действующую реализацию; нормы и их статусы определяет CONTRACT_INDEX.

# 20. Торговля

## Для человека

### Какому столпу служит

«Я могу попробовать что угодно» и «Люди живут без меня»: герой свободно предлагает сделку, а другой человек оценивает выгоду и вправе отказать. Товар и деньги реальны. ([VIS-028](../questionnaire.md); [D275/20](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))

### Что чувствует игрок

Он договаривается с человеком, у которого есть имущество, интерес и доверие, а не получает вещи за удачную формулировку. Торговец — обычный житель мира. ([WLD-053](../questionnaire.md); [D275/20](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))

### Правила для игрока

Можно спорить о цене, предложить бартер или обещание; согласие зависит от собственного решения собеседника. Деньги и товар нельзя создать фразой. Передаются только реальные вещи и средства; игрок видит местные деньги, суммы считает игра. ([MEC-025](../questionnaire.md); [D275/20](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))

### Как игрок узнаёт о механике

Через свободные переговоры, предложение или отказ собеседника и фактическое изменение имущества после состоявшейся сделки. Краткая проза описывает произошедшее, а подробные вещи доступны в панели инвентаря. ([D275/20](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275/36](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275 §6.4](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))

### Связи с другими механиками

[Разговор](05-conversation.md) передаёт предложение, [вещи и владение](08-items-property.md) задают доступное имущество, [поручения](18-quests.md) и обещания могут связывать услуги, [сохранение](15-saves.md) возвращает сделку вместе с миром. Расход материалов и конечных запасов остаётся реальным. ([MEC-023](../questionnaire.md); [MEC-025](../questionnaire.md); [D275/20](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275/33](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275 §7.4](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))

### Примеры ситуаций

- Герой предлагает обменять имеющуюся вещь на товар → собеседник оценивает предложение и может отказаться → при согласии передаются настоящие вещи. ([D275/20](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))
- Игрок пишет, что платит деньгами, которых у героя нет → фраза не создаёт монеты и не исполняет физическую сделку. ([MEC-025](../questionnaire.md))
- Герой просит снизить цену или принять обещание → человек решает из своей выгоды и доверия; слова сами по себе не передают товар. ([D275/20](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275 §6.4](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))

## Для разработчика и нейросети

### Замысел

Разделить свободное человеческое согласие и точное исполнение одной сделки. LLM решает предложение или отказ NPC согласно знанию и выгоде, CDDA проверяет доступность и исполняет передачу. Наблюдаемые последствия возникают после кодовой фиксации. ([D275/20](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275 §6.4](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))

### Что может игрок

- **20.01.** Предложить цену или бартер свободной фразой и получить самостоятельное согласие либо отказ человека. Целевое поведение; не начато. ([D275/20](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))
- **20.02.** При согласии обменять реальные вещи и местные деньги с сохранением результата. Целевое поведение; не начато. ([MEC-025](../questionnaire.md); [D275 §6.4](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275 §7.4](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))

### Родное CDDA

Есть ассортимент `shopkeeper_item_group`, правила цен, владение и товар из инвентаря, бартер, `start_trade`, `u_buy_item`, `u_sell_item`, `add_debt`. Проверенные опоры карты: `src/npctrade.cpp:178,236,294,355`, `src/npc.cpp:2165,2193,2296`, `src/npc_class.cpp:198–297`, `src/npctalk_funcs.cpp:225`. Native цены могут зависеть от INT/речи, валютой служат предметы. Полное покрытие карты относится к родной торговле, не доказывает свободный торг через наш ввод. ([карта разговора, торговля](../../context/cdda-native-map/areas/03-conversation.md))

### Наш слой и владелец

Используем native предметы, ассортимент, цены, передачу и учёт имущества; смысловое решение NPC сообщает допустимое согласие, отказ или предложение. Код формирует сумму и исполняет физическую сделку через CDDA; рассказчик не создаёт платёж, деньги или товар. Привязка местной денежной меры и согласованного торга к native исполнению требует отдельной проверки, не второго физического владельца. ([MEC-025](../questionnaire.md); [D275/2](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275/20](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275 §6.4](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))

### Решения владельца

Каталог, цены и передача принадлежат CDDA; спор о цене, доверие, бартер, обещание и согласие — самостоятельному решению NPC. Монеты и слитки являются обычными предметами каталога, внутренняя единица учёта — БУЕ, игрок видит местные деньги. ([MEC-025](../questionnaire.md); [D275/20](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))

### Расхождения и открытые вопросы

Не решено — см. [open-questions.md, WLD-053](../open-questions.md).

### Источники

[Пакет D275](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md), решение 20, §6.4; [анкета](../questionnaire.md), [MEC-025](../questionnaire.md), [WLD-053](../questionnaire.md); [карта native торговли](../../context/cdda-native-map/areas/03-conversation.md); [вещи и собственность](08-items-property.md).

### Этап

Дизайн принят, интеграция свободных переговоров с физической сделкой здесь не объявляется готовой. Полноценный первый регион строится на универсальных действиях; порядок работ — [глава 11 GDD](../GDD.md). ([D275/20](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275/37](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D276/3](../decision-log.md))

### Данные и числа

Внутренняя единица — БУЕ, 1 мг серебра; игроку показываются местные деньги. Баланс цен берётся из CDDA; собственных коэффициентов наценки и успешности торга не утверждено. Сводная таблица — [таблица главы 4 GDD](../GDD.md). ([MEC-025](../questionnaire.md); [D275/2](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275/20](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))

### Состояния и события

Предложение → самостоятельное решение NPC → проверка доступности товара и денег → физическая передача и фиксация → наблюдаемые последствия. Обещание не подменяет передачу; оно связывается с точными условиями, если принято. ([D275/20](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275/33](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275 §6.4](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))

### Что сохраняется

Реальные деньги, товары и владение после сделки; принятые обещания и субъективная память состоявшегося разговора — в том же поколении мира. Загрузка не повторяет списание и передачу. ([D275/26](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275/31](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275 §6.4](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275 §7.4](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))

### Чек-лист

- Сохранение: до и после обмена нет дублей, повторного платежа или расхождения владения. ([D275 §6.4](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275 §7.4](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))
- Перевод: русский интерфейс и литературный разговор. ([EXP-044](../questionnaire.md); [EXP-045](../questionnaire.md))
- Звук: проза называет только слышимое героем; отдельных сигналов опасности нет. ([EXP-017](../questionnaire.md)) Подписи звуков не решены — см. [open-questions.md, EXP-043](../open-questions.md).
- Подсказка и управление: свободный торг, наблюдаемое согласие/отказ, реальные вещи в инвентаре. ([D275/20](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275/36](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))
- Доступность: родные средства CDDA, крупная проза, смысл не только цветом. ([EXP-040](../questionnaire.md))

### Как проверить готовность

По сквозному сценарию T07 (D275 §10) проверить покупку, бартер, отказ NPC и попытку заплатить отсутствующими деньгами. Сопоставить согласованные условия с реальным инвентарём и владением после сделки, затем сохранить и загрузить. Текст не должен сообщать успешный платёж при отсутствии физического результата. ([MEC-025](../questionnaire.md); [D275/20](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275 §6.4](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275 §7.4](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))
