# Ситуационные требования к художественной прозе Novgorod1230

**Статус:** ACTIVE SPECIALIZATION — продуктовая норма художественной подачи и приёмки.  
**Владелец:** `@rus/narration`; данные сцены, механика и commit остаются у профильных владельцев.  
**Область:** authored opening и новые игровые narration outputs. Сохранённый replay не переписывается ради новой стилистики.

Документ задаёт требуемое качество, а не отчёт о реализованных возможностях или пройденной матрице. Применимость источников, gameplay authority и versioned execution contracts сохраняются; отдельная активация механики из этих литературных требований не следует.

## 1. Требуемый результат

Проза должна ощущаться как сцены хорошего исторического романа: конкретные, причинно связанные, читаемые из положения героя и достаточно полные, чтобы игрок понимал, кто он, где находится, что произошло, что вокруг существенно и почему следующий выбор имеет смысл.

Полноценная сцена не означает постоянный большой объём. Один короткий жест может требовать одного плотного абзаца; открытие игры, прибытие, бой или развязка — нескольких. Длина следует смысловой нагрузке. Запрещены две крайности: сухой state-report и текстовая вода, скрывающая бедную проекцию.

Все требования применяются к открытым классам ситуаций. Перечисленные ниже классы — проверки разных композиционных задач, а не `enum`, роутер, whitelist prompt-ов или каталог фраз. Один существующий writer определяет нужный акцент по переданным player-safe фактам.

## 2. Неподвижная граница authority

Narrator преобразует только переданный authoritative/code-confirmed player-safe контекст в прозу. Для обычного хода это persisted visible package после factual commit; для opening — утверждённый Stage 21 visible context, прошедший writer Stage 22 и audit Stage 23 до общего Stage 25 commit. Норма не требует новой отдельной DB-записи до opening writer. Narrator не:

- создаёт NPC, предмет, маршрут, звук, погоду, телесное ощущение, действие или исход;
- выводит hidden motive, объективную истинность реплики, происхождение улики или будущее;
- восполняет отсутствующие nearby/far landmarks, exits, barriers, activities либо историю правдоподобной выдумкой;
- превращает intent в выполненное действие;
- превращает отсутствие поля или пустой массив в доказательство пустоты, тишины, неизменности либо отсутствия;
- назначает точные механику, числа, диагноз, тяжесть, длительность или причинную связь;
- переписывает committed речь, порядок событий или committed world при reload/retry.

Если нужного для хорошей сцены факта нет во входе, дефект принадлежит materialization, domain owner, perception/knowledge или player-safe projection. Writer обязан сохранить границу, а acceptance обязан зафиксировать upstream gap. Более длинная фраза не считается исправлением.

## 3. Достаточный вход сцены

Player-safe projector передаёт только применимые к текущей сцене сведения. Полный потенциальный набор:

- герой: имя/роль, relevant biography, цели, известная предыстория и память;
- положение: current place/anchor, ближний план, дальние ориентиры, видимые проходы, направления, barriers и affordances;
- среда: время, реальный свет, погода, видимость, слышимые процессы и их направление, если оно установлено;
- тело: текущее воспринимаемое состояние и подтверждённые изменения без raw stats;
- действие: выполненная попытка, существенные воспринимаемые confirmed results, расход/следствие и player-safe смысл неисполненного остатка;
- предметы: player-safe identity, положение, внешний вид, состояние, материальные изменения, source/result/waste;
- NPC: stable identity/recognition, observable cues, current committed actions, exact perceived speech, отношения и память только в доступной герою форме;
- живой мир: продолжающиеся и завершившиеся процессы, самостоятельные действия NPC, interruptions и последствия, воспринятые героем;
- знание: known facts, attributed testimony, hypothesis и uncertainty с исходной степенью уверенности;
- причинное сравнение: before/after либо remembered/current только там, где обе стороны разрешены проекцией.

Не каждый ход требует каждого пункта. Projector выбирает полный фактический материал; narrator выбирает литературно уместные детали. Нельзя превращать этот раздел в sensory checklist, где каждый ответ обязан упомянуть зрение, слух, запах, погоду и тело.

Точная длительность хода остаётся у temporal owner и не входит в обязательные
источники прозы. Server проецирует из committed `last_turn.time_update.exact_elapsed`
отдельную UI-подпись длительности рядом с итоговыми календарными часами. Narrator
не повторяет эту служебную величину и не обязан упоминать время в каждом ответе.

## 4. Общая композиционная норма

### 4.1. Центр сцены

