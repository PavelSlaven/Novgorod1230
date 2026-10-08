# production-v2 final approval — batch A-02

Independent approval (WR §21.1) of issue #154 candidates at commit `87d6cc2a865a0f63ce69005c5a155e73f7a1fd4d`. Approver: Claude Opus 5.5 (high reasoning), a separate run from the Sonnet authors and classifiers. Packet: `A-02` (A = access class only, B = text/aliases/date, C = new book-sourced claims).

## A-02

| claim | verdict | limits | reason |
|---|---|---|---|
| `claim:fauna-mammals-european-otter-solitary-crepuscular` | REJECT | Годится только внутренний класс либо переписанный текст без нотации. Не выводить знание охотничьих повадок у любого NPC. | Стрелочная нотация «→» и косая черта: так человек 1230 года не говорит; general_physical слишком широк для этого текста. |
| `claim:fauna-mammals-moose-browse-aquatic-forage` | REJECT | Содержание о питании лося наблюдаемо, но в открытый класс только после перезаписи без нотации. | Нотация «→» в открытом тексте; формулировка не произносима человеком 1230 года. |
| `claim:fauna-mammals-moose-crepuscular-seasonal-movement` | REJECT | Остаётся domain_internal_only; открытым может стать только переписанный текст. | Нотация «→» и научное слово «популяции». |
| `claim:fauna-mammals-moose-defensive-antlers-hooves` | REJECT | Смысл общеизвестен, но открыть можно только после перезаписи без нотации. | Нотация «→» в открытом тексте. |
| `claim:fauna-mammals-moose-solitary-calf-seclusion` | REJECT | Открытым может стать только переписанный текст без нотации; поведение лосей знает скорее охотник. | Нотация «→» в открытом тексте. |
| `claim:fauna-mammals-mountain-hare-sheltered-winter-movement` | REJECT | Остаётся domain_internal_only до перезаписи. | Нотация «→» и слово «тундра» вне кругозора новгородца 1230 года. |
| `claim:fauna-mammals-red-fox-cooperative-pup-care` | REJECT | Остаётся domain_internal_only до перезаписи без нотации. | Нотация «→»; к тому же это наблюдение натуралиста, а не общее знание. |
| `claim:fauna-mammals-red-fox-habitat-flexibility` | REJECT | Остаётся domain_internal_only; открытым может стать фраза вроде «лиса живёт и в лесу, и на опушках». | «Широкий спектр местообитаний» — современная экологическая терминология, плюс нотация «→». |
| `claim:fauna-mammals-red-fox-nonpack-territoriality` | REJECT | Остаётся domain_internal_only до перезаписи. | Нотация «→»; защита участков — знание натуралиста. |
| `claim:fauna-mammals-red-fox-omnivory-food-caching` | REJECT | Смысл наблюдаем, но открыть можно только переписанный текст без нотации. | Нотация «→» в открытом тексте. |
| `claim:fauna-mammals-red-squirrel-forgotten-cache-germination` | APPROVE | Только общее наблюдение; не задаёт наличие запасов, всходов или белок в сцене. | Простая бытовая формулировка без научных понятий; прорастание спрятанных орехов и семян наблюдаемо. |
| `claim:fauna-mammals-red-squirrel-seed-cache` | APPROVE | Только общее бытовое наблюдение; не создаёт тайник или белку в сцене. | Обиходное наблюдение без нотации и терминов. |
| `claim:fauna-mammals-roe-deer-seasonal-grouping` | REJECT | Остаётся domain_internal_only до перезаписи. | Нотация «→»; сезонная группировка косуль — знание натуралиста или охотника. |
| `claim:fauna-mammals-ruminant-grazing-selectivity` | REJECT | Остаётся domain_internal_only; не выводить разницу в выборе корма у скота из открытого текста. | Аббревиатура «КРС», нотация «→», термины «разнотравье» и «древесно-кустарниковый корм». |
| `claim:fauna-mammals-wild-boar-group-offspring-protection` | REJECT | Остаётся domain_internal_only до перезаписи без нотации. | Нотация «→» в открытом тексте. |
| `claim:fauna-mammals-wild-boar-grubbing-soil-disturbance` | REJECT | Смысл наблюдаем; открыть можно только переписанный текст. | Нотация «→» в открытом тексте. |
| `claim:fauna-mammals-wild-boar-sexual-social-structure` | REJECT | Остаётся domain_internal_only до перезаписи. | Нотация «→»; структура групп — знание натуралиста или охотника. |
| `claim:fauna-mammals-wild-boar-thermal-wallowing-activity` | REJECT | Остаётся domain_internal_only до перезаписи. | Нотация «→» и косая черта «вечеру/ночи». |
| `claim:fauna-mammals-wolf-carnivorous-diet` | REJECT | Смысл общеизвестен; открыть можно только после перезаписи. | Нотация «→» и зоологический термин «копытные». |
| `claim:fauna-mammals-wolf-howling-communication` | APPROVE | Только общее знание о вое; не задаёт присутствие волков или значение конкретного воя. | Общеизвестное наблюдение, сказано простыми словами. |
| `claim:fauna-mammals-wolf-pack-pup-care` | REJECT | Остаётся domain_internal_only до перезаписи. | Нотация «→» и оборот «период зависимости» — служебная и научная формулировка. |
| `claim:fauna-mammals-wolf-territorial-defense` | APPROVE | Только общее знание охотников и селян о волчьих угодьях; не задаёт стычку или присутствие волков. Слово «территория» пересказывать по-старому. | Простая фраза без нотации; о волчьих угодьях знали охотники. |
| `claim:fauna-pike-ambush` | APPROVE | Только общее знание о щуке; не задаёт наличие рыбы или улов. | Наблюдаемое поведение, простая формулировка. |
| `claim:fauna-pike-juvenile-predation` | REJECT | Остаётся domain_internal_only; о поедании икры личинками насекомых открыто не говорить. | Поедание икры личинками водных насекомых — знание натуралиста, для general_physical слишком широко. |
| `claim:fauna-pike-spawning` | REJECT | Весенний нерест подходит как знание рыбака (role_bound nov_role_fisher); что самцы не охраняют икру — внутреннее. | Что самцы не охраняют икру — деталь натуралиста; general_physical слишком широк. |
| `claim:fauna-salmon-age-diet` | REJECT | Остаётся domain_internal_only; открывать рыбаку можно только переписанный текст. | Термины «беспозвоночные» и «атлантический лосось» недопустимы даже в role_bound-тексте. |
| `claim:fauna-salmon-anadromy` | REJECT | Годится разве что «лосось приходит с моря метать икру», для рыбака; уход молоди в море — внутреннее. | «Проходной», «атлантический» — термины ихтиологии; развитие молоди в реке и уход в море — не общее знание. |
| `claim:fauna-salmon-repeat-spawning` | REJECT | Остаётся domain_internal_only. | Повторный нерест установлен научными наблюдениями; название «атлантический лосось» — анахронизм. |
| `claim:fauna-sheep-flocking` | APPROVE | Только общее наблюдение; не задаёт стадо или поведение конкретных овец. | Общеизвестно, простыми словами. |
| `claim:fauna-tadpole-temperature` | REJECT | Остаётся domain_internal_only. | Зависимость скорости развития от температуры — экспериментальное научное знание. |
| `claim:fauna-tawny-owl-activity` | APPROVE | Только общее знание, что сова кричит и летает ночью; видовое название пересказывать как «сова». | Ночная жизнь совы общеизвестна; формулировка почти бытовая. |
| `claim:fauna-tawny-owl-pellets` | APPROVE | Только общее наблюдение за совами; не задаёт находку погадок в сцене. | «Погадка» — старое народное и охотничье слово, явление находимо. |
| `claim:fauna-tawny-owl-territory` | REJECT | Остаётся domain_internal_only. | «Молодь расселяется за пределы родительского участка» — орнитологическая формулировка. |
| `claim:fauna-tick-feeding` | REJECT | Годится только «клещ пьёт кровь и отпадает»; остальное внутреннее. | «Зависит от вида», «хозяин» в смысле паразитологии — научные понятия. |
| `claim:fauna-tick-questing` | REJECT | Годится перезапись вроде «клещ сидит в траве и цепляется к проходящему»; этот текст внутренний. | «Хозяин» — паразитологический термин; «многие клещи» подразумевает видовую систематику. |
| `claim:fauna-tick-senses` | REJECT | Остаётся domain_internal_only. | Сенсорика клещей (тепло, запахи, вибрации) — научное знание. |
| `claim:fauna-toad-breeding-return` | REJECT | Остаётся domain_internal_only. | Возврат к прежним водоёмам — знание натуралиста; «обыкновенная жаба» — видовое название. |
| `claim:fauna-toad-defence` | REJECT | Годится «жабу звери не едят», но этот текст внутренний. | «Кожные токсины» — научное понятие. |
| `claim:fauna-toad-diet` | REJECT | Остаётся domain_internal_only. | «Ногохвостки», «многоножки», «обыкновенные жабы» — зоологическая терминология. |
| `claim:fermentation-conditions` | APPROVE | Внутреннее устройство мира; открытым текстом не подаётся. | Возврат в domain_internal_only верен: «субстрат» и «микроорганизмы» — научные понятия. |
| `claim:final-nature-channel-flow-can-transport-large-woody-debris` | APPROVE | Только общее наблюдение; не создаёт бревно, завал или скорость течения в сцене. | Наблюдаемо, простые слова; оговорка — ограничение, а не содержание. |
| `claim:final-nature-deciduous-trees-have-seasonal-leaf-state-unlike-evergreen-conifers` | APPROVE | Только общее знание; не задаёт сезон или состав леса в сцене. | Общеизвестно, формулировка произносима. |
| `claim:final-nature-floating-leaved-aquatic-plants-remain-rooted-and-are-not-free-floating-debris` | APPROVE | Только общее наблюдение; не называет растение и не задаёт его наличие. | Наблюдаемое свойство, без научных терминов. |
| `claim:final-nature-freeze-thaw-can-break-bank-soil-and-increase-erosion-vulnerability` | APPROVE | Только общее наблюдение; не предсказывает обвал, проходимость или нагрузку. | Наблюдаемо простыми словами («размыв», «оттепель»). |
| `claim:final-nature-known-edible-plant-premise-does-not-transfer-to-an-unidentified-part-or-lookalike` | APPROVE | Только общая осторожность; не определяет съедобность конкретного растения. | Народная осторожность к незнакомым растениям; научных понятий нет. |
| `claim:final-nature-large-woody-debris-can-be-deposited-or-stranded-after-transport` | APPROVE | Только общее наблюдение; не создаёт завал и не говорит о проходимости. | Наблюдаемо, формулировка простая. |
| `claim:final-nature-lookalike-risk-means-appearance-alone-does-not-establish-wild-plant-edibility` | REJECT | Остаётся domain_internal_only; открытой может быть только простая осторожность из claim 45. | «Съедобные родственники» — ботаническая систематика; недоверие к народному описанию — современная позиция. |
| `claim:final-nature-poison-hemlock-is-a-toxic-plant-and-its-parts-are-not-food` | REJECT | Годится «болиголов ядовит», но этот текст внутренний. | «Болиголов пятнистый» — научное видовое название. |
| `claim:final-nature-rooted-aquatic-herbs-can-combine-substrate-rhizomes-with-floating-or-emergent-leaves` | APPROVE | Только общее наблюдение; не определяет растение, глубину или доступ. | Наблюдаемое строение, слова простые. |
| `claim:final-nature-rooted-aquatic-plant-has-distinct-submerged-and-surface-parts` | APPROVE | Только общее наблюдение; не задаёт состояние конкретного растения. | Наблюдаемо, произносимо. |
| `claim:final-nature-thawed-wet-soil-can-detach-more-readily-than-its-bound-state` | REJECT | Смысл допустим; открыть после перезаписи без инженерного термина. | «Несущая способность» — инженерный термин в открытом тексте. |
| `claim:final-nature-wet-site-woody-plants-can-differ-from-drier-upland-tree-context` | APPROVE | Только общее наблюдение; не называет вид дерева в сцене. | Очевидное различие растительности, простые слова. |
| `claim:final-nature-woody-debris-can-change-local-shore-or-channel-obstacles-without-predicting-passage` | APPROVE | Только общее наблюдение; не предсказывает проходимость и исход маршрута. | Наблюдаемо, произносимо. |
| `claim:final-practical-after-birth-mother-and-newborn-need-continuing-observation-and-available-support` | APPROVE | Только бытовой уход; не задаёт осложнение, диагноз, исход или помощника. | Послеродовой уход — обычное бытовое знание. |
| `claim:final-practical-parasite-concern-can-support-hygiene-observation-and-contextual-help-without-diagnosis` | REJECT | Остаётся domain_internal_only. | «Паразит», «гигиена», «заражение» — современные медицинские понятия. |
| `claim:final-practical-postnatal-care-can-share-attention-between-parent-infant-and-household-needs` | APPROVE | Только бытовые заботы; не создаёт помощника, расписание или исход. | Бытовое знание, без терминов. |
| `claim:final-practical-present-weapon-or-tool-needs-secure-carrying-and-access` | APPROVE | Только общее практическое знание; не задаёт владельца, умение или применение. | Общее бытовое знание о ношении вещей. |
| `claim:final-practical-protective-layers-and-shields-need-fit-and-clearance` | APPROVE | Только знание воинов о подгонке снаряжения; не задаёт защиту или исход боя. | role_bound за стражей и дружинниками уместен. |
| `claim:final-practical-severe-or-worsening-postnatal-concerns-need-available-experienced-assessment-without-diagnosis` | APPROVE | Только обычай звать опытную помощь; не задаёт диагноз, лечение или помощника. | Звать повитуху или опытную женщину — бытовая норма. |
| `claim:final-practical-storage-separation-and-air-movement-can-limit-interference-when-available` | APPROVE | Только бытовая практика хранения; сушку не гарантирует. | Хозяйственное знание, простые слова. |
| `claim:final-practical-stored-goods-condition-can-change-with-air-moisture-and-time-without-fixed-rate` | APPROVE | Только общее наблюдение; не задаёт скорость, причину или исход порчи. | Наблюдаемо и произносимо. |
| `claim:final-practical-wet-gear-and-hull-care-compete-for-space-time-and-dry-work-area` | APPROVE | Только знание лодочников и рыбаков; не задаёт расписание или результат. | Роли подходят к уходу за снастью и лодкой. |
| `claim:final-practical-wet-netting-and-cordage-can-need-inspection-drying-and-repair-before-reuse` | APPROVE | Только знание рыбаков и лодочников; не создаёт сеть или успех починки. | Ремесленное знание, роли подходящие. |
| `claim:final-practical-wet-wooden-hull-or-boat-seam-needs-local-inspection-before-repair-or-travel` | APPROVE | Только знание лодочников; не задаёт течь, прочность или безопасный путь. | Лодочник, перевозчик, кормчий — подходящие роли. |
| `claim:final-practical-wood-leather-textile-and-metal-equipment-can-show-condition-before-use` | APPROVE | Только осмотр видимого; скрытый изъян и отказ не определяет. | Общее бытовое знание. |
| `claim:final-practical-worn-fastening-or-covering-can-be-limited-repaired-replaced-or-deferred-conditionally` | APPROVE | Только общее знание о починке; успех не гарантирует. | Бытовое знание, простые слова. |
| `claim:final-social-competing-property-accounts-can-guide-bounded-return-inquiry` | APPROVE | Только обычай разбирать спор о вещи; не доказывает право и не задаёт исход дела. | Метка, свидетель, передача — привычные горожанам способы разбора. |
| `claim:final-social-finding-an-object-can-start-return-inquiry-not-acquisition` | APPROVE | Только общий обычай о находке; не задаёт владельца, возврат или вину. | Обычай о находке чужой вещи известен горожанам. |
| `claim:final-social-holding-or-custody-does-not-by-itself-establish-title` | APPROVE | Только общее различение держания и права; не решает принадлежность конкретной вещи. | Общеизвестное бытовое различение, простые слова. |
| `claim:final-social-separating-waste-from-water-and-food-paths-can-limit-contact` | APPROVE | Только бытовая норма; не устанавливает загрязнение или болезнь. | Держать нечистоты подальше от воды и еды — бытовая норма. |
| `claim:final-social-veche-can-provide-bounded-public-deliberation-interface` | REJECT | Вече как общеизвестный институт годится для common_cultural, но только после перезаписи оговорки. | «Компетенция», «юрисдикция» — латинские юридические термины в открытом тексте. |
| `claim:final-social-washing-and-drying-can-change-visible-household-soil` | APPROVE | Только физическое наблюдение; чистоту и безопасность не гарантирует. | Наблюдаемо, простые слова. |
| `claim:fishing-net-mending-or-worn-part-replacement-can-prolong-serviceability` | REJECT | Роль рыбака подходит; открыть после удаления историографической оговорки. | «Историческая практика не подразумевается» — историографическое служебное слово в открытом тексте. |
| `claim:flayed-skin-processing-purpose` | REJECT | Смысл (очищать шкуру от гнили) общеизвестен; открыть после перезаписи. | Служебные оговорки «связь цели обработки», «упорядоченный рецепт», «историческая доступность». |
| `claim:food-drying-depends-on-humidity-airflow` | APPROVE | Только общее наблюдение; погоду и готовность не задаёт. | Житейское знание о сушке. |
| `claim:food-practices-threshing-chaff` | REJECT | Мякина при обмолоте — общее знание, но открыть только без отсылки к источникам. | «Описана по севернорусским зерновым материалам» — ссылка на источники в открытом тексте. |
| `claim:food-preservation-qualitative` | APPROVE | Внутреннее устройство мира; открытым текстом не подаётся. | Возврат в domain_internal_only верен: «микробиологические риски». |
| `claim:force-contact-geometry` | APPROVE | Внутреннее устройство мира; открытым текстом не подаётся. | Возврат в domain_internal_only верен: физическая терминология. |
| `claim:foundations-earth-24-water-cycle-fluxes` | REJECT | Остаётся domain_internal_only. | Круговорот воды через атмосферу и недра — научная модель, недоступная человеку 1230 года. |
| `claim:foundations-earth-25-snowmelt-runoff` | APPROVE | Только общее наблюдение; сезон, расход и паводок не задаёт. | Талая вода питает ручьи — очевидно; формулировка приемлема. |
| `claim:foundations-earth-27-fog-visibility` | REJECT | Годится «в тумане плохо видно», но этот текст внутренний. | Туман как взвесь мельчайших капель — физическое объяснение. |
| `claim:foundations-earth2-03-freeze-thaw-rock-fracture` | REJECT | Смысл наблюдаем; открыть после перезаписи. | «Порах породы» и служебное «универсальная условная связь». |
| `claim:foundations-earth2-04-mineral-hardness-not-brittleness` | REJECT | Остаётся domain_internal_only. | «Минерал», «свойства» и «универсальная условная связь» — научные и служебные слова даже для мастера. |
| `claim:foundations-earth2-05-mineral-hardness-scratch-comparison` | REJECT | Остаётся domain_internal_only. | Сравнение минералов царапаньем — минералогия; служебное «универсальная условная связь». |
| `claim:foundations-earth2-06-precipitation-infiltration-runoff-limit` | APPROVE | Только общее наблюдение; не задаёт насыщение, паводок или прогноз. | Когда земля не принимает воду, она течёт поверху — наблюдаемо; язык приемлем. |
| `claim:foundations-earth2-11-river-ice-jam-flow-obstruction` | REJECT | Ледоход и затор годятся для general_physical после удаления служебной оговорки. | Служебное «универсальная условная связь» в открытом тексте. |
| `claim:foundations-haz-04-slope-force-strength` | REJECT | Остаётся domain_internal_only. | Баланс сил и сопротивления материалов, «расчёт устойчивости» — физика. |
| `claim:foundations-haz-05-slope-water-triggers` | REJECT | Остаётся domain_internal_only. | «Эрозия», «грунтовые воды», «потеря устойчивости» — научные термины. |
| `claim:foundations-mat-01-wood-knot-strength-bonding` | APPROVE | Только знание мастера о древесине; не задаёт прочность конкретной вещи. | Практическое плотницкое знание, роль мастера подходит. |
| `claim:foundations-physical-b2-bnh-02-porous-bone-fragility` | APPROVE | Только ремесленное знание; не задаёт состояние конкретной кости. | Простое наблюдение костереза, роль подходит. |
| `claim:fuel-iron-pan-lifter-use` | NEEDS_REVIEW | Не открывать, пока не подтверждено бытование чапельника в Новгороде 1230 года. | Чапельник, скорее всего, поздний предмет; прошедшее «служил» — взгляд из будущего. По пакету не проверить. |
| `claim:fuel-pit-charcoal-burning-charcoal-output` | REJECT | Роли подходят; открыть после перезаписи в настоящем времени без служебных слов. | «Качественный результат процесса», «гарантированный выход» — служебные слова; прошедшее время историографично. |
| `claim:grain-processing-bread-open-fire-baking` | APPROVE | Только общее знание; не создаёт костёр или хлеб в сцене. | Бытовое знание, простые слова. |
| `claim:grain-processing-bread-oven-baking` | APPROVE | Только общее знание; не доказывает печь в сцене. | Бытовое знание. |
| `claim:healer-care-coordination-and-uncertainty` | APPROVE | Только обычный уход за больным; не обещает лечения и выздоровления. | Бытовая практика ухода, понятная каждому. |
| `claim:healer-livelihood-and-household-support` | APPROVE | Только общие обычаи оплаты помощи; не задаёт суммы, достаток или уважение. Слова «пациент», «профессия» пересказывать по-старому. | Плата едой, ночлегом или даром — общеизвестный обычай. |
| `claim:healer-portable-and-household-kit` | APPROVE | Только правдоподобный набор; не задаёт лекарство, его действенность или наличие. | Бытовое знание о вещах лекаря. |
| `claim:household-clay-drying-and-incompatible-movement` | APPROVE | Только общее наблюдение; не предсказывает трещину в конкретной стене. | Усыхание и трещины глины наблюдаемы. |
| `claim:household-clay-key-and-compatible-patch` | APPROVE | Только знание мастера; долговечность починки не гарантирует. | Ремесленный приём, роль мастера уместна. |
| `claim:household-dough-temperature-changes-proofing` | REJECT | Годится «в тепле тесто подходит быстрее», но этот текст внутренний. | «Образование газа» — понятие химии нового времени. |
| `claim:household-dough-yeast-gas-needs-retention` | REJECT | Остаётся domain_internal_only. | Дрожжи, образующие газ, и его удержание структурой — научное объяснение. |
| `claim:household-roof-layers-shed-water` | APPROVE | Только общее наблюдение; исправность конкретной кровли не задаёт. | Наблюдаемо и произносимо. |
| `claim:household-roof-local-condition-guides-repair` | APPROVE | Только бытовая починка; не гарантирует исправности всей кровли. | Обычная хозяйственная забота. |
| `claim:household-trauma-unnecessary-movement-can-worsen` | REJECT | Остаётся domain_internal_only. | Не двигать при травме шеи и спины — правило современной первой помощи, не знание 1230 года. |
| `claim:human-life-audience-can-interpret-standing-contextually` | REJECT | Остаётся domain_internal_only как устройство общественного поведения. | Абстрактное социальное обобщение («аудитория», «контекст»), по сути social_behavior. |
| `claim:human-life-capacity-experience-help-vary` | REJECT | Остаётся domain_internal_only. | Абстрактное обобщение о «контекстах» — модельная оговорка, человек 1230 года её не произнесёт. |
| `claim:human-life-category-does-not-determine-means-ties-skill` | REJECT | Остаётся domain_internal_only. | «Гендер» — современное англоязычное понятие; сама мысль — современная установка. |
| `claim:human-life-household-change-can-redistribute-labor-care` | APPROVE | Только общее знание о браке и хозяйстве; распределение труда в конкретном доме не задаёт. | Бытовое знание, произносимо. |
| `claim:human-life-household-formation-needs-residence-provisioning` | APPROVE | Только общий обычай; конкретное жильё не задаёт. | Бытовое знание, простые слова. |
| `claim:human-life-household-pressure-can-interrupt-learning` | APPROVE | Только знание ремесленного ученичества; расписание не задаёт. | Роли ученика, подмастерья и мастера уместны. |
