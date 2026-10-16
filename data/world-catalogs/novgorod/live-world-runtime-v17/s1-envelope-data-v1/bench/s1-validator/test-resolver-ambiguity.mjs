import { resolveUniqueRecord } from '../../validate-s1-candidate.mjs';
const duplicate=[{id:'same',version:1},{id:'same',version:1}];
try { resolveUniqueRecord(duplicate,{id:'same',version:1},'ambiguous fixture'); process.exitCode=1; console.error('FAIL: duplicate source records accepted'); }
catch (error) { if(error.code!=='SOURCE_RECORD_AMBIGUOUS'){process.exitCode=1;console.error(`FAIL: unexpected rejection ${error.code}`)}else console.log('PASS SOURCE_RECORD_AMBIGUOUS: duplicate exact source records rejected'); }