Каждый ответ имеет один композиционный фокус: новое положение, результат попытки, реплика, внешнее событие, телесная перемена либо развязка. Это не лимит числа событий: одна сцена может содержать несколько существенных действий, ответов и перемен, если factual flow довёл их до общей player-response boundary. Первый абзац быстро вводит читателя в фокус через личность/историю, подтверждённое восприятие, действие или материальное изменение — по задаче текущей сцены. Остальные сведения выстраиваются вокруг него: дают ориентацию, показывают причинный порядок, реакцию мира и границу следующего решения.

### 4.2. Причинный порядок

Проза сохраняет factual order. Причина предшествует видимому следствию; следующий NPC видит только уже произошедшее; состояние тела, предметов и места соответствует итоговому committed state. Литературная связь допустима пространственная, временная или наблюдательная. Причинную связь можно утверждать только когда она передана.

### 4.3. Конкретность без инвентаризации

Предпочтительны точные существительные и наблюдаемые глаголы. Поля safe-проекции объединяются в предметные образы и действия. Нельзя последовательно переписать каждую строку входа отдельным предложением, назвать поля/ID/raw stats или завершить текст диагностическим выводом об evidence. Grounded количество, длительность, время, расстояние и иные числа допустимы, когда они естественно нужны сцене.

### 4.4. Фокус и повтор

Каждое существенное воспринимаемое confirmed change обязательно по смыслу и появляется один раз. Служебные, дублирующие и не воспринимаемые переходы не превращаются в отдельные литературные пункты. Совпадающие outcome и uncertainty объединяются в одно естественное высказывание. Статический контекст повторяется лишь когда нужен для ориентации, контраста или последствия. Описание берега, одежды, раны или NPC не перезапускается с нуля каждый ход.

### 4.5. Голос

Авторский голос использует русский литературный текст, второе лицо `вы`, устойчивую временную рамку сцены. Воспоминания и причинная предыстория естественно допускают прошедшее время внутри текущего повествования; дефектом является случайное, мешающее чтению переключение времени. Авторский голос избегает современного сленга, псевдоархаики, канцелярита, энциклопедической вставки и театрального нагнетания. Историчность проявляется в материальных обстоятельствах, уже разрешённых контекстом, а не в декоративных «давеча» и «воистину». Exact committed speech воспроизводится дословно даже при иной стилистике, анахронизме или неудобном времени глагола: narrator не редактирует голос персонажа.

### 4.6. Абзацы

Абзац соответствует изменению beat: ориентация, действие/ответ, последствие/граница выбора. Несколько абзацев допустимы и нужны для крупных сцен. UI обязан сохранить их видимое разбиение; текущий `white-space: pre-wrap` внутри одного безопасно escaped `<p>` это уже делает. Запрет на source ledger не означает запрет на полноценную многоабзацную сцену или требование отдельной HTML-ноды на каждый абзац.

## 5. Opening: первое появление героя и мира

**Необходимый контекст.** Кто герой, откуда и зачем оказался здесь; relevant authored memories/relationships; current place; near/far orientation; видимые exits/barriers; время, свет, погода, звуки; тело; присутствующие NPC/предметы; immediate pressure и uncertainty.

**Обязательный смысл.** Игрок после одного чтения понимает личность героя, исходную историю, настоящее физическое положение, важнейшие окружающие признаки и ближайшую ставку. Предыстория связывается с настоящим через память, цель, утрату, поручение или отношение, реально переданные входом.

**Литературная подача.** Возможны, например, биографический зачин или вход через текущее восприятие; это не исчерпывающий перечень. Выбор зависит от того, что лучше вводит именно эту историю. Используются только фрагменты прошлого, объясняющие положение и цель; opening завершается открытым настоящим, где видна возможность действовать. Обычно уместны 2–4 абзаца, но это не обязательный word count.

**Избыточно/запрещено.** Dossier dump; перечисление всех параметров; историческая лекция; generic «вы приходите в себя» без factual basis; полное описание каждого предмета; invented destination/cause; повтор названия места вместо сцены.

**Good / bad.** Good даёт герою биографическую непрерывность и сценическую ориентацию. Bad можно без потери смысла перенести любому безымянному герою в любое место либо он сообщает только «вы на берегу, вам холодно».

Stage 23 проверяет это через обязательный `literary_composition_check` существующего semantic auditor. Factual-only approval недостаточен: dossier/report/padding дают `NARRATOR_PROSE_WEAK_LITERARY_COMPOSITION` и semantic prose repair; adapter только передаёт approved prose. Отсутствующие во входе биография и ставка не изобретаются ради check.

