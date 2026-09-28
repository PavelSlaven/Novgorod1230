'use strict';

// Fractions are ranges of live mass. They are editorial play calibration, not historical measurements.
// A zero range means the body class does not produce that output. Taxon/product rows further restrict outputs.
module.exports = [
  ['bc_bird_very_small','bird','very_small','0','0.1','5','15','0.25','0.50','0','0','0.10','0.20','0','0.10','0','0','0','0','0.03','0.12'],
  ['bc_bird_small','bird','small','0.1','2','10','30','0.30','0.55','0','0','0.10','0.20','0.01','0.12','0','0','0','0','0.04','0.12'],
  ['bc_bird_large','bird','large','2','15','25','60','0.30','0.55','0','0','0.10','0.20','0.02','0.12','0','0','0','0','0.05','0.12'],
  ['bc_mammal_very_small','mammal','very_small','0','0.1','5','20','0.20','0.45','0.08','0.20','0.10','0.20','0','0.10','0','0.015','0','0','0','0'],
  ['bc_mammal_small','mammal','small','0.1','5','15','45','0.25','0.50','0.06','0.15','0.10','0.20','0.01','0.12','0.005','0.025','0','0','0','0'],
  ['bc_mammal_medium','mammal','medium','5','50','45','120','0.30','0.50','0.05','0.10','0.10','0.18','0.02','0.15','0.005','0.025','0','0.02','0','0'],
  ['bc_mammal_large','mammal','large','50','','120','360','0.30','0.50','0.04','0.10','0.10','0.18','0.02','0.16','0.005','0.025','0','0.03','0','0'],
].map((r) => ({
  carcass_class_id:r[0], animal_class:r[1], size_class:r[2], live_mass_min_kg:r[3], live_mass_max_kg:r[4],
  live_mass_interval:'min_inclusive_max_exclusive;empty_max_unbounded',
  duration_min_minutes:r[5], duration_max_minutes:r[6], meat_fraction_min:r[7], meat_fraction_max:r[8],
  raw_hide_fraction_min:r[9], raw_hide_fraction_max:r[10], bone_fraction_min:r[11], bone_fraction_max:r[12],
  fat_fraction_min:r[13], fat_fraction_max:r[14], sinew_fraction_min:r[15], sinew_fraction_max:r[16],
  horn_fraction_min:r[17], horn_fraction_max:r[18], feathers_down_fraction_min:r[19], feathers_down_fraction_max:r[20],
  output_eligibility_rule:'emit only outputs allowed by mammals.products, birds.products, or livestock_products.csv; bone/fat/sinew require an applicable authored product or downstream ordinary-material rule',
  output_source_refs:'fauna-mammals-birds/fauna/mammals.csv#products;fauna-mammals-birds/fauna/birds.csv#products;fauna-fish-invertebrates-livestock/fauna/livestock_products.csv',
  yield_basis:'editorial', yield_source_refs:'', qualitative_source_refs:'claim:macro-gap-carcass-handling-can-separate-material-streams', confidence:'C', status:'candidate',
  note:'Ranges are broad conservation-safe calibration; unlisted mass remains blood, organs, gut contents, moisture and waste. They are not a promise of edible or usable output.',
}));
