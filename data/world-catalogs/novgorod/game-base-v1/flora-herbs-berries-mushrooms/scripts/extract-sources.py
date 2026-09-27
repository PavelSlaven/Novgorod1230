"""Re-extract the two scholarly sources used for Novgorod evidence into cache/*.json (deterministic parse).
Downloads to a temp dir (not the repo). Usage: python extract-sources.py
 - Kiryanova 1979 (annales.info HTML): crop presence tables for Novgorod/Pskov/Izborsk/Staraya Ladoga.
 - Kalinina 2020 thesis (BIN RAN PDF): annotated list entries (months, frequency, Novgorod record) for taxa in src/berries_fungi.tsv.
Requires curl and pdftotext on PATH."""
import csv, html, json, os, re, subprocess, tempfile
HERE = os.path.dirname(os.path.abspath(__file__)); CACHE = os.path.join(HERE, 'cache'); tmp = tempfile.mkdtemp()
def get(url, out):
    subprocess.run(['curl', '-sL', '-m', '120', '-A', 'Mozilla/5.0', '-o', out, url], check=True); return out
# Kiryanova
t = open(get('http://annales.info/rus/small/zerno.htm', os.path.join(tmp, 'k.htm')), 'rb').read().decode('utf-8', 'ignore')
tabs = re.findall(r'<table.*?</table>', t, flags=re.S | re.I)
cells = lambda r: [re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', c))).strip() for c in re.findall(r'<t[dh].*?</t[dh]>', r, flags=re.S | re.I)]
kir = {}
for i, tb in enumerate(tabs):
    rows = [cells(r) for r in re.findall(r'<tr.*?</tr>', tb, flags=re.S | re.I)]
    if not rows or 'Памятники' not in rows[0]: continue
    head = rows[0]
    for r in rows[1:]:
        if len(r) >= 2 and any(k in r[1] for k in ['Новгород', 'Псков', 'Изборск', 'Ладога', 'Торопец']):
            kir.setdefault('table_%d' % i, {})[r[1]] = {head[j]: r[j] for j in range(2, min(len(head), len(r))) if r[j]}
json.dump({'source': 'KIRYANOVA1979', 'url': 'http://annales.info/rus/small/zerno.htm', 'note': 'table_2 = X – first half XIII c.; table_5 = later period (per article)', 'tables': kir}, open(os.path.join(CACHE, 'kiryanova1979.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# Kalinina
pdf = get('https://www.binran.ru/files/phd/Kalinina_Thesis.pdf', os.path.join(tmp, 'kal.pdf'))
subprocess.run(['pdftotext', '-enc', 'UTF-8', pdf, os.path.join(tmp, 'kal.txt')], check=True)
L = open(os.path.join(tmp, 'kal.txt'), encoding='utf-8', errors='replace').read().split('\n')
st = next(i for i, l in enumerate(L) if l.startswith('3.2 Аннотированный список') and i > 200); en = next(i for i, l in enumerate(L) if l.startswith('ГЛАВА 4') and i > st)
# Header = optional page-number prefix + capitalized Latin binomial at line start.
# Earlier version also required the trophic marker ("— Mr:" etc.) on the SAME line, so a
# heading whose marker wraps to the next pdftotext line (e.g. "56 Entoloma sordidulum ...")
# was missed: the line kept appending to the PREVIOUS species' buffer, which is how the
# "НОВГОРОДСКАЯ" note of the next entry (E. strigosissimum) ended up inside E. sinuatum's
# text. Detecting the heading from the name alone, independent of the marker's position,
# fixes that misattribution.
pat = re.compile(r'^(?:\d+\s+)?([A-Z][a-z]+ [a-z\-]+)\b')
ents, cur = {}, None
for l in L[st:en]:
    m = pat.match(l)
    if m: cur = m.group(1); ents[cur] = l
    elif cur: ents[cur] += ' ' + l
want = [r['name_lat'] for r in csv.DictReader(open(os.path.join(HERE, 'src', 'berries_fungi.tsv'), encoding='utf-8'), delimiter='\t')]
out = {}
for k in want:
    v = ents.get(k)
    if not v: out[k] = None; continue
    mo = re.search(r'\b([IVX]+ – [IVX]+)\.', v); fr = re.search(r'(Очень часто|Часто|Нередко|Редко|Единственная находка)', v)
    # '—' may now be missing from v (heading no longer requires the marker on its own line).
    parts = v.split('—', 1)
    out[k] = {'trophic': parts[1].strip()[:2] if len(parts) > 1 else None, 'months': mo.group(1) if mo else None, 'frequency': fr.group(1) if fr else None, 'novgorod_record': 'НОВГОРОДСКАЯ' in v}
json.dump({'source': 'KALININA2020', 'url': 'https://www.binran.ru/files/phd/Kalinina_Thesis.pdf', 'scope': 'broadleaf forests of Leningrad, Novgorod, Pskov oblasts', 'entries': out}, open(os.path.join(CACHE, 'kalinina2020.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('kiryanova tables', list(kir), 'kalinina found', sum(1 for v in out.values() if v), 'of', len(out))
