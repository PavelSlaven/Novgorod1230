// Technological chains, part A: metal (bloomery, forging, heat treatment, casting, jewelry, seals).
// Step tuple: [action_ru, in_state, extra_inputs(;), tools(;), out_state, waste(;), duration_band, skill, checks_and_defects_ru, confidence]
// States: mt_* = registry material; st:* = intermediate state inside this chain; pr:* = final product (item category, resolved by items domains).
// duration_band: minutes|hour|hours|day|days|weeks|months|season ; skill: household|trained|master|specialist
module.exports = [
{
  id:'pc_bloomery_iron', name_ru:'Кричное железо из болотной руды', name_en:'bloomery iron from bog ore', group:'metallurgy', master_family:'iron_bloomery',
  workplace:'forest_edge', inputs:'mt_bog_ore;mt_charcoal;mt_clay_refractory;mt_firewood', tools:'tl_ore_basket;tl_bloomery_furnace;tl_bellows;tl_tuyere;tl_smith_tongs;tl_sledgehammer',
  fuel_heat:'древесный уголь, принудительное дутьё мехами; жар по цвету и поведению шлака, без измерения температуры',
  season:'добыча руды — в сухое время года (летом и осенью болото доступнее); плавка — вне сильных дождей; зимой затруднён доступ к болоту',
  outputs:'mt_bloom_iron', waste:'mt_forge_slag;шлаковые лепёшки;обломки обмазки горна;пережжённая руда', skill:'specialist', total_duration:'weeks',
  failure_modes:'руда не восстановилась — вышел шлак без железа;крица рыхлая, распадается при проковке;горн прогорел или обвалился;мехи не дали дутья',
  defect_signs:'много стекловидного шлака и мало губчатого металла;крица крошится под молотом;трещины и прогар в стенке горна',
  feasibility:'Нужны разведанная болотная руда, уголь в количестве, многократно превышающем руду, построенный горн, мехи и работник, умеющий вести плавку. Одиночная попытка без опыта почти наверняка даёт шлак. В городе этим обычно не занимались: железо привозили сельские металлурги.',
  authenticity:'', wk:'claim:occupation-smith-iron-input;claim:population-material-wood-pyrolysis;claim:fuel-charcoal-metallurgy-fuel',
  sources:'src:kolchin1953-metallurgy;src:kolchin1959-iron', conf:'B', note:'Соотношения руда/уголь/выход и длительность плавки не приводятся: числа не выписаны из первоисточника.',
  steps:[
    ['Найти и накопать болотную руду у ручьёв и в торфе','mt_bog_ore','','tl_ore_basket','st:raw_ore','торф и дёрн','days','trained','руда — ржаво-бурые комки; пустой торф не годится','B'],
    ['Просушить и обжечь руду на костре, раздробить','st:raw_ore','mt_firewood','tl_sledgehammer','st:roasted_ore','зола, пустая порода','days','trained','недожжённая руда сырая и вязкая','C'],
    ['Сложить или подновить горн, обмазать огнеупорной глиной, вставить сопло','st:roasted_ore','mt_clay_refractory;mt_fieldstone','tl_bloomery_furnace;tl_tuyere','st:charged_furnace','','day','specialist','трещины обмазки дают прогар','C'],
    ['Разжечь уголь и загружать руду с углём слоями, непрерывно дуть мехами','st:charged_furnace','mt_charcoal','tl_bellows','st:furnace_run','шлак вытекает и застывает лепёшками','hours','specialist','без ровного дутья восстановление не идёт','B'],
    ['Вскрыть горн и извлечь раскалённую крицу клещами','st:furnace_run','','tl_smith_tongs','st:hot_bloom','обломки стенки горна','minutes','specialist','крица — рыхлый ком со шлаком и углём','B'],
    ['Уплотнить крицу ударами, выжимая шлак','st:hot_bloom','','tl_sledgehammer;tl_anvil','mt_bloom_iron','брызги шлака, окалина','hours','specialist','распадается — слишком много шлака','B'],
  ]
},
{
  id:'pc_smith_forging', name_ru:'Кузнечная ковка железного изделия', name_en:'forging a wrought-iron object', group:'smithing', master_family:'iron_forging',
  workplace:'smithy', inputs:'mt_bloom_iron;mt_iron;mt_charcoal;mt_water', tools:'tl_forge_hearth;tl_bellows;tl_anvil;tl_smith_hammer;tl_sledgehammer;tl_smith_tongs;tl_smith_chisel;tl_punch;tl_quench_tub',
  fuel_heat:'древесный уголь в горне с мехами; нагрев до ковочного жара по цвету; остывшую заготовку возвращают в горн',
  season:'круглый год под крышей; сырой уголь сначала сушат',
  outputs:'pr:forged_iron_object', waste:'mt_forge_slag;обсечки;зола;остатки угля', skill:'trained', total_duration:'hours',
  failure_modes:'пережог металла;заковы и расслоения;трещина при гибке остывшей заготовки;недогрев — металл не тянется',
  defect_signs:'искристый пережжённый край, крупное зерно в изломе;видимые расслоения и складки;трещины на изгибе',
  feasibility:'Нужны горн, мехи, наковальня, клещи, молот, сухой уголь и железо. Простые вещи (гвоздь, скоба, крюк, дужка) реалистичны для обученного подмастерья за часы. Без горна и мехов железо не куют.',
  authenticity:'', wk:'claim:mb14-practical-iron-workability-is-qualitative-not-temperature;claim:ordinary-life-smith-anvil-hammer-tongs;claim:ordinary-life-smith-forge-and-bellows;claim:ordinary-life-smith-leaves-scale-ash-offcuts;claim:ordinary-life-smith-needs-iron-and-fuel;claim:macro-b21-wet-charcoal-needs-drying-or-heat-management-before-reliable-hot-forge-work;claim:static-forge-welding-pressure-depends-on-temperature-and-material',
  sources:'src:kolchin1959-iron;src:kolchin1957-city', conf:'A', note:'',
  steps:[
    ['Разжечь горн, наладить дутьё, просушить уголь','mt_charcoal','','tl_forge_hearth;tl_bellows','st:working_fire','дым, зола','hour','trained','влажный уголь дымит и не даёт жара','A'],
    ['Нагреть железную заготовку до ковочного жара','st:working_fire','mt_iron','tl_smith_tongs','st:hot_stock','окалина','minutes','trained','белое искрение — пережог','A'],
    ['Оттянуть, осадить, согнуть заготовку на наковальне, повторяя нагревы','st:hot_stock','','tl_anvil;tl_smith_hammer;tl_sledgehammer','st:rough_form','окалина','hours','trained','трещина на остывшем металле; заковы','A'],
    ['Пробить отверстия и отрубить лишнее','st:rough_form','','tl_punch;tl_smith_chisel','st:shaped_object','обсечки','minutes','trained','смятые края отверстий','A'],
    ['Выправить и остудить на воздухе или в воде','st:shaped_object','mt_water','tl_quench_tub','pr:forged_iron_object','','minutes','trained','поводка после остывания','A'],
  ]
},
{
  id:'pc_welded_steel_edge', name_ru:'Изготовление орудия с наварным стальным лезвием и закалкой', name_en:'edge tool with welded steel blade and heat treatment', group:'smithing', master_family:'iron_heat_treatment',
  workplace:'smithy', inputs:'mt_iron;mt_steel;mt_charcoal;mt_water;mt_quartz_sand', tools:'tl_forge_hearth;tl_bellows;tl_anvil;tl_smith_hammer;tl_smith_tongs;tl_smith_chisel;tl_quench_tub;tl_grinding_wheel;tl_whetstone;tl_file',
  fuel_heat:'горн на угле с мехами; сварочный жар выше ковочного; закалка в воде; отпуск по цветам побежалости',
  season:'круглый год',
  outputs:'pr:edge_tool', waste:'mt_forge_slag;точильная пыль и шлам;обсечки', skill:'master', total_duration:'day',
  failure_modes:'стальная полоса не сварилась с основой;трещина закалки;перекал — лезвие крошится;недокал — лезвие мнётся;пережог стали',
  defect_signs:'видимый шов с чернотой или отслоением на лезвии;волосная трещина после закалки;выкрашивание кромки;кромка заминается о дерево',
  feasibility:'Требует мастера: сварку разнородных полос и закалку не выполнить без навыка. Топор, нож, тесло, долото, серп, коса делались так (Колчин). Для оружия — тот же процесс плюс заготовка стали; право носить оружие решает weapons_armour и social-law, а не процесс.',
  authenticity:'', wk:'claim:occupation-smith-heat-treatment;claim:population-joining-steel-quench;claim:population-joining-steel-temper;claim:harvest-scythe-iron-steel-specimen;claim:casting-firesteel-steel;claim:static-forge-welding-pressure-depends-on-temperature-and-material',
  sources:'src:kolchin1959-iron;src:kolchin1957-city', conf:'A', note:'Колчин 1957: многослойные лезвия из 3 или 5 пластин с высокоуглеродистой сталью в середине.',
  steps:[
    ['Отковать железную основу (обух, тело) с пазом или площадкой под сталь','mt_iron','mt_charcoal','tl_forge_hearth;tl_anvil;tl_smith_hammer;tl_smith_tongs','st:iron_body','окалина','hours','master','','A'],
    ['Подготовить стальную полосу и вложить её в паз или наложить на край','st:iron_body','mt_steel','tl_smith_chisel;tl_smith_tongs','st:assembled_blank','обсечки','minutes','master','зазоры между полосами','A'],
    ['Нагреть до сварочного жара с флюсом-песком и сварить ударами','st:assembled_blank','mt_quartz_sand','tl_forge_hearth;tl_bellows;tl_smith_hammer','st:welded_blank','шлак, искры','hour','master','несварившийся шов виден как тёмная линия','A'],
    ['Отковать форму лезвия, оттянуть кромку','st:welded_blank','','tl_anvil;tl_smith_hammer','st:forged_tool','окалина','hours','master','','A'],
    ['Закалить рабочую часть в воде','st:forged_tool','mt_water','tl_quench_tub;tl_smith_tongs','st:hardened_tool','пар','minutes','master','трещина закалки, поводка','A'],
    ['Отпустить нагревом до нужного цвета','st:hardened_tool','','tl_forge_hearth','st:tempered_tool','','minutes','master','перегрев снимает закалку','B'],
    ['Заточить на круге и оселке, насадить рукоять','st:tempered_tool','mt_wood_birch','tl_grinding_wheel;tl_whetstone;tl_file','pr:edge_tool','точильный шлам, стружка рукояти','hours','trained','','A'],
  ]
},
{
  id:'pc_carburizing', name_ru:'Науглероживание (цементация) железа', name_en:'carburizing iron into steel', group:'smithing', master_family:'iron_heat_treatment',
  workplace:'smithy', inputs:'mt_iron;mt_charcoal;mt_salt;mt_clay_refractory', tools:'tl_carburizing_pot;tl_forge_hearth;tl_bellows;tl_smith_tongs',
  fuel_heat:'длительный нагрев в горне закрытого сосуда с угольной засыпкой',
  season:'круглый год', outputs:'mt_steel', waste:'разбитый сосуд;зола', skill:'master', total_duration:'day',
  failure_modes:'сосуд треснул — металл окислился;науглероживание только поверхностное;пережог',
  defect_signs:'окалина вместо светлой поверхности;после закалки кромка мягкая',
  feasibility:'Мастерская операция; без знания рецептуры и длительного жара результат непредсказуем.',
  authenticity:'', wk:'claim:population-material-wood-pyrolysis',
  sources:'src:kolchin1959-iron', conf:'B', note:'Уголь и поваренная соль в глиняных сосудах — по конспекту Колчина; длительность не выписана.',
  steps:[
    ['Уложить железные полосы в глиняный сосуд с толчёным углём и солью, замазать','mt_iron','mt_charcoal;mt_salt;mt_clay_refractory','tl_carburizing_pot','st:sealed_pot','','hour','master','щели в обмазке','B'],
    ['Держать сосуд в жару горна долгое время','st:sealed_pot','mt_charcoal','tl_forge_hearth;tl_bellows','st:carburized_pot','зола','hours','master','трещина сосуда','C'],
    ['Разбить сосуд и извлечь полосы','st:carburized_pot','','tl_smith_tongs','mt_steel','черепки сосуда','minutes','master','светлая поверхность без окалины','C'],
  ]
},
{
  id:'pc_nail_forging', name_ru:'Ковка гвоздей в гвоздильне', name_en:'forging nails with a nail header', group:'smithing', master_family:'iron_forging',
  workplace:'smithy', inputs:'mt_iron;mt_charcoal', tools:'tl_forge_hearth;tl_bellows;tl_anvil;tl_smith_hammer;tl_smith_chisel;tl_nail_header;tl_smith_tongs',
  fuel_heat:'горн, ковочный жар', season:'круглый год', outputs:'pr:forged_nail', waste:'обсечки;окалина', skill:'trained', total_duration:'hours',
  failure_modes:'стержень застрял в гвоздильне;шляпка кривая или трескается',
  defect_signs:'кривая шляпка;расслоение стержня',
  feasibility:'Рутинная работа подмастерья при горне и гвоздильне; гвоздочники — отдельная специальность XII в.',
  authenticity:'', wk:'claim:construction-forged-iron-nail-vessel-joint',
  sources:'src:kolchin1959-iron;src:kolchin1957-city', conf:'A', note:'',
  steps:[
    ['Оттянуть железный пруток','mt_iron','mt_charcoal','tl_forge_hearth;tl_anvil;tl_smith_hammer','st:nail_rod','окалина','hour','trained','','A'],
    ['Заострить конец и надрубить стержень на длину гвоздя','st:nail_rod','','tl_smith_hammer;tl_smith_chisel','st:nail_blank','','minutes','trained','','B'],
    ['Вставить в гвоздильню, отломить и расклепать шляпку','st:nail_blank','','tl_nail_header;tl_smith_hammer','pr:forged_nail','обсечки','minutes','trained','кривая шляпка','B'],
  ]
},
{
  id:'pc_iron_repair', name_ru:'Починка и перековка железной вещи', name_en:'repair and reforging of iron objects', group:'smithing', master_family:'iron_finishing_repair',
  workplace:'smithy', inputs:'pr:worn_iron_object;mt_iron;mt_charcoal', tools:'tl_forge_hearth;tl_bellows;tl_anvil;tl_smith_hammer;tl_smith_tongs;tl_grinding_wheel;tl_file',
  fuel_heat:'горн', season:'круглый год', outputs:'pr:repaired_iron_object', waste:'окалина;обломки', skill:'trained', total_duration:'hours',
  failure_modes:'вещь не подлежит сварке — ломается снова;при нагреве отпускается закалка лезвия',
  defect_signs:'шов наварки виден;лезвие после починки мягкое',
  feasibility:'Заказы мастера часто состоят из починки (WK); поломанную вещь чаще перековывают в меньшую или меняют деталь.',
  authenticity:'', wk:'claim:ordinary-life-craftsman-income-varies-with-orders;claim:final-practical-worn-fastening-or-covering-can-be-limited-repaired-replaced-or-deferred-conditionally',
  sources:'src:kolchin1959-iron;src:master-technology-v1', conf:'B', note:'',
  steps:[
    ['Осмотреть вещь и решить: сварить, наварить, перековать или разобрать на лом','pr:worn_iron_object','','tl_file','st:assessed_object','','minutes','trained','скрытую трещину по внешнему виду не установить','B'],
    ['Нагреть и наварить или выправить повреждённую часть','st:assessed_object','mt_iron;mt_charcoal','tl_forge_hearth;tl_bellows;tl_anvil;tl_smith_hammer;tl_smith_tongs','st:reforged_object','окалина','hours','trained','','B'],
    ['Заточить или зачистить','st:reforged_object','','tl_grinding_wheel;tl_file','pr:repaired_iron_object','точильный шлам','hour','trained','','B'],
  ]
},
{
  id:'pc_nonferrous_casting', name_ru:'Литьё цветного металла в каменную или глиняную форму', name_en:'non-ferrous casting in stone or clay moulds', group:'casting_jewelry', master_family:'nonferrous_casting',
  workplace:'ordinary_workshop', inputs:'mt_copper;mt_bronze;mt_brass;mt_lead;mt_tin;mt_silver;mt_charcoal;mt_clay_refractory', tools:'tl_mould_stone;tl_mould_clay;tl_crucible;tl_crucible_tongs;tl_ladle_pouring;tl_bellows;tl_blowpipe;tl_file;tl_burnisher;tl_graver;tl_jeweler_scales',
  fuel_heat:'малый горн или очаг с углём и дутьём; тигель в угле',
  season:'круглый год', outputs:'pr:cast_ornament', waste:'литники;брак литья;брызги металла;разбитые тигли и формы', skill:'master', total_duration:'day',
  failure_modes:'металл не заполнил форму;пористая отливка;треснула каменная форма;тигель лопнул',
  defect_signs:'недолив, раковины и пузыри;облой по шву створок;следы литника не зачищены',
  feasibility:'Нужны металл (привозной), тигель, форма и умение резать форму. Копия чужой вещи отливается по оттиску в глину — рельеф получается мягче и мельче оригинала (усадка, потеря деталей); это важно для подделок: решение о подлинности — у @rus/items-property.',
  authenticity:'@rus/items-property', wk:'claim:casting-defective-casting;claim:casting-sprue;claim:casting-copper;claim:casting-bronze;claim:casting-brass;claim:casting-lead;claim:casting-tin;claim:casting-gold;claim:casting-casting-crucible;claim:casting-casting-mould;claim:casting-pouring-ladle;claim:population-joining-metal-melt;claim:metal-classes-composition',
  sources:'src:iaran-desyatinny;src:sedova1981-jewelry', conf:'A', note:'Состав сплавов конкретной вещи не назначается (WK metal-classes-composition).',
  steps:[
    ['Вырезать форму в сланцевой створке (или слепить глиняную по модели), сделать литник и штифты','mt_slate_ovruch','mt_limestone;mt_clay_refractory','tl_graver;tl_carving_knife;tl_compass_divider','st:mould_ready','каменная крошка','days','master','ошибку резьбы в камне не исправить','A'],
    ['Отвесить металл и лом, загрузить в тигель','st:mould_ready','mt_copper;mt_tin;mt_lead;mt_brass','tl_jeweler_scales;tl_crucible','st:charged_crucible','','minutes','master','','B'],
    ['Расплавить металл в тигле в угле при дутье','st:charged_crucible','mt_charcoal','tl_bellows;tl_blowpipe;tl_crucible_tongs','st:molten_metal','шлак на поверхности','hour','master','тигель треснул — металл в угле','A'],
    ['Связать и прогреть форму, залить металл','st:molten_metal','','tl_mould_stone;tl_ladle_pouring;tl_crucible_tongs','st:raw_casting','брызги','minutes','master','недолив, пузыри','A'],
    ['Раскрыть форму, отломить литник, опилить и заполировать','st:raw_casting','','tl_file;tl_burnisher','pr:cast_ornament','литник, опилки металла, брак','hours','trained','облой, раковины','A'],
  ]
},
{
  id:'pc_lost_wax_casting', name_ru:'Литьё по восковой модели', name_en:'lost-wax casting', group:'casting_jewelry', master_family:'nonferrous_casting',
  workplace:'ordinary_workshop', inputs:'mt_beeswax;mt_clay_refractory;mt_bronze;mt_silver;mt_charcoal', tools:'tl_carving_knife;tl_crucible;tl_crucible_tongs;tl_bellows;tl_file;tl_burnisher',
  fuel_heat:'прогрев формы для вытапливания воска; плавка в тигле', season:'круглый год', outputs:'pr:cast_ornament', waste:'разбитая глиняная форма;литник', skill:'master', total_duration:'days',
  failure_modes:'воск не вытек полностью — пустоты;форма треснула при заливке',
  defect_signs:'пористость, недолив тонких частей',
  feasibility:'Даёт единичную отливку; форма разбивается. Модель можно снять оттиском с чужой вещи — тогда копия чуть меньше и мягче по рельефу.',
  authenticity:'@rus/items-property', wk:'claim:casting-casting-mould;claim:population-joining-metal-melt;claim:population-material-clay-steam',
  sources:'src:sedova1981-jewelry;src:matcult-catalog-v1', conf:'B', note:'Применение способа в Новгороде — по Седовой (через сводки); доля в производстве не выписана.',
  steps:[
    ['Вылепить или вырезать модель из воска с восковым литником','mt_beeswax','','tl_carving_knife','st:wax_model','восковые обрезки','hours','master','','B'],
    ['Облепить модель слоями глины и просушить','st:wax_model','mt_clay_refractory','','st:invested_model','','days','master','слишком быстрая сушка — трещины','C'],
    ['Прогреть форму и вытопить воск','st:invested_model','mt_charcoal','','st:empty_mould','дым воска','hours','master','остаток воска даёт пустоты','C'],
    ['Залить расплавленный металл в горячую форму','st:empty_mould','mt_bronze','tl_crucible;tl_crucible_tongs;tl_bellows','st:filled_mould','','minutes','master','','B'],
    ['Разбить форму, отделить литник, отделать','st:filled_mould','','tl_file;tl_burnisher','pr:cast_ornament','черепки формы, литник','hours','trained','','B'],
  ]
},
{
  id:'pc_wire_filigree', name_ru:'Проволока, филигрань и зернь', name_en:'wire drawing, filigree and granulation', group:'casting_jewelry', master_family:'sheet_wire_metal',
  workplace:'ordinary_workshop', inputs:'mt_silver;mt_copper;mt_charcoal', tools:'tl_draw_plate;tl_jeweler_pliers;tl_jeweler_hammer;tl_jeweler_anvil;tl_blowpipe;tl_crucible',
  fuel_heat:'малый огонь с паяльной трубкой для пайки', season:'круглый год', outputs:'pr:filigree_ornament', waste:'проволочные концы;опилки драгметалла', skill:'specialist', total_duration:'days',
  failure_modes:'проволока рвётся при протяжке;припой растекается и заливает узор;зерно не припаялось',
  defect_signs:'неравномерная толщина проволоки;залитые припоем ячейки',
  feasibility:'Узкая специальность ювелира; требует драгметалла и точного огня. Для 1230 г. тонкая филигрань — редкая элитная работа.',
  authenticity:'@rus/items-property', wk:'claim:population-joining-metal-melt',
  sources:'src:sedova1981-jewelry;src:matcult-catalog-v1;src:master-technology-v1', conf:'C', note:'Волочение и пайка в Новгороде — по сводкам; конкретный инструмент (волочильная доска) — реконструкция.',
  steps:[
    ['Отлить и отковать пруток','mt_silver','mt_charcoal','tl_crucible;tl_jeweler_hammer;tl_jeweler_anvil','st:metal_rod','','hour','specialist','','C'],
    ['Протянуть пруток через волочильную доску до тонкой проволоки','st:metal_rod','','tl_draw_plate;tl_jeweler_pliers','st:wire','обрывки проволоки','hours','specialist','разрывы, неровная толщина','C'],
    ['Свить и выложить узор, приготовить зерно','st:wire','','tl_jeweler_pliers','st:laid_filigree','','hours','specialist','','C'],
    ['Напаять узор и зерно на основу','st:laid_filigree','','tl_blowpipe','pr:filigree_ornament','','hours','specialist','залитые припоем ячейки','C'],
  ]
},
{
  id:'pc_sheet_embossing', name_ru:'Тиснение накладок по матрице', name_en:'embossing sheet mounts over a die', group:'casting_jewelry', master_family:'jewelry_decoration',
  workplace:'ordinary_workshop', inputs:'mt_copper;mt_silver;mt_bronze', tools:'tl_embossing_die;tl_jeweler_hammer;tl_jeweler_anvil;tl_chasing_punch;tl_jeweler_pliers;tl_file',
  fuel_heat:'отжиг листа на малом огне', season:'круглый год', outputs:'pr:embossed_mount', waste:'обрезки листа', skill:'master', total_duration:'hours',
  failure_modes:'лист прорвался;оттиск неполный',
  defect_signs:'разрывы на выпуклостях;размытый рельеф',
  feasibility:'Матрица позволяет делать много одинаковых накладок; чужая матрица — прямой путь к копиям (подлинность решает @rus/items-property).',
  authenticity:'@rus/items-property', wk:'claim:population-physics-load-deformation;claim:population-physics-stress-failure;claim:metal-classes-composition',
  sources:'src:matcult-catalog-v1;src:sedova1981-jewelry', conf:'B', note:'',
  steps:[
    ['Отковать и отжечь тонкий лист','mt_copper','','tl_jeweler_hammer;tl_jeweler_anvil','st:metal_sheet','','hour','master','','B'],
    ['Выбить рельеф по матрице через прокладку','st:metal_sheet','mt_lead','tl_embossing_die;tl_jeweler_hammer;tl_chasing_punch','st:embossed_sheet','','hour','master','разрывы','B'],
    ['Вырезать накладку, пробить отверстия, опилить','st:embossed_sheet','','tl_jeweler_pliers;tl_file','pr:embossed_mount','обрезки','hour','trained','','B'],
  ]
},
{
  id:'pc_lead_seal', name_ru:'Изготовление вислой свинцовой печати (буллы) на документе', name_en:'making a lead bulla on a document', group:'writing_seals', master_family:'writing_bookmaking',
  workplace:'dwelling_interior', inputs:'mt_lead;mt_cordage;mt_charcoal', tools:'tl_seal_blank_mould;tl_crucible;tl_ladle_pouring;tl_bullotirion;tl_smith_hammer;tl_anvil',
  fuel_heat:'малый огонь для плавки свинца', season:'круглый год', outputs:'pr:sealed_document', waste:'свинцовые брызги и обрезки', skill:'trained', total_duration:'hour',
  failure_modes:'оттиск смещён или неполный;шнур перебит при сжатии;заготовка треснула',
  defect_signs:'двойной оттиск;смятые края;шнур не проходит через печать',
  feasibility:'Сама операция проста, но подлинная печать возможна только тем буллотирием, чьи матрицы вырезаны для конкретного владельца; после смерти или смены должностного лица матрицы уничтожали. Подделка требует новой резной матрицы (работа торевта, pc_seal_matrix) или снятия оттиска с чужой печати — рельеф такой копии беднее. Подлинность и последствия решают @rus/items-property и @rus/social-law.',
  authenticity:'@rus/items-property;@rus/social-law', wk:'claim:population-joining-metal-melt',
  sources:'src:iaran-bullotirion;src:kyy1985-applied', conf:'A', note:'Буллотирий XIV в.; для 1230 г. способ тот же (печати XIII в. массово), конкретный инструмент — аналогия.',
  steps:[
    ['Отлить свинцовую заготовку со сквозным каналом (вокруг стержня)','mt_lead','mt_charcoal','tl_seal_blank_mould;tl_crucible;tl_ladle_pouring','st:seal_blank','брызги свинца','minutes','trained','канал перекрыт','B'],
    ['Продеть через канал шнур, привязанный к документу','st:seal_blank','mt_cordage','','st:blank_on_cord','','minutes','household','','A'],
    ['Зажать заготовку между матрицами буллотирия и ударить молотом','st:blank_on_cord','','tl_bullotirion;tl_smith_hammer;tl_anvil','pr:sealed_document','','minutes','trained','смещённый или двойной оттиск','A'],
  ]
},
{
  id:'pc_seal_matrix', name_ru:'Резьба матрицы печати (буллотирия) или клейма', name_en:'engraving a seal matrix or stamp', group:'writing_seals', master_family:'jewelry_decoration',
  workplace:'ordinary_workshop', inputs:'mt_steel;mt_iron;mt_bronze', tools:'tl_graver;tl_chasing_punch;tl_file;tl_forge_hearth;tl_anvil;tl_smith_hammer;tl_compass_divider',
  fuel_heat:'ковка заготовки в горне; резьба холодная', season:'круглый год', outputs:'pr:seal_matrix', waste:'металлическая стружка', skill:'specialist', total_duration:'days',
  failure_modes:'ошибка в зеркальной надписи;сорвавшийся резец испортил поле',
  defect_signs:'надпись не зеркальна (на оттиске читается наоборот);неровные буквы',
  feasibility:'Требует редкого мастера (торевта), знания письма и изображения владельца печати. Заказ матрицы для чужого имени — уже преступный умысел; решает @rus/social-law.',
  authenticity:'@rus/items-property;@rus/social-law', wk:'claim:mb14-practical-iron-workability-is-qualitative-not-temperature;claim:population-joining-steel-quench',
  sources:'src:kyy1985-applied;src:iaran-bullotirion', conf:'B', note:'Резьба «первоклассными художниками-торевтами» — сводка по Янину; инструменты гравёра не выписаны.',
  steps:[
    ['Отковать заготовку щипцов или пластины','mt_iron','mt_steel','tl_forge_hearth;tl_anvil;tl_smith_hammer','st:matrix_blank','окалина','hours','master','','B'],
    ['Разметить поле и зеркальную надпись','st:matrix_blank','','tl_compass_divider','st:marked_matrix','','hours','specialist','ошибка зеркальности','C'],
    ['Вырезать изображение и надпись вглубь','st:marked_matrix','','tl_graver;tl_chasing_punch;tl_file','pr:seal_matrix','металлическая стружка','days','specialist','сорвавшийся штрих','C'],
  ]
},
];
