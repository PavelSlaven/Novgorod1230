const OBSERVE_RE = /(осмотр|осматри|огляд|look|смотрю|гляжу)/i;
const WAIT_RE = /(жду|ждать|подожду|wait|ожид)/i;
const MOVE_RE = /(иду|пойду|еду|поеду|отправлюсь|пойдем|пойдём|go|move|ед)/i;
const TALK_RE = /(говор|спрошу|спросить|поговор|ask|say|talk)/i;
const REST_RE = /(отдох|сплю|спать|rest|sleep)/i;
const HEAL_RE = /(леч|перевяз|бинт|обработ|зажив|кровотеч|ран[ауы]|medicine|heal|treat)/i;
const DEFEND_RE = /(защищ|оборон|парир|уклон|block|defend)/i;
const FLEE_RE = /(бегу|сбег|убег|побег|flee|run away|escape)/i;
const TRADE_RE = /(куп|прод|обмен|trade|sell|buy)/i;
const STEAL_RE = /(крад|ворую|украд|steal|stealing|pickpocket)/i;
const ATTACK_RE = /(удар|напад|убью|kill|attack|hit|стреля|выстрел)/i;
const CLAIM_RE = /(я (?:сын|дочь|друг|родственник|посланник)|моё имя|моя правда|я из)/i;
const RETURN_RE = /(вернуться|назад|обратно|return back)/i;
const ROUTE_INQUIRY_RE = /(как (?:добраться|дойти|пройти|проехать|попасть)|куда (?:идти|ехать)|путь|дорог|маршрут|переправ|тракт|сколько идти)/i;

const INSPECT_ITEM_RE = /(осматриваю предмет|изучаю предмет|inspect item|examine item|осмотреть предмет)/i;
const OPEN_CONTAINER_RE = /(открываю|отпереть|open|unlock)/i;
const SEARCH_CONTAINER_RE = /(обыскиваю|ищу в|search|loot|rifle through)/i;
const EQUIP_RE = /(надеваю|экипирую|беру в руку|equip|wear|wield)/i;
const UNEQUIP_RE = /(снимаю|убираю за пояс|unequip|remove|sheathe)/i;
const USE_RE = /(использую|применяю|use|apply)/i;
const GIVE_RE = /(?:^|\s)(?:даю|передаю)(?:\s|$)|(?:^|\s)give(?:\s|$)|hand over/i;
const TAKE_RE = /(?:^|\s)(?:беру|взять|поднимаю|подобрать)(?:\s|$)|(?:^|\s)(?:take|pick up)(?:\s|$)/i;
const RETRIEVE_RE = /(?:^|\s)(?:достаю|достать)(?:\s|$)|(?:^|\s)(?:retrieve|pull out|get out)(?:\s|$)/i;
const STORE_RE = /(?:кладу|положить|положу|убираю)\s+.+\s+в\s+/i;
const DROP_RE = /(?:^|\s)(?:бросаю|бросить|оставляю|оставить)(?:\s|$)|(?:^|\s)(?:drop|put down|leave behind)(?:\s|$)/i;
const HIDE_RE = /(?:^|\s)(?:прячу|спрятать)(?:\s|$)|(?:^|\s)(?:hide|conceal)(?:\s|$)/i;

export const INVENTORY_INTENT_TYPES = new Set([
  'trade',
  'steal',
  'item_take',
  'item_drop',
  'item_store',
  'item_retrieve',
  'item_open_container',
  'item_search_container',
  'item_equip',
  'item_unequip',
  'item_use',
  'item_give',
  'item_hide',
  'item_inspect'
]);

export function isInventoryIntent(type) {
  return INVENTORY_INTENT_TYPES.has(String(type ?? '').toLowerCase());
}

