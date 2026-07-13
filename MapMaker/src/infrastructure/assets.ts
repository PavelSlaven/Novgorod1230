const ICONS: Record<string, string> = {
  generic_place: "◆", entrance: "⇥", exit: "⇤", road: "↟", street: "╬", yard: "▣",
  dwelling: "⌂", market: "⚖", church: "✚", monastery: "♜", authority: "♛", guard: "⚔",
  workshop: "⚒", storage: "▤", stable: "♞", livestock: "♉", field: "≋", garden: "♧",
  forest: "♠", hunting: "⌖", camp: "△", dock: "⚓", riverbank: "≈", bridge: "═",
  ford: "⋯", ferry: "◒", ruin: "◫", hidden_passage: "◌"
};

export function iconDataUri(key: string): string {
  const glyph = ICONS[key] ?? ICONS.generic_place!;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="29" fill="#efe2bd" stroke="#493a2a" stroke-width="3"/><text x="32" y="42" text-anchor="middle" font-family="Georgia,serif" font-size="31" fill="#34291e">${glyph}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
