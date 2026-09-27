// Builds services.csv for the services_hire_labor domain (group economy-trade-measures).
//
// Source basis: tools/rus13-novgorod-regional-templates/{novgorod_goods_prices_v1.tsv (service
// categories),novgorod_trade_rules_v1.json (exchange_forms closed vocabulary),
// novgorod_route_knowledge_rules_v1.json (guide_rules for провожатый)}; wk:residual-law-norms-v1
// (approved -- Правда Русская statutes on закуп, for labor_relation_ref); book:641351 (Правда
// Русская translation) for the rare directly-attested labor rate (городник).
//
// Run: node build_services.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { toCSV } from "../../scripts/lib_csv.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..", "..", "..", "..", "..");
const TSV_PATH = join(REPO_ROOT, "tools", "rus13-novgorod-regional-templates", "novgorod_goods_prices_v1.tsv");
const OUT = join(__dirname, "..", "services.csv");

function loadTSV(path) {
  const raw = readFileSync(path, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const header = lines[0].split("\t");
  return lines.slice(1).map((l) => {
    const cells = l.split("\t");
    const o = {};
    header.forEach((h, i) => (o[h] = cells[i]));
    return o;
  });
}

const SERVICE_CATEGORIES = new Set([
  "transport_service", "service", "service_lodging", "food_service", "service_care",
  "medical", "repair", "repair_transport", "storage_service", "religious_service",
  "ritual_food", "lodging_religious", "dues", "labor", "labor_transport",
  "service_message", "service_literacy", "credit", "credit_labor", "credit_food", "law_custom",
]);

// closed vocabulary of payment forms, taken from novgorod_trade_rules_v1.json#exchange_forms
const EXCHANGE_FORM_IDS = [
  "exchange_barter", "exchange_silver_coin", "exchange_debt", "exchange_pledge",
  "exchange_labor", "exchange_guarantor", "exchange_witness", "exchange_gift_donation",
  "exchange_dues", "exchange_emergency",
];

function mapExchangeForms(tsvText) {
  // tsv column common_exchange_forms uses free-text tokens; map to the closed exchange_* ids.
  const map = {
    barter: "exchange_barter",
    silver_or_coin_if_available: "exchange_silver_coin",
    debt: "exchange_debt",
    pledge: "exchange_pledge",
    labor: "exchange_labor",
    witness_backed_promise: "exchange_witness",
  };
  return tsvText.split(";").map((t) => t.trim()).map((t) => map[t] || t).filter(Boolean).join(";");
}

// labor_relation_ref: link services touching hired/dependent labor to the approved Pravda/zakup basis.
const LABOR_RELATION_BY_CATEGORY = {
  labor: "wk:residual-law-norms-v1#claim:residual-law-zakup-loss-context;book:641351§Правда Русская(наём, ставки городника: 1 куна закладка + 1 ногата окончание + 7 кун корм/неделю)",
  labor_transport: "wk:residual-law-norms-v1#claim:residual-law-zakup-loss-context (закуп отвечает за утрату по хозяйственному поручению в зависимости от обстоятельств, не автоматически)",
  service: "tools/rus13-novgorod-regional-templates/novgorod_route_knowledge_rules_v1.json#guide_rules (guide_requires_causal_basis,guide_payment_and_status,guide_may_refuse,guide_deception)",
  credit_labor: "wk:residual-law-norms-v1#claim:residual-law-zakup-complaint-not-escape,claim:residual-law-zakup-illegal-sale (долг работой близок к статусу закупа — не обельное холопство)",
  law_custom: "wk:residual-law-norms-v1#claim:residual-law-status-and-witness-exceptions (вес свидетельства зависит от статуса)",
};

const goodsPricesTsv = loadTSV(TSV_PATH).filter((r) => SERVICE_CATEGORIES.has(r.category));

const header = [
  "sv_id", "service_kind", "provider_roles", "payment_forms", "value_band_ref",
  "season_periods", "labor_relation_ref", "source_refs", "confidence",
];

const rows = goodsPricesTsv.map((item) => ({
  sv_id: `sv_${item.price_entry_id.replace(/^price_/, "")}`,
  service_kind: item.category,
  provider_roles: item.who_sells,
  payment_forms: mapExchangeForms(item.common_exchange_forms),
  value_band_ref: item.base_value_band,
  season_periods: item.seasonal_variation,
  labor_relation_ref: LABOR_RELATION_BY_CATEGORY[item.category] || "",
  source_refs: `tools/rus13-novgorod-regional-templates/novgorod_goods_prices_v1.tsv#${item.price_entry_id}` +
    (LABOR_RELATION_BY_CATEGORY[item.category] ? "; " + LABOR_RELATION_BY_CATEGORY[item.category].split(";")[0].split(" (")[0] : ""),
  confidence: "C",
}));

// hand-added rows not present in the tsv but explicitly required by the brief
// (перевоз, ночлег are already covered by the tsv; проводник/наймит/закуп/рядович need the
// direct legal-status links the tsv does not carry):
rows.push({
  sv_id: "sv_guide_local_status_link", service_kind: "service",
  provider_roles: "проводник; местный житель (см. также price_guide_local в price_bands)",
  payment_forms: "exchange_barter;exchange_silver_coin;exchange_labor;exchange_guarantor",
  value_band_ref: "ordinary",
  season_periods: "хуже доступен в распутицу/паводок/метель (см. route_season_modifiers)",
  labor_relation_ref: "tools/rus13-novgorod-regional-templates/novgorod_route_knowledge_rules_v1.json#guide_may_refuse,guide_deception",
  source_refs: "tools/rus13-novgorod-regional-templates/novgorod_route_knowledge_rules_v1.json",
  confidence: "C",
});
rows.push({
  sv_id: "sv_naymit_zakup_status", service_kind: "labor_relation_reference (не отдельная услуга — правовой статус нанятого)",
  provider_roles: "наймит; закуп; рядович",
  payment_forms: "exchange_labor;exchange_debt",
  value_band_ref: "",
  season_periods: "",
  labor_relation_ref: "wk:residual-law-norms-v1#claim:residual-law-zakup-complaint-not-escape,claim:residual-law-zakup-loss-context,claim:residual-law-zakup-illegal-sale,claim:residual-law-status-and-witness-exceptions (approved; статьи 52-55, 59 Пространной Правды: закуп НЕ обельный холоп, ответственность зависит от обстоятельств утраты, послушество закупа ограничено но допускается в малой тяжбе)",
  source_refs: "wk:residual-law-norms-v1 (production-v1, approved)",
  confidence: "A",
});

writeFileSync(OUT, toCSV(header, rows), "utf8");
console.log(`services.csv: ${rows.length} rows`);
