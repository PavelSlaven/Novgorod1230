function cleanText(value) {
  return String(value ?? '').trim();
}

function summarizeNpcPlacement(npc) {
  const place = cleanText(npc?.microLocationId ?? npc?.locationId);
  return place ? `место ${place}` : '';
}

function summarizeNpcActivity(npc) {
  const reason = cleanText(npc?.reasonHere);
  const occupation = cleanText(npc?.occupation);
  const schedule = Array.isArray(npc?.schedule) ? cleanText(npc.schedule[0]) : cleanText(npc?.schedule);
  const parts = [];

  if (reason) parts.push(`зачем ${reason}`);
  if (occupation) parts.push(`дело ${occupation}`);
  if (schedule) parts.push(`сейчас ${schedule}`);

  return parts.length ? `занят ${parts.join(' · ')}` : '';
}

function summarizeNpcMood(npc) {
  const mood = cleanText(npc?.mood);
  const bodyState = cleanText(npc?.bodyState);
  const status = cleanText(npc?.visibleStatus ?? npc?.status);
  return [
    status ? `видно как ${status}` : '',
    mood ? `настроение ${mood}` : '',
    bodyState ? `состояние ${bodyState}` : ''
  ].filter(Boolean);
}

function summarizeNpcPropertyClues(npc) {
  const clues = Array.isArray(npc?.propertyClues)
    ? npc.propertyClues
    : typeof npc?.propertyClues === 'string'
      ? [npc.propertyClues]
      : [];
  return clues
    .map((clue) => cleanText(clue))
    .filter(Boolean)
    .map((clue) => `след имущества ${clue}`);
}

function humanizeProfileLevel(value) {
  const level = cleanText(value).toLowerCase();
  if (level === 'background') return 'фоновый';
  if (level === 'scene') return 'сценический';
  if (level === 'key') return 'ключевой';
  return '';
}

function pluralizePeople(count) {
  const value = Math.abs(Number(count) || 0);
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return 'человек';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'человека';
  return 'человек';
}

function buildPeopleView(npcs = []) {
  const items = (Array.isArray(npcs) ? npcs : []).slice(0, 12).map((npc) => {
    const name = cleanText(npc?.name) || 'неизвестный';
    const role = cleanText(npc?.role) || 'человек рядом';
    const profileLevel = humanizeProfileLevel(npc?.profileLevel);
    const meta = [
      role,
      profileLevel,
      cleanText(npc?.visibleStatus ?? npc?.status)
    ].filter(Boolean).join(' · ');
    const lines = [
      summarizeNpcPlacement(npc),
      summarizeNpcActivity(npc),
      ...summarizeNpcMood(npc),
      ...summarizeNpcPropertyClues(npc)
    ].filter(Boolean);

    return {
      raw: npc,
      name,
      meta,
      lines
    };
  });

  const summaryText = items.length > 0
    ? `Рядом: ${items.length} ${pluralizePeople(items.length)}`
    : 'Рядом никого нет';

  return {
    summaryText,
    items
  };
}

export {
  buildPeopleView
};
