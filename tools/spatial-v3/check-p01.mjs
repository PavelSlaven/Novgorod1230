import { readFile } from 'node:fs/promises';

const standard = await readFile('data/knowledge-source/corpus/DOCUMENTS/spatial_architecture_standard_g0_g6.md', 'utf8');
const temporalAmendment = await readFile('data/knowledge-source/corpus/DOCUMENTS/temporal_world_and_interruptible_activities.md', 'utf8');
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
if (matrix.contracts.length !== 213 || matrix.errors.length !== 82) throw new Error('Current target matrix totals failed');
if (!matrix.contracts.every((x) => x.owner_package && x.json_schema_or_dto && x.ddl_table_or_value && x.validator && x.repository && x.tests && x.migration_step)) throw new Error('Unassigned contract matrix field');
if (!matrix.errors.every((x) => x.owner_package && x.json_schema_or_dto && x.validator && x.tests && x.migration_step)) throw new Error('Unassigned error matrix field');
const conflictRows = conflicts.split(/\r?\n/).filter((line) => /^\| NC-\d+ /.test(line));
if (conflictRows.length !== 10 || conflictRows.some((line) => line.split('|').length !== 8) || conflicts.includes('решить позднее')) throw new Error('Incomplete conflict record');
const temporalContracts = [...temporalAmendment.matchAll(/```yaml\r?\ncontract_name:\s*([^\r\n]+)[\s\S]*?```/g)].map((m) => m[1].trim());
const pr8Index = temporalAmendment.indexOf('## A.7.');
const acceptedTemporalContracts = [...temporalAmendment.slice(0, pr8Index).matchAll(/```yaml\r?\ncontract_name:\s*([^\r\n]+)[\s\S]*?```/g)].map((m) => m[1].trim());
const temporalErrorAppendix = temporalAmendment.slice(temporalAmendment.indexOf('# Приложение B. Temporal typed-error amendment'), temporalAmendment.indexOf('# Приложение C.'));
const temporalErrors = [...temporalErrorAppendix.matchAll(/^\|\s*`([^`]+)`\s*\|/gm)].map((m) => m[1]).filter((x) => x !== 'code');
if (!count(acceptedTemporalContracts) || acceptedTemporalContracts.length !== 35) throw new Error('Accepted Temporal 4.3 snapshot audit failed');
const temporalContractCounts = temporalContracts.reduce((result, name) => result.set(name, (result.get(name) ?? 0) + 1), new Map());
const temporalOverrides = [...temporalContractCounts].filter(([, occurrences]) => occurrences > 1);
if (
  temporalContracts.length !== 62
  || new Set(temporalContracts).size !== 61
  || temporalOverrides.length !== 1
  || temporalOverrides[0][0] !== 'npc_decision_option'
  || temporalOverrides[0][1] !== 2
  || !count(temporalErrors)
  || temporalErrors.length !== 24
) throw new Error('Current Temporal/PR8 amendment audit failed');
const currentContracts = new Set([...contracts, ...temporalContracts]);
const currentErrors = new Set([...errors, ...temporalErrors]);
if (currentContracts.size !== 213 || currentErrors.size !== 82) throw new Error('Current 4.4 target union audit failed');
console.log('P01 checks passed: historical P05 160/58 and Temporal 4.3 188/82 are immutable; current 4.4 target union is 213 contracts/82 errors.');