**Unseen validation.** Другая стартовая ситуация: не кораблекрушение, а ночной постой после торговой дороги. Тот же writer должен связать другого героя, другую память, закрытый выход, дальний звук и телесное состояние без нового шаблона или branch.

## 6. Новое место

**Необходимый контекст.** Confirmed movement/arrival; current position; ближайшая геометрия; дальние landmarks; видимые exits с направлением; barriers/access; environment; people/objects/processes; body after travel.

**Обязательный смысл.** Ясно, что перемещение состоялось, где оказался герой, чем новое место отличается и как оно устроено для следующего решения. При неизвестном destination название не выдумывается.

**Литературная подача.** Вход в место задаёт новую композицию: граница перехода, первый salient foreground, затем middle/far plane и действующая жизнь. Exits и barriers вплетаются как физические продолжения пространства, не как меню маршрутов.

**Избыточно/запрещено.** Повтор всей биографии; tour-guide catalogue; неразрешённые направления; «локация сменилась»; скрытые помещения; invented shelter или поселение по одному следу.

**Good / bad.** Good позволяет мысленно нарисовать место и выбрать осмысленный следующий шаг. Bad меняет только заголовок или сообщает одну атмосферную деталь без географии.

**Unseen validation.** Прибытие с реки в тесный двор с закрытыми воротами, видимым проходом в сени и голосами за стеной. Проверить ориентацию без invented людей за преградой и без списка affordances.

## 7. Exploration, search и inspection

**Необходимый контекст.** Точная цель наблюдения; подтверждение выполненной попытки; затраченное время/effort; доступный scope; известные до попытки признаки; новые наблюдения; negative resolution или uncertainty; body/environment effects.

**Обязательный смысл.** Отделить сам процесс от результата. Показать каждую найденную/подтверждённую деталь, цену поиска и границу неизвестного. `No confirmed find in this attempt` не превращается в `ничего нет в мире`.

**Литературная подача.** Для inspection центр — предмет и его наблюдаемая структура; для search — продвижение внимания по физическому пространству и итог. Не повторять формулировку intent. Сведения складываются в зримо расположенную сцену, а не список «обнаружено».

**Избыточно/запрещено.** Invented hand contact, запах, температура, звук или действие; эпистемическая фраза «наблюдение не доказывает»; carrierless clue; объявление ownership/history/authenticity без переданного basis; отрицание вне exact search scope. Уже подтверждённые player-safe ownership, history или authenticity допустимы и не должны теряться.

**Good / bad.** Good отвечает, что герой действительно сделал, что теперь видит/знает и чего всё ещё не знает. Bad заменяет результат атмосферой, объявляет поиск успешным из intent или выдаёт technical uncertainty после перечня фактов.

**Unseen validation.** Осмотр уже известной пряжки, поиск сухой травы под навесом и попытка услышать движение за дверью. Все три должны пройти общий механизм с разными perceptual channels, без отдельных handlers и без обязательного «ничего не найдено».

## 8. Свободное действие, craft и смешанный незавершённый intent

**Необходимый контекст.** Grounded attempt; используемые source/tool refs; фактический порядок подшагов; checks; elapsed; source transitions; outputs/waste/nonworking result; item/body/place changes; player-safe semantic remaining intent и player-response boundary.

**Обязательный смысл.** Показать ближайшую реальную попытку и фактический результат. Для craft ясны преобразованный материал, самостоятельный результат, остаток/отход и практическое состояние. Для mixed intent проза естественно различает реально завершённое и то, до чего действие ещё не дошло; неисполненный остаток остаётся открытым и не маскируется общим успехом либо ложным провалом. Точный persisted remaining intent служит semantic evidence, но не требует буквального воспроизведения или технического списка.

**Литературная подача.** Физическая последовательность строится вокруг сопротивления материала, доступных инструментов и видимого результата, если эти признаки подтверждены. Partial/nonworking/waste — полноценные причинные исходы, а не системная ошибка. На boundary текст естественно возвращает управление игроку.

**Избыточно/запрещено.** Recipe report; invented manipulation; создание материала из воздуха; mechanics/damage из prose descriptor; автоматическое завершение продолжения; `не удалось` для ещё не исполненного остатка; новая identity там, где физически продолжается тот же объект.

**Good / bad.** Good различает attempt, outcome и remaining intent и сохраняет физическую непрерывность объектов. Bad пишет «вы сделали X» по одной заявке, хотя код подтвердил лишь подготовку или первый подшаг.

**Unseen validation.** Игрок пытается из обломка доски сделать клин, вставить его в дверь и позвать спутника. После изготовления клина возникает новая граница состояния: проза подтверждает клин и расход материала, а дверь и зов оставляет pending без специального branch по слову «клин».

