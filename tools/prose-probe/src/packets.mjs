import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { read, json, output, serialize, checkMoments } from './files.mjs';

function clean(text) {
  return String(text).replace(/<\/?color(?:_[^>]*)?>/g, '').replace(/^[+]+\s*/u, '').replace(/\d+/g, value => words(Number(value))).trim();
}

export function words(number) {
  if (!Number.isSafeInteger(number) || number < 0 || number > 999) throw new Error(`Нельзя передать количество ${number}`);
  const units = ['ноль', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
  const teens = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
  const tens = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
  const hundreds = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];
  if (number < 10) return units[number];
  if (number < 20) return teens[number - 10];
  if (number < 100) return [tens[Math.floor(number / 10)], number % 10 ? words(number % 10) : ''].filter(Boolean).join(' ');
  if (number < 1000) return [hundreds[Math.floor(number / 100)], number % 100 ? words(number % 100) : ''].filter(Boolean).join(' ');
}

function lines(text, path) {
  return text.split(/\r?\n/).filter(line => line.trim()).map((line, index) => {
    try { return JSON.parse(line); } catch (error) { throw new Error(`${path}, строка ${index + 1}: ${error.message}`); }
  });
}

async function gameData(dirs) {
  const descriptions = new Map();
  const items = new Map();
  async function visit(path) {
    const entries = await readdir(path, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const file = join(path, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.name.endsWith('.json')) {
        const data = await json(file);
        for (const definition of Array.isArray(data) ? data : [data]) {
          const text = definition.description;
          const value = typeof text === 'string' ? text : text?.str ?? text?.str_sp;
          if (typeof value === 'string') for (const id of Array.isArray(definition.id) ? definition.id : [definition.id]) if (typeof id === 'string') descriptions.set(id, value);
          if (definition.type !== 'ITEM' || typeof definition.id !== 'string') continue;
          const prior = items.get(definition.id);
          const rawName = typeof definition.name === 'string' ? definition.name : definition.name?.str || definition.name?.str_sp;
          const declaredCopyFrom = typeof definition['copy-from'] === 'string' ? definition['copy-from'] : undefined;
          const hasName = typeof rawName === 'string' && rawName.trim();
          const name = hasName ? rawName : declaredCopyFrom && declaredCopyFrom !== definition.id ? undefined : prior?.name;
          const copyFrom = declaredCopyFrom
            ? declaredCopyFrom === definition.id ? prior?.copyFrom ?? definition.id : declaredCopyFrom
            : prior?.copyFrom;
          items.set(definition.id, { name, copyFrom });
        }
      }
    }
  }
  for (const dir of dirs ?? []) await visit(dir);
  function itemNameById(id) {
    const requested = id;
    const seen = new Set();
    while (typeof id === 'string' && id && !seen.has(id)) {
      seen.add(id);
      const item = items.get(id);
      if (!item) break;
      const name = clean(item.name ?? '');
      if (name) return name;
      id = item.copyFrom;
    }
    throw new Error(`Нет названия ITEM ${requested} в --game-data`);
  }
  return { descriptions, itemNameById };
}

const positionKey = position => JSON.stringify(position);
const sceneKey = frame => JSON.stringify([frame.place.name, frame.place.roofed, frame.place.outside, frame.place.overmap_position]);
const neutral = label => label === null || label === undefined || label === '' || label === 'Нет';

function inPlace(position, frame) {
  // CDDA projects map squares to overmap terrain by floor division (coordinates.h, map_scale_constants.h).
  return Math.floor(position[0] / 24) === frame.place.overmap_position[0] && Math.floor(position[1] / 24) === frame.place.overmap_position[1] && position[2] === frame.place.overmap_position[2];
}

function directionAt(position, hero) {
  const x = position[0] - hero[0];
  const y = position[1] - hero[1];
  if (!x && !y) return 'центр';
  const octant = Math.trunc(Math.atan2(x, y) / (Math.PI / 8));
  return ({ 0: 'юг', 1: 'юго-восток', 2: 'юго-восток', 3: 'восток', 4: 'восток', 5: 'северо-восток', 6: 'северо-восток', 7: 'север', 8: 'север', '-1': 'юго-запад', '-2': 'юго-запад', '-3': 'запад', '-4': 'запад', '-5': 'северо-запад', '-6': 'северо-запад', '-7': 'север', '-8': 'север' })[octant];
}

