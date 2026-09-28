'use strict';

const quality = (winterMonths) => {
  const winter = new Set(winterMonths);
  const transitional = new Set([3, 4, 5, 10]);
  return Array.from({ length: 12 }, (_, i) => `${i + 1}=${winter.has(i + 1) ? 'winter' : transitional.has(i + 1) ? 'transitional' : 'summer'}`).join(';');
};

const row = (prime, winter, qualitativeRefs, note) => ({
  pelt_prime_months: prime.join(';'),
  pelt_quality_by_month: quality(winter),
  pelt_calendar_basis: 'editorial',
  pelt_calendar_source_refs: '',
  pelt_qualitative_source_refs: qualitativeRefs,
  pelt_calendar_note: `Точные границы месяцев не найдены в проверенных выписках; редакционная северо-западная сезонная калибровка. ${note}`.trim(),
});

module.exports = {
  fa_m_wolf: row([11,12,1,2], [11,12,1,2], 'SRC_VOLOGDA_MAMM', 'Видовая строка качественно различает густой зимний мех; prime-месяцы редакционные.'),
  fa_m_red_squirrel: row([11,12,1,2], [11,12,1,2], 'SRC_VOLOGDA_MAMM', 'Видовая строка подтверждает зимний промысловый мех и весенне-осеннюю линьку.'),
  fa_m_lynx: row([11,12,1,2], [11,12,1,2], '', 'Пушистый зимний мех описан в видовой строке, но подходящей прямой ссылки на календарь или сортность нет.'),
  fa_m_wolverine: row([11,12,1,2], [11,12,1,2], 'SRC_VOLOGDA_MAMM', 'Грубый тёмный мех подтверждён качественно; присутствие в регионе и prime-месяцы ограничены confidence C.'),
  fa_m_pine_marten: row([11,12,1,2], [11,12,1,2], 'SRC_VOLOGDA_MAMM', 'Видовая строка называет ценный зимний мех и ноябрь–февраль, но отдельной цитаты о товарном качестве нет.'),
  fa_m_sable: row([11,12,1,2], [11,12,1,2], '', 'Сортность и месяцы — явный пробел; присутствие в ядре Новгородской земли само имеет confidence C.'),
  fa_m_stoat: row([11,12,1,2,3], [11,12,1,2,3], 'SRC_VOLOGDA_MAMM;books-evidence-v1/fauna-mammals-birds.csv#L257', 'Источник подтверждает сезонную смену окраски, не сортность шкурки.'),
  fa_m_polecat: row([11,12,1,2], [11,12,1,2], 'SRC_VOLOGDA_MAMM', 'Тёмный мех описан качественно; точная сезонная сортность не найдена.'),
  fa_m_european_mink: row([11,12,1,2], [11,12,1,2], 'SRC_VOLOGDA_MAMM', 'Профиль относится к европейской норке; американская норка анахронична и не подразумевается.'),
  fa_m_red_fox: row([11,12,1,2], [11,12,1,2], 'SRC_VOLOGDA_MAMM', 'Видовая строка различает густой зимний и редкий летний мех; конец prime-периода редакционный.'),
  fa_m_mountain_hare: row([11,12,1,2,3], [11,12,1,2,3], 'SRC_VOLOGDA_MAMM;books-evidence-v1/fauna-mammals-birds.csv#L255;claim:fauna-mammals-mountain-hare-seasonal-pelage', 'Источники подтверждают смену зимнего меха, не сортность и не точные даты.'),
  fa_m_beaver: row([11,12,1,2,3], [11,12,1,2,3], 'SRC_VOLOGDA_MAMM', 'Густая подпушь подтверждена качественно; prime-месяцы редакционные.'),
  fa_m_otter: row([11,12,1,2,3], [11,12,1,2,3], 'SRC_WK_FAUNA', 'Водостойкий густой мех подтверждён качественно; prime-месяцы редакционные.'),
  fa_m_mole: row([11,12,1,2], [11,12,1,2], '', 'Бархатистый мех описан в видовой строке; пригодность, сортность и календарь шкурки — логический редакционный gap.'),
  fa_m_water_vole: row([11,12,1,2], [11,12,1,2], '', 'В проверенных данных нет сезонного описания меха; весь календарь и пригодность шкурки редакционные.'),
  fa_m_flying_squirrel: row([11,12,1,2], [11,12,1,2], '', 'Серебристо-серый мех описан качественно; присутствие около 1230, промысловая пригодность и календарь не закреплены.'),
};
