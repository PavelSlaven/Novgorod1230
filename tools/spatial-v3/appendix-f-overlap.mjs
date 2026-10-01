// The overlaps of Appendix F (Spatial standard 4.7.0) with an amendment of another document are two blocks:
// `preparation_snapshot_member` (F = Temporal World v4 Appendix A.7 + the `canonical_connection` member) and
// `party_traversal_interval_result` (F = Temporal A.6 + `turn_back` and the outcome `returned_to_departure`, F.1.1).
// A change of the temporal block must be mirrored in F; this check keeps the temporal block a subset of the F block.

const blockOf = (text, name) => text.match(new RegExp(`\`\`\`yaml\\r?\\ncontract_name: ${name}\\r?\\n[\\s\\S]*?\`\`\``))?.[0] ?? null;
const lines = (block) => block.split(/\r?\n/);
const fieldOf = (line) => line.match(/^ {2}(\w+): (required|optional) (.+)$/);
const enumValues = (type) => type.match(/^enum\[(.+)\]$/)?.[1].split(',').map((value) => value.trim()) ?? null;
// invariants of A.7 that F extends (a stem match is enough)
const extendedInvariantStems = ['  - endpoint requires', '  - transfer_scene requires'];

export function preparationSnapshotMemberOverlapErrors(temporalText, standardText, name = 'preparation_snapshot_member', extraStems = [], expectedIdentityOverride = null) {
  const temporal = blockOf(temporalText, name);
  const amended = blockOf(standardText.slice(standardText.indexOf('# Приложение F.')), name);
  if (!temporal) return [`${name}: block is missing in the temporal amendment`];
  if (!amended) return [`${name}: block is missing in Appendix F`];
  const errors = [];
  const amendedLines = lines(amended);
  if (expectedIdentityOverride) {
    const identityStart = amendedLines.indexOf('identity:') + 1;
    const identityEnd = amendedLines.findIndex((line, index) => index >= identityStart && /^[a-z_]+:$/.test(line));
    const amendedIdentity = amendedLines.slice(identityStart, identityEnd < 0 ? undefined : identityEnd)
      .filter((line) => line.startsWith('  - '));
    const expected = expectedIdentityOverride.map((field) => `  - ${field}`);
    if (amendedIdentity.length !== expected.length
      || expected.some((line, index) => amendedIdentity[index] !== line)) {
      errors.push(`${name}: identity override must be exactly ${expected.map((line) => line.trim()).join(', ')}`);
    }
  }
  const amendedFields = new Map(amendedLines.map(fieldOf).filter(Boolean).map((match) => [match[1], match]));
  let section = null;
  for (const line of lines(temporal)) {
    const sectionHeader = line.match(/^([a-z_]+):$/);
    if (sectionHeader) {
      section = sectionHeader[1];
      if (!amendedLines.includes(line)) errors.push(`${name}: header line differs: ${line.trim()}`);
      continue;
    }
    const field = fieldOf(line);
    if (field) {
      const found = amendedFields.get(field[1]);
      if (!found) { errors.push(`${name}: field ${field[1]} of the temporal block is missing in Appendix F`); continue; }
      const [temporalValues, amendedValues] = [enumValues(field[3]), enumValues(found[3])];
      if (temporalValues && amendedValues) {
        for (const value of temporalValues) if (!amendedValues.includes(value)) errors.push(`${name}: ${field[1]} lost enum value ${value}`);
      } else if (found[2] !== field[2] || found[3] !== field[3]) errors.push(`${name}: field ${field[1]} differs (${field[2]} ${field[3]} vs ${found[2]} ${found[3]})`);
    } else if (line.startsWith('  - ')) {
      if (section === 'identity') {
        if (!expectedIdentityOverride && !amendedLines.includes(line)) errors.push(`${name}: identity differs: ${line.trim()}`);
        continue;
      }
      if (section !== 'invariants') continue;
      const stem = [...extendedInvariantStems, ...extraStems].find((prefix) => line.startsWith(prefix));
      const present = stem ? amendedLines.some((candidate) => candidate.startsWith(stem)) : amendedLines.includes(line);
      if (!present) errors.push(`${name}: invariant of the temporal block is missing in Appendix F: ${line.trim().slice(0, 80)}`);
    } else if (/^(contract_name|storage)/.test(line) && !amendedLines.includes(line)) {
      errors.push(`${name}: header line differs: ${line.trim()}`);
    }
  }
  return errors;
}
