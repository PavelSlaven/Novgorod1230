# Verification: material culture, craft and physics shards

## Метод и verdict policy

Аудит повторно открывал cited URLs через browser-harness; PDF/paid landing pages
подтверждают библиографическую запись и scope, но не заменяют доступный anchor в
стратиграфическом отчёте. `APPROVE` и `APPROVE_WITH_LIMITS` — единственные
production-eligible verdicts. `NEEDS_EVIDENCE` означает: не использовать claim
как factual grounding до добавления прямого источника; это не утверждение, что он
ложен.

| Обозначение | Проверенный URL | Результат проверки |
|---|---|---|
| NGB-73 | https://gramoty.ru/birchbark/document/show/novgorod/73/ | Карточка первичного документа: Новгород, Неревский раскоп/усадьба Б, стратиграфическая дата 20–30-е XIII в.; жанр долговой записи. |
| Orton | https://journals.uclpress.co.uk/ai/article/575/galley/12753/view/ | Открываемый академический PDF по средневековому Новгороду; широкий археологический, не 1230-specific scope. |
| Brisbane | https://www.jstor.org/stable/j.ctvh1dqcg | Академический сборник, широкий хронологический/тематический scope; landing page не является anchor конкретной находки. |
| Yanin | https://doi.org/10.1017/CHO9781139055994.009 | Cambridge chapter landing/DOI: синтез, не публикация конкретного 1230 слоя. |
| OpenStax | https://openstax.org/books/college-physics-2e/pages/11-8-archimedes-principle | Учебный первичный owner базовых законов; аналогично проверены linked pages 5-1, 7, 11-4, 14-3 и 14-5. |
| USDA FPL | https://www.fpl.fs.usda.gov/documnts/fplgtr/fplgtr190/chapter_04.pdf | Государственное engineering handbook: свойства древесины, широкий material-science scope. |
| DoITPoMS | https://www.doitpoms.ac.uk/tlplib/properties-of-materials.php | Cambridge educational materials-science source; class-level, не object-specific данные. |
| NIST | https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication960-17.pdf | NIST guide по fractography стекла/керамики; не источник для общего камня. |
| ASTM D1776 | https://www.astm.org/d1776-20.html | Стандарт conditioning текстиля перед испытанием; не измерение свойств кожи/исторических тканей. |
| Currey record | https://books.google.com/books?id=Xd1YAAAAMAAJ | Библиографическая запись книги, без проверяемого text anchor для заявлений о кости/роге. |

## Historical material culture

| Candidate ID | Verdict | Production-safe factual wording | Exact limits / rationale |
|---|---|---|---|
| MC-01 | APPROVE_WITH_LIMITS | В средневековом Новгороде деревянные постройки и деревянные элементы городской среды исторически засвидетельствованы. | Только городской широкий medieval context; не доказывает дом, настил, ограду, породу, конструкцию или состояние в конкретной сцене/1230. Orton/Yanin — синтезы. |
| MC-02 | APPROVE | Водонасыщенные новгородские слои особенно хорошо сохраняют органические находки. | Это tafonomic правило археологического record, не свойство всех мест региона и не evidence наличия предмета у actor. |
| MC-03 | APPROVE | НГБ №73 — целая берестяная долговая запись из Новгорода, Неревского раскопа, стратиграфически датированная 20–30-ми годами XIII века. | Доказывает этот документ и практику берестяной записи; не грамотность, инвентарь или юридическую силу любого текста. |
| MC-04 | APPROVE_WITH_LIMITS | НГБ №73 употребляет форму «гривнь» в долговой записи, что безопасно grounding’ит термин в новгородском деловом контексте 1220–1240. | Не утверждает физическую форму, массу, курс, цену, legal tender или баланс actor. |
| MC-05 | APPROVE_WITH_LIMITS | Кожаные личные вещи входят в опубликованный средневековый новгородский вещевой комплекс. | Source wide-period; не поддерживает модель обуви, локальное производство или доступность конкретной вещи в 1230. |
| MC-06 | APPROVE_WITH_LIMITS | Дерево, кость и рог допустимы как широкие классы материалов средневекового новгородского вещевого комплекса. | Не approved конкретная форма, декор или социальный смысл; JSTOR landing page не даёт 1230 anchor. |
| MC-07 | APPROVE_WITH_LIMITS | Академический свод документирует городскую металлообработку в средневековом Новгороде. | Не доказывает кузницу, сплав, технологию, качество или доступный металл в конкретном дворе/1230. |

## Craft and technology

В исходном shard отсутствуют machine-readable IDs; для проверки им присвоены
стабильные audit IDs в порядке строк таблицы (`CT-01`–`CT-11`).

