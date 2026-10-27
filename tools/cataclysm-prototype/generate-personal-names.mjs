import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "../../data/world-catalogs/novgorod/game-base-v1/nature-materials-weather/_shared/scripts/lib.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "../..");
const SOURCE_PATH = path.join(ROOT_DIR, "data/world-catalogs/novgorod/game-base-v1/names-peoples/personal_names/name_pool_entries.csv");
const DEFAULT_OUTPUT_PATH = path.join(SCRIPT_DIR, "dev-world/personal-names.generated.json");
const POOL_ID = "novgorod_1230_1250_personal_names_v1";
const SEX_CATEGORIES = ["male", "female"];

function compareLexically(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function projectRows(rows) {
  const selected = rows.filter((row) => row.name_pool_id === POOL_ID
    && row.selection_class === "ordinary"
    && SEX_CATEGORIES.includes(row.sex_category));

  for (const row of selected) {
    if (!row.id || !row.name_form) {
      throw new Error(`selected row must have non-empty id and name_form: ${row.id || "<missing id>"}`);
    }
  }

  return Object.fromEntries(SEX_CATEGORIES.map((sex) => [
    sex,
    selected.filter((row) => row.sex_category === sex)
      .sort((left, right) => compareLexically(left.id, right.id)),
  ]));
}

function createModJson(rowsBySex) {
  return [
    {
      type: "snippet",
      category: "<male_full_name>",
      text: rowsBySex.male.map((row) => row.name_form),
      override: true,
    },
    {
      type: "snippet",
      category: "<female_full_name>",
      text: rowsBySex.female.map((row) => row.name_form),
      override: true,
    },
  ];
}

function parseArguments(args) {
  let check = false;
  let outputPath = DEFAULT_OUTPUT_PATH;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--check") {
      check = true;
    } else if (args[index] === "--output") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--output requires a path");
      outputPath = path.resolve(process.cwd(), value);
      index += 1;
    } else {
      throw new Error(`unknown argument: ${args[index]}`);
    }
  }
  return { check, outputPath };
}

function main() {
  const { check, outputPath } = parseArguments(process.argv.slice(2));
  const rows = parseCsv(fs.readFileSync(SOURCE_PATH, "utf8"));
  const rowsBySex = projectRows(rows);
  const expected = Buffer.from(`${JSON.stringify(createModJson(rowsBySex), null, 2)}\n`, "utf8");

  if (check) {
    let actual;
    try {
      actual = fs.readFileSync(outputPath);
    } catch (error) {
      if (error.code === "ENOENT") throw new Error(`generated personal names are missing: ${outputPath}`);
      throw error;
    }
    if (!actual.equals(expected)) throw new Error(`generated personal names are stale: ${outputPath}`);
    console.log(`generated personal names are current: ${outputPath}`);
    return;
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, expected);
  console.log(`generated personal names: ${outputPath}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