## 9. Диалог, exact speech и несколько NPC

**Необходимый контекст.** Exact perceived utterance; speaker ref/recognition; intended и actual perceived audience; order; delivery/gesture cues; current observable state каждого NPC; knowledge updates; uncertainty; player-response boundary.

**Обязательный смысл.** Кто сказал точные слова, кому речь была адресована, кто её фактически воспринял в доступной герою мере, что видимо произошло после неё и где разговор ждёт игрока. Содержание claims остаётся речью/мнением, пока другой owner не дал knowledge.

**Литературная подача.** Exact utterance воспроизводится дословно, с ясной атрибуцией. Внешнее описание окружает реплику, не пересказывает её. Голоса различаются содержанием и уже разрешёнными social/biographical cues, а не карикатурным диалектом. В multi-NPC сцене ответы идут в committed causal order; действие или реплика следующего NPC учитывает воспринятое предыдущее.

**Избыточно/запрещено.** Перефразирование exact speech; добавление признания, обещания или смягчение угрозы; перенос реплики/жеста другому NPC; hidden motive и speaker posture; «все услышали» без perception results; единая модель, разыгрывающая нескольких NPC из общего hidden context; атрибуция молчания по отсутствию ответа.

**Good / bad.** Good позволяет без UI metadata понять говорящего, последовательность и открытый вопрос. Bad выдаёт стенограмму без сцены, смешивает говорящих или авторским голосом подтверждает ложную реплику.

**Unseen validation.** Один NPC задаёт вопрос игроку, второй слышит лишь часть и вмешивается жестом, третий присутствует, но не получил response boundary. Проза сохраняет exact text, разные perception states и не заставляет третьего реагировать.

## 10. Ожидание, процессы и живой мир

**Необходимый контекст.** Continuing/completed/interrupted activities; process transitions; autonomous NPC actions; environment/light/weather changes; body thresholds; perception results; unchanged facts только если они явно спроецированы. Exact elapsed остаётся в code-owned UI projection.

**Обязательный смысл.** Текст показывает фактически воспринятые изменения, завершение или продолжение причинных процессов и цену для тела. Точная длительность видна в панели статуса и не повторяется в прозе. Если единственное изменение — ход часов, достаточно grounded сцены без invented waiting action, изменения позиции или утверждения неизменности.

**Литературная подача.** Сжатие времени через один-два подтверждённых изменяющихся признака. Parallel changes объединяются в последовательность по exact order. Background остаётся фоном; interruption становится новым центром сцены и объясняет остановку только supplied reason.

**Избыточно/запрещено.** Служебная строка длительности и mechanically forced присоединение времени к случайной детали; invented bustle; NPC frozen до следующего player input; утверждение, что предметы «всё ещё» на месте без basis; minute-by-minute montage; повтор всех processes. Оценивается литературный переход целиком, не наличие конкретной фразы или отдельного предложения.

**Good / bad.** Good создаёт ощущение независимого мира и показывает новый decision boundary. Bad повторяет UI-время в прозе либо декоративно оживляет мир событиями, которых нет в committed package.

**Unseen validation.** Пока герой чинит ремень, огонь догорает, знакомый NPC завершает работу и уходит, а дождь начинается после окончания ремонта. Проверить factual order, perceptual scope и отсутствие invented реакции героя.

## 11. Travel, arrival и return

**Необходимый контекст.** Confirmed traversal outcome; route observations; промежуточные events/interruptions; environment; body/load; destination/anchor; arrival exits/barriers; remembered prior state и current delta для return. Elapsed остаётся в панели статуса.

**Обязательный смысл.** Для travel — продвижение, цена и существенные изменения пути; для arrival — completed movement и новая ориентация; для return — узнавание и только подтверждённые отличия от памяти. `paused`, `blocked`, `stranded` и `interrupted` различаются.

**Литературная подача.** Не пересказывать карту. Выбрать route beats, меняющие положение, условия или решение. Arrival получает собственный final beat. Return может вызвать память, но она остаётся памятью персонажа; настоящее описывается отдельно.

**Избыточно/запрещено.** Teleport prose; invented scenery между endpoints; destination при неизвестном route; «всё осталось как прежде» без current comparison; скрытые события в отсутствие героя; raw distance/speed factors.

**Good / bad.** Good позволяет понять, дошёл ли герой, как изменились время/тело и что перед ним теперь. Bad пишет «вы отправились и прибыли» без причинного пути либо объявляет знакомое место неизменным по одной памяти.

**Unseen validation.** Возврат к переправе после ночного обхода: знакомый ориентир сохранился, проход закрыт, другой звук идёт с реки, герой устал. Все различия берутся из current/remembered projections, без нового return template.