function location(direction, far = false) {
  const positions = { север: 'к северу от героя', юг: 'к югу от героя', запад: 'к западу от героя', восток: 'к востоку от героя', 'северо-запад': 'к северо-западу от героя', 'северо-восток': 'к северо-востоку от героя', 'юго-запад': 'к юго-западу от героя', 'юго-восток': 'к юго-востоку от героя' };
  return `${far ? 'вдали, ' : ''}${positions[direction] ?? 'рядом с героем'}`;
}

const sentence = text => text[0].toUpperCase() + text.slice(1);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const itemName = item => clean(item.name).split(/\s*>\s*/u);
const changingState = new Set(['Пора суток', 'Погода', 'Свет', 'Самочувствие']);
const distanceAt = (position, hero) => Math.trunc(Math.hypot(...position.map((value, index) => value - hero[index])));
const postureWords = { standing: 'стоит', sitting: 'сидит', crouching: 'держится пригнувшись', prone: 'лежит' };
const attentionWords = { attends: 'внимательно слушает героя', unaware: 'не видит героя', notices: 'видит героя' };

function creatureStateText(creature, data) {
  const lines = [];
  const name = clean(creature.name);
  if (creature.activity !== undefined && creature.activity !== null) {
    const verb = typeof creature.activity.verb === 'string' ? clean(creature.activity.verb) : '';
    if (!verb) throw new Error(`Нет глагола занятия у существа «${name}»`);
    lines.push(`Текущее занятие существа «${name}» — «${verb}».`);
    if (creature.activity.tool !== undefined && creature.activity.tool !== null) lines.push(`Орудие — «${data.itemNameById(creature.activity.tool)}».`);
    if (creature.activity.material !== undefined && creature.activity.material !== null) lines.push(`Материалом служит «${data.itemNameById(creature.activity.material)}».`);
  }
  if (creature.posture !== undefined && creature.posture !== null) {
    const word = Object.hasOwn(postureWords, creature.posture) ? postureWords[creature.posture] : null;
    if (!word) throw new Error(`Неизвестная поза существа «${name}»: ${creature.posture}`);
    lines.push(`${name} ${word}.`);
  }
  if (creature.attention !== undefined && creature.attention !== null) {
    const word = Object.hasOwn(attentionWords, creature.attention) ? attentionWords[creature.attention] : null;
    if (!word) throw new Error(`Неизвестный отклик существа «${name}»: ${creature.attention}`);
    lines.push(`${name} ${word}.`);
  }
  return lines.length ? ` ${lines.join(' ')}` : '';
}

function itemSentence(item, prefix, descriptions) {
  const [name, ...contents] = itemName(item);
  let text = `${prefix} — ${name}.`;
  for (let index = 0; index < contents.length; index++) text += ` При предмете «${index ? contents[index - 1] : name}» находилось ${contents[index]}.`;
  if (descriptions.has(item.type)) text += ` ${clean(descriptions.get(item.type))}`;
  return text;
}

