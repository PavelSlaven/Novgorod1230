# Bibliography for the fauna-fish-invertebrates-livestock candidate set.
# Each entry: src_id -> (citation, url_or_path, kind, reliability_note)
# kind: primary | archaeology | scholarship | reference_db | popular | repo_data
# "read" = the collector actually read the text (2026-09-26); "via" = only cited by a read source.

SOURCES = {
    "src:tarasov-2009-ladoga-fishing": (
        "Тарасов И.И. Рыболовство в средневековой Ладоге // Староладожский сборник. Вып. 7. Старая Ладога, 2009. С. 177–184",
        "http://histfishing.ru/biblio/middleages/tarasov-ii-rybolovstvo-v-srednevekovoj-ladoge.html",
        "archaeology", "read; ихтиоархеология Ст. Ладоги (кости VIII–X вв., 11 видов, доли и размеры), орудия лова, писцовые тони XV в., осётр до Гостинопольских порогов, волховский сиг в Шелонь/Ловать/Мсту"),
    "src:tarasov-2008-fish-fauna-review": (
        "Тарасов И.И. Обзор промысловой ихтиофауны Новгородской земли в средние века по данным археологии // Исследование археологических памятников эпохи средневековья. СПб., 2008. С. 95–102",
        "https://www.academia.edu/11936072/",
        "archaeology", "via tarasov-2009 (текст закрыт, 403)"),
    "src:lebedev-1960": (
        "Лебедев В.Д. Пресноводная четвертичная ихтиофауна европейской части СССР. М., 1960. С. 37–62",
        "", "archaeology", "via tarasov-2009"),
    "src:sychevskaya-1965": (
        "Сычевская Е.К. Рыбы древнего Новгорода // Советская археология. 1965. № 1. С. 236–256",
        "", "archaeology", "via rybina (23 вида рыб в слоях X–XIV вв.; полный список не прочитан)"),
    "src:rybina-novgorod-crafts": (
        "Рыбина Е.А. Промыслы в средневековом Новгороде (по археологическим материалам) // Исторические исследования (МГУ)",
        "https://cyberleninka.ru/article/n/promysly-v-srednevekovom-novgorode-po-arheologicheskim-materialam",
        "archaeology", "read (через WebFetch-конспект); рыболовные снасти Новгорода, берестяные поплавки со знаками собственности, ботала, жерлицы, блёсны, остроги; рыбы в берестяных грамотах"),
    "src:kudersky-ladoga-ichthyofauna": (
        "Кудерский Л.А. Пути формирования ихтиофауны Ладожского озера // альманах «Terra Humana»",
        "http://ladoga-lake.ru/pages/artcl-ladoga-kudersky-fish-fauna.php",
        "scholarship", "read; Ильмень 25 видов; жерех, белоглазка, сырть, сом в Волхове и Ильмене; синец — основной промысловый в Ильмене; аборигенные лосось, кумжа, сиг, минога, ряпушка, хариус, корюшка, налим"),
    "src:fishbase": (
        "Froese R., Pauly D. (eds.) FishBase. Species summary pages (retrieved 2026-09-26); сниппеты о нересте в scripts/input_snapshots/fishbase_spawning_extract.json",
        "https://www.fishbase.se/", "reference_db", "read (скриптом); общая биология, не региональная"),
    "src:sablin-2007-rurikovo": (
        "Саблин М.В. Новые исследования фаунистических остатков с Рюрикова городища // Новгород и Новгородская земля. История и археология. Вып. 21. Великий Новгород, 2007",
        "https://bibliotekar.ru/rusNovgorod/171.htm",
        "archaeology", "read; высота в холке коровы 112,7 см (Рюриково), КРС лесной полосы ~100 см (Цалкин 1956); кони 142–144 см (IX в.), на ~10 см выше средних лесной полосы; собака ~60 см (крупная лайка); доля свиньи падает в XI–XII вв.; коза редка; кошка с X в."),
    "src:tsalkin-1956": (
        "Цалкин В.И. Материалы для истории скотоводства и охоты в Древней Руси // МИА. № 51. 1956",
        "", "archaeology", "via sablin-2007"),
    "src:maltby-hamilton-dyer-1995": (
        "Молтби М., Гамильтон-Даер Ш. Кости животных из раскопок в Новгороде и его округе // НиНЗ. История и археология. Вып. 9. 1995. С. 129–156",
        "", "archaeology", "via sablin-2007"),
    "src:maltby-2020-animals-archaeology": (
        "Brisbane M., Maltby M. et al. (eds.) Animals and Archaeology in Northern Medieval Russia: Zooarchaeological studies in Novgorod and its region. Oxford: Oxbow, 2020",
        "https://www.jstor.org/stable/j.ctv138wsxr",
        "archaeology", "via MASTER SRC040/FSRC010 и WK environment-p1 (текст не прочитан; eprints недоступен)"),
    "src:maltby-2017-horseflesh-beaver": (
        "Maltby M. Horseflesh and beaver pelts: aspects of faunal studies in Medieval Novgorod",
        "http://eprints.bournemouth.ac.uk/30013/",
        "archaeology", "via MASTER SRC042 (сервер недоступен 2026-09-26)"),
    "src:cats-novgorod-tver": (
        "Кошки средневековых Новгорода Великого и Твери // International Journal of Osteoarchaeology (doi 10.1002/oa.2637)",
        "https://onlinelibrary.wiley.com/doi/10.1002/oa.2637",
        "archaeology", "via MASTER SRC043"),
    "src:arch-northrus-village-3": (
        "Археология севернорусской деревни X–XIII вв. Т. III: палеоэкология, общество, культура. М., 2009",
        "https://archaeolog.ru/el-bib/el-cat/el-series/arch-northrus-village/arch-northrus-village-3",
        "archaeology", "via MASTER SRC046"),
    "src:russkaya-pravda-prostrannaya": (
        "Русская Правда (Пространная редакция), ст. 41–45, 53–54, 69–75, 80–81; перевод по изд. «Библиотека литературы Древней Руси»",
        "https://drevne-rus-lit.niv.ru/drevne-rus-lit/text/russkaya-pravda-prostrannaya/russkaya-pravda-prostrannaya.htm",
        "primary", "read; сравнительный правовой текст Руси (WK: не исполнимый кодекс Новгорода 1230 г.)"),
    "src:npl-6736-6738": (
        "Новгородская первая летопись старшего извода, л. 104об.–113об. (6736–6738 / 1228–1230 гг.)",
        "http://litopys.org.ua/novglet/novg06.htm",
        "primary", "read; 1228: вздорожали хлеб, мясо, рыба; 1230: голод, ели конину, псину, кошек, мох, кору"),
    "src:kochin-1965-agriculture": (
        "Кочин Г.Е. Сельское хозяйство на Руси в период образования Русского централизованного государства. Конец XIII — начало XVI в. М.–Л., 1965 (выдержка)",
        "https://bibliotekar.ru/4-1-71-drevnyaya-rus/27.htm",
        "scholarship", "read (выдержка); стойловый период 6–7 мес., хлевы (с Русской Правды), поскотины и прогоны, телятники, 25–30 копен сена на бедный двор, 6 овец/2 гнезда кур/2 свиньи в описи двора с. Спасского; период позже 1230 → для 1230 не выше C"),
    "src:korotkova-byt": (
        "Короткова М.В. Путешествие в историю русского быта. Гл. 2 «Крестьянский двор»",
        "https://culture.wikireading.ru/59514",
        "popular", "read; этнографическая картина позднего крестьянства (лошадь, 2–3 коровы, 6–8 овец и свиней; Егорьев день — выгон); только C"),
    "src:askeyev-2021-black-rat": (
        "Аскеев И.В., Шайморатова Д.Н., Недашковский Л.Ф. Распространение чёрной крысы (Rattus rattus) в средневековье на территории Поволжья (по археозоологическим данным) // Российский журнал прикладной экологии. 2021",
        "https://cyberleninka.ru/article/n/rasprostranenie-chernoy-krysy-rattus-rattus-l-1758-v-srednevekovie-na-territorii-povolzhya-po-arheozoologicheskim-dannym",
        "archaeology", "read (конспект); чёрная крыса в Поволжье с сер. I тыс.; серая крыса — конец XVII–XVIII в."),
    "src:master-material-culture": (
        "Novgorod1230 MASTER ARCHIVE v1 — material_culture catalog (LIV*, FSH*), кандидат",
        "data/world-catalogs/novgorod/sources/master-archive-v1/data/canonical/material_items.csv",
        "repo_data", "кандидат; источники SRC005, SRC025, SRC032, SRC039–SRC046"),
    "src:master-food-ingredients": (
        "Novgorod1230 MASTER ARCHIVE v1 — food_system ingredients (ING*), кандидат",
        "data/world-catalogs/novgorod/sources/master-archive-v1/data/normalized_source_tables/food_system/ingredients.csv",
        "repo_data", "кандидат"),
    "src:rus13tpl-household-wealth": (
        "rus13 regional templates — novgorod_household_wealth_profiles_v1.json (23 профиля, draft)",
        "tools/rus13-novgorod-regional-templates/novgorod_household_wealth_profiles_v1.json",
        "repo_data", "draft LLM-reconstruction; используется только как перечень типов двора и упомянутых животных"),
    "src:rus13-place-rules-v2": (
        "rus13 place generation rules v2 expanded (38 правил, typical_animals, draft)",
        "tools/rus13-novgorod-place-generation-rules/novgorod_region_place_generation_rules_v2_expanded.tsv",
        "repo_data", "draft"),
    "src:v6-g3-household-mix": (
        "Novgorod G2–G4 v6 — g3_places household_estimate / household_mix (911 строк, draft)",
        "DOCUMENTS/documents-kg/corpus/DOCUMENTS/novgorod_graphify_g1_g4_full/source_tsv/novgorod_g2_g4_70_cells_v6_g3_places.tsv",
        "repo_data", "draft (путь в main checkout)"),
    "src:world-db-water-body-templates": (
        "world_db world_base.water_body_templates + region_water_body_templates (41 строка, draft), выгрузка 2026-09-26",
        "scripts/input_snapshots/world_db_water_body_templates.csv",
        "repo_data", "draft"),
    "src:wk-place-first-cartography": (
        "WK production-v1 place-first-cartography.json — 44 environment_families (pf_id)",
        "data/world-catalogs/novgorod/world-knowledge/production-v1/place-first-cartography.json",
        "repo_data", "approved pack"),
}