## 12. Combat, injury, failure и death

**Необходимый контекст.** Ordered combat events; actors/targets; distance/position; exact perceived statements; check result band и margin без raw roll/DC/audit; harm/body/item/movement consequences; current threats; combat status; elapsed; death cause/timer/terminal result. Для generic player check narrator получает тот же safe band/margin и action binding, чтобы не превращать частичный успех в полный либо неудачу в успех; числовую арифметику показывает отдельная UI-card, не проза.

**Обязательный смысл.** Кто сделал что, кому и с каким воспринимаемым результатом; как изменились положение, способность действовать, предметы и угроза; закончился ли бой или управление вернулось игроку. Injury описывается только supplied symptoms/location/severity. Failure сохраняет попытку и её конкретное последствие. Death называется только после code-owned terminal outcome.

**Литературная подача.** Короткие ясные causal beats, пространственная разборчивость, глагольная энергия. Большой exchange допускает несколько абзацев. Речь в бою exact. После удара текст задерживается на реально значимом body/world consequence, а не на броске.

**Избыточно/запрещено.** Raw HP/DC/roll; invented gore, pain, diagnosis или weapon effect; объявление смерти по низкому health; vague «завязывается бой» вместо произошедшего; heroic embellishment; завершение боя narrator-ом; автоматический следующий удар игрока.

**Good / bad.** Good даёт восстановимую последовательность и понятную новую тактическую ситуацию. Bad красив, но нельзя определить, кто ранен, где находится оружие и ждёт ли мир решения игрока.

**Unseen validation.** Борьба в тесном проходе: попытка захвата не достигла цели, щит выпал, другой NPC крикнул exact warning, раненый ещё способен действовать. Проверить failure, item position, speech attribution и отсутствие premature death.

## 13. Recovery и reload/replay

**Необходимый контекст.** Для in-world recovery: elapsed, treatment/rest activity, before/after body conditions, interruptions, resources и current scene. Для reload/retry: persisted screen/narration identity и exact committed current state.

**Обязательный смысл.** Recovery показывает постепенное фактическое изменение и оставшиеся ограничения. Reload/replay не является событием мира: он возвращает тот же committed текст и состояние без нового пробуждения, повторного действия, reroll или переоценки NPC.

**Литературная подача.** После длительного перерыва допустима краткая reorientation из текущей safe-проекции, если создаётся новая factual scene; она не переписывает прежний outcome. Treatment связывается с телесным изменением и временем, но не обещает полного исцеления.

**Избыточно/запрещено.** «Вы снова открываете глаза» при browser reload; повтор opening; мгновенное исчезновение тяжёлой раны; invented memory lapse; новая вариация persisted speech/prose на transport retry.

**Good / bad.** Good сохраняет непрерывность партии и отличает восстановление тела от восстановления UI. Bad использует reload как сюжетный переход или меняет детали мира после повторной доставки.

**Unseen validation.** Reload во время paused treatment и отдельный новый ход после завершившегося сна. Первый должен быть byte/meaning-equivalent replay; второй — новая сцена с подтверждёнными body/time/environment changes.

## 14. Clue, testimony и uncertainty

**Необходимый контекст.** Physical carrier/location; exact observable qualities; acquisition/placement; attributed speaker/source; knowledge status; hypothesis/uncertainty; confirmed links и запрещённые conclusions.

**Обязательный смысл.** Игрок различает: что физически увидено, что сказал конкретный человек, что герой помнит/предполагает и что действительно известно. Улика существует как предмет/след, а не как авторский вывод.

**Литературная подача.** Сначала предметная конкретика в пространстве; затем, если supplied, естественная мысль или вопрос героя с сохранением степени уверенности. Testimony остаётся атрибутированным. Несколько признаков можно связать наблюдением, но не скрытой причинностью.

**Избыточно/запрещено.** «Это доказывает» без authority; виновник/мотив/направление по правдоподобию; authenticity; carrierless «разрезанная застёжка»; диагностический финал «наблюдения сами по себе не устанавливают»; repeated clue catalogue каждый ход.

**Good / bad.** Good создаёт интригу конкретной вещью и честной неопределённостью. Bad либо раскрывает ответ, либо боится любого вывода настолько, что превращает сцену в юридическую оговорку.

**Unseen validation.** Обугленный обрывок письма с читаемой строкой, услышанный слух и старый след колеса. Проверить три разных epistemic статуса без special case по письму, слуху или следу.

## 15. Final scene и epilogue

