'use strict';
const rules = require('../fauna/activity_phase_rules.json').rules;
// A call described only at a nest, in a season, or at a time is not an unconditional daily call.
module.exports = function voicePhase(taxon, season, phase, audible, dormant) {
  if (dormant) return 'no';
  if (!audible) return taxon.class === 'Aves' ? 'no' : 'no_source';
  const description = taxon.class === 'Aves' ? taxon.voice_description : taxon.signs_sounds;
  if (!description || /обычно (?:молчалив|безмолв)|почти (?:молчалив|безмолв|неслыш)/.test(description.toLowerCase()) ||
      (taxon.class !== 'Aves' && /^редко(?:[;,]|$)/.test(description.toLowerCase())))
    return taxon.class === 'Aves' && !audible ? 'no' : 'no_source';
  let general = false, temporalMention = false;
  const rut = (taxon.rut_period || '').toLowerCase();
  const rutSeasons = [/декабр|январ|феврал/.test(rut) && 'winter', /март|апрел|ма[йяею]/.test(rut) && 'spring',
    /июн|июл|август/.test(rut) && 'summer', /сентябр|октябр|ноябр/.test(rut) && 'autumn'].filter(Boolean);
  // Keep linked sound enumerations together, but split a new independent time clause.
  const fragments = description.toLowerCase().replace(/(при тревоге|крик тревоги),\s*/g, '$1; ').split(/[;.!?]|,\s*(?=когда|вес(?:н|ен)|лет(?:н|ом|о)|осен|зим(?:н|ой|е|у)|ноч(?:ью|ами)|по ночам|и ноч(?:ью|ами)|слышно и ночью|дн[её]м|на (?:рассвет|закат|зар|зор)|перед рассвет|в сумерк|вечером|утром|особенно|у гнезда|у птенцов|[^,;]*при тревоге|в гон|ранний прил[её]т|(?:в пик|на|во время|при|в период) прол[её]т[а-я]*[^,;]*(?:голос|крик|песн|свист|слыш|звуч))/);
  for (let i = 0; i < fragments.length; i++) {
    let fragment = fragments[i];
    if (/^\s*когда(?:\s|$)/.test(fragment) && i && !/крик|голос|песн|свист|писк|всплеск|звуч|звон|шорох|хрюкан|рев|рёв/.test(fragments[i - 1]))
      fragment = `${fragments[i - 1]} ${fragment}`;
    else if (!/крик|голос|песн|свист|писк|всплеск|звуч|звон|шорох|хрюкан|рев|рёв/.test(fragment) &&
        /^\s*когда(?:\s|$)/.test(fragments[i + 1] || '')) continue;
    if (taxon.class !== 'Aves' && season === 'winter' && /подо льдом|в норах/.test((taxon.season_winter || '').toLowerCase()) &&
        /всплеск|шл[её]пок.*по воде|прыж\w*.*в воду/.test(fragment)) continue;
    if (/молчалив|безмолв|неслыш|у гнезда|у птенцов|у логова|пойманн|при тревоге|крик тревоги|^редко/.test(fragment)) continue;
    if (/в гон/.test(fragment) && (!rutSeasons.includes(season) || !/^(?:в гон|[^,;]+ в гон)/.test(fragment))) continue;
    const migration = taxon[`migration_${season}`];
    if (/прол[её]т/.test(fragment) && migration !== 'passage' && !(season === 'autumn' && migration === 'breeding')) {
      temporalMention = true;
      continue;
    }
    const mentioned = [
      /вес(?:н|ен)|март|апрел|ма[йяею]/.test(fragment) && 'spring',
      /лет(?:н|ом|о)|июн|июл|август/.test(fragment) && 'summer',
      /осен|сентябр|октябр|ноябр/.test(fragment) && 'autumn',
      /зим(?:н|ой|е|у)|декабр|январ|феврал/.test(fragment) && 'winter',
    ].filter(Boolean);
    if (mentioned.length && !mentioned.includes(season) && !/с (?:декабр|январ|феврал|март|апрел|ма[йяею]|июн|июл|август|сентябр|октябр|ноябр)/.test(fragment)) continue;
    if (/ноч|зар|зор|сумерк|вечер|утр|днём|днем/.test(fragment)) {
      temporalMention = true;
      const match = phase === 'night' ? /ноч/.test(fragment) :
        phase === 'civil_dawn' ? /(?:на |до )зар|зор|утр/.test(fragment) && !/вечерн.{0,8}зар/.test(fragment) :
        phase === 'civil_dusk' ? /сумерк|вечер|зор/.test(fragment) : /днём|днем/.test(fragment);
      if (match) return 'yes';
    } else general = true;
  }
  return general && (!temporalMention || rules[taxon.activity_time]?.[phase] === 'yes') ? null : 'no_source';
};
