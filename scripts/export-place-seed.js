import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const xlsxPath = path.join(root, 'infra/world-base/place_templates_scientific_v2_fixed.xlsx');
const outPath = path.join(root, 'infra/world-base/place_templates.seed.json');

const PYTHON = `
import json, re, sys, zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
BOOL_COLS = {
    "can_exist_inside_landscape", "requires_water_nearby", "requires_route_nearby", "requires_land_use",
}
JSON_ARRAY_COLS = {
    "compatible_landscape_template_ids", "compatible_water_body_template_ids",
    "compatible_route_template_ids", "compatible_land_use_template_ids", "sources",
}

def col_to_idx(col):
    n = 0
    for c in col:
        n = n * 26 + (ord(c) - 64)
    return n - 1

def cell_ref_parts(ref):
    m = re.match(r"([A-Z]+)(\\d+)", ref)
    return col_to_idx(m.group(1)), int(m.group(2)) - 1

def parse_bool(val):
    s = str(val or "").strip().lower()
    return s in ("1", "true", "yes")

def parse_json_array(val):
    s = str(val or "").strip()
    if not s:
        return []
    try:
        parsed = json.loads(s)
        return parsed if isinstance(parsed, list) else []
    except json.JSONDecodeError:
        return []

def empty_to_null(val):
    s = "" if val is None else str(val).strip()
    return None if s == "" else s

xlsx = Path(sys.argv[1])
out_path = Path(sys.argv[2])
with zipfile.ZipFile(xlsx) as z:
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        root = ET.fromstring(z.read("xl/sharedStrings.xml"))
        for si in root.findall("m:si", NS):
            texts = [t.text or "" for t in si.findall(".//m:t", NS)]
            shared.append("".join(texts))
    sheet = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
    grid = {}
    for cell in sheet.findall(".//m:sheetData/m:row/m:c", NS):
        ref = cell.get("r")
        col, row = cell_ref_parts(ref)
        t = cell.get("t")
        v = cell.find("m:v", NS)
        val = v.text if v is not None else ""
        if t == "s":
            val = shared[int(val)]
        elif t == "inlineStr":
            is_el = cell.find("m:is/m:t", NS)
            val = is_el.text if is_el is not None else ""
        grid.setdefault(row, {})[col] = val

max_row = max(grid)
max_col = max(max(r) for r in grid.values())
header = [grid[0].get(i, "") for i in range(max_col + 1)]

rows = []
for row_idx in range(1, max_row + 1):
    raw = {header[i]: grid[row_idx].get(i, "") for i in range(len(header))}
    out = {}
    for key, val in raw.items():
        if key in BOOL_COLS:
            out[key] = parse_bool(val)
        elif key in JSON_ARRAY_COLS:
            out[key] = parse_json_array(val)
        elif key in ("id", "slug", "title", "place_kind", "status", "confidence"):
            out[key] = str(val).strip()
        else:
            out[key] = empty_to_null(val)
    if not out.get("id"):
        continue
    rows.append(out)

out_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\\n", encoding="utf-8")
print(len(rows))
`;

const result = spawnSync('python', ['-c', PYTHON, xlsxPath, outPath], {
  encoding: 'utf-8',
  maxBuffer: 10 * 1024 * 1024,
});

if (result.status !== 0) {
  console.error(result.stderr || 'export-place-seed: python failed');
  process.exit(result.status ?? 1);
}

const count = Number(String(result.stdout).trim());
console.log(`wrote ${outPath} (${count} rows)`);
