"""Deterministic extraction of two regional bird sources into small JSON snapshots.

1) Пантелеев 2001 «Список птиц Новгородской области» (cyberleninka HTML): Latin name -> literature refs,
   flag petrov_1885 (recorded in Приильменье by А.Е. Петров 1885).
2) Мальчевский & Пукинский 1983 (zoomet.ru pages malchevski_<n>.html): species number -> RU name, Latin heading,
   page, and keyword FLAGS only (no text copied): status words and abundance words in the first sentences.

Usage: python extract_regional_bird_sources.py <panteleev_html> <malchevsky_pages_dir> <out_dir>
Pages are fetched beforehand (curl) from the URLs in scripts/src/sources.cjs.
"""
import html, json, os, re, sys, glob


def text_of(path):
    b = open(path, 'rb').read()
    s = b.decode('utf-8', 'replace')
    s = re.sub(r'<script.*?</script>|<style.*?</style>', ' ', s, flags=re.S)
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s)))


def panteleev(path):
    t = text_of(path)
    i = t.find('★ ★ ★'); j = t.find('Литература', i)
    body = t[i + 5:j]
    body = re.sub(r'i Не можете найти.*?литературы \.', ' ', body)
    # entries: "Genus species: refs." ; genus capitalised latin (OCR may contain cyrillic look-alikes)
    out = {}
    L = r'[a-zа-яёà-ÿ́]'
    NAME = r'\??[A-ZСА][a-zа-яёà-ÿ]+ ?' + L + r'+(?: [a-z]+)?'
    for m in re.finditer('(' + NAME + r'): (.*?)(?=\s' + NAME + ': |$)', body):
        name, refs = m.group(1).strip(), m.group(2).strip()
        out[name] = {'refs': refs, 'petrov_1885': 'Петров 1885' in refs, 'doubtful': name.startswith('?')}
    return out


STATUS = {
    'resident': r'оседл|круглый год|во все сезоны|встречается здесь в течение круглого года',
    'breeding': r'гнездящ|гнездится',
    'passage': r'пролет',
    'wintering': r'зиму|зимующ|зимой',
    'irruptive': r'налет|появляются осенью|кочу',
}
ABUND = {
    'most_numerous': r'самый многочисленный|самая обычная|самых обычных|наиболее многочисленн|обычнейш',
    'common': r'обычн|многочисленн',
    'scarce': r'немногочисленн|неравномерно',
    'rare': r'редк|малочисленн|исчез',
}


def malchevsky(d):
    out = {}
    for f in sorted(glob.glob(os.path.join(d, 'malchevski_*.html'))):
        t = text_of(f)
        k = t.find('1983 г.')
        body = t[k + 7:] if k >= 0 else t
        for sec in re.split(r'(?=\b\d{1,3}\. [А-ЯЁ][А-ЯЁ\- ]{2,40} ?[-—–] ?[A-Z][A-Z]+ [A-Z]+)', body):
            m = re.match(r'(\d{1,3})\. ([А-ЯЁ][А-ЯЁ\- ]{2,40}?) ?[-—–] ?([A-Z]+ [A-Z]+)', sec)
            if not m:
                continue
            head = ' '.join(re.split(r'(?<=[.!?])\s+', sec)[:4])
            out[m.group(1)] = {
                'name_ru': m.group(2).strip(), 'latin_heading': m.group(3).title(),
                'page': 'https://zoomet.ru/mal/' + os.path.basename(f),
                'status_flags': [k2 for k2, p in STATUS.items() if re.search(p, sec[:4000], re.I)],
                'abundance_flags_head': [k2 for k2, p in ABUND.items() if re.search(p, head, re.I)],
            }
    return out


if __name__ == '__main__':
    p_html, m_dir, out_dir = sys.argv[1:4]
    os.makedirs(out_dir, exist_ok=True)
    p = panteleev(p_html)
    m = malchevsky(m_dir)
    json.dump({'source': 'SRC_PANT2001', 'count': len(p), 'species': p}, open(os.path.join(out_dir, 'panteleev2001_list.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    json.dump({'source': 'SRC_MALPUK1983', 'count': len(m), 'species': m}, open(os.path.join(out_dir, 'malchevsky1983_flags.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('panteleev', len(p), 'malchevsky', len(m))
