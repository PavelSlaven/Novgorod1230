import re,os
R='/srv/novgorod-work/demo/etalons/member-phrases-703'
NEG=re.compile(r'(?i)(\bнет\b|\bне\s+\w+|\bни\s+\w+|\bничего\b|\bникак\w*|\bкроме\b|\bбез\b|\bотсутств\w*|\bпуст\w*|\bнигде\b|\bтолько\b|\bлишь\b|\bникто\b|\bникогда\b)')
n=0;hits=[]
for root,_,fs in os.walk(R):
    if '/run-' not in root+'/': continue
    for f in sorted(fs):
        if not f.endswith('.md') or f=='notes.md' or not (f.startswith('turn-') or f.startswith('case-')): continue
        p=os.path.join(root,f)
        for i,l in enumerate(open(p,encoding='utf-8').read().splitlines(),1):
            if re.match(r'\*\*(Текст|Ответ):\*\*',l):
                n+=1
                t=re.sub(r'^\*\*\w+:\*\* ','',l)
                for m in NEG.finditer(t): hits.append((os.path.relpath(p,R),i,m.group(0),t))
print(n,'реплик/текстов;',len(hits),'вхождений отрицаний')
for h in hits: print(f'{h[0]}:{h[1]} [{h[2]}] {h[3]}')
