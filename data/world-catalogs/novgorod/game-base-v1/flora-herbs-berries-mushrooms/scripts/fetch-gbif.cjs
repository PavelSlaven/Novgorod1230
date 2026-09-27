// Fetch GBIF name match + occurrence counts in NW Russia bbox (56.5-60N, 29-36E) and month facets.
// Deterministic given GBIF state at fetch time; cached to cache/gbif.json (fetched_at recorded).
const { fs, path, readTsv } = require('./lib.cjs');
const CACHE = path.join(__dirname, 'cache', 'gbif.json');
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
const BBOX = 'decimalLatitude=56.5,60&decimalLongitude=29,36';
const names = new Set();
for (const f of ['herbs.tsv', 'berries_fungi.tsv', 'cultivated.tsv']) for (const r of readTsv(f)) names.add(r.name_lat);
// GBIF synonymy aliases (accepted names in GBIF backbone) and genus-level queries
const ALIAS = { 'Festuca pratensis': 'Lolium pratense', 'Daucus carota subsp. sativus': 'Daucus carota' };
const get = async u => { for (let i = 0; i < 3; i++) { try { const r = await fetch(u); if (r.ok) return r.json(); } catch (e) {} await new Promise(s => setTimeout(s, 1500)); } throw new Error('fetch failed ' + u); };
(async () => {
  for (const n of names) {
    if (cache[n] && cache[n].usageKey && cache[n].matchType === 'EXACT' && !process.argv.includes('--refresh')) continue;
    const m = await get('https://api.gbif.org/v1/species/match?name=' + encodeURIComponent(ALIAS[n] || n) + (/ /.test(n) ? '' : '&rank=GENUS&kingdom=Plantae'));
    const key = m.usageKey;
    let count = null, monthFacet = null;
    if (key) {
      const o = await get(`https://api.gbif.org/v1/occurrence/search?taxonKey=${key}&${BBOX}&limit=0&facet=month&facetLimit=12`);
      count = o.count;
      monthFacet = {}; for (const f of (o.facets[0] || { counts: [] }).counts) monthFacet[f.name] = f.count;
    }
    cache[n] = { query: ALIAS[n] || n, usageKey: key || null, matchType: m.matchType, rank: m.rank || null, scientificName: m.scientificName || null, status: m.status || null, nw_count: count, month_facet: monthFacet, fetched_at: new Date().toISOString().slice(0, 10) };
    process.stdout.write('.');
  }
  fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1));
  const miss = Object.entries(cache).filter(([k, v]) => !v.usageKey || v.matchType !== 'EXACT');
  console.log('\nnames', names.size, 'non-exact/missing', miss.map(([k, v]) => k + ':' + v.matchType + ':' + v.scientificName).join(' | '));
})();
