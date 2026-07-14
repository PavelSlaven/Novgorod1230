export function walk(value,visitor,seen=new Set()){if(value==null||typeof value!=='object'||seen.has(value))return;seen.add(value);visitor(value);if(Array.isArray(value))value.forEach((item)=>walk(item,visitor,seen));else Object.values(value).forEach((item)=>walk(item,visitor,seen));}
export function addText(set,value){if(text(value))set.add(value);}
export function addMapSet(map,key,value){if(!text(key)||!text(value))return;if(!map.has(key))map.set(key,new Set());map.get(key).add(value);}
export function firstText(object,keys){for(const key of keys)if(text(object?.[key]))return object[key];return null;}
export function array(value){return Array.isArray(value)?value:[];}
export function isObject(value){return value!==null&&typeof value==='object'&&!Array.isArray(value);}
export function text(value){return typeof value==='string'&&value.trim().length>0;}
export function deepEqual(a,b){return JSON.stringify(a)===JSON.stringify(b);}
export function safeClone(value){try{return structuredClone(value);}catch{return value;}}
export function issue(code,message,field,expected=null,actual=null,severity='error'){return{code,message,field,expected,actual,severity};}
export function dedupe(items){const seen=new Set();return items.filter((item)=>{const key=`${item.code}|${item.field}|${item.actual??''}`;if(seen.has(key))return false;seen.add(key);return true;});}
export function requireSchema(concerns,value,schema,path,code){if(value?.version!==1||value?.schema!==schema)concerns.push(issue(code,`${path} must be ${schema} version 1.`,path));}
export function requireAudit(concerns,value,schema,path,code){if(value?.version!==1||value?.schema!==schema||value?.pass!==true)concerns.push(issue(code,`${path} must be approved ${schema}.`,path));}
export function hasOwnRecursive(value,key,seen=new Set()){if(value==null||typeof value!=='object'||seen.has(value))return false;seen.add(value);if(!Array.isArray(value)&&Object.prototype.hasOwnProperty.call(value,key))return true;return Object.values(value).some((child)=>hasOwnRecursive(child,key,seen));}
