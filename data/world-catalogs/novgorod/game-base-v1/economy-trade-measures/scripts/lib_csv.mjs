// Minimal RFC4180 CSV writer shared by the economy-trade-measures build scripts.
// Deterministic, no dependencies (project rule: prefer deterministic scripts over model authoring for mechanical output).

export function csvField(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function toCSV(header, rows) {
  const lines = [header.map(csvField).join(",")];
  for (const row of rows) {
    lines.push(header.map((h) => csvField(row[h])).join(","));
  }
  return lines.join("\n") + "\n";
}
