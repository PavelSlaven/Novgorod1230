export function validateFiniteInitialAmountChoices(value, path, errors, exactObject, stringConst, nonemptyString, issue) {
  if (!Array.isArray(value)) { issue(errors, path, 'type', `${path} must be an array.`); return; }
  value.forEach((entry, index) => {
    const itemPath = `${path}[${index}]`;
    if (!exactObject(entry, ['schema', 'selection_ref'], itemPath, errors)) return;
    stringConst(entry.schema, 'finite_source_initial_amount_choice_v1', `${itemPath}.schema`, errors);
    nonemptyString(entry.selection_ref, `${itemPath}.selection_ref`, errors);
  });
}

export function validateFiniteInitialAmountChoiceBinding({ entity, path, choices, errors, issue }) {
  const choice = entity.finite_source_initial_amount_choice;
  if (choices == null) {
    if (choice !== undefined) issue(errors, `${path}.finite_source_initial_amount_choice`, 'forbidden', 'finite source initialization choice was not supplied by the request.');
    return;
  }
  if (choice === undefined) issue(errors, `${path}.finite_source_initial_amount_choice`, 'required', 'finite source initialization choice is required.');
  else if (!choices.some((entry) => entry.schema === choice.schema && entry.selection_ref === choice.selection_ref)) issue(errors, `${path}.finite_source_initial_amount_choice`, 'enum', 'finite source initialization choice must be supplied by the request.');
}