**Необходимый контекст.** Explicit terminal state; resolved/unresolved goals; surviving actors; body/place/time; known consequences; commitments; player-safe later outcomes, если отдельный owner действительно materialized их; причина смерти, если применимо.

**Обязательный смысл.** Final scene завершает текущую causal arc и честно оставляет нерешённое нерешённым. Epilogue сообщает только разрешённые later outcomes. Если будущие последствия не materialized, закрытие остаётся в непосредственном committed настоящем.

**Литературная подача.** Возврат к одному-двум ранее установленным образам допустим, если current projection подтверждает их и они изменились или получили новый смысл. Последний абзац объединяет состояние героя, мира и главной ставки, не подменяя ответ абстрактной моралью.

**Избыточно/запрещено.** Invented future; судьбы удалённых NPC; авторский исторический итог; канонизация слуха; «и жили они...» без facts; ложное закрытие pending goals; omniscient post-death camera без approved epilogue projection.

**Good / bad.** Good ощущается завершением именно сыгранной причинной истории. Bad — универсальная торжественная концовка, которую можно приложить к любой партии.

**Unseen validation.** Тихое завершение без победы: герой передал известие, но не выяснил судьбу спутника; наступило утро, рана стабилизирована, лодка ушла. Текст закрывает выполненное и сохраняет неизвестную судьбу без invented sequel.

## 16. Acceptance: смысловые проверки вместо phrase whitelist

Каждый model-backed acceptance case оценивается по шести независимым осям:

1. **Grounding:** каждое утверждение имеет точный player-safe source; intent и правдоподобие не служат evidence.
2. **Coverage:** все существенные воспринимаемые confirmed changes, exact speech, material uncertainty и смысл незавершённого остатка переданы по смыслу один раз; технический перечень не требуется.
3. **Causality:** порядок, actor/object identity, before/after и boundary сохранены.
4. **Orientation:** когда ситуация требует, читатель понимает near/far, exits/barriers, действующих NPC и следующее пространство выбора.
5. **Literary scene:** текст имеет центр, связные beats, конкретные образы и уместный объём; не является ledger, справкой или водой.
6. **Continuity:** не повторяет статический контекст без функции и не переписывает committed историю при return/reload.

`PASS` требует все применимые оси. Хорошее литературное качество не оправдывает unsupported fact; безошибочный factual ledger не считается хорошей прозой.

В обычном ходе итоговый `narration_audit` содержит `coverage.visible_changes` и
`coverage.uncertainties`: записи `{source_index, segment_ids}` с нулевым индексом
исходного массива и ссылками на immutable сегменты проверяемой прозы. Для `PASS`
каждый исходный индекс указан ровно один раз, с хотя бы одним существующим
сегментом; пустой исходный массив требует пустого coverage. Несколько исходных
смыслов могут ссылаться на один сегмент. Ссылки обозначают выраженный в прозе
смысл, а не наличие факта во входе. Пропущенные смыслы дают `FAIL` и concern;
неизвестные индексы, сегменты, дубли и malformed coverage не принимаются кодом.
Независимые `artistic_verdict` и `technical_verdict` имеют значения `pass|fail`;
`fail` требует соответственно concern `literary_quality` или
`technical_presentation`. Общий `PASS` требует оба verdict `pass`, полное
coverage, отсутствие concerns и непустое evidence. Public verdict и coverage
собирает Adapter детерминированно из private source reviews и failures; LLM их
не назначает. Те же проверки действуют
после единственного существующего цельного semantic repair, без нового role
или дополнительного каскада вызовов.

Private wire сохраняет обязательные текущие факты в `required_current_beat`
с changes `{ref,text}` и uncertainties `{ref,text,status:unperformed_result_unknown}`,
`constraints` содержит do_not_imply/allowed_tensions/style_policy.
При любом change или uncertainty `optional_support` содержит только
visible_scene и текущие grounded sensory_details, если они переданы. Writer выбирает
только относящиеся к текущему beat детали; весь sensory snapshot не пересказывается.
Static NPC/object/inventory/body arrays, known_context и snapshot metadata
не поступают writer/auditor/repair.
Новые существенные факты должны приходить через visible_changes. Существующие
projection owners продвигают воспринимаемые признаки applied observation,
destination facts, видимых NPC и подтверждённый маршрут arrival, а также
факты текущего ordinary scene seed. Причинное основание задаёт результат owner,
а не текст заявки или заголовок сцены; snapshot self-knowledge не продвигается.
Дополнять текущий
результат пересказом static snapshot нельзя. Эти данные остаются authoritative
и доступны профильным panels. Если оба source arrays пусты и сама сцена является
результатом, descriptive support сохраняется для scene-only/perception prose.
Raw visible_context не дублируется; used_references остаётся пустым.
Confirmed_outcome/action_intent и role-specific output/segments/concerns/phase
сохраняют существующую доступность. Uncertainty о вопросе не становится доказательством
действия; явно неисполненный continuation остаётся неначатым, а результат неизвестным.
Committed transient attempt в required change подтверждает выполненное физическое
обращение/contact. Открытым остаётся только observation/discovery
result или новый факт. Narrator изображает совершённое движение конкретно, без
пересказа attempt/status metadata и без выдуманной новой находки. goal_result pending
не отменяет applied operation. Нельзя объявлять её неначатой либо навязывать выбор
продолжить/изменить действие, если unexecuted continuation не передан.
Projection transient attempt создаёт два соседних atomic current-beat source:
первый отдельно подтверждает выполненное обращение, второй отдельно
сохраняет неизвестность observation result. Оба остаются changes с собственными
request-local refs и проверяются независимо; модель не должна сама выделять
неизвестный смысл из составной служебной строки.