function project(frame, data, knownDoors) {
  const { descriptions } = data;
  const facts = new Map();
  const add = (key, section, text, extra = {}) => facts.set(key, { section, text, state: text, ...extra });
  add('hero', 'Герой', `Имя героя — ${clean(frame.player_state.name)}. Герой — ${frame.player_state.male ? 'мужчина' : 'женщина'}.`);
  add('place', 'Место', `Место — ${clean(frame.place.name)}. Герой ${frame.place.outside ? 'находился снаружи' : 'не находился снаружи'}. ${frame.place.roofed ? 'Над ним была крыша' : 'Над ним не было крыши'}.`);
  if (frame.clock?.time_of_day) add('time', 'Пора суток', `Пора суток описывалась словами «${clean(frame.clock.time_of_day).toLowerCase()}».`);
  if (frame.weather?.name) add('weather:name', 'Погода', `Погода описывалась словом «${clean(frame.weather.name).toLowerCase()}».`);
  if (frame.weather?.wind_label) add('weather:wind', 'Погода', `Ветер описывался словом «${clean(frame.weather.wind_label).toLowerCase()}».`);
  if (frame.weather?.wind_direction_label) add('weather:direction', 'Погода', `Ветер дул с направления «${clean(frame.weather.wind_direction_label).toLowerCase()}».`);
  if (frame.light?.label) add('light', 'Свет', `На месте героя было ${clean(frame.light.label)}.`);
  const body = {
    pain_label: ['Боль ощущалась как', 'Боль прошла.'],
    hunger_label: ['Голод ощущался как', 'Голод прошёл.'],
    thirst_label: ['Жажда ощущалась как', 'Жажда прошла.'],
    sleepiness_label: ['Сонливость ощущалась как', 'Сонливость прошла.'],
    weariness_label: ['Усталость ощущалась как', 'Усталость прошла.'],
    warmth_label: ['Тепловое ощущение героя описывалось словом', 'Прежнее тепловое ощущение прошло.'],
    weight_label: ['Телосложение героя описывалось словом', 'Прежнее ощущение телосложения больше не отмечалось.'],
    activity_label: ['Нагрузка героя описывалась словом', 'Прежняя нагрузка закончилась.'],
    wetness_label: ['Влажность тела ощущалась как', 'Прежняя влажность тела больше не ощущалась.']
  };
  for (const [key, [prefix, removal]] of Object.entries(body)) if (!neutral(frame.player_state[key])) add(`body:${key}`, 'Самочувствие', `${prefix} «${clean(frame.player_state[key]).toLowerCase()}».`, { removal });
  const carried = (item, held) => {
    const [label] = itemName(item);
    add(`item:${item.uid}`, 'При себе', itemSentence(item, held ? 'В руках у героя' : 'При герое', descriptions), { label, state: [clean(item.name), held], removal: `При герое больше не видно предмета «${label}».` });
  };
  for (const item of frame.inventory ?? []) carried(item, false);
  if (frame.player_state.wielded) carried(frame.player_state.wielded, true);
  const visible = new Set();
  const terrain = new Map();
  for (const group of frame.visible_terrain ?? []) for (const position of group.positions) {
    const pos = positionKey(position);
    visible.add(pos);
    if (inPlace(position, frame)) terrain.set(pos, { ...group, position });
  }
  const occupied = new Set();
  const addObject = object => {
    const pos = positionKey(object.position);
    const key = object.kind === 'ground_item' ? `ground:${object.item.uid}` : `${object.kind}:${pos}:${object.kind === 'field' ? object.type : ''}`;
    const label = object.item ? itemName(object.item)[0] : clean(object.name ?? object.vehicle_name);
    const type = object.item?.type ?? object.type;
    let text = object.item ? itemSentence(object.item, sentence(location(object.direction)), descriptions) : `${sentence(location(object.direction))} — ${label}.${descriptions.has(type) ? ` ${clean(descriptions.get(type))}` : ''}`;
    const opening = object.kind === 'door' ? 'Дверь' : object.kind === 'window' ? 'Окно' : null;
    if (opening && object.state === 'open') text += ` ${opening} ${object.kind === 'window' ? 'было открыто' : 'была открыта'}.`;
    if (opening && object.state === 'closed') text += ` ${opening} ${object.kind === 'window' ? 'было закрыто' : 'была закрыта'}.`;
    add(key, 'Вещи вокруг', text, { label, position: pos, state: [label, object.state, object.intensity], physical: true, object });
    if (!['ground_item', 'field', 'known_trap', 'vehicle_part'].includes(object.kind)) occupied.add(pos);
    if (object.kind === 'door') knownDoors.set(pos, object);
  };
  const vehicles = new Map();
  for (const object of frame.objects ?? []) if (inPlace(object.position, frame)) {
    if (object.kind !== 'vehicle_part') addObject(object);
    else {
      const prior = vehicles.get(object.vehicle_name);
      if (!prior || distanceAt(object.position, frame.position) < distanceAt(prior.position, frame.position)) vehicles.set(object.vehicle_name, object);
    }
  }
  for (const [name, nearest] of vehicles) {
    const label = clean(name);
    add(`vehicle:${name}`, 'Вещи вокруг', `${sentence(location(directionAt(nearest.position, frame.position)))} — ${label}.`, { label, state: name, vehicle: true });
  }
  // An open door may lose its DOOR flag; open_to links the observed terrain to the known door.
  for (const [pos, door] of knownDoors) {
    const observed = terrain.get(pos);
    if (!observed || observed.type !== door.open_to || door.open_to === 't_null') continue;
    addObject({ ...door, type: observed.type, name: observed.name, state: 'open', direction: directionAt(door.position, frame.position) });
  }
  for (const group of frame.visible_furniture ?? []) for (const position of group.positions) {
    const pos = positionKey(position);
    if (!inPlace(position, frame) || occupied.has(pos)) continue;
    const label = clean(group.name);
    add(`furniture:${pos}:`, 'Вещи вокруг', `${sentence(location(directionAt(position, frame.position)))} — ${label}.${descriptions.has(group.type) ? ` ${clean(descriptions.get(group.type))}` : ''}`, { label, position: pos, state: [group.type, label], physical: true });
  }
  const kinds = new Map();
  for (const [pos, tile] of terrain) {
    if (occupied.has(pos)) continue;
    const distance = distanceAt(tile.position, frame.position);
    if (!kinds.has(tile.type) || distance < kinds.get(tile.type).distance) kinds.set(tile.type, { ...tile, distance });
  }
  for (const [type, tile] of kinds) {
    const prefix = tile.distance === 0 ? 'Под ногами героя' : sentence(location(directionAt(tile.position, frame.position)));
    add(`terrain:${type}`, 'Видимая местность', `${prefix} — ${clean(tile.name)}.${descriptions.has(type) ? ` ${clean(descriptions.get(type))}` : ''}`, { terrain: true });
  }
  const occurrences = new Map();
  for (const creature of frame.creatures ?? []) {
    const far = !inPlace(creature.position, frame);
    const base = creature.id !== undefined ? `creature:${creature.id}` : `creature:${creature.type}:${far}`;
    const ordinal = (occurrences.get(base) ?? 0) + 1;
    occurrences.set(base, ordinal);
    const label = clean(creature.name);
    const where = location(creature.direction, far);
    let text = `${sentence(where)} — ${label}.`;
    for (const item of creature.worn ?? []) text += ` ${itemSentence(item, `Видимая одежда существа «${label}»`, descriptions)}`;
    if (creature.wielded) text += ` ${itemSentence(creature.wielded, `В руках у существа «${label}»`, descriptions)}`;
    text += creatureStateText(creature, data);
    // Без записанного id сравнимы только количества внутри и вне места, а не перемещения особей.
    const state = [
      label,
      (creature.worn ?? []).map(item => clean(item.name)),
      creature.wielded ? clean(creature.wielded.name) : null,
      creature.activity == null ? null : [creature.activity.id ?? null, creature.activity.verb ?? null, creature.activity.tool ?? null, creature.activity.material ?? null],
      creature.posture ?? null,
      creature.attention ?? null
    ];
    add(`${base}:${ordinal}`, 'Люди и звери', text, { label, far, position: creature.id !== undefined ? positionKey(creature.position) : undefined, state, creature: true });
  }
  const presentItems = new Set((frame.objects ?? []).filter(object => object.item).map(object => `ground:${object.item.uid}`));
  return { facts, visible, terrain, occupied, presentItems };
}

