# Fauna anachronisms / not-native taxa for Novgorod land ~1230. Checked by the validator against every
# name/lat field of every table in this folder (patterns are case-insensitive regexes).
DENY = [
 # id, patterns (ru|lat), reason, earliest/limit, src, conf, scope
 ("deny_rabbit_livestock", ["домашний кролик", "кролиководство", "крольчатина"], "Домашнее кролиководство на Руси датируется существенно позже 1230 года; до библиографической проверки датировки не распространять запрет на дикого кролика как зверя.", "не ранее XVIII в. (датировка проекта требует библиографической привязки)", ["src:project-rabbit-livestock-lexicon"], "C", "anachronism"),
 ("deny_turkey", ["индейк", "индюк", "Meleagris"], "американская птица, в Европу после 1492 г.", "после Колумбова обмена", ["master:n1230:material_item:liv0021", "wp:Индейка"], "A", "anachronism"),
 ("deny_heavy_draft_horse", ["тяжеловоз", "першерон", "битюг", "брабансон", "шайр"], "тяжелоупряжные породы — позднейшая селекция; кони Новгорода мелкие–среднерослые (Саблин 2007)", "Новое время", ["master:n1230:material_item:liv0027", "src:sablin-2007-rurikovo"], "A", "anachronism"),
 ("deny_brown_rat", ["серая крыса", "пасюк", "Rattus norvegicus"], "появилась в Поволжье в конце XVII — XVIII в. и вытеснила чёрную крысу", "конец XVII–XVIII в.", ["src:askeyev-2021-black-rat", "wp:Серая_крыса"], "B", "anachronism"),
 ("deny_german_cockroach", ["прусак", "рыжий таракан", "Blattella germanica"], "завезён в Европу в XVIII в.", "XVIII в.", ["wp:Рыжий_таракан"], "B", "anachronism"),
 ("deny_sterlet_native", ["стерлядь", "Acipenser ruthenus"], "волжско-каспийский вид; в Волхово-Ильменском бассейне аборигенным не показан (нет в списках Тарасова и Кудерского); допускать только как привоз после проверки", "—", ["src:kudersky-ladoga-ichthyofauna", "src:tarasov-2009-ladoga-fishing"], "C", "not_native"),
 ("deny_gibel_carp", ["серебряный карась", "Carassius gibelio", "Carassius auratus"], "позднее расселение, не аборигенный вид региона (проверить)", "Новое время", ["src:fishbase"], "C", "not_native"),
 ("deny_carp_farm", [r"\bсазан", r"\bкарп\b", "Cyprinus carpio"], "карп (прудовой) — поздняя интродукция в северо-западной Руси", "не ранее XVI–XVII в. (проверить)", ["src:fishbase"], "C", "anachronism"),
 ("deny_modern_breeds", ["голштин", "симментал", "меринос", "ландрас", "леггорн"], "современные породы", "XIX–XX в.", ["master:n1230:material_item:liv0024", "master:n1230:material_item:liv0016"], "A", "anachronism"),
]

# Source-check queue: species awaiting an item-specific source; reading the queue by generation is a separate task.
CHECK_QUEUE = [
    {"check_id": "fchk_black_cockroach", "taxon_ru": "Чёрный таракан", "name_lat": "Blatta orientalis", "basis": "analogy", "confidence": "C", "reason": "Время появления Blatta orientalis в Новгородской земле не установлено; это пробел свидетельств, не датировка анахронизма.", "source_request": "Найти датированное исследование синантропной фауны средневекового Новгорода или Северо-Западной Руси.", "status": "needs_check"},
    {"check_id": "fchk_guinea_fowl", "taxon_ru": "Цесарка", "name_lat": "Numida meleagris", "basis": "analogy", "confidence": "D", "reason": "Не установлено появление цесарки в Новгороде около 1230 г.; не переносить неопределённость на павлина.", "source_request": "Датированное свидетельство ввоза или содержания цесарки на Руси/соседних торговых землях до или около 1230 г.", "status": "needs_check"},
    {"check_id": "fchk_peacock", "taxon_ru": "Павлин", "name_lat": "Pavo cristatus", "basis": "analogy", "confidence": "D", "reason": "Импортная декоративная птица возможна, но присутствие в Новгороде около 1230 г. не подтверждено.", "source_request": "Датированный источник о ввозе декоративных павлинов в Новгород или соседний регион до/около 1230 г.", "status": "needs_check"},
]