export function classifyIntent(rawText) {
  const text = rawText.trim();
  const lower = text.toLowerCase();
  const target = extractTarget(lower);
  const routeInquiry = ROUTE_INQUIRY_RE.test(lower);
  const focus = deriveIntentFocus(lower);

  if (INSPECT_ITEM_RE.test(lower)) {
    return { type: 'item_inspect', raw: text, target, routeInquiry, focus };
  }
  if (SEARCH_CONTAINER_RE.test(lower)) {
    return { type: 'item_search_container', raw: text, target, routeInquiry, focus };
  }
  if (OPEN_CONTAINER_RE.test(lower) && /(сундук|ларец|мешок|сумк|ящик|контейнер|короб|бочк|сунд|chest|bag|box|container)/i.test(lower)) {
    return { type: 'item_open_container', raw: text, target, routeInquiry, focus };
  }
  if (EQUIP_RE.test(lower)) {
    return { type: 'item_equip', raw: text, target, routeInquiry, focus };
  }
  if (UNEQUIP_RE.test(lower)) {
    return { type: 'item_unequip', raw: text, target, routeInquiry, focus };
  }
  if (USE_RE.test(lower)) {
    return { type: 'item_use', raw: text, target, routeInquiry, focus };
  }
  if (GIVE_RE.test(lower)) {
    return { type: 'item_give', raw: text, target, routeInquiry, focus };
  }
  if (STORE_RE.test(lower)) {
    return { type: 'item_store', raw: text, target, routeInquiry, focus };
  }
  if (RETRIEVE_RE.test(lower)) {
    return { type: 'item_retrieve', raw: text, target, routeInquiry, focus };
  }
  if (HIDE_RE.test(lower)) {
    return { type: 'item_hide', raw: text, target, routeInquiry, focus: focus ?? 'stealth' };
  }
  if (DROP_RE.test(lower)) {
    return { type: 'item_drop', raw: text, target, routeInquiry, focus };
  }
  if (TAKE_RE.test(lower)) {
    return { type: 'item_take', raw: text, target, routeInquiry, focus };
  }

  if (OBSERVE_RE.test(lower)) {
    return { type: 'observe', raw: text, target, routeInquiry, focus };
  }
  if (WAIT_RE.test(lower)) {
    return { type: 'wait', raw: text, target, routeInquiry, focus };
  }
  if (RETURN_RE.test(lower)) {
    return { type: 'return', raw: text, target, routeInquiry, focus: focus ?? 'endurance' };
  }
  if (MOVE_RE.test(lower)) {
    return { type: 'move', raw: text, target, routeInquiry, focus: focus ?? 'endurance' };
  }
  if (TALK_RE.test(lower)) {
    return { type: 'talk', raw: text, target, routeInquiry, focus };
  }
  if (REST_RE.test(lower)) {
    return { type: 'rest', raw: text, target, routeInquiry, focus };
  }
  if (HEAL_RE.test(lower)) {
    return { type: 'heal', raw: text, target, routeInquiry, focus: focus ?? 'attention' };
  }
  if (DEFEND_RE.test(lower)) {
    return { type: 'defend', raw: text, target, routeInquiry, focus: focus ?? 'strength' };
  }
  if (FLEE_RE.test(lower)) {
    return { type: 'flee', raw: text, target, routeInquiry, focus: focus ?? 'endurance' };
  }
  if (TRADE_RE.test(lower)) {
    return { type: 'trade', raw: text, target, routeInquiry, focus };
  }
  if (STEAL_RE.test(lower)) {
    return { type: 'steal', raw: text, target, routeInquiry, focus: 'stealth' };
  }
  if (ATTACK_RE.test(lower)) {
    return { type: 'attack', raw: text, target, routeInquiry, focus: focus ?? 'strength' };
  }
  if (CLAIM_RE.test(lower)) {
    return { type: 'claim', raw: text, target, routeInquiry, focus };
  }

  return { type: 'unknown', raw: text, target, routeInquiry, focus };
}

function extractTarget(text) {
  const patterns = [
    /к ([\p{L}\- ]+)/u,
    /с ([\p{L}\- ]+)/u,
    /про ([\p{L}\- ]+)/u,
    /во ([\p{L}\- ]+)/u,
    /на ([\p{L}\- ]+)/u,
    /в ([\p{L}\- ]+)/u,
    /из ([\p{L}\- ]+)/u
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].trim().replace(/[.,!?]+$/u, '');
    }
  }

  const inline = text.match(/(?:беру|взять|открываю|обыскиваю|надеваю|снимаю|использую|передаю|даю|достаю|кладу|бросаю)\s+([\p{L}\- ]+)/iu);
  if (inline?.[1]) {
    return inline[1].trim().replace(/[.,!?]+$/u, '');
  }

  return '';
}

function deriveIntentFocus(text) {
  if (/(лук|арбал|стрел|метан|брос)/i.test(text)) return 'ranged';
  if (/(тих|крад|скрыт)/i.test(text)) return 'stealth';
  if (/(борь|захват|толк|удерж)/i.test(text)) return 'grapple';
  if (/(рана|кров|перевяз|бинт|леч)/i.test(text)) return 'injury';
  return null;
}
