// Technological chains, part C: wood, boats, fuels and tar, fishing and hunting gear, writing, lime, wax.
// Step tuple: [action_ru, in_state, extra_inputs(;), tools(;), out_state, waste(;), duration_band, skill, checks_and_defects_ru, confidence]
module.exports = [
{
  id:'pc_birch_tar', name_ru:'Дёготь: сухая перегонка бересты', name_en:'birch-bark tar by dry distillation', group:'tar_charcoal', master_family:'fuel_charcoal_fire',
  workplace:'forest_edge', inputs:'mt_birch_bark;mt_firewood;mt_clay', tools:'tl_tar_pots;tl_knife_utility;tl_basket_bark;tl_spade',
  fuel_heat:'костёр вокруг закрытой корчаги; нагрев бересты без доступа воздуха',
  season:'бересту снимают в пору сокодвижения (конец весны — начало лета); гонят в сухую погоду',
  outputs:'mt_birch_tar', waste:'уголь бересты;разбитые корчаги;зола;запах дёгтя на месте', skill:'trained', total_duration:'days',
  failure_modes:'в корчагу попал воздух — береста сгорела;корчага лопнула;дёготь пригорел',
  defect_signs:'пустой сборник и пепел вместо угля бересты;густой пригорелый продукт с сажей',
  feasibility:'Реалистично для обученного крестьянина при корчагах и бересте; горшки с дёгтем найдены в Новгороде. Главный риск — пожар и ожоги.',
  authenticity:'', wk:'claim:place-thermal-birch-tar-can-link-heated-bark-and-a-separate-collection-path;claim:place-thermal-birch-tar-method-choice-can-change-oxygen-and-collection-conditions;claim:household-tar-pot;claim:population-material-wood-pyrolysis',
  sources:'src:talanin-degot', conf:'C', note:'Способ (две корчаги или корчага над ямой) — аналогия XIX–XX вв.; выход не переносится.',
  steps:[
    ['Надрать бересты с живых или поваленных берёз, свернуть','mt_birch_bark','','tl_knife_utility;tl_basket_bark','st:bark_rolls','','hours','household','','B'],
    ['Плотно набить корчагу берестой, закрыть, поставить над сборником, обмазать глиной стыки','st:bark_rolls','mt_clay','tl_tar_pots;tl_spade','st:sealed_retort','','hours','trained','щели дают доступ воздуха','C'],
    ['Жечь костёр вокруг корчаги, не давая огню внутрь','st:sealed_retort','mt_firewood','tl_tar_pots','st:tar_collected','зола','day','trained','','C'],
    ['Остудить, вскрыть, слить дёготь из сборника','st:tar_collected','','tl_tar_pots','mt_birch_tar','берестяной уголь','hours','trained','','C'],
  ]
},
{
  id:'pc_pine_pitch', name_ru:'Смолокурение и варка пека', name_en:'pine tar and pitch boiling', group:'tar_charcoal', master_family:'fuel_charcoal_fire',
  workplace:'conifer_woodland', inputs:'mt_pine_resin;mt_wood_pine;mt_firewood', tools:'tl_axe_household;tl_knife_utility;tl_pitch_pot;tl_charcoal_pit',
  fuel_heat:'медленный нагрев смолистой древесины в яме или котле', season:'подсочка — лето; курение — сухая пора',
  outputs:'mt_pine_pitch', waste:'смольё-уголь;копоть', skill:'trained', total_duration:'weeks',
  failure_modes:'смола загорелась;пек пережжён и ломок',
  defect_signs:'пламя из котла;крошащийся пек',
  feasibility:'Смола сосны определена на новгородских лодках; способ промышленного смолокурения для 1230 г. не засвидетельствован — только аналогия.',
  authenticity:'', wk:'claim:construction-pine-resin-surfaces;claim:macro-b20-heated-pitch-is-a-burn-and-fume-exposure-hazard-that-needs-cautious-handling;claim:pine-pitch-severe-oxidation',
  sources:'src:ethno-analogy;src:dubrovin2000-transport', conf:'C', note:'',
  steps:[
    ['Сделать надрезы на соснах и собрать живицу или нарубить смолистые пни','mt_pine_resin','mt_wood_pine','tl_axe_household;tl_knife_utility','st:resin_stock','щепа','weeks','household','','C'],
    ['Медленно курить или вытапливать в яме или котле','st:resin_stock','mt_firewood','tl_charcoal_pit;tl_pitch_pot','st:crude_tar','смольё-уголь','days','trained','возгорание','C'],
    ['Уварить в котле до густого пека','st:crude_tar','mt_firewood','tl_pitch_pot','mt_pine_pitch','копоть','hours','trained','пережог','C'],
  ]
},
{
  id:'pc_charcoal_pit', name_ru:'Ямное углежжение', name_en:'pit charcoal burning', group:'tar_charcoal', master_family:'fuel_charcoal_fire',
  workplace:'forest_edge', inputs:'mt_firewood;mt_wood_generic', tools:'tl_axe_household;tl_spade;tl_charcoal_pit',
  fuel_heat:'частичное горение при ограниченном воздухе, затем закрытие отверстий',
  season:'сухое время года; зимой заготовка дров', outputs:'mt_charcoal', waste:'зола;недожог (головни);выжженная земля', skill:'trained', total_duration:'days',
  failure_modes:'дрова сгорели дотла;недожог',
  defect_signs:'много золы и мало угля;бурые недожжённые головни',
  feasibility:'Колчин реконструирует ямное углежжение как вероятную форму. Нужны лес, яма, земля для укрытия и надзор.',
  authenticity:'', wk:'claim:fuel-pit-charcoal-burning-form;claim:fuel-pit-charcoal-burning-wood-input;claim:fuel-pit-charcoal-burning-air-sequence;claim:fuel-pit-charcoal-burning-air-control;claim:fuel-pit-charcoal-burning-charcoal-output;claim:population-material-wood-pyrolysis',
  sources:'src:kolchin1953-metallurgy', conf:'A', note:'',
  steps:[
    ['Нарубить поленья и сучья, выкопать яму','mt_firewood','mt_wood_generic','tl_axe_household;tl_spade','st:stacked_pit','щепа','days','household','','A'],
    ['Зажечь и дать частично сгореть при слабом доступе воздуха','st:stacked_pit','','tl_charcoal_pit','st:charring_pit','дым','hours','trained','сильный огонь — выгорание','A'],
    ['Закрыть отверстия землёй и дерном для обугливания','st:charring_pit','','tl_spade','st:closed_pit','','days','trained','прорыв огня','A'],
    ['Остудить и выгрести уголь','st:closed_pit','','tl_spade','mt_charcoal','зола, головни','hours','trained','недожог','A'],
  ]
},
{
  id:'pc_log_building', name_ru:'Рубка сруба (плотницкое дело)', name_en:'log-house construction', group:'carpentry', master_family:'log_building',
  workplace:'town_courtyard', inputs:'mt_wood_pine;mt_wood_spruce;mt_hemp;mt_moss;mt_birch_bark', tools:'tl_axe_carpenter;tl_adze;tl_chisel;tl_auger_spoon;tl_wedge;tl_mallet;tl_marking_cord;tl_plumb_line;tl_saw',
  fuel_heat:'нет', season:'лес рубят зимой (меньше сока, по снегу вывозят); рубка сруба — с весны до осени',
  outputs:'pr:log_frame', waste:'щепа;обрубки;кора;стружка', skill:'master', total_duration:'weeks',
  failure_modes:'венцы не прилегают — щели;перекос сруба;гнилое бревно в нижнем венце',
  defect_signs:'свет в пазах;сруб «повело»;мягкая труха в нижних венцах',
  feasibility:'Артель плотников за недели; одиночке — только малая постройка. Нужны брёвна, топоры, разметка. Подробности постройки — у buildings_structures.',
  authenticity:'', wk:'claim:ordinary-life-carpenter-works-wood-with-tools;claim:agriculture-fauna-tow-log-gaps;claim:population-material-wood-loading;claim:reality-batch-01-wooden-joinery-can-be-unloaded-before-adjustment;claim:urban-wooden-coverings',
  sources:'src:kolchin1957-city;src:kolchin1959-iron', conf:'B', note:'Мох в пазах — кандидат (master); пакля — WK.',
  steps:[
    ['Свалить и окорить брёвна, вывезти','mt_wood_pine','mt_wood_spruce','tl_axe_carpenter','st:logs','кора, сучья','weeks','trained','','B'],
    ['Разметить и вырубить чаши и продольный паз','st:logs','','tl_axe_carpenter;tl_adze;tl_marking_cord','st:notched_logs','щепа','days','master','щели в пазах','B'],
    ['Собрать венцы, прокладывая мох или паклю, выверять отвесом','st:notched_logs','mt_moss;mt_hemp','tl_plumb_line;tl_mallet','st:raised_frame','','days','master','перекос','B'],
    ['Прорубить проёмы, вставить косяки на нагелях','st:raised_frame','','tl_saw;tl_chisel;tl_auger_spoon','pr:log_frame','обрезки','days','master','','C'],
  ]
},
{
  id:'pc_board_hewing', name_ru:'Раскол бревна и тёска досок и плах', name_en:'splitting and hewing boards', group:'carpentry', master_family:'wood_splitting_hewing',
  workplace:'town_courtyard', inputs:'mt_wood_pine;mt_wood_oak', tools:'tl_wedge;tl_mallet;tl_axe_carpenter;tl_adze;tl_workhorse',
  fuel_heat:'нет', season:'свежесрубленный лес колется легче', outputs:'pr:hewn_board', waste:'щепа;горбыль', skill:'trained', total_duration:'day',
  failure_modes:'трещина ушла в сторону — плаха короткая или кривая',
  defect_signs:'винтовой раскол;сучковатая плаха',
  feasibility:'Основной способ получать доски (механической распиловки нет); выход зависит от прямослойности бревна.',
  authenticity:'', wk:'claim:mb14-practical-wet-wood-splitting-needs-grain-and-restraint;claim:foundations-mat-01-wood-knot-strength-bonding;claim:population-material-wood-loading',
  sources:'src:master-technology-v1;src:kolchin1957-city', conf:'B', note:'',
  steps:[
    ['Закрепить бревно, наметить линию раскола по волокну','mt_wood_pine','','tl_workhorse;tl_axe_carpenter','st:marked_log','','minutes','trained','','B'],
    ['Забить клинья и расколоть на половины и плахи','st:marked_log','','tl_wedge;tl_mallet','st:split_planks','щепа','hours','trained','раскол ушёл в сторону','B'],
    ['Стесать плахи топором и теслом до ровной доски','st:split_planks','','tl_axe_carpenter;tl_adze','pr:hewn_board','щепа, горбыль','hours','trained','','B'],
  ]
},
{
  id:'pc_plank_boat', name_ru:'Постройка дощатой речной лодки', name_en:'building a plank river boat', group:'boatbuilding', master_family:'boat_shipbuilding',
  workplace:'riverbank', inputs:'pr:hewn_board;mt_wood_oak;mt_wood_pine;mt_iron;mt_hemp;mt_pine_resin;mt_pine_pitch;mt_bast_linden;mt_animal_glue', tools:'tl_axe_carpenter;tl_adze_boat;tl_auger_spoon;tl_chisel;tl_caulking_iron;tl_pitch_pot;tl_boat_stocks;tl_mallet',
  fuel_heat:'разогрев смолы и пека; распаривание досок для гибки', season:'строят на берегу в тёплое время; спуск — по высокой воде',
  outputs:'pr:plank_boat', waste:'щепа;обрезки досок;капли смолы;пакля', skill:'master', total_duration:'weeks',
  failure_modes:'течь по швам;доска треснула при гибке;корпус перекошен',
  defect_signs:'мокрые пятна и струйки внутри;треск и поводка обшивки',
  feasibility:'Работа лодейного мастера с помощниками за недели; в одиночку нереально. Нужны прямослойные доски, крепёж (деревянные нагели, железные гвозди и скобы), пакля и смола.',
  authenticity:'', wk:'claim:construction-wooden-nail-planking;claim:construction-wooden-peg-vessel-joint;claim:construction-forged-iron-nail-vessel-joint;claim:construction-tarred-tow-caulking;claim:construction-iron-clamp-caulking;claim:construction-bast-vessel-fastening;claim:construction-pine-resin-surfaces;claim:construction-animal-glue-pegged-planks;claim:construction-aspen-cladding-joint;claim:macro-b20-steam-softened-wood-needs-restraint-and-controlled-drying-to-retain-a-bend;claim:population-wood-boat',
  sources:'src:dubrovin2000-transport', conf:'B', note:'Конструктивные приёмы засвидетельствованы на лодке № 1 начала XI в. и судне XII в.; общий порядок сборки — реконструкция.',
  steps:[
    ['Вытесать киль (днище) и штевни, поставить на стапель','pr:hewn_board','mt_wood_oak','tl_axe_carpenter;tl_adze_boat;tl_boat_stocks','st:keel_set','щепа','days','master','','B'],
    ['Распарить и навесить доски обшивки, сверлить и крепить нагелями и гвоздями','st:keel_set','mt_wood_pine;mt_iron','tl_auger_spoon;tl_mallet','st:planked_hull','обрезки досок','weeks','master','трещина доски при гибке','B'],
    ['Поставить шпангоуты, привязать лыковыми вицами или нагелями','st:planked_hull','mt_bast_linden','tl_chisel;tl_auger_spoon','st:framed_hull','','days','master','','A'],
    ['Проконопатить швы просмолённой паклей, прижать планками на скобах','st:framed_hull','mt_hemp;mt_pine_resin','tl_caulking_iron;tl_mallet','st:caulked_hull','пакля','days','trained','','A'],
    ['Просмолить корпус горячим пеком','st:caulked_hull','mt_pine_pitch','tl_pitch_pot','pr:plank_boat','капли смолы','days','trained','течь при пробном спуске','B'],
  ]
},
{
  id:'pc_dugout_boat', name_ru:'Долблёная лодка-однодеревка', name_en:'dugout canoe', group:'boatbuilding', master_family:'boat_shipbuilding',
  workplace:'riverbank', inputs:'mt_wood_aspen;mt_wood_pine', tools:'tl_axe_carpenter;tl_adze_boat;tl_auger_spoon;tl_chisel',
  fuel_heat:'иногда распаривание для развода бортов (аналогия)', season:'ствол валят зимой, долбят весной-летом', outputs:'pr:dugout_boat', waste:'крупная щепа', skill:'master', total_duration:'weeks',
  failure_modes:'пробитое дно;трещина по ядру',
  defect_signs:'неравная толщина бортов;сквозная трещина',
  feasibility:'Нужен толстый прямой ствол; долбят топором и теслом. Контрольные сверлёные отверстия для толщины — аналогия.',
  authenticity:'', wk:'claim:population-wood-boat',
  sources:'src:dubrovin2000-transport;src:ethno-analogy', conf:'C', note:'Однодеревки в Новгороде — по Дубровину (класс), способ — аналогия.',
  steps:[
    ['Свалить и отесать ствол снаружи','mt_wood_aspen','','tl_axe_carpenter','st:hewn_log','щепа','days','master','','C'],
    ['Выдолбить полость теслом, выверяя толщину сверлёными отверстиями','st:hewn_log','','tl_adze_boat;tl_auger_spoon;tl_chisel','pr:dugout_boat','крупная щепа','weeks','master','пробитое дно','C'],
  ]
},
{
  id:'pc_boat_repair', name_ru:'Ремонт речного судна', name_en:'boat repair', group:'boatbuilding', master_family:'boat_shipbuilding',
  workplace:'river_wharf', inputs:'pr:damaged_boat;pr:hewn_board;mt_hemp;mt_pine_pitch;mt_iron', tools:'tl_adze_boat;tl_auger_spoon;tl_caulking_iron;tl_pitch_pot;tl_mallet',
  fuel_heat:'разогрев пека', season:'в тёплое сухое время на берегу; зимой лодки лежат', outputs:'pr:plank_boat', waste:'старая пакля;гнилые доски', skill:'trained', total_duration:'days',
  failure_modes:'течь не найдена;новая доска не встала',
  defect_signs:'сырость внутри после спуска',
  feasibility:'Обычная работа у пристани; железные скобы для ремонта судов найдены в прибрежном раскопе.',
  authenticity:'', wk:'claim:household-boat-repair-clamp;claim:final-practical-wet-wooden-hull-or-boat-seam-needs-local-inspection-before-repair-or-travel;claim:final-practical-wet-gear-and-hull-care-compete-for-space-time-and-dry-work-area',
  sources:'src:dubrovin2000-transport', conf:'A', note:'',
  steps:[
    ['Вытащить лодку, осмотреть мокрые швы и доски','pr:damaged_boat','','','st:inspected_boat','','hours','trained','','A'],
    ['Вырубить гнилое, вставить доску или скобу','st:inspected_boat','pr:hewn_board;mt_iron','tl_adze_boat;tl_auger_spoon;tl_mallet','st:patched_boat','гнилые доски','days','trained','','A'],
    ['Проконопатить и просмолить','st:patched_boat','mt_hemp;mt_pine_pitch','tl_caulking_iron;tl_pitch_pot','pr:plank_boat','старая пакля','hours','trained','','A'],
  ]
},
{
  id:'pc_wood_turning', name_ru:'Точение деревянной посуды', name_en:'wood turning of vessels', group:'woodworking_fine', master_family:'wood_turning_carving',
  workplace:'ordinary_workshop', inputs:'mt_wood_birch;mt_wood_maple', tools:'tl_axe_carpenter;tl_adze;tl_lathe;tl_turning_hook;tl_gouge;tl_carving_knife',
  fuel_heat:'нет', season:'заготовки из сырой древесины сушат медленно', outputs:'pr:turned_vessel', waste:'стружка;огрызки-центры;треснувшие заготовки', skill:'master', total_duration:'days',
  failure_modes:'заготовка треснула при сушке;прорезано дно',
  defect_signs:'радиальные трещины;дыра в дне',
  feasibility:'Нужен станок и токарь; 25+ типов точёной посуды XII в. Простые ложки и ковши — резьбой без станка (household).',
  authenticity:'', wk:'claim:household-wooden-tableware;claim:household-utensil-wood;claim:work-waste-context;wk:craft_technology:woodworked-objects-and-waste',
  sources:'src:kolchin1957-city;src:kolchin1968-wood', conf:'B', note:'',
  steps:[
    ['Вытесать болванку из чурака','mt_wood_birch','','tl_axe_carpenter;tl_adze','st:turning_blank','щепа','hours','trained','','B'],
    ['Выточить наружную и внутреннюю форму на станке','st:turning_blank','','tl_lathe;tl_turning_hook','st:turned_rough','стружка','hours','master','прорезанное дно','B'],
    ['Срезать центр, дорезать и медленно высушить','st:turned_rough','','tl_carving_knife;tl_gouge','pr:turned_vessel','огрызки','days','trained','трещины сушки','C'],
  ]
},
{
  id:'pc_cooperage', name_ru:'Бондарное дело: клёпаная кадь, ведро, бочонок', name_en:'cooperage', group:'cooperage', master_family:'cooperage_wooden_vessels',
  workplace:'ordinary_workshop', inputs:'mt_wood_oak;mt_wood_pine;mt_wood_willow', tools:'tl_axe_carpenter;tl_drawknife;tl_cooper_croze;tl_mallet;tl_wedge;tl_workhorse',
  fuel_heat:'иногда прогрев для гибки клёпок (аналогия)', season:'круглый год', outputs:'pr:stave_vessel', waste:'стружка;бракованные клёпки', skill:'master', total_duration:'days',
  failure_modes:'течь по стыкам;обруч лопнул',
  defect_signs:'мокрые полосы по стыкам клёпок',
  feasibility:'Бондарные скобели и пазники — в перечне инструментов (Колчин 1957); деревянные обручи из ивы или других прутьев.',
  authenticity:'', wk:'claim:household-utensil-wood',
  sources:'src:kolchin1957-city;src:matcult-catalog-v1', conf:'B', note:'',
  steps:[
    ['Расколоть клёпки и выстрогать их скобелем','mt_wood_oak','','tl_wedge;tl_mallet;tl_drawknife','st:staves','стружка','days','master','','B'],
    ['Собрать клёпки в обруч, стянуть временными обручами','st:staves','mt_wood_willow','tl_workhorse','st:raised_vessel','','hours','master','щели','C'],
    ['Вырезать уторы, вставить дно, набить постоянные обручи','st:raised_vessel','','tl_cooper_croze;tl_mallet','pr:stave_vessel','','hours','master','течь','B'],
  ]
},
{
  id:'pc_net_making', name_ru:'Вязание и оснастка рыболовной сети', name_en:'net making and rigging', group:'fishing', master_family:'rope_net_mat',
  workplace:'fishing_camp', inputs:'mt_hemp;mt_flax;mt_birch_bark;mt_bark_pine;mt_wood_generic;mt_fieldstone;mt_cordage;mt_bast_linden', tools:'tl_netting_needle;tl_carving_knife;tl_awl;tl_net_float;tl_net_sinker',
  fuel_heat:'нет', season:'вяжут и чинят зимой и в межсезонье; сушат после каждого лова', outputs:'pr:fishing_net', waste:'обрывки нити;старые поплавки', skill:'trained', total_duration:'weeks',
  failure_modes:'неровная ячея;узлы расползаются;сеть гниёт от сырости',
  defect_signs:'разная ячея по полотну;дыры;тёмные прелые участки',
  feasibility:'Вязание сети — долгая работа; поплавки и грузила делают сами, часто с знаками собственности (артельный лов).',
  authenticity:'', wk:'claim:population-net-cord;claim:population-net-floats;claim:population-net-weights;claim:population-processes-hemp-net;claim:practical-net-repair;claim:practical-net-dry;claim:final-practical-wet-netting-and-cordage-can-need-inspection-drying-and-repair-before-reuse',
  sources:'src:rybina2015-promysly', conf:'A', note:'',
  steps:[
    ['Ссучить сетную нить из пеньки или льна','mt_hemp','mt_flax','','st:net_twine','','days','household','','B'],
    ['Связать полотно иглой по мерке ячеи','st:net_twine','','tl_netting_needle','st:net_panel','обрывки','weeks','trained','разная ячея','A'],
    ['Сделать поплавки (скрученные и плоские берестяные, из коры, деревянные)','st:net_panel','mt_birch_bark;mt_bark_pine;mt_wood_generic;mt_bast_linden','tl_carving_knife;tl_awl','st:panel_with_floats','обрезки бересты','hours','household','','A'],
    ['Привязать к подборам поплавки и каменные грузила на ремешках или верёвке','st:panel_with_floats','mt_fieldstone;mt_cordage','tl_net_float;tl_net_sinker','pr:fishing_net','','hours','trained','','A'],
  ]
},
{
  id:'pc_bark_float', name_ru:'Плоский берестяной поплавок со знаком собственности', name_en:'flat birch-bark net float with owner mark', group:'fishing', master_family:'bark_birch_work',
  workplace:'fishing_camp', inputs:'mt_birch_bark;mt_bast_linden', tools:'tl_carving_knife;tl_awl',
  fuel_heat:'нет', season:'берёста лучше снимается летом', outputs:'pr:net_float', waste:'обрезки бересты', skill:'household', total_duration:'hour',
  failure_modes:'слои расслоились',
  defect_signs:'расползающийся шов',
  feasibility:'Нужны острый нож и инструмент для отверстий; знак (рисунок, буквы, надпись) вырезают или процарапывают на одной или обеих сторонах.',
  authenticity:'@rus/items-property', wk:'claim:population-bark-input;claim:population-bark-cut;claim:population-bark-pierce;claim:population-bark-bast',
  sources:'src:rybina2015-promysly', conf:'A', note:'Размер ~10×12 см, отверстие в 1–2 см от края.',
  steps:[
    ['Вырезать два и более овальных слоя бересты','mt_birch_bark','','tl_carving_knife','st:bark_layers','обрезки','minutes','household','','A'],
    ['Проколоть отверстия по краю и в центре, сшить лыком','st:bark_layers','mt_bast_linden','tl_awl','st:sewn_float','','minutes','household','','A'],
    ['Прорезать отверстие для крепления, нанести знак собственности','st:sewn_float','','tl_carving_knife','pr:net_float','','minutes','household','','A'],
  ]
},
{
  id:'pc_fish_trap', name_ru:'Плетение верши', name_en:'weaving a wicker fish trap', group:'fishing', master_family:'rope_net_mat',
  workplace:'riverbank', inputs:'mt_wood_willow;mt_bast_linden;mt_water', tools:'tl_knife_utility;tl_billhook',
  fuel_heat:'нет', season:'прут режут поздней осенью или ранней весной; сухой прут вымачивают', outputs:'pr:fish_trap', waste:'обрезки прута', skill:'household', total_duration:'day',
  failure_modes:'прут ломается при гибке',
  defect_signs:'трещины на изгибах',
  feasibility:'Простая крестьянская работа; верша названа в грамоте № 248.',
  authenticity:'', wk:'claim:final-static-b01-willow-selection;claim:final-static-b01-willow-preparation;claim:final-static-b01-willow-limits;claim:macro-b19-dried-willow-rods-can-be-moistened-for-flexible-basket-work;claim:population-rod-input;claim:population-rod-cord',
  sources:'src:rybina2015-promysly;src:ethno-analogy', conf:'B', note:'',
  steps:[
    ['Нарезать и рассортировать ивовый прут, сухой — вымочить','mt_wood_willow','mt_water','tl_billhook','st:rods','обрезки','hours','household','ломкий прут','B'],
    ['Сплести конус с горловиной и обручами, связать лыком','st:rods','mt_bast_linden','tl_knife_utility','pr:fish_trap','обрезки','hours','household','','C'],
  ]
},
{
  id:'pc_self_bow', name_ru:'Охотничий лук из цельного ясеня и стрелы', name_en:'ash self bow and wooden arrows', group:'hunting', master_family:'wood_turning_carving',
  workplace:'town_courtyard', inputs:'mt_wood_ash;mt_wood_pine;mt_cordage;mt_bone', tools:'tl_axe_household;tl_drawknife;tl_carving_knife;tl_bow_drill',
  fuel_heat:'нет (сушка заготовки)', season:'заготовку рубят зимой и сушат', outputs:'pr:hunting_bow', waste:'стружка', skill:'trained', total_duration:'weeks',
  failure_modes:'плечо треснуло при натяге;лук «сел» (потерял силу)',
  defect_signs:'трещины на спинке;плечи не возвращаются в форму',
  feasibility:'Простой охотничий лук (87 см, второй четверти XIII в.) реалистичен для охотника. Боевой сложносоставной лук — специалист и привоз; права на оружие — weapons_armour.',
  authenticity:'', wk:'claim:agriculture-fauna-ash-hunting-bow;claim:population-material-wood-loading',
  sources:'src:rybina2015-promysly', conf:'B', note:'Порядок работ — реконструкция; форма лука и стрел — A.',
  steps:[
    ['Выколоть и высушить ясеневую заготовку','mt_wood_ash','','tl_axe_household','st:bow_stave','щепа','weeks','trained','','C'],
    ['Выстрогать плечи, перехват и рога, слегка отогнуть концы','st:bow_stave','','tl_drawknife;tl_carving_knife','st:shaped_bow','стружка','days','trained','трещины','B'],
    ['Натянуть тетиву, выстрогать стрелы с утолщением или костяным навершием','st:shaped_bow','mt_cordage;mt_wood_pine;mt_bone','tl_carving_knife;tl_bow_drill','pr:hunting_bow','стружка','days','trained','лук сел','B'],
  ]
},
{
  id:'pc_birchbark_letter', name_ru:'Письмо на бересте', name_en:'writing a birch-bark letter', group:'writing_seals', master_family:'writing_bookmaking',
  workplace:'dwelling_interior', inputs:'mt_birch_bark;mt_water', tools:'tl_knife_utility;tl_stylus',
  fuel_heat:'иногда проваривание бересты для мягкости (аналогия)', season:'круглый год', outputs:'pr:birchbark_letter', waste:'обрезки бересты;испорченные листы', skill:'trained', total_duration:'minutes',
  failure_modes:'береста расслоилась;ошибка в тексте',
  defect_signs:'зачёркивания, прорезы',
  feasibility:'Грамотность в Новгороде 1230 г. широко распространена среди горожан; писало и береста — дешёвые. Содержание текста (имена, долги, даты) задаётся пулами кода, не LLM; подлинность и сила документа — @rus/social-law.',
  authenticity:'@rus/social-law', wk:'claim:gramota-73-debt-record',
  sources:'src:kyy1985-applied;src:rybina2015-promysly', conf:'A', note:'',
  steps:[
    ['Подготовить лист: снять наружный слой, обрезать','mt_birch_bark','mt_water','tl_knife_utility','st:prepared_bark','обрезки','minutes','household','','B'],
    ['Процарапать текст писалом','st:prepared_bark','','tl_stylus','pr:birchbark_letter','','minutes','trained','','A'],
  ]
},
{
  id:'pc_ownership_mark', name_ru:'Нанесение знака собственности или надписи на вещь', name_en:'marking ownership signs or inscriptions on objects', group:'writing_seals', master_family:'repair_reuse_recycling',
  workplace:'town_courtyard', inputs:'pr:unmarked_object', tools:'tl_carving_knife;tl_stylus;tl_awl',
  fuel_heat:'нет', season:'круглый год', outputs:'pr:marked_object', waste:'стружка', skill:'household', total_duration:'minutes',
  failure_modes:'знак нечитаем',
  defect_signs:'свежие края прорези отличаются по цвету от старой поверхности',
  feasibility:'Знаки и надписи вырезают или процарапывают на поплавках, пряслицах, бирках, деревянных цилиндрах-замках. Свежая переделка чужого знака заметна по свежим краям и цвету прорези. Какие знаки и тексты бывают — пулы item_marks_text_pools; чья вещь — @rus/items-property.',
  authenticity:'@rus/items-property', wk:'claim:work-waste-context',
  sources:'src:rybina2015-promysly;src:kyy1985-applied', conf:'B', note:'Признак свежести прорези — наблюдение общего характера (C).',
  steps:[
    ['Вырезать или процарапать знак или надпись','pr:unmarked_object','','tl_carving_knife;tl_stylus;tl_awl','pr:marked_object','стружка','minutes','household','','B'],
  ]
},
{
  id:'pc_lime_burning', name_ru:'Обжиг и гашение извести', name_en:'lime burning and slaking', group:'masonry', master_family:'lime_mortar_plaster',
  workplace:'town_courtyard', inputs:'mt_limestone;mt_firewood;mt_water;mt_quartz_sand', tools:'tl_kiln;tl_spade;tl_bucket;tl_clay_trough',
  fuel_heat:'длительный сильный обжиг известняка', season:'строительный сезон; свежая известковая работа боится мороза и дождя',
  outputs:'pr:lime_mortar', waste:'недожог;зола', skill:'specialist', total_duration:'weeks',
  failure_modes:'недожог — камень не гасится;ожоги при гашении',
  defect_signs:'твёрдые куски в тесте;раствор осыпается',
  feasibility:'Нужна для каменных церквей и штукатурки (Георгиевский собор XII в.); не для обычной избы. Гашение опасно (жар, едкость).',
  authenticity:'', wk:'claim:lime-transformations;claim:static-nonhydraulic-lime-can-harden-by-carbonation;claim:streak01-lime-weather;claim:streak01-wet-lime-contact;claim:pigment-lime-plaster',
  sources:'src:kyy1985-applied', conf:'C', note:'Устройство известеобжигательной печи для Новгорода XIII в. не выписано.',
  steps:[
    ['Нагрузить печь известняком и дровами, обжигать','mt_limestone','mt_firewood','tl_kiln','st:quicklime','зола, недожог','days','specialist','','C'],
    ['Гасить водой в яме или корыте, выдерживать','st:quicklime','mt_water','tl_clay_trough;tl_bucket','st:slaked_lime','пар','weeks','specialist','ожоги, куски','B'],
    ['Замешать с песком','st:slaked_lime','mt_quartz_sand','tl_spade;tl_clay_trough','pr:lime_mortar','','hours','trained','','C'],
  ]
},
{
  id:'pc_wax_candle', name_ru:'Восковая свеча из пластины', name_en:'rolled wax candle', group:'wax', master_family:'writing_bookmaking',
  workplace:'monastery_yard', inputs:'pr:honeycomb;mt_beeswax;mt_flax;mt_water;mt_firewood', tools:'tl_dye_pot;tl_knife_utility',
  fuel_heat:'мягкий нагрев воска на воде', season:'воск — после выемки мёда (конец лета, осень)', outputs:'pr:wax_candle', waste:'вытопки (мерва)', skill:'trained', total_duration:'hours',
  failure_modes:'воск перегрелся и потемнел;свеча коптит — фитиль толстый',
  defect_signs:'тёмный воск с запахом гари;коптящее пламя',
  feasibility:'Воск — ценный товар (экспорт Новгорода); свечи нужны церкви. Гнёздовский способ — свёрнутая пластина с фитилём из крученых нитей.',
  authenticity:'', wk:'claim:r7-gentle-warming-of-beeswax-comb-can-separate-some-liquid-wax-from-coarse-debris;claim:candle-rolled-plate;claim:candle-wax-material;claim:candle-thread-wick;claim:trade-economy-wax-lot-quality-can-use-observable-purity-colour-and-sample-limits',
  sources:'src:rybina2015-promysly', conf:'B', note:'Способ по Гнёздову X в. — ранний древнерусский аналог.',
  steps:[
    ['Мягко растопить соты и отделить воск от мусора','pr:honeycomb','mt_water;mt_firewood','tl_dye_pot','st:clean_wax','мерва','hours','trained','перегрев','B'],
    ['Раскатать тёплую пластину воска','st:clean_wax','','tl_knife_utility','st:wax_sheet','','minutes','trained','','B'],
    ['Скрутить фитиль из нитей, свернуть пластину вокруг него, прижать края','st:wax_sheet','mt_flax','','pr:wax_candle','','minutes','trained','коптит','A'],
  ]
},
];
