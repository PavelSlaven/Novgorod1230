# Fauna anachronisms / not-native taxa for Novgorod land ~1230. Checked by the validator against every
# name/lat field of every table in this folder (patterns are case-insensitive regexes).
DENY = [
 # id, patterns (ru|lat), reason, earliest/limit, src, conf, scope
 ("deny_turkey", ["индейк", "индюк", "Meleagris"], "американская птица, в Европу после 1492 г.", "после Колумбова обмена", ["master:n1230:material_item:liv0021", "wp:Индейка"], "A", "anachronism"),
 ("deny_rabbit_livestock", ["кролик", "Oryctolagus"], "кролик как домашний скот не засвидетельствован для Руси XIII в.; дикий кролик — юго-запад Европы", "—", ["master:n1230:material_item:liv0020", "wp:Кролик"], "B", "anachronism_as_livestock"),
 ("deny_heavy_draft_horse", ["тяжеловоз", "першерон", "битюг", "брабансон", "шайр"], "тяжелоупряжные породы — позднейшая селекция; кони Новгорода мелкие–среднерослые (Саблин 2007)", "Новое время", ["master:n1230:material_item:liv0027", "src:sablin-2007-rurikovo"], "A", "anachronism"),
 ("deny_brown_rat", ["серая крыса", "пасюк", "Rattus norvegicus"], "появилась в Поволжье в конце XVII — XVIII в. и вытеснила чёрную крысу", "конец XVII–XVIII в.", ["src:askeyev-2021-black-rat", "wp:Серая_крыса"], "B", "anachronism"),
 ("deny_german_cockroach", ["прусак", "рыжий таракан", "Blattella germanica"], "завезён в Европу в XVIII в.", "XVIII в.", ["wp:Рыжий_таракан"], "B", "anachronism"),
 ("deny_black_cockroach_unverified", ["чёрный таракан", "черный таракан", "Blatta orientalis"], "время появления на Руси не установлено — не генерировать до проверки", "не установлено", ["wp:Чёрный_таракан"], "C", "unverified"),
 ("deny_sterlet_native", ["стерлядь", "Acipenser ruthenus"], "волжско-каспийский вид; в Волхово-Ильменском бассейне аборигенным не показан (нет в списках Тарасова и Кудерского); допускать только как привоз после проверки", "—", ["src:kudersky-ladoga-ichthyofauna", "src:tarasov-2009-ladoga-fishing"], "C", "not_native"),
 ("deny_gibel_carp", ["серебряный карась", "Carassius gibelio", "Carassius auratus"], "позднее расселение, не аборигенный вид региона (проверить)", "Новое время", ["src:fishbase"], "C", "not_native"),
 ("deny_carp_farm", [r"\bсазан", r"\bкарп\b", "Cyprinus carpio"], "карп (прудовой) — поздняя интродукция в северо-западной Руси", "не ранее XVI–XVII в. (проверить)", ["src:fishbase"], "C", "anachronism"),
 ("deny_modern_breeds", ["голштин", "симментал", "меринос", "ландрас", "леггорн"], "современные породы", "XIX–XX в.", ["master:n1230:material_item:liv0024", "master:n1230:material_item:liv0016"], "A", "anachronism"),
 ("deny_guinea_fowl_peacock", ["цесарк", "павлин", "Numida", "Pavo"], "экзотическая птица, в Новгороде 1230 г. как дворовая не засвидетельствована", "—", ["wp:Цесарки"], "C", "unverified"),
]
