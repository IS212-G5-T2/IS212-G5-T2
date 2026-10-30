// Matching of a mutant's testMappings title to the tests the runner executes.
//
// A plain title selects tests by substring, as before. A title that contains a printf placeholder (%s, %j, %i, %d, %f,
// %o, %O, %p) is the source text of an it.each call site, so it is turned into a pattern for the expanded titles:
// the literal text is escaped, each placeholder becomes `.+?`, and the pattern is anchored at the end of the title
// and at a word boundary at the start (Vitest tests a --testNamePattern against "describe-names test-name").
const PLACEHOLDER = /%[sjidfoOp%]/g;
const escapePattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** True when the title has an it.each placeholder (a lone `%%` is a literal percent sign, not a placeholder). */
export const hasPlaceholder = (title) => (title.match(PLACEHOLDER) ?? []).some((token) => token !== '%%');

/** The --testNamePattern text for a mapping title. */
export function titlePattern(title) {
  if (!hasPlaceholder(title)) return escapePattern(title);
  const tokens = title.match(PLACEHOLDER) ?? [];
  const parts = title.split(PLACEHOLDER).map(escapePattern);
  const body = parts.reduce((text, part, index) => `${text}${tokens[index - 1] === '%%' ? '%' : '.+?'}${part}`);
  return `(?:^|\\s)${body}$`;
}

/** Test lines of a verbose report that really ran (passed or failed) for the mapping title; skipped ones (↓) never count. */
export function executedLines(output, title) {
  const matcher = hasPlaceholder(title)
    ? new RegExp(`${titlePattern(title).replace(/\$$/, '')}(?:\\s+\\d+(?:\\.\\d+)?m?s)?\\s*$`)
    : undefined;
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('↓') && (matcher ? matcher.test(line) : line.includes(title)));
}
