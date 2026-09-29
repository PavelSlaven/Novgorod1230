// Technological chains, part E: animal carcass processing.
// Step tuple: [action_ru, in_state, extra_inputs(;), tools(;), out_state, waste(;), duration_band, skill, checks_and_defects_ru, confidence]
module.exports = [
{
  id:'proc_butcher_carcass', name_ru:'Разделка туши зверя, птицы или скота', name_en:'butchering an animal carcass', group:'butchery', master_family:'carcass_butchery',
  workplace:'hunting_ground', inputs:'pr:whole_carcass', tools:'tl_skinning_knife', fuel_heat:'нет', season:'круглый год; в тепле свежая туша быстро портится',
  outputs:'pr:raw_meat;mt_hide_raw;mt_bone;mt_tallow;mt_sinew_gut;mt_horn;pr:feathers_down', waste:'кровь;содержимое желудка и кишечника;загрязнённые и несъедобные ткани', skill:'household', total_duration:'hours',
  failure_modes:'загрязнение мяса содержимым кишок;порез шкуры;потеря жира и сухожилий;затупленный нож замедляет работу',
  defect_signs:'запах и загрязнение мяса;рваные края шкуры;оставленные на костях мясо и сухожилия',
  feasibility:'Нужны уже существующая туша и режущий нож. Размер задаёт время и редакционные доли в butchery_profiles.csv; выдаются только продукты, разрешённые taxon/product-строкой.',
  authenticity:'', wk:'claim:macro-gap-carcass-handling-can-separate-material-streams;claim:macro-gap-slaughter-needs-work-tools-and-place',
  sources:'claim:macro-gap-carcass-handling-can-separate-material-streams;claim:macro-gap-slaughter-needs-work-tools-and-place', conf:'C',
  note:'Справочная цепочка не создаёт тушу и не решает пригодность мяса. Выделка, копчение и засолка не входят. Численные доли и время — editorial profiles.',
  steps:[
    ['Обескровить, вскрыть тушу и вынуть внутренности','pr:whole_carcass','','tl_skinning_knife','st:eviscerated_carcass','кровь;содержимое желудка и кишечника','minutes','household','не повредить кишечник и не загрязнить мясо','C'],
    ['Снять шкуру или ощипать птицу, отделить жир и сухожилия','st:eviscerated_carcass','','tl_skinning_knife','st:skinned_carcass','загрязнённые и несъедобные ткани','hours','household','порезы шкуры;потерянный жир;оставленные сухожилия','C'],
    ['Разделить тушу на мясо, кости и доступные видовые продукты','st:skinned_carcass','','tl_skinning_knife','pr:raw_meat','мелкие загрязнённые обрезки','hours','household','мясо оставлено на костях;продукт повреждён','C'],
  ]
},
{
  id:'proc_clean_fish', name_ru:'Чистка и потрошение свежей рыбы', name_en:'cleaning and gutting fresh fish', group:'butchery', master_family:'fish_cleaning',
  workplace:'fishing_camp', inputs:'pr:whole_fish', tools:'tl_knife_utility', fuel_heat:'нет', season:'круглый год; свежую рыбу обрабатывают без задержки',
  outputs:'pr:gutted_fish', waste:'чешуя;жабры;внутренности;загрязнённая вода', skill:'household', total_duration:'minutes',
  failure_modes:'повреждение желчи или кишечника; потеря съедобной части; грязная рабочая поверхность; затупленный нож',
  defect_signs:'раздавленные внутренности; загрязнение мяса; лишние глубокие надрезы; оставшиеся жабры и внутренности',
  feasibility:'Нужны уже существующая свежая рыба с food_ingredient_ref и режущий нож. Вид сохраняется по fish_cleaning_products.csv; общий выход не создаёт рыбу без видового продукта.',
  authenticity:'', wk:'claim:macro-gap-carcass-handling-can-separate-material-streams',
  sources:'claim:macro-gap-carcass-handling-can-separate-material-streams', conf:'C',
  note:'Логическая цепочка сверена с MASTER food_system RCP0166 и material items FSH0002/FOD0010/FOD0012. Архив — черновой список D39, не исторический источник; 8–30 минут и точный набор отходов — реконструкция. Современное филе не подразумевается.',
  steps:[
    ['Удержать свежую рыбу и очистить поверхность от явной грязи','pr:whole_fish','','tl_knife_utility','st:fish_held','чешуя;грязная вода','minutes','household','не загрязнить съедобную часть','C'],
    ['Вскрыть брюхо, удалить внутренности и жабры, сохранить пригодную часть','st:fish_held','','tl_knife_utility','pr:gutted_fish','жабры;внутренности;загрязнённая вода','minutes','household','не повредить желчь и не срезать лишнее мясо','C'],
  ]
},
];
