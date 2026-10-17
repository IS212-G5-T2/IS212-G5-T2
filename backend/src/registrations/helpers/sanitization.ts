/*
 * SPM-61 input sanitisation. Text is stored literally: it is trimmed and
 * stripped of control characters, never HTML-escaped. SQL safety comes from
 * parameterised queries and XSS safety from React's output escaping.
 */

// eslint-disable-next-line no-control-regex
const SINGLE_LINE_CONTROLS = /[\u0000-\u001F\u007F]/g;
// eslint-disable-next-line no-control-regex
const MULTI_LINE_CONTROLS = /[\u0000-\u0009\u000B-\u001F\u007F]/g;

/*
 * SPM-63 export-time formula neutralisation (OWASP CSV injection). Stored data and the on-screen report stay
 * literal; only the CSV writer calls this, and it runs before RFC 4180 quoting.
 */
const CSV_FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r'];

/** Prefixes a single quote when a cell starts with a character a spreadsheet would treat as a formula. */
export function neutralizeCsvCell(value: string): string {
  return CSV_FORMULA_TRIGGERS.includes(value.charAt(0)) ? `'${value}` : value;
}

/** Trims, normalises line endings and removes control characters. */
export function sanitizeText(value: string, options: { multiline: boolean }): string {
  const text = value.normalize('NFC');
  if (!options.multiline) return text.replace(SINGLE_LINE_CONTROLS, '').trim();
  return text
    .replace(/\r\n?/g, '\n')
    .replace(MULTI_LINE_CONTROLS, '')
    .trim();
}