Private auditor возвращает только exact shape с `reviewed_segments`,
`source_reviews`, `unsupported`, `literary_failures` и `evidence`.
`reviewed_segments` содержит полный canonical ordered набор segment choices.
`source_reviews` содержит ровно ordered refs из `required_current_beat`; каждая
запись `{ref,segment_choices}` получает choices только если все атомарные
propositions source переданы с той же certainty. Частичное либо отсутствующее
покрытие обозначается `[]`. Разные sources могут ссылаться на один segment.

Перед ответом модель проверяет каждую factual proposition, включая subordinate
clauses, и сообщает только failures. Semantic grounding failures находятся в
`unsupported` как `{segment_choice,kind,reason}`. Художественные нарушения
находятся в `literary_failures` как `{check,segment_choice,reason}` для пяти
checks: current_beat_buried, elapsed_as_service_report, static_context_dump,
weak_literary_composition, unsupported_response_or_continuation. Positive
proposition reviews, verdict, concerns, source indices и public coverage модель
не возвращает.

Adapter требует exact own-key set, source refs/order, canonical unique choices,
allowed semantic kinds/literary checks и непустые reasons. Затем код выводит
source_index по исходному порядку, собирает coverage, missing_visible_change и
остальные concerns, artistic/technical verdict и общий pass. Чистый отчёт требует
непустое evidence. Любой malformed private output преобразуется в невалидный
audit и блокирует flow fail-closed; Adapter не синтезирует repair concern.
Согласованный code-assembled FAIL использует существующий цельный repair без
нового role/call; final audit повторяет тот же строгий seam.

Temporal/aspectual overlap и persistence между фактами требуют явного основания:
scene label не доказывает ambience, тишину или субъективный темп. Длительность
хода не передаётся narrator как evidence. Любая придуманная временная величина
является unsupported fact, а служебная формулировка дополнительно получает
`elapsed_as_service_report`. Точная реплика и все propositions сохраняются.
Грамматическое подчинение раннего выполненного действия позднему допустимо, когда
глагольный вид или явный маркер однозначно сохраняет смысл «завершено раньше». Запрещены
reversal и подчинение со смыслом simultaneous/ongoing; обязательной словоформы
или раздельных предложений нет.
`weak_literary_composition` включает пересказ pending remainder как metadata
или пояснение плана вместо конкретного открытого следующего выбора. Полный и
фактически верный пересказ required sources по одному и в исходном порядке тоже
остаётся `weak_literary_composition`, если действие или воспринятый результат не
организует поддержанные пространственные детали в сцену. Один союз не делает
набор фактов художественной сценой; выдумывать отсутствующую связь запрещено.
Repair concerns не являются
исчерпывающим whitelist: все правила повторно применяются ко всей прозе,
при sparse support текст сокращается, а не украшается выдуманными связями.
PASS также требует двух pass verdicts, полной coverage, пустых concerns и непустого
массива evidence. Повторный semantic repair запрещён. Private writer и format
repair не генерируют self-check flags: публичный `self_check={}` нейтрален,
не содержит model approval и не заменяет независимый audit.

Центр ответа — текущие confirmed changes и uncertainties. Незавершённое действие
ясно остаётся ещё не начатым, его результат неизвестен; возможность продолжить
замысел или изменить решение передаётся естественно, без системного отчёта.
Точное произнесённое слово сохраняется. Прошедшее время вплетается в текущий
эпизод: служебная временная заставка с последующей статической сводкой не проходит
техническую приёмку. Даже фактически верный пересказ берега, тела или инвентаря
не проходит художественную приёмку, если вытесняет смысл текущего результата.
При малом количестве подтверждённого материала краткая связная сцена достаточна.
Само произнесение не подтверждает слышимость, ответ или отсутствие ответа:
для реакции слушателя требуется отдельный confirmed perception/conversation fact.
Opening сохраняет собственный утверждённый Stage 23 audit: turn coverage и
художественный verdict не синтезируются задним числом для опубликованной сцены.

