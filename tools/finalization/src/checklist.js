export function parseManualChecklist(markdown, manualGates) {
  const rows = String(markdown ?? '').split(/\r?\n/u)
    .map((line) => /^\s*-\s*\[([ xX])\]\s+(.+?)\s*$/u.exec(line))
    .filter(Boolean)
    .map((match) => ({ checked: match[1].toLowerCase() === 'x', text: match[2] }));

  return manualGates.map((gate) => {
    const row = rows.find((item) => item.text.includes(gate.checklist_marker));
    return Object.freeze({
      id: gate.id,
      required_actor: gate.required_actor,
      checked: Boolean(row?.checked),
      found: Boolean(row),
      text: row?.text ?? null
    });
  });
}
