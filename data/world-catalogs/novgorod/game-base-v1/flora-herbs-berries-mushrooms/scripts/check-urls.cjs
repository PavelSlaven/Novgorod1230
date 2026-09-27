// Check that every Wikipedia URL generated from name_lat resolves (HTTP 200 after redirects). Cache: cache/wiki.json
const { fs, path, readTsv, wikiUrl } = require('./lib.cjs');
const CACHE = path.join(__dirname, 'cache', 'wiki.json');
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
const urls = new Set();
for (const f of ['herbs.tsv', 'berries_fungi.tsv', 'cultivated.tsv', 'denylist.tsv']) for (const r of readTsv(f)) {
  const toks = r.refs.split(/\s+/);
  if (toks.includes('wiki')) urls.add(wikiUrl(r.name_lat));
  for (const t of toks) if (/^https?:/.test(t)) urls.add(t);
}
// also source registry URLs (some sites block bots: status recorded, not fatal)
for (const s of readTsv('sources.tsv')) if (/^https?:/.test(s.url_or_path)) urls.add(s.url_or_path);
(async () => {
  for (const u of urls) {
    if (cache[u] === 200 && !process.argv.includes('--refresh')) continue;
    let st = 0;
    for (let i = 0; i < 3 && st !== 200; i++) { try { const r = await fetch(u, { redirect: 'follow', headers: { 'User-Agent': 'Novgorod1230-gamebase-check/1.0' } }); st = r.status; } catch (e) { st = -1; } if (st !== 200) await new Promise(s => setTimeout(s, 1000)); }
    cache[u] = st;
  }
  fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1));
  const bad = Object.entries(cache).filter(([u, s]) => s !== 200 && urls.has(u));
  console.log('urls', urls.size, 'bad', bad.length, bad.map(b => b.join(' ')).join('\n'));
})();
