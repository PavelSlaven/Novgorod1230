// Technological chains, part D: timber, street paving, sledges, sewing, small leather goods.
// Step tuple: [action_ru, in_state, extra_inputs(;), tools(;), out_state, waste(;), duration_band, skill, checks_and_defects_ru, confidence]
module.exports = [
{
  id:'pc_timber_felling', name_ru:'Валка леса и вывоз брёвен', name_en:'timber felling and hauling', group:'carpentry', master_family:'timber_felling_conversion',
  workplace:'conifer_woodland', inputs:'mt_wood_pine;mt_wood_spruce', tools:'tl_axe_carpenter;tl_axe_household;tl_wedge;tl_rope_coil;tl_drawknife',
  fuel_heat:'нет', season:'зимой: меньше сока, по снегу брёвна вывозят на санях; весной дороги непроезжи', outputs:'pr:log', waste:'сучья;вершины;кора;пни', skill:'trained', total_duration:'days',
  failure_modes:'дерево упало не туда;зажим топора;ствол треснул при падении', defect_signs:'расщеп комля;трещины по стволу',
  feasibility:'Нужны топор, помощники и право рубить в этом лесу (угодья — social-law). Одно бревно одиночке посильно, сруб — артели.',
  authenticity:'', wk:'claim:population-material-wood-loading;claim:structural-and-object-wood;claim:transport-sledge-summer-cargo',
  sources:'src:kolchin1957-city;src:ethno-analogy', conf:'C', note:'Зимняя рубка — этнографическая норма; для 1230 г. прямо не засвидетельствована.',
  steps:[
    ['Выбрать прямое дерево, подрубить и свалить','mt_wood_pine','mt_wood_spruce','tl_axe_carpenter;tl_wedge','st:felled_tree','щепа','hours','trained','расщеп комля','C'],
    ['Обрубить сучья и вершину, окорить','st:felled_tree','','tl_axe_household;tl_drawknife','st:trimmed_log','сучья, кора','hours','household','','C'],
    ['Вывезти бревно волоком или на санях','st:trimmed_log','','tl_rope_coil','pr:log','','day','household','','C'],
  ]
},
{
  id:'pc_street_paving', name_ru:'Устройство и ремонт деревянной мостовой', name_en:'laying and repairing a timber street pavement', group:'carpentry', master_family:'roads_bridges_waterfront',
  workplace:'town_street', inputs:'pr:log;pr:hewn_board', tools:'tl_axe_carpenter;tl_adze;tl_wedge;tl_mallet;tl_spade',
  fuel_heat:'нет', season:'тёплое время; весной мостовые подмывает, и они проседают', outputs:'pr:street_pavement', waste:'старые плахи;щепа;грязь', skill:'trained', total_duration:'weeks',
  failure_modes:'плахи расходятся;проседание над гнилыми лагами', defect_signs:'щели и провалы, хлюпающая грязь',
  feasibility:'Общественная работа улицы или конца; частному лицу — только малый ремонт у своего двора. Новые ярусы клали поверх старых.',
  authenticity:'', wk:'claim:urban-pavements;claim:novgorod-wooden-urban-elements;claim:urban-wooden-coverings',
  sources:'src:master-technology-v1', conf:'B', note:'Способ (лаги вдоль, плахи поперёк) — общеизвестная новгородская археология; выборка из отчётов не делалась.',
  steps:[
    ['Уложить продольные лаги на выровненный грунт или старую мостовую','pr:log','','tl_spade;tl_axe_carpenter','st:laid_sleepers','грязь','days','trained','','B'],
    ['Настелить поперёк расколотые плахи плоской стороной вверх','st:laid_sleepers','pr:hewn_board','tl_adze;tl_mallet','pr:street_pavement','щепа, старые плахи','days','trained','щели','B'],
  ]
},
{
  id:'pc_sledge_making', name_ru:'Изготовление саней и полозьев', name_en:'sledge making', group:'carpentry', master_family:'cart_sledge_wheel',
  workplace:'town_courtyard', inputs:'mt_wood_birch;mt_wood_oak;mt_bast_linden;mt_rawhide', tools:'tl_axe_carpenter;tl_adze;tl_drawknife;tl_auger_spoon;tl_chisel;tl_mallet',
  fuel_heat:'распаривание для гибки полозьев (аналогия)', season:'делают к зиме; сани ходят и летом с грузом', outputs:'pr:sledge', waste:'стружка;щепа', skill:'trained', total_duration:'days',
  failure_modes:'полоз треснул;соединения расшатались', defect_signs:'трещина на загибе полоза;люфт копыльев',
  feasibility:'Сани делали из дерева (WK); соединение на нагелях и вязках; упряжь — transport_travel.',
  authenticity:'', wk:'claim:population-wood-sledge;claim:transport-sledge-summer-cargo;claim:macro-b20-steam-softened-wood-needs-restraint-and-controlled-drying-to-retain-a-bend;claim:r401-wood-drying-can-loosen-wheel-fit',
  sources:'src:dubrovin2000-transport', conf:'C', note:'Конструкция по Дубровину не выписана; шаги — реконструкция.',
  steps:[
    ['Вытесать и согнуть полозья','mt_wood_birch','','tl_axe_carpenter;tl_adze;tl_drawknife','st:runners','стружка','days','trained','трещина на загибе','C'],
    ['Врезать копылья, наложить настил, связать и сшить нагелями','st:runners','mt_wood_oak;mt_bast_linden;mt_rawhide','tl_auger_spoon;tl_chisel;tl_mallet','pr:sledge','щепа','days','trained','люфт','C'],
  ]
},
{
  id:'pc_sewing_mending', name_ru:'Раскрой, шитьё и починка одежды', name_en:'cutting, sewing and mending clothes', group:'sewing', master_family:'sewing_mending',
  workplace:'dwelling_interior', inputs:'pr:woven_cloth;pr:yarn', tools:'tl_shears;tl_sewing_needle;tl_knife_utility',
  fuel_heat:'нет', season:'круглый год; больше зимой', outputs:'pr:garment', waste:'обрезки ткани;лоскуты', skill:'household', total_duration:'days',
  failure_modes:'ошибка раскроя — не хватает ткани;шов расходится', defect_signs:'перекос, короткие рукава;рвётся по шву',
  feasibility:'Домашняя работа; раскрой расходует ткань, обрезки идут на заплаты. Выкройка — у clothing.',
  authenticity:'', wk:'claim:practical-textile-cut;claim:practical-textile-sew;claim:practical-textile-repair',
  sources:'src:matcult-catalog-v1', conf:'B', note:'',
  steps:[
    ['Разметить и раскроить полотно на детали','pr:woven_cloth','','tl_shears;tl_knife_utility','st:cut_pieces','обрезки','hours','household','','A'],
    ['Сшить детали, подрубить края, вшить ластовицы','st:cut_pieces','pr:yarn','tl_sewing_needle','pr:garment','лоскуты','days','household','расходящийся шов','A'],
  ]
},
{
  id:'pc_leather_goods', name_ru:'Кожаные ножны, кошели и ремни', name_en:'leather sheaths, pouches and belts', group:'shoemaking', master_family:'leather_cut_sew',
  workplace:'ordinary_workshop', inputs:'mt_leather_veg;mt_flax;mt_beeswax', tools:'tl_shoe_knife;tl_awl;tl_leather_needle;tl_wax_block;tl_stamp_leather',
  fuel_heat:'нет', season:'круглый год', outputs:'pr:leather_small_goods', waste:'обрезки кожи', skill:'trained', total_duration:'hours',
  failure_modes:'ножны не по клинку;шов разошёлся', defect_signs:'клинок болтается или не входит',
  feasibility:'Ножны 15–21 см из одной сложенной полосы, с тиснением с XII в.; ремни 1,7–3,5 см (Изюмова через конспект).',
  authenticity:'', wk:'claim:population-leather-case;claim:population-leather-straps;claim:practical-leather-cut;claim:practical-leather-stitch',
  sources:'src:izumova1959-leather', conf:'B', note:'',
  steps:[
    ['Раскроить полосу или детали по вещи (клинку, поясу)','mt_leather_veg','','tl_shoe_knife','st:cut_leather','обрезки','hour','trained','','B'],
    ['Сшить навощённой нитью, оттиснуть узор','st:cut_leather','mt_flax;mt_beeswax','tl_awl;tl_leather_needle;tl_wax_block;tl_stamp_leather','pr:leather_small_goods','','hours','trained','расходящийся шов','B'],
  ]
},
];
