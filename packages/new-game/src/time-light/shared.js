export function issue(code,message,field,expected=null,actual=null,severity='error'){return {code,message,field,expected,actual,severity};}
export function isObject(v){return v!==null&&typeof v==='object'&&!Array.isArray(v);}
export function text(v){return typeof v==='string'&&v.trim().length>0;}
export function array(v){return Array.isArray(v)?v:[];}
export function nonEmpty(v){return Array.isArray(v)&&v.length>0;}
export function normalizeText(v){return String(v??'').toLowerCase().replaceAll('ё','е');}
export function hasCode(c,code){return c.some((x)=>x.code===code&&x.severity!=='warning');}
export function hasPrefix(c,p){return c.some((x)=>x.code.startsWith(p)&&x.severity!=='warning');}
export function deepEqual(a,b){return JSON.stringify(a)===JSON.stringify(b);}
export function requireAudit(concerns,value,schema,path,code){if(value?.schema!==schema||value?.version!==1||value?.pass!==true) concerns.push(issue(code,`${path} must be approved ${schema}.`,path));}
export function authoritativeFrame(input){return {clock:structuredClone(input?.historical_frame?.clock ?? null),season:input?.historical_frame?.calendar?.season ?? null,weather_state:structuredClone(input?.weather_state ?? null),light_profile:input?.historical_frame?.clock?.light_profile ?? null};}
