// Small words that stay lower case inside a surname (van der Merwe).
const particles = new Set([
  'van',
  'der',
  'den',
  'de',
  'du',
  'la',
  'le',
  'von',
  'da',
  'di',
  'te',
  'ten',
  'ter',
]);

const capital = (part: string) => part.charAt(0).toUpperCase() + part.slice(1);

// "mcdonald" -> "McDonald"; hyphens and apostrophes start a new capital.
function titleWord(word: string, first: boolean) {
  if (!first && particles.has(word)) return word;
  const cased = word
    .split(/(?<=[-'’])/)
    .map(capital)
    .join('');
  return /^mc.{2,}/.test(word) ? 'Mc' + capital(cased.slice(2)) : cased;
}

/**
 * Tidies a person's name. Only ALL CAPS or all lower case is rewritten; a
 * name typed with its own mix of capitals (McDonald, van der Merwe, de
 * Villiers) is left alone, because a program cannot know better than the owner.
 * `namecase` on npm turned van der Merwe into Van der Merwe and Mackenzie into
 * MacKenzie, so this helper replaces it.
 */
export function tidyName(value: string): string {
  const name = value.trim().replace(/\s+/g, ' ');
  if (name !== name.toLowerCase() && name !== name.toUpperCase()) return name;
  return name
    .toLowerCase()
    .split(' ')
    .map((word, index) => titleWord(word, index === 0))
    .join(' ');
}