| Candidate ID | Verdict | Production-safe factual wording | Exact limits / rationale |
|---|---|---|---|
| CT-01 | APPROVE_WITH_LIMITS | Структурная и предметная древесина — засвидетельствованный класс новгородских археологических материалов. | Не создаёт древесину, доски, лес, мастерскую или деталь 1230 без local causal basis. |
| CT-02 | APPROVE_WITH_LIMITS | Деревянные постройки и покрытия допустимы как городской medieval context. | Конкретная конструкция, датировка и location не подтверждены source anchor. |
| CT-03 | APPROVE_WITH_LIMITS | Обработанные деревянные предметы и деревообрабатывающие отходы допустимы как классы археологического материала. | Назначение заготовки/вещи не следует из материала; source не является каталогом конкретных форм 1230. |
| CT-04 | NEEDS_EVIDENCE | Не утверждать отдельно ремесленное использование кости и рога. | Brisbane landing page не даёт прямого anchor для кости/рога или их обработки; нужен раскопочный каталог/глава с находками. |
| CT-05 | APPROVE_WITH_LIMITS | Кожаные предметы допустимы в широком новгородском medieval context. | Не approved дубление как локальная практика, его длительность или конкретная кожа: cited general preservation evidence недостаточна. |
| CT-06 | NEEDS_EVIDENCE | Не утверждать конкретные волокна либо практики прядения/ткачества на основании одного preservation overview. | Нужен прямой текстильный/технологический source; waterlogged preservation не доказывает все заявленные операции. |
| CT-07 | APPROVE_WITH_LIMITS | Городская металлообработка исторически засвидетельствована в широком средневековом Новгороде. | Не approved конкретный горн, fuel, железная заготовка, метод ковки либо 1230-location. |
| CT-08 | NEEDS_EVIDENCE | Не утверждать обработку цветных металлов/ювелирную работу как factual candidate. | Cited anthology landing page без checked anchor не подтверждает этот более узкий claim. |
| CT-09 | APPROVE_WITH_LIMITS | Керамика — археологически релевантная материальная категория Новгорода/региона. | Не approved форма, масса, печь, технология обжига, глазурь или локальное производство около 1230. |
| CT-10 | APPROVE_WITH_LIMITS | Производственные отходы могут быть контекстным следствием работы с материалом. | Не выводить автора, время, профессию, скрытый предмет или свободный ресурс; specific woodworking link remains broad. |
| CT-11 | APPROVE_WITH_LIMITS | Физически осмысленная обработка зависит от реальных материала, инструмента, времени и доступа. | Это production-safe mechanics boundary, не археологический факт о любом орудии/мастерской. |

## Physics and material science

| Candidate ID | Verdict | Production-safe factual wording | Exact limits / rationale |
|---|---|---|---|
| PMS-01 | APPROVE | Выталкивающая сила, гидростатическое давление и фазовый переход воды — универсальные физические связи. | Исход зависит от массы, объёма, температуры, течения, геометрии и state; source не задаёт safety/load values. |
| PMS-02 | APPROVE_WITH_LIMITS | Площадь контакта, направление силы, опора и геометрия меняют механический результат; простые машины не создают работу из ничего. | Cited work-energy page не является отдельным evidence для всякого резания/раскалывания; exact tool/material response остаётся mechanics owner. |
| PMS-03 | APPROVE | Сухое трение сопротивляется относительному движению; результат зависит от нормальной силы и поверхностей. | Не fixed coefficient для материалов, не automatic slip from wetness; exact traction/wear code-owned. |
| PMS-04 | NEEDS_EVIDENCE | Approve только conduction при температурном градиенте. | Ссылка подтверждает conduction, но не полный claim о топливе, окислителе и ignition conditions; для production candidate горения нужен fire-science source. |
| PMS-05 | APPROVE | Свойства древесины зависят от направления, породы и moisture condition. | Не numeric strength, load capacity, drying time, decay/fire behaviour конкретного объекта. |
| PMS-06 | APPROVE_WITH_LIMITS | Металлические свойства зависят от состава, структуры, обработки и температуры; «металл» не одно число свойств. | Не supported specific cold-brittleness statement/steel grade; no hardness, armour, sharpness or forging temperature. |
| PMS-07 | APPROVE_WITH_LIMITS | Стекло и керамика имеют brittle-fracture behaviour, чувствительное к дефектам. | NIST source не верифицирует общий камень или конкретный thermal-shock result; исключить их до отдельного source. |
| PMS-08 | APPROVE_WITH_LIMITS | Для испытания текстиля состояние образца/conditioning существенно. | ASTM не подтверждает весь claim о коже, льне, шерсти, влагопоглощении, изоляции или усадке; конкретные свойства need evidence. |
| PMS-09 | NEEDS_EVIDENCE | Не утверждать physics кости/рога как production factual substrate. | Google Books record — библиографический, не content anchor; рог вообще не имеет прямой cited evidence. |

## Итог

- Проверено 27 candidate IDs: 4 `APPROVE`, 18 `APPROVE_WITH_LIMITS`, 5
  `NEEDS_EVIDENCE`; `DISPUTED` и `REJECT` не потребовались.
- Production-eligible wording намеренно не превращает wide-period synthesis в
  факт конкретного места, предмета или календарного года.
- Не verified: конкретные 1230 stratigraphic anchors для большинства craft/material
  форм, цветные металлы, текстильные операции, физика горения, кость и рог.