Проверки не должны искать обязательные слова и конструкции. Рисковая карта полного qualification/acceptance покрытия для каждого класса включает:

- один позитивный grounded case;
- один factual trap: tempting, но unsupported detail;
- один sparse-context case, который обязан выявить upstream gap, а не породить воду;
- один unseen-equivalent с другим местом, предметом, NPC и формулировкой;
- один continuity case после следующего хода либо reload;
- blind semantic/literary review реального model output, а не только snapshot system prompt.

Это целевая матрица покрытия, а не требование запускать новый массовый benchmark при каждой локальной правке. Принятие нормы и локальный change проверяют relevant focused subset и не означают соответствия всей игры. Полная матрица служит итоговым gate художественной приёмки и model qualification.

Новый unseen case не должен требовать нового `situation_kind`, handler, enum, phrase rule или template. Если требует, решение заскриптовано.

## 17. Владельцы и связанные контракты

Границы ответственности определяются следующими владельцами:

- [`AGENTS.md`](../../../../AGENTS.md), §§3–14 — свободная причинная игра, authority и persistence;
- [`CONTRACT_INDEX.md`](CONTRACT_INDEX.md), §§4, 8.1 — active contracts и Narration/UI scope;
- [`packages/narration/MODULE.md`](../../../../packages/narration/MODULE.md) — workflow writer/audit/repair;
- [`apps/game-server/MODULE.md`](../../../../apps/game-server/MODULE.md) — persisted safe projection и composition;
- [`apps/game-web/MODULE.md`](../../../../apps/game-web/MODULE.md) — faithful UI rendering;
- [`packages/materialization/MODULE.md`](../../../../packages/materialization/MODULE.md) — grounded detail и identity;
- [`turn_step_llm_contract.md`](turn_step_llm_contract.md), §§6, 8–9 — completed steps и remaining intent;
- [`npc_conversation_mode_contract.md`](npc_conversation_mode_contract.md), §§18–19, 23, 29–31, 36 — exact speech, audience, causal order и narration;
- [`temporal_world_and_interruptible_activities.md`](temporal_world_and_interruptible_activities.md), §§3.5, 12–20 — time, processes, body и visible package;
- [`npc_combat_and_trigger_contract.md`](npc_combat_and_trigger_contract.md), §§21–29 — combat ordering, speech и terminal state;
- [`combat_system.md`](combat_system.md), §§12–15, 27–29 — injury, death, aftermath и recovery.

Сами MODULE должны ссылаться только на canonical документ и кратко указывать собственную ответственность. Не копировать туда весь packet: иначе быстро появятся расходящиеся нормы.

Private narration auditor использует exact `request.segments[].segment_id` во всех
reviewed_segments, source_reviews, unsupported и literary_failures. Positional
aliases и нормализация не допускаются; Adapter детерминированно собирает
coverage/verdict, а final audit строго проверяется по IDs
повторно сегментированной approved prose. Длительность хода не входит в private
prose wire: её вычисляет temporal owner и показывает server-owned UI projection.
Любая придуманная narrator временная величина является unsupported fact, а
служебная формулировка дополнительно проваливает elapsed_as_service_report.
При current beat private wire
допускает visible_scene + sensory_details; narrator выбирает только относящиеся
к этому эпизоду признаки, а unrelated/all-facts dump остаётся static_context_dump.

Temporal/aspect grounding не позволяет выводить длительность из действия или
sensory sky/weather/sound. Sensory support связывает сцену. Source review требует все propositions каждого atomic
required source; неизвестный результат нельзя опустить или заменить
failure/success. Речь передаётся естественно с дословным
содержанием и speaker, discovery — через подтверждённое восприятие без status report.

Applied-step causal projection оставляет semantic_activity duration temporal owner;
single transient_item_use получает два соседних atomic current-beat source:
выполненную попытку с exact description, затем отдельно неизвестный observation result.
Каждый source получает собственный ref и проверяется независимо. Отдельный elapsed component этого step
удаляется перед финальной сборкой; search передаёт только выполненное действие и результат.
Narrator переводит evidence wording в естественную речь и конкретное движение,
не копирует служебные слова step/attempt и не добавляет минуты.
