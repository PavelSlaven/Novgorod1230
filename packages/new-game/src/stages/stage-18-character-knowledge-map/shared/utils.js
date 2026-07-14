import { sha256 } from '@rus/kernel';
export function basisValues(record){const values=record?.basis??record?.knowledge_basis??record?.basis_refs??[];return array(values).map((value)=>isObject(value)?value.basis_type??value.type??value.id:value).filter(text);}
export function canonicalRecordText(record){const value=record?.statement??record?.knowledge_text??record?.rumor_text??record?.belief_text??record?.label??record?.name??null;return text(value)?String(value).trim().toLowerCase():'';}
export function issue(code,message,field,expected=undefined,actual=undefined){return{code,severity:'hard_block',message,field,...(expected!==undefined?{expected}:{}),...(actual!==undefined?{actual}:{})};}
export function requireSchema(concerns,value,schema,field,code){if(!isObject(value)||value.version!==1||value.schema!==schema)concerns.push(issue(code,`${field} must be ${schema} version 1.`,field));}
export function requireAudit(concerns,value,schema,field,code){requireSchema(concerns,value,schema,field,code);if(value?.pass!==true)concerns.push(issue(code,`${field}.pass must be true.`,`${field}.pass`,true,value?.pass));}
export function collectByKeys(value,set,keys){walk(value,(key,child)=>{if(keys.includes(key))addText(set,child);});}
export function collectSourceIds(value,set){collectByKeys(value,set,['source_id','source_ref','source_record_id','fact_id','rule_id']);}
export function addText(set,value){if(text(value))set.add(String(value));}
export function firstText(value,keys){for(const key of keys)if(text(value?.[key]))return value[key];return null;}
export function firstTextFromObject(value,keys){return firstText(value,keys);}
export function array(value){return Array.isArray(value)?value:[];}
export function isObject(value){return Boolean(value)&&typeof value==='object'&&!Array.isArray(value);}
export function text(value){return typeof value==='string'&&value.trim().length>0;}
export function safeClone(value){try{return structuredClone(value);}catch{return null;}}
export function hashJson(value){return sha256(value);}
export function dedupe(concerns){const seen=new Set();return concerns.filter((item)=>{const key=`${item.code}|${item.field}|${item.message}`;if(seen.has(key))return false;seen.add(key);return true;});}
export function hasOwnRecursive(value,target){let found=false;walk(value,(key)=>{if(key===target)found=true;});return found;}
export function walk(value,visitor,path='root'){if(foundTerminal(value))return;if(Array.isArray(value)){value.forEach((child,index)=>walk(child,visitor,`${path}[${index}]`));return;}if(!isObject(value))return;for(const[key,child]of Object.entries(value)){visitor(key,child,`${path}.${key}`);walk(child,visitor,`${path}.${key}`);}}
export function foundTerminal(value){return value==null||typeof value!=='object';}
