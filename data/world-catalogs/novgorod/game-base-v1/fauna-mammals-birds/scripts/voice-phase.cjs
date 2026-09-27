'use strict';
const rules = require('../fauna/activity_phase_rules.json').rules;
// A call described only at a nest, in a season, or at a time is not an unconditional daily call.
module.exports = function voicePhase(taxon, season, phase, audible, dormant) {
  if (dormant) return 'no';
  if (taxon.class === 'Aves' && !audible) return 'no';
  const description = taxon.class === 'Aves' ? taxon.voice_description : taxon.signs_sounds;
  if (!description || /обычно (?:молчалив|безмолв)|почти (?:молчалив|безмолв)/.test(description.toLowerCase()))
    return taxon.class === 'Aves' && !audible ? 'no' : 'no_source';
  let general = false, temporalMention = false;
  // Keep linked sound enumerations together, but split a new independent time clause.
  for (const fragment of description.toLowerCase().split(/;|,\s*(?=вес(?:н|ен)|лет(?:н|ом|о|у)|осен|зим(?:н|ой|е|у)|ноч(?:ью|ами)|по ночам|дн[её]м|на (?:рассвет|закат|зар|зор)|перед рассвет|в сумерк|вечером|утром|(?:в пик|на|во время|при|в период) прол[её]т[а-я]*[^,;]*(?:голос|крик|песн|свист|слыш|звуч))/)) {
    if (/молчалив|безмолв|у гнезда|у птенцов|у логова/.test(fragment)) continue;
    const migration = taxon[`migration_${season}`];
    if (/прол[её]т/.test(fragment) && migration !== 'passage' && !(season === 'autumn' && migration === 'breeding')) {
      temporalMention = true;
      continue;
    }
    const mentioned = [
      /вес(?:н|ен)/.test(fragment) && 'spring',
      /лет(?:н|ом|о|у)/.test(fragment) && 'summer',
      /осен/.test(fragment) && 'autumn',
      /зим(?:н|ой|е|у)/.test(fragment) && 'winter',
    ].filter(Boolean);
    if (mentioned.length && !mentioned.includes(season)) continue;
    if (/ноч|зар|зор|сумерк|вечер|утр|днём|днем/.test(fragment)) {
      temporalMention = true;
      const match = phase === 'night' ? /ноч/.test(fragment) :
        phase === 'civil_dawn' ? /(?:на |до )зар|зор|утр/.test(fragment) && !/вечерн.{0,8}зар/.test(fragment) :
        phase === 'civil_dusk' ? /сумерк|вечер|зор/.test(fragment) : /днём|днем/.test(fragment);
      if (match) return 'yes';
    } else general = true;
  }
  if (!audible) return taxon.class === 'Aves' ? 'no' : 'no_source';
  return general && (!temporalMention || rules[taxon.activity_time]?.[phase] === 'yes') ? null : 'no_source';
};
