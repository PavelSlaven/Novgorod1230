const NODE_RULES: Array<[RegExp, string]> = [
  [/church|chapel|temple|погост/i, "church"], [/monastery/i, "monastery"],
  [/market|trade/i, "market"], [/yard|courtyard/i, "yard"], [/house|dwelling|homestead/i, "dwelling"],
  [/workshop|craft/i, "workshop"], [/warehouse|storage|barn/i, "storage"], [/stable|horse/i, "stable"],
  [/forest|grove/i, "forest"], [/field|meadow/i, "field"], [/garden/i, "garden"],
  [/dock|pier|harbor/i, "dock"], [/river|bank/i, "riverbank"], [/bridge/i, "bridge"],
  [/gate|entrance/i, "entrance"], [/road|street/i, "road"], [/camp|hunt/i, "camp"], [/ruin/i, "ruin"]
];

const EDGE_ALIASES: Record<string, string> = {
  road: "road", route: "road", corridor_segment: "corridor_segment", street: "street",
  path: "path", trail: "path", forest_track: "forest_track", river: "river", lake_route: "lake_route",
  winter_road: "winter_road", yard_passage: "yard_passage", door: "door", gate: "gate",
  bridge: "bridge", ford: "ford", ferry: "ferry", offroad_crossing: "offroad_crossing",
  border_transition: "border_transition"
};

export const markerForEdge = (edgeType: string): string | undefined =>
  ["bridge", "gate", "door", "ford", "ferry"].includes(edgeType) ? edgeType : undefined;

export const styleForEdge = (edgeType: string): string => EDGE_ALIASES[edgeType] ?? "other";

export function iconForNode(nodeType: string): string {
  return NODE_RULES.find(([pattern]) => pattern.test(nodeType))?.[1] ?? "generic_place";
}

export const EDGE_LABELS: Record<string, string> = {
  road: "Дорога", corridor_segment: "Магистраль", street: "Улица", path: "Тропа",
  forest_track: "Лесная тропа", river: "Река", lake_route: "Водный путь", winter_road: "Зимник",
  yard_passage: "Проход", door: "Дверь", gate: "Ворота", bridge: "Мост", ford: "Брод",
  ferry: "Переправа", offroad_crossing: "Вне дорог", border_transition: "Выход", other: "Связь"
};
