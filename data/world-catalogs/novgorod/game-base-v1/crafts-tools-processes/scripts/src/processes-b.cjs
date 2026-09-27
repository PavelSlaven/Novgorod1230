// Technological chains, part B: leather, footwear, fibre and textile, pottery, bone, glass.
// Step tuple: [action_ru, in_state, extra_inputs(;), tools(;), out_state, waste(;), duration_band, skill, checks_and_defects_ru, confidence]
module.exports = [
{
  id:'pc_tanning_bark', name_ru:'Кожевенное дело: выделка кожи растительным дублением', name_en:'vegetable tanning of hides', group:'leather', master_family:'tanning_leather',
  workplace:'ordinary_workshop', inputs:'mt_hide_raw;mt_water;mt_lime;mt_wood_ash_lye;mt_bark_tanning;mt_tallow;mt_birch_tar', tools:'tl_liming_vat;tl_beam;tl_fleshing_knife;tl_leather_press;tl_drying_frame;tl_knife_utility',
  fuel_heat:'без огня; тёплая вода по надобности', season:'мочка и золка — в тёплое время; зимой вода мёрзнет и работа замедляется; кору дерут весной-летом при сокодвижении',
  outputs:'mt_leather_veg', waste:'шерсть и волос в золе;мездра;обрезки шкуры;отработанная кора;вонючие стоки', skill:'master', total_duration:'months',
  failure_modes:'шкура загнила при мочке;волос не сходит — недозолено;кожа передублена и ломкая;кожа недублена и гниёт',
  defect_signs:'ослизлые пятна и запах гнили;пятна волоса;кожа трескается на изгибе;непродубленная серая середина на срезе',
  feasibility:'Долгий процесс (недели и месяцы) с чанами, водой и корой; кожевня пахнет и ставится у воды и на окраине усадьбы. Мгновенно кожу не получить: WK прямо говорит, что наличие кожаных вещей не подтверждает локального дубления.',
  authenticity:'', wk:'claim:vegetable-tanning-prepared-hide;claim:vegetable-tanning-collagen-stabilization;claim:oil-fat-vegetable-leather-flexibility;claim:material-water-vegetable-leather-water;claim:leather-broad-context;claim:population-hide-leather-distinction;claim:static-wood-ash-water-can-produce-alkaline-runoff;claim:r201-lye-1;claim:streak01-wet-leather-drying',
  sources:'src:izumova1959-leather', conf:'B', note:'Порядок стадий и составы — по Изюмовой (через конспект), которая сама опирается на технологию XIX в. для реконструкции; сроки не приводятся.',
  steps:[
    ['Отмочить и промыть сырую шкуру от грязи и крови','mt_hide_raw','mt_water','tl_liming_vat','st:soaked_hide','грязная вода','days','trained','перемочка — ослизлость и запах гнили','B'],
    ['Мездрить шкуру на колоде скребком','st:soaked_hide','','tl_beam;tl_fleshing_knife','st:fleshed_hide','мездра','hours','trained','подрезы и дыры','A'],
    ['Золить в растворе извести с золой до отставания волоса','st:fleshed_hide','mt_lime;mt_wood_ash_lye','tl_liming_vat','st:limed_hide','отработанная золка','weeks','master','волос не сходит — недозолено; зола раздражает кожу рук','A'],
    ['Счистить волос и остатки на колоде, промыть','st:limed_hide','mt_water','tl_beam;tl_fleshing_knife','st:pelt','шерсть и волос с золой (слои 5–15 см в раскопах)','hours','trained','','A'],
    ['Мягчить в кислом хлебном растворе (для мягких кож)','st:pelt','mt_sour_bread_kvas','tl_liming_vat','st:bated_pelt','','days','master','','C'],
    ['Дубить в чане с настоем толчёной коры ивы, дуба, ольхи, подсыпая кору','st:bated_pelt','mt_bark_tanning;mt_water','tl_liming_vat','st:tanned_hide','отработанная кора','months','master','серая недубленая середина на срезе','B'],
    ['Высушить на раме, промять, прожировать жиром или дёгтем','st:tanned_hide','mt_tallow;mt_birch_tar','tl_drying_frame;tl_leather_press','st:finished_leather','','days','trained','пересушка у огня — ломкость','B'],
    ['При надобности окрасить в чёрный или бурый солями железа, обрезать края','st:finished_leather','mt_iron_black_dye','tl_knife_utility','mt_leather_veg','обрезки кожи','hours','trained','пятнистое прокрашивание','B'],
  ]
},
{
  id:'pc_rawhide', name_ru:'Сыромять: промятая недублёная кожа', name_en:'rawhide (syromyat) preparation', group:'leather', master_family:'tanning_leather',
  workplace:'town_courtyard', inputs:'mt_hide_raw;mt_water;mt_tallow', tools:'tl_beam;tl_fleshing_knife;tl_drying_frame;tl_leather_press',
  fuel_heat:'нет', season:'тёплое время для мочки и сушки', outputs:'mt_rawhide', waste:'волос;мездра', skill:'trained', total_duration:'weeks',
  failure_modes:'пересохла и стала деревянной;загнила при мочке',
  defect_signs:'жёсткая, звенит, трескается;запах гнили',
  feasibility:'Проще дубления; даёт прочные ремни и поршни, но кожа боится воды (разбухает, затем усыхает).',
  authenticity:'', wk:'claim:material-water-rawhide-wet-dry;claim:oil-rawhide-moisture-resistance',
  sources:'src:izumova1959-leather', conf:'B', note:'',
  steps:[
    ['Отмочить, мездрить и очистить от волоса','mt_hide_raw','mt_water','tl_beam;tl_fleshing_knife','st:clean_hide','волос, мездра','days','trained','','B'],
    ['Растянуть и подсушить','st:clean_hide','','tl_drying_frame','st:dried_hide','','days','trained','','B'],
    ['Мять с жиром до мягкости','st:dried_hide','mt_tallow','tl_leather_press','mt_rawhide','','days','trained','пересохшие жёсткие участки','B'],
  ]
},
{
  id:'pc_shoemaking', name_ru:'Шитьё кожаной обуви по колодке (выворотный способ)', name_en:'turnshoe making on a last', group:'shoemaking', master_family:'footwear_repair',
  workplace:'ordinary_workshop', inputs:'mt_leather_veg;mt_flax;mt_beeswax;mt_birch_bark', tools:'tl_last;tl_shoe_knife;tl_awl;tl_leather_needle;tl_wax_block;tl_stamp_leather',
  fuel_heat:'нет', season:'круглый год', outputs:'pr:leather_footwear', waste:'обрезки кожи;изношенные подошвы (при починке)', skill:'trained', total_duration:'day',
  failure_modes:'детали скроены не по мерке;шов разошёлся;кожа лопнула при выворачивании',
  defect_signs:'обувь давит или болтается;рвутся проколы;перекошенный задник',
  feasibility:'При наличии выделанной кожи, колодки и навыка — дни работы. Сапоги с жёстким задником и многослойной подошвой сложнее мягких туфель и поршней.',
  authenticity:'', wk:'claim:population-shoe-input;claim:population-shoe-output;claim:population-shoe-form;claim:practical-leather-cut;claim:practical-leather-stitch;claim:research-failure-of-stitched-leather-join-can-separate-components',
  sources:'src:izumova1959-leather', conf:'A', note:'Швы: выворотный, тачной, наружный; задник подкреплён кожей, берестой или лубом (Изюмова через конспект).',
  steps:[
    ['Снять мерку, подобрать колодку, раскроить верх, подошву и задник','mt_leather_veg','','tl_last;tl_shoe_knife','st:cut_parts','обрезки кожи','hours','trained','детали не по мерке','A'],
    ['Навощить нить, сшить детали верха потайным (тачным) швом','st:cut_parts','mt_flax;mt_beeswax','tl_awl;tl_leather_needle;tl_wax_block','st:upper','','hours','trained','','A'],
    ['Пришить подошву к верху наизнанку на колодке, вставить подкрепление задника','st:upper','mt_birch_bark','tl_last;tl_awl;tl_leather_needle','st:inside_out_shoe','','hours','trained','разошедшийся шов','A'],
    ['Вывернуть, выправить на колодке, при желании оттиснуть узор','st:inside_out_shoe','','tl_last;tl_stamp_leather','pr:leather_footwear','','hour','trained','кожа лопнула при выворачивании','B'],
  ]
},
{
  id:'pc_shoe_repair', name_ru:'Починка обуви', name_en:'shoe repair', group:'shoemaking', master_family:'footwear_repair',
  workplace:'ordinary_workshop', inputs:'pr:worn_footwear;mt_leather_veg;mt_flax', tools:'tl_awl;tl_leather_needle;tl_shoe_knife;tl_last',
  fuel_heat:'нет', season:'круглый год', outputs:'pr:leather_footwear', waste:'старые подошвы и заплаты', skill:'trained', total_duration:'hours',
  failure_modes:'гнилая кожа не держит шов',
  defect_signs:'заплата отходит',
  feasibility:'Обычный заказ сапожника; изношенные подошвы и заплатки — массовая находка.',
  authenticity:'', wk:'claim:practical-leather-patch;claim:practical-leather-shoe;claim:ordinary-life-shoes-protect-feet',
  sources:'src:izumova1959-leather', conf:'A', note:'',
  steps:[
    ['Осмотреть обувь, распороть изношенную подошву или место прорыва','pr:worn_footwear','','tl_shoe_knife','st:opened_shoe','старая подошва','minutes','trained','','A'],
    ['Выкроить и пришить новую подошву или заплату','st:opened_shoe','mt_leather_veg;mt_flax','tl_awl;tl_leather_needle;tl_last','pr:leather_footwear','обрезки','hours','trained','','A'],
  ]
},
{
  id:'pc_flax_fibre', name_ru:'Подготовка льняного (конопляного) волокна', name_en:'flax and hemp fibre preparation', group:'textile_fibre', master_family:'fiber_preparation',
  workplace:'peasant_homestead', inputs:'pr:flax_stems;mt_water', tools:'tl_flax_brake;tl_scutcher;tl_hackle',
  fuel_heat:'сушка снопов в овине или на солнце', season:'теребление — конец лета; мочка — конец лета или осень (стлище — росяная мочка на лугу); мятьё и трепание — осень и зима',
  outputs:'mt_flax', waste:'кострика;очёсы (пакля);гнилая вода мочила', skill:'household', total_duration:'weeks',
  failure_modes:'перемочка — волокно слабое;недомочка — кострика не отделяется',
  defect_signs:'волокно рвётся в руках;в кудели много кострики',
  feasibility:'Домашняя работа всей семьи; сроки задаёт сезон и погода, а не навык. Конопля идёт тем же путём и даёт пеньку и паклю.',
  authenticity:'', wk:'claim:fibre-flax-breaker-shive;claim:fibre-hackle-removes-shive;claim:macro-b19-flax-retting-is-a-progressive-separation-process-that-needs-condition-assessment;claim:agriculture-fauna-hemp-stem-fibre;claim:agriculture-fauna-hemp-processing-tow',
  sources:'src:izumova1959-leather;src:ethno-analogy', conf:'B', note:'Сезонность — севернорусская этнография (C); орудия — WK (B).',
  steps:[
    ['Вымочить стебли в воде или расстелить на росу','pr:flax_stems','mt_water','','st:retted_stems','гнилая вода, запах','weeks','household','проверять отделение волокна руками','B'],
    ['Высушить стебли','st:retted_stems','','','st:dry_stems','','days','household','','C'],
    ['Промять мялкой, ломая кострику','st:dry_stems','','tl_flax_brake','st:broken_stems','кострика','hours','household','','B'],
    ['Трепать трепалом, выбивая кострику','st:broken_stems','','tl_scutcher','st:scutched_fibre','кострика, пыль','hours','household','','B'],
    ['Чесать чесалом, отделяя длинное волокно от очёсов','st:scutched_fibre','','tl_hackle','mt_flax','очёсы (пакля)','hours','household','кострика в кудели','B'],
  ]
},
{
  id:'pc_spinning', name_ru:'Прядение на веретене', name_en:'spindle spinning', group:'spinning', master_family:'spinning',
  workplace:'dwelling_interior', inputs:'mt_flax;mt_wool;mt_hemp', tools:'tl_distaff;tl_spindle;tl_spindle_whorl;tl_reel',
  fuel_heat:'нет', season:'основная пора — осень и зима, долгие вечера', outputs:'pr:yarn', waste:'обрывки нити', skill:'household', total_duration:'weeks',
  failure_modes:'нить неровная, рвётся;перекрут',
  defect_signs:'утолщения и слабины на нити;нить закручивается петлями',
  feasibility:'Женская домашняя работа; навык массовый. Скорость низкая: на полотно нужны недели прядения.',
  authenticity:'', wk:'claim:practical-textile-spin;claim:household-spindle-whorl',
  sources:'src:matcult-catalog-v1;src:ethno-analogy', conf:'B', note:'Колёсная прялка не используется (denylist dl_spinning_wheel).',
  steps:[
    ['Привязать кудель к прялке','mt_flax','','tl_distaff','st:dressed_distaff','','minutes','household','','B'],
    ['Вытягивать и скручивать нить веретеном с пряслицем','st:dressed_distaff','','tl_spindle;tl_spindle_whorl','st:spun_cop','обрывки','weeks','household','неровная нить','A'],
    ['Смотать нить на мотовило в пасмы','st:spun_cop','','tl_reel','pr:yarn','','hours','household','','B'],
  ]
},
{
  id:'pc_weaving', name_ru:'Ткачество полотна и сукна', name_en:'weaving cloth', group:'weaving', master_family:'weaving',
  workplace:'dwelling_interior', inputs:'pr:yarn', tools:'tl_loom;tl_shuttle;tl_weaving_sword;tl_reed_comb;tl_loom_weight;tl_shears',
  fuel_heat:'нет', season:'зима и весна до полевых работ', outputs:'pr:woven_cloth', waste:'концы основы;обрывки нитей', skill:'trained', total_duration:'weeks',
  failure_modes:'неравное натяжение основы;обрыв нитей;перекос полотна',
  defect_signs:'волнистая кромка;пропуски переплетения;рыхлые и плотные полосы',
  feasibility:'Нужен стан, место и запас пряжи; работу можно прерывать, оставляя основу на стане. Узорное и тонкое сукно — работа мастерицы или привоз.',
  authenticity:'', wk:'claim:population-processes-weaving-thread;claim:population-processes-weaving-device;claim:population-processes-weaving-textile;claim:population-weaving-practice;claim:macro-b19-uneven-warp-tension-is-a-condition-to-diagnose-before-controlled-adjustment;claim:practical-textile-weave;claim:ordinary-life-weaver-needs-yarn-and-loom-space',
  sources:'src:matcult-catalog-v1', conf:'A', note:'Тип стана (горизонтальный/вертикальный) задаётся контекстом; WK — реконструкция горизонтального по деталям.',
  steps:[
    ['Снуть основу нужной длины и числа нитей','pr:yarn','','','st:warp','','hours','trained','ошибка в счёте нитей','B'],
    ['Заправить основу в стан через ремиз и бёрдо, натянуть','st:warp','','tl_loom;tl_reed_comb;tl_loom_weight','st:dressed_loom','','day','trained','неравное натяжение','B'],
    ['Ткать: зев, прокидка утка челноком, прибой','st:dressed_loom','','tl_shuttle;tl_weaving_sword','st:cloth_on_loom','обрывки','weeks','trained','пропуски, перекос','A'],
    ['Снять полотно, закрепить концы','st:cloth_on_loom','','tl_shears','pr:woven_cloth','концы основы','hour','trained','','B'],
  ]
},
{
  id:'pc_textile_dyeing', name_ru:'Крашение пряжи или ткани', name_en:'dyeing yarn or cloth', group:'dyeing', master_family:'textile_finish_dye',
  workplace:'town_courtyard', inputs:'pr:woven_cloth;mt_textile_dyes;mt_water;mt_firewood;mt_wood_ash_lye', tools:'tl_dye_pot;tl_bucket',
  fuel_heat:'нагрев красильной ванны на костре или очаге', season:'растительное сырьё — по сезону сбора; работа в тёплое время на дворе',
  outputs:'pr:dyed_cloth', waste:'отработанная ванна;окрашенная вода', skill:'trained', total_duration:'days',
  failure_modes:'пятнистая окраска;краска смывается;шерсть испорчена щёлоком',
  defect_signs:'пятна и полосы;линяет при стирке;свалявшаяся ломкая шерсть',
  feasibility:'Простые растительные цвета — домашняя работа; синий индиго и красный лак-дай — привозные и дорогие, в 1230 г. это элитный цвет.',
  authenticity:'', wk:'claim:textile-dye-application;claim:textile-dye-mordant-fixation;claim:place-dye-bath-to-fibre-transfer-can-change-with-process-conditions;claim:place-dye-textile-preparation-can-affect-uptake-evenness;claim:place-dye-moving-submerged-textile-can-support-even-contact;claim:static-wool-is-sensitive-to-alkaline-cleaning-conditions;claim:textile-indigo-yellow-analysis;claim:textile-lac-dye-analysis',
  sources:'src:kyy1985-applied', conf:'B', note:'Протравы и рецептуры не задаются.',
  steps:[
    ['Промыть ткань или пряжу','pr:woven_cloth','mt_water;mt_wood_ash_lye','tl_bucket','st:scoured_textile','грязная вода','hours','household','недостаточная очистка — пятна','B'],
    ['Приготовить и нагреть красильную ванну','st:scoured_textile','mt_textile_dyes;mt_firewood','tl_dye_pot','st:dyebath_with_textile','','hours','trained','','C'],
    ['Выдерживать ткань в ванне, переворачивая','st:dyebath_with_textile','','tl_dye_pot','st:dyed_wet','отработанная ванна','hours','trained','пятнистость','B'],
    ['Прополоскать и высушить','st:dyed_wet','mt_water','','pr:dyed_cloth','окрашенная вода','days','household','линяет','B'],
  ]
},
{
  id:'pc_felting', name_ru:'Валяние войлока', name_en:'felting wool', group:'textile_fibre', master_family:'textile_finish_dye',
  workplace:'dwelling_interior', inputs:'mt_wool;mt_water', tools:'tl_bucket;tl_mallet',
  fuel_heat:'горячая вода', season:'после стрижки овец; работа в тепле', outputs:'mt_felt', waste:'клочья шерсти', skill:'household', total_duration:'days',
  failure_modes:'войлок рыхлый, рвётся;неравная толщина',
  defect_signs:'просвечивающие тонкие места',
  feasibility:'Домашняя работа при наличии шерсти и горячей воды.',
  authenticity:'', wk:'claim:static-wool-moisture-heat-mechanical-action-can-felt;claim:population-felt-lining',
  sources:'src:ethno-analogy', conf:'C', note:'Способ — аналогия; войлочные стельки засвидетельствованы (WK).',
  steps:[
    ['Разложить расчёсанную шерсть слоями','mt_wool','','','st:laid_wool','клочья','hours','household','','C'],
    ['Мочить горячей водой, катать и бить до сваливания','st:laid_wool','mt_water','tl_bucket;tl_mallet','mt_felt','мутная вода','hours','household','рыхлые места','C'],
  ]
},
{
  id:'pc_pottery_wheel', name_ru:'Гончарное дело: круговая посуда и обжиг', name_en:'wheel-thrown pottery and firing', group:'pottery', master_family:'pottery_forming',
  workplace:'ordinary_workshop', inputs:'mt_clay;mt_temper;mt_water;mt_firewood', tools:'tl_spade;tl_clay_trough;tl_potter_wheel;tl_potter_paddle;tl_pottery_stamp;tl_drying_shelf;tl_kiln',
  fuel_heat:'дровяной обжиг в горне (или в яме/очаге для простых сосудов) с постепенным подъёмом жара',
  season:'копка глины — в талую пору; сушка и обжиг — в тёплое сухое время; зимой глина мёрзнет',
  outputs:'pr:ceramic_pot', waste:'черепки брака;пережжённые и деформированные сосуды;зола', skill:'master', total_duration:'weeks',
  failure_modes:'сосуд треснул при сушке;разрыв паром при быстром обжиге;недожог — сосуд размокает;деформация на круге',
  defect_signs:'трещины от края или дна;вздутия и отколы;мягкий, пачкающий черепок;кривые стенки',
  feasibility:'Нужны пригодная глина (проверяется руками), отощитель, круг, сушка и горн с топливом. Сосуды сушат постепенно и обжигают этапами. Простой лепной горшок — доступен и неумелому, но с большим браком.',
  authenticity:'', wk:'claim:ceramic-novgorod-wheel;claim:pottery-handmade-local-clay;claim:pottery-handmade-temper;claim:macro-b19-wet-surface-mud-is-not-by-itself-evidence-of-workable-pottery-clay;claim:population-material-clay-plasticity;claim:population-material-clay-steam;claim:population-material-clay-quartz;claim:mb14-practical-clay-firing-needs-gradual-observation;claim:clay-firing-structural-transformation;claim:clay-fired-no-replasticization;claim:clay-dried-replasticization',
  sources:'src:novgorod-museum-ceramics;src:matcult-catalog-v1', conf:'B', note:'Устройство горна для Новгорода XIII в. не выписано.',
  steps:[
    ['Накопать глину, проверить пластичность в руках','mt_clay','','tl_spade','st:dug_clay','пустая порода','hours','trained','мокрая грязь — не глина; проверять жгутом','A'],
    ['Выдержать, очистить, замесить с отощителем','st:dug_clay','mt_temper;mt_water','tl_clay_trough','st:prepared_clay','камешки и корни','days','trained','','A'],
    ['Налепить заготовку жгутами и вытянуть на ручном круге','st:prepared_clay','','tl_potter_wheel;tl_potter_paddle','st:green_vessel','обрезки глины','hours','master','кривые стенки','A'],
    ['Оттиснуть или прочертить орнамент','st:green_vessel','','tl_pottery_stamp','st:decorated_vessel','','minutes','trained','','B'],
    ['Медленно высушить в тени','st:decorated_vessel','','tl_drying_shelf','st:dry_vessel','','days','trained','трещины от быстрой сушки','A'],
    ['Обжечь с постепенным подъёмом жара и медленно остудить','st:dry_vessel','mt_firewood','tl_kiln','pr:ceramic_pot','брак, зола','day','master','разрыв паром, недожог','A'],
  ]
},
{
  id:'pc_bone_comb', name_ru:'Косторезное дело: составной гребень из рога и кости', name_en:'composite antler comb making', group:'bone', master_family:'bone_antler_horn',
  workplace:'ordinary_workshop', inputs:'mt_antler;mt_bone;mt_water;mt_bronze;mt_iron', tools:'tl_saw_bone;tl_bone_knife;tl_file;tl_bow_drill;tl_compass_divider;tl_bone_rivets;tl_whetstone',
  fuel_heat:'распаривание в горячей воде', season:'сброшенный лосиный рог — зима и весна; работа круглый год',
  outputs:'pr:bone_comb', waste:'отпиленные основания рога;опилки;пластины-заготовки;брак', skill:'master', total_duration:'days',
  failure_modes:'пластина треснула;зубья сломаны при нарезке',
  defect_signs:'трещины вдоль волокна;неровные зубья',
  feasibility:'Нужны рог или кость, пилки, напильники, сверло и заклёпки. Простые изделия (проколки, пряслица, рукояти) — проще гребня.',
  authenticity:'', wk:'claim:foundations-physical-material3-01-antler-osseous-not-horn;claim:foundations-physical-material3-03-antler-water-workability;claim:foundations-physical-material3-04-osseous-shaping-operations;claim:work-waste-context',
  sources:'src:smirnova1998-bone;src:kyy1985-applied', conf:'C', note:'Отходы костереза — A (Смирнова); последовательность операций — реконструкция.',
  steps:[
    ['Распилить рог на отрезки, отделив губчатую сердцевину','mt_antler','','tl_saw_bone','st:antler_billets','основания рога, опилки','hours','master','','B'],
    ['Распарить и расколоть на пластины, выровнять ножом и напильником','st:antler_billets','mt_water','tl_bone_knife;tl_file','st:comb_plates','стружка, брак','hours','master','трещины','C'],
    ['Собрать пластины между накладками, просверлить и склепать','st:comb_plates','mt_bronze;mt_iron','tl_bow_drill;tl_bone_rivets','st:comb_blank','','hours','master','','C'],
    ['Нарезать зубья, разметить и нанести циркульный орнамент, отполировать','st:comb_blank','','tl_saw_bone;tl_compass_divider;tl_whetstone','pr:bone_comb','опилки','hours','master','сломанные зубья','C'],
  ]
},
{
  id:'pc_bone_skate', name_ru:'Костяной конёк', name_en:'bone skate', group:'bone', master_family:'bone_antler_horn',
  workplace:'town_courtyard', inputs:'mt_bone;mt_leather_veg', tools:'tl_axe_household;tl_bone_knife;tl_bow_drill',
  fuel_heat:'нет', season:'делают к зиме', outputs:'pr:bone_skate', waste:'костные обрубки', skill:'household', total_duration:'hours',
  failure_modes:'кость раскололась',
  defect_signs:'трещина вдоль кости',
  feasibility:'Простая домашняя работа из лошадиной или коровьей кости.',
  authenticity:'', wk:'claim:population-processes-bone-skate-input;claim:population-processes-bone-skate-output;claim:settlement-skate-bone;claim:settlement-skate-footwear',
  sources:'src:matcult-catalog-v1', conf:'A', note:'',
  steps:[
    ['Выбрать и очистить трубчатую кость, стесать скользящую плоскость','mt_bone','','tl_axe_household;tl_bone_knife','st:skate_blank','обрубки','hours','household','','A'],
    ['Просверлить отверстия и привязать ремнями к обуви','st:skate_blank','mt_leather_veg','tl_bow_drill','pr:bone_skate','','hour','household','','B'],
  ]
},
{
  id:'pc_glass_bracelet', name_ru:'Стеклянные браслеты и бусы из готового стекла', name_en:'glass bracelets and beads from glass stock', group:'glass', master_family:'glass_bead_reworking',
  workplace:'ordinary_workshop', inputs:'mt_glass;mt_charcoal', tools:'tl_glass_crucible;tl_glass_tongs;tl_bellows',
  fuel_heat:'горн с углём и дутьём до размягчения стекла', season:'круглый год', outputs:'pr:glass_bracelet', waste:'капли и нити стекла;битые браслеты', skill:'specialist', total_duration:'day',
  failure_modes:'браслет лопнул при остывании;стекло не спаялось в кольцо',
  defect_signs:'трещина по спаю;пузыри',
  feasibility:'Редкая специальность; первичную варку стекла в каждом дворе не предполагать. Браслеты носили городские женщины с 1130-х до начала XIV в.',
  authenticity:'', wk:'claim:population-glass-cooling;claim:foundations-mat-09-glass-brittle-thermal-stress',
  sources:'src:shchapova1972-glass;src:kyy1985-applied', conf:'C', note:'Техника навивки и спайки — реконструкция.',
  steps:[
    ['Расплавить стекло в тигле','mt_glass','mt_charcoal','tl_glass_crucible;tl_bellows','st:soft_glass','','hours','specialist','','C'],
    ['Вытянуть и свить стеклянный прут, согнуть в кольцо и спаять','st:soft_glass','','tl_glass_tongs','st:hot_ring','капли стекла','minutes','specialist','несплавленный спай','C'],
    ['Медленно остудить','st:hot_ring','','','pr:glass_bracelet','битый брак','hours','specialist','трещина при быстром остывании','C'],
  ]
},
];