const movement = { RIGHT: [1, 0, 'к востоку'], DOWN: [0, 1, 'к югу'], UP: [0, -1, 'к северу'], RIGHTUP: [1, -1, 'к северо-востоку'], LEFTDOWN: [-1, 1, 'к юго-западу'] };
const ignored = new Set(['debug', 'safemode', 'player_data']);

function actionEvents(actions, before, after) {
  if (!actions || !before) return [];
  const candidates = actions.inputs.filter(input => !ignored.has(input.action));
  if (candidates.length !== 1) return [];
  const action = candidates[0].action;
  if (movement[action]) {
    const [x, y, direction] = movement[action];
    const delta = after.position.map((value, i) => value - before.position[i]);
    if (Math.sign(delta[0]) === x && Math.sign(delta[1]) === y && delta[2] === 0 && (delta[0] || delta[1])) return [{ direction }];
  }
  if (action === 'open') {
    const changed = (before.objects ?? []).filter(door => door.kind === 'door' && door.state === 'closed' && inPlace(door.position, after) && (
      (after.objects ?? []).some(object => object.kind === 'door' && object.state === 'open' && positionKey(object.position) === positionKey(door.position)) ||
      (after.visible_terrain ?? []).some(group => group.type === door.open_to && group.positions.some(pos => positionKey(pos) === positionKey(door.position)))
    ));
    if (changed.length === 1) return [{ text: 'Герой открыл дверь.', door: positionKey(changed[0].position) }];
  }
  return [];
}

