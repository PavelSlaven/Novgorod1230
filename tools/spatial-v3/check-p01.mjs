import { readFile } from 'node:fs/promises';

const standard = await readFile('data/knowledge-source/corpus/DOCUMENTS/spatial_architecture_standard_g0_g6.md', 'utf8');
const matrix = JSON.parse(await readFile('docs/migration/spatial-v3/contract-implementation-matrix.json', 'utf8'));
const conflicts = await readFile('docs/migration/spatial-v3/normative-conflicts.md', 'utf8');
const count = (value) => new Set(value).size === value.length;
const contracts = [...standard.matchAll(/```yaml\r?\ncontract_name:\s*([^\r\n]+)[\s\S]*?```/g)].map((m) => m[1].trim());
const errorSection = standard.slice(standard.indexOf('# Приложение C.'), standard.indexOf('# Приложение D.'));
const errors = [...errorSection.matchAll(/^\|\s*`([^`]+)`\s*\|/gm)].map((m) => m[1]).filter((x) => x !== 'code');
if (!standard.includes('**Статус:** `target`') || !standard.includes('**Версия:** `4.2.0`')) throw new Error('Target metadata missing');
if (!count(contracts) || contracts.length !== 160) throw new Error(`Contract audit failed: ${contracts.length}`);
if (!count(errors) || errors.length !== 58) throw new Error(`Error audit failed: ${errors.length}`);
if (standard.includes('TODO') || standard.includes('{{') || standard.includes('TBD')) throw new Error('Placeholder found');
if (matrix.contracts.length !== 160 || matrix.errors.length !== 58) throw new Error('Matrix totals failed');
if (!matrix.contracts.every((x) => x.owner_package && x.json_schema_or_dto && x.ddl_table_or_value && x.validator && x.repository && x.tests && x.migration_step)) throw new Error('Unassigned contract matrix field');
if (!matrix.errors.every((x) => x.owner_package && x.json_schema_or_dto && x.validator && x.tests && x.migration_step)) throw new Error('Unassigned error matrix field');
const conflictRows = conflicts.split(/\r?\n/).filter((line) => /^\| NC-\d+ /.test(line));
if (conflictRows.length !== 10 || conflictRows.some((line) => line.split('|').length !== 8) || conflicts.includes('решить позднее')) throw new Error('Incomplete conflict record');
console.log('P01 checks passed: 160 contracts, 58 errors, target metadata and complete matrix.');
