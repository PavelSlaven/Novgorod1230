// Parse world_base DDL: tables -> columns (CREATE TABLE + ALTER TABLE ADD COLUMN)
const fs=require('fs'),path=require('path');
const dir='C:/Users/Slaven/Documents/Novgorod-runtime/infra/world-base/schema';
const out={};
for(const f of fs.readdirSync(dir).filter(f=>f.endsWith('.sql')).sort()){
  const s=fs.readFileSync(path.join(dir,f),'utf8');
  const re=/CREATE TABLE(?: IF NOT EXISTS)?\s+world_base\.(\w+)\s*\(([\s\S]*?)\);[ \t]*\r?\n/g;let m;
  while((m=re.exec(s))){const cols=[];let depth=0,cur='';
    for(const ch of m[2]){if(ch=='(')depth++;if(ch==')')depth--;if(ch==','&&depth==0){cols.push(cur);cur='';}else cur+=ch;}cols.push(cur);
    const names=cols.map(c=>c.replace(/--.*$/mg,'').trim()).filter(c=>c&&!/^(CONSTRAINT|PRIMARY|UNIQUE|FOREIGN|CHECK|EXCLUDE)\b/i.test(c)).map(c=>c.split(/\s+/)[0].replace(/"/g,''));
    out[m[1]]={file:f,columns:names};}
  const re2=/ALTER TABLE(?: ONLY)?\s+world_base\.(\w+)\s+([\s\S]*?);/g;
  while((m=re2.exec(s))){const r=/ADD COLUMN(?: IF NOT EXISTS)?\s+(\w+)/gi;let k;while((k=r.exec(m[2])))if(out[m[1]]&&!out[m[1]].columns.includes(k[1]))out[m[1]].columns.push(k[1]);}
}
fs.writeFileSync(process.argv[2],JSON.stringify(out,null,1));
console.log(Object.keys(out).length);