function addText(packet, section, text) { (packet[section] ??= []).push(text); }

function finishPart(part) {
  const events = [];
  let directions = [];
  let movementIndex;
  function flush() {
    if (directions.length) {
      const seen = new Set();
      events[movementIndex] = `Герой прошёл ${directions.map((direction, i) => {
        const prefix = i ? `затем ${seen.has(direction) ? 'снова ' : ''}` : '';
        seen.add(direction);
        return prefix + direction;
      }).join(', ')}.`;
    }
    directions = [];
  }
  for (const event of part.events) {
    if (event.direction) {
      if (!directions.length) { movementIndex = events.length; events.push(''); }
      if (directions.at(-1) !== event.direction) directions.push(event.direction);
    } else {
      if (event.door) flush();
      events.push(event.text);
    }
  }
  flush();
  if (events.length) part.packet.События = events;
  delete part.events;
  for (const [field, values] of Object.entries(part.packet)) {
    let countedLines;
    if (field === 'События') {
      countedLines = [];
      for (const text of values) {
        const last = countedLines.at(-1);
        if (last?.[0] === text) last[1]++;
        else countedLines.push([text, 1]);
      }
    } else {
      const counts = new Map();
      for (const text of values) counts.set(text, (counts.get(text) ?? 0) + 1);
      countedLines = [...counts];
    }
    part.packet[field] = countedLines.map(([text, count]) => {
      if (count === 1) return text;
      const times = count % 100 >= 11 && count % 100 <= 14 ? 'раз' : count % 10 >= 2 && count % 10 <= 4 ? 'раза' : 'раз';
      const counted = field === 'Люди и звери' ? `Таких существ было ${words(count)}` : field === 'Вещи вокруг' || field === 'При себе' ? `Таких предметов было ${words(count)}` : `${field === 'Звуки' || field === 'Речь' ? 'Это было слышно' : 'Это отмечалось'} ${words(count)} ${times}`;
      return `${text} ${counted}.`;
    });
    for (const text of part.packet[field]) if (/\d|\b[a-z]+_[a-z_]+\b|<color_|>/u.test(text)) throw new Error(`Текст пакета содержит цифру, идентификатор CDDA или разметку: ${field}: ${text}`);
  }
}

