const LETTERS = /[\p{L}\p{M}]+/gu;
const RUSSIAN_HOMOGLYPHS = Object.freeze({
  A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х',
  a: 'а', c: 'с', e: 'е', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', x: 'х', y: 'у'
});

function isMixedLatinCyrillic(word) {
  return /\p{Script=Latin}/u.test(word) && /\p{Script=Cyrillic}/u.test(word);
}

export function findMixedLatinCyrillicWord(value) {
  if (typeof value !== 'string') return null;
  return value.match(LETTERS)?.find(isMixedLatinCyrillic) ?? null;
}

export function normalizeMixedScriptHomoglyphs(value) {
  if (typeof value !== 'string') return { text: value, replacedCharacterCount: 0 };

  let replacedCharacterCount = 0;
  const text = value.replace(LETTERS, (word) => {
    if (!isMixedLatinCyrillic(word)) return word;
    const latinCharacters = [...word].filter((character) => /\p{Script=Latin}/u.test(character));
    if (latinCharacters.some((character) => !Object.hasOwn(RUSSIAN_HOMOGLYPHS, character))) return word;

    return [...word].map((character) => {
      const replacement = RUSSIAN_HOMOGLYPHS[character];
      if (replacement === undefined) return character;
      replacedCharacterCount += 1;
      return replacement;
    }).join('');
  });

  return { text, replacedCharacterCount };
}
