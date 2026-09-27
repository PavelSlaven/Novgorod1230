'use strict';
const rules = require('../fauna/activity_phase_rules.json').rules;
// A call described only at a nest, in a season, or at a time is not an unconditional daily call.
module.exports = function voicePhase(taxon, season, phase, audible, dormant) {
  if (dormant) return 'no';
  if (taxon.class === 'Aves' && !audible) return 'no';
  if (!audible) return 'no_source';
  const description = taxon.class === 'Aves' ? taxon.voice_description : taxon.signs_sounds;
  if (!description || /обычно молчалив|почти молчалив/.test(description.toLowerCase())) return 'no_source';
  let general = false, temporalMention = false;
  for (const fragment of description.toLowerCase().split(/[;,]/)) {
    if (/молчалив|у гнезда|у птенцов|у логова/.test(fragment)) continue;
    const migration = taxon[`migration_${season}`];
    if (/прол[её]т/.test(fragment) && migration !== 'passage' && !(season === 'autumn' && migration === 'breeding')) {
      temporalMention = true;
      continue;
    }
    if (/весн/.test(fragment) && season !== 'spring' && !/осен/.test(fragment)) continue;
    if (/осен/.test(fragment) && season !== 'autumn' && !/весн/.test(fragment)) continue;
    if (/весн/.test(fragment) && /осен/.test(fragment) && !['spring', 'autumn'].includes(season)) continue;
    if (/ноч|зар|сумерк|вечер|утр|днём|днем/.test(fragment)) {
      temporalMention = true;
      const match = phase === 'night' ? /ноч/.test(fragment) :
        phase === 'civil_dawn' ? /(?:на |до )зар|утр/.test(fragment) && !/вечерн.{0,8}зар/.test(fragment) :
        phase === 'civil_dusk' ? /сумерк|вечер/.test(fragment) : /днём|днем/.test(fragment);
      if (match) return 'yes';
    } else general = true;
  }
  return general && (!temporalMention || rules[taxon.activity_time]?.[phase] === 'yes') ? null : 'no_source';
};