export async function packets(options) {
  const recording = lines(await read(options.recording), options.recording).sort((a, b) => a.sequence - b.sequence);
  for (const row of recording) {
    if (row.kind !== 'full') throw new Error(`${options.recording}: kind не full, sequence ${row.sequence}`);
    if (typeof row.frame?.player_state?.male !== 'boolean') throw new Error(`${options.recording}: нет boolean player_state.male, sequence ${row.sequence}`);
  }
  const momentsText = await read(options.moments);
  const moments = JSON.parse(momentsText);
  checkMoments(moments, options.moments);
  const data = await gameData(options['game-data']);
  const actionRows = options.actions ? lines(await read(options.actions), options.actions) : [];
  const actions = new Map(actionRows.map(row => [row.native_turn, row]));
  for (const row of actionRows) for (const input of row.inputs ?? []) if (!movement[input.action] && input.action !== 'open' && !ignored.has(input.action)) console.error(`Предупреждение: неизвестное action ${input.action}; поступок исключён`);
  let scene = 0;
  let previous;
  for (const row of recording) {
    if (!previous || sceneKey(previous.frame) !== sceneKey(row.frame)) scene++;
    row.scene = `S${scene}`;
    row.before = previous?.frame;
    previous = row;
  }
  const delivered = new Map();
  const results = [];
  const heard = new Set();
  for (const moment of moments) {
    const rows = recording.filter(row => row.native_turn >= moment.from_turn && row.native_turn <= moment.to_turn);
    if (!rows.length) throw new Error(`${options.recording}: нет кадров для ${moment.id}`);
    const parts = [];
    let part;
    for (const row of rows) {
      if (!part || part.scene_id !== row.scene) {
        const first = !delivered.has(row.scene);
        part = { scene_id: row.scene, scene_first: first, packet: {}, events: [] };
        parts.push(part);
        if (first) delivered.set(row.scene, { facts: new Map(), terrain: new Map(), doors: new Map(), vehicles: new Set() });
      }
      const memory = delivered.get(row.scene);
      const current = project(row.frame, data, memory.doors);
      const initial = memory.facts.size === 0;
      const acts = row.reason === 'turn' ? actionEvents(actions.get(row.native_turn), row.before, row.frame) : [];
      const opened = new Set(acts.filter(event => event.door).map(event => event.door));
      for (const [key, fact] of memory.facts) if (fact.creature && !current.facts.has(key)) {
        part.events.push({ text: `Существо «${fact.label}» больше не видно ${fact.far ? 'вдали' : 'в месте сцены'}.` });
        memory.facts.delete(key);
      }
      for (const [key, fact] of current.facts) {
        const prior = memory.facts.get(key);
        if (!prior) {
          if (fact.creature && !initial) part.events.push({ text: `Появилось существо «${fact.label}». ${fact.text}` });
          else if (changingState.has(fact.section) && !initial) part.events.push({ text: fact.text });
          else if (fact.vehicle && memory.vehicles.has(key)) part.events.push({ text: `Вновь виден транспорт «${fact.label}». ${fact.text}` });
          else addText(part.packet, fact.section, fact.text);
        } else if (!fact.terrain) {
          if (prior.position !== fact.position) part.events.push({ text: `Положение ${fact.creature ? 'существа' : 'предмета'} «${fact.label}» изменилось. Теперь ${fact.creature ? 'существо находилось' : 'предмет находился'} ${location(fact.object?.direction ?? directionAt(JSON.parse(fact.position), row.frame.position))}${fact.creature ? fact.far ? ', вдали' : ', в месте сцены' : ''}.` });
          if (!same(prior.state, fact.state) && !opened.has(fact.position)) part.events.push({ text: fact.label ? `Изменилось состояние ${fact.creature ? 'существа' : 'предмета'} «${fact.label}». ${fact.text}` : fact.text });
        }
        memory.facts.set(key, fact);
        if (fact.vehicle) memory.vehicles.add(key);
      }
      for (const [key, fact] of memory.facts) if (!current.facts.has(key) && !fact.terrain) {
        if (current.presentItems.has(key)) continue;
        if (fact.vehicle || (fact.physical && current.visible.has(fact.position)) || fact.removal) {
          part.events.push({ text: fact.removal ?? (fact.vehicle ? `Транспорт «${fact.label}» больше не виден.` : `Предмет «${fact.label}» больше не видно.`) });
          memory.facts.delete(key);
        }
      }
      for (const [pos, tile] of current.terrain) {
        const prior = memory.terrain.get(pos);
        if (prior && prior.type !== tile.type && !current.occupied.has(pos) && !opened.has(pos)) part.events.push({ text: `${positionKey(row.frame.position) === pos ? 'Под ногами героя' : sentence(location(directionAt(tile.position, row.frame.position)))} вместо «${clean(prior.name)}» теперь — «${clean(tile.name)}».` });
        memory.terrain.set(pos, tile);
      }
      part.events.push(...acts);
      const occurrence = new Map();
      for (const sound of row.frame.sounds ?? []) {
        const signature = JSON.stringify(sound);
        const ordinal = (occurrence.get(signature) ?? 0) + 1;
        occurrence.set(signature, ordinal);
        const key = `${signature}:${ordinal}`;
        if (heard.has(key)) continue;
        heard.add(key);
        const section = sound.category === 5 || sound.category === 6 ? 'Речь' : 'Звуки';
        addText(part.packet, section, `Герой слышал «${sound.description}».`);
      }
    }
    for (const part of parts) finishPart(part);
    results.push({ ...moment, parts });
  }
  await output(options.dir, { 'moments.json': momentsText, 'packets.json': serialize(results) });
}
