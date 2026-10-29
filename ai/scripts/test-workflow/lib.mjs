// Shared helpers for the test-workflow gate scripts (see ai/docs/test-workflow.md).
// Dependency-free Node ESM. Every gate script writes <cycle>/gates/<gate>.json and exits 0 (PASS),
// 1 (BLOCKED) or 3 (UNABLE_TO_VERIFY).
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const WORKFLOW_DIR = 'docs/test-cases/workflow';

/** Robust ESM entry-point detection on Windows (drive paths/file URLs) and POSIX. */
export function isMain(metaUrl, argvPath = process.argv[1]) {
  return Boolean(argvPath && resolve(fileURLToPath(metaUrl)) === resolve(argvPath));
}

export const PASS = 'PASS';
export const BLOCKED = 'BLOCKED';
export const UNABLE = 'UNABLE_TO_VERIFY';

export function exitCodeFor(status) {
  return status === PASS ? 0 : status === BLOCKED ? 1 : 3;
}

/** BLOCKED beats UNABLE_TO_VERIFY beats PASS. */
export function worst(statuses) {
  if (statuses.includes(BLOCKED)) return BLOCKED;
  if (statuses.includes(UNABLE)) return UNABLE;
  return PASS;
}

/** A suite with skipped tests did not fully execute and cannot pass G7. */
export function executionStatus(results) {
  if (results.some((result) => !result.ran)) return UNABLE;
  if (results.some((result) => result.failed > 0 || result.skipped > 0)) return BLOCKED;
  return PASS;
}

/** Timezone evidence blocks when any test failed or was skipped, and is unavailable when a zone did not run. */
export function timezoneStatus(zones) {
  const totals = Object.values(zones);
  if (totals.some((zone) => zone.failed > 0 || zone.skipped > 0)) return BLOCKED;
  if (totals.some((zone) => zone.notRun > 0 || zone.total === 0)) return UNABLE;
  return PASS;
}

// ---------------------------------------------------------------- arguments

export function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const eq = arg.indexOf('=');
    const key = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    let value = true;
    if (eq !== -1) value = arg.slice(eq + 1);
    else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      i += 1;
      value = argv[i];
    }
    flags[key] = key in flags ? [].concat(flags[key], value) : value;
  }
  return { flags, positional };
}

export const asList = (value) => (value === undefined || value === true ? [] : [].concat(value));

// ---------------------------------------------------------------- files

export const abs = (path) => resolve(REPO_ROOT, path);
export const rel = (path) => relative(REPO_ROOT, resolve(REPO_ROOT, path)).split('\\').join('/');

export function readText(path) {
  return readFileSync(abs(path), 'utf8');
}

export function readJson(path) {
  return JSON.parse(readText(path));
}

export function writeText(path, text) {
  mkdirSync(dirname(abs(path)), { recursive: true });
  writeFileSync(abs(path), text);
}

export function writeJson(path, value) {
  writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function fileExists(path) {
  return existsSync(abs(path));
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', 'build', '.vite']);

function walk(dirRel, out) {
  const full = abs(dirRel);
  if (!existsSync(full)) return;
  const stat = statSync(full);
  if (stat.isFile()) {
    out.push(dirRel);
    return;
  }
  for (const name of readdirSync(full)) {
    if (SKIP_DIRS.has(name)) continue;
    walk(dirRel ? `${dirRel}/${name}` : name, out);
  }
}

export function globToRegExp(glob) {
  let source = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        source += '.*';
        i += 1;
        if (glob[i + 1] === '/') i += 1;
      } else source += '[^/]*';
    } else if (c === '?') source += '[^/]';
    else source += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${source}$`);
}

/** Root-relative files matching any glob (`*`, `**`, `?`), sorted, node_modules and build output skipped. */
export function expandGlobs(globs) {
  const found = new Set();
  for (const glob of globs) {
    const segments = glob.split('/');
    const staticSegments = [];
    for (const segment of segments) {
      if (/[*?]/.test(segment)) break;
      staticSegments.push(segment);
    }
    const prefix = staticSegments.join('/');
    const candidates = [];
    walk(prefix, candidates);
    const pattern = globToRegExp(glob);
    for (const file of candidates) if (pattern.test(file)) found.add(file);
  }
  return [...found].sort();
}

export const matchesAny = (file, globs) => globs.some((glob) => globToRegExp(glob).test(file));

// ---------------------------------------------------------------- markdown tables and CSV

const normalise = (name) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
export const stripTicks = (value) => value.replace(/`/g, '').trim();

/** Every pipe table in a markdown document with the nearest preceding heading. */
export function parseTables(markdown) {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const tables = [];
  let heading = '';
  for (let i = 0; i < lines.length; i += 1) {
    const heads = lines[i].match(/^#{1,6}\s+(.*)$/);
    if (heads) heading = heads[1].trim();
    if (!lines[i].trim().startsWith('|') || !/^\s*\|?\s*:?-{2,}/.test((lines[i + 1] ?? '').replace(/^\s*\|/, ''))) continue;
    const split = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
    const header = split(lines[i]).map(normalise);
    const rows = [];
    let j = i + 2;
    while (j < lines.length && lines[j].trim().startsWith('|')) {
      const cells = split(lines[j]);
      rows.push(Object.fromEntries(header.map((name, k) => [name, cells[k] ?? ''])));
      j += 1;
    }
    tables.push({ heading, header, rows });
    i = j - 1;
  }
  return tables;
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (c !== '\r') cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.some((value) => value !== ''));
  if (!header) return [];
  return body.map((r) => Object.fromEntries(header.map((name, k) => [name, r[k] ?? ''])));
}

export function toCsv(header, rows) {
  const quote = (value) => {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return `${[header.join(','), ...rows.map((row) => header.map((name) => quote(row[name])).join(','))].join('\n')}\n`;
}

// ---------------------------------------------------------------- test files

/** A test id as written in this repository, e.g. CONFIRM-EVENT-04-B or EVENT-UPDATE-04-SEC-2. */
export const ID_PATTERN = /\b[A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)*-\d{2}(?:-[A-Z0-9]+)*(?![\w-])/g;

export const idsIn = (text) => [...new Set(text.match(ID_PATTERN) ?? [])];
export const idFamily = (id) => id.replace(/-\d{2}(?:-.*)?$/, '');

export function levelOf(file) {
  if (/\.playwright\.spec\.ts$/.test(file)) return 'E2E';
  if (/\.e2e-spec\.ts$/.test(file)) return 'Integration';
  if (/\.test\.tsx?$/.test(file)) return 'Frontend';
  return 'Unit';
}

export const isTestFile = (file) => /\.(spec|test|e2e-spec)\.(ts|tsx)$|\.playwright\.spec\.ts$/.test(file);

const TEST_CALL = /^(\s*)(it|test)(?:\.(only|skip|todo|fails|concurrent))?\s*\(\s*(['"`])((?:\\.|(?!\4).)*)\4/;
const EACH_CALL = /^(\s*)(it|test)(?:\.(only|skip))?\.each\s*\(/;
const EACH_TITLE = /\)\s*\(\s*(['"`])((?:\\.|(?!\1).)*)\1/;
const EACH_TITLE_BELOW = /^\s*(['"`])((?:\\.|(?!\1).)*)\1/;
const DESCRIBE_CALL = /^(\s*)describe(?:\.(?:only|skip))?(?:\.skipIf\([^)]*\))?\s*\(\s*(['"`])((?:\\.|(?!\2).)*)\2/;

/**
 * Test definitions (one per it/test/it.each call site) with the comment block above each and the
 * nearest enclosing describe titles. Heuristic and line based; good enough for the gate checks.
 */
export function extractTests(text) {
  const lines = text.split('\n');
  const tests = [];
  const describes = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const describe = line.match(DESCRIBE_CALL);
    if (describe) {
      while (describes.length && describes.at(-1).indent >= describe[1].length) describes.pop();
      describes.push({ indent: describe[1].length, title: describe[3] });
      continue;
    }
    let title;
    let indent;
    let kind = 'it';
    let modifier = '';
    const plain = line.match(TEST_CALL);
    if (plain) {
      indent = plain[1].length;
      title = plain[5];
      modifier = plain[3] ?? '';
    } else if (EACH_CALL.test(line)) {
      indent = line.match(/^(\s*)/)[1].length;
      kind = 'each';
      // The title follows the table's closing `)(`, on that line or the line below it. The search stops at the
      // next call site, so a table without a title cannot take the title of the test after it.
      for (let j = i; j < Math.min(lines.length, i + 80); j += 1) {
        if (j > i && (TEST_CALL.test(lines[j]) || EACH_CALL.test(lines[j]) || DESCRIBE_CALL.test(lines[j]))) break;
        const found = lines[j].match(EACH_TITLE);
        if (found) {
          title = found[2];
          break;
        }
        const below = /\)\s*\(\s*$/.test(lines[j]) && lines[j + 1]?.match(EACH_TITLE_BELOW);
        if (below) {
          title = below[2];
          break;
        }
      }
      if (title === undefined) continue;
      modifier = line.match(EACH_CALL)[3] ?? '';
    } else continue;

    while (describes.length && describes.at(-1).indent >= indent) describes.pop();
    let j = i - 1;
    while (j >= 0 && lines[j].trim() === '') j -= 1;
    const commentLines = [];
    if (j >= 0 && (lines[j].trim().endsWith('*/') || lines[j].trim().startsWith('//'))) {
      if (lines[j].trim().endsWith('*/')) {
        let k = j;
        while (k >= 0 && !lines[k].includes('/*')) k -= 1;
        for (let m = Math.max(k, 0); m <= j; m += 1) commentLines.push(lines[m]);
      } else {
        let k = j;
        while (k >= 0 && lines[k].trim().startsWith('//')) {
          commentLines.unshift(lines[k]);
          k -= 1;
        }
      }
    }
    tests.push({
      title: title.replace(/\\(['"`])/g, '$1'),
      line: i + 1,
      kind,
      modifier,
      comment: commentLines.join('\n'),
      commentPresent: commentLines.length > 0,
      describes: describes.map((d) => d.title),
    });
  }
  return tests;
}

/**
 * The test id a test answers to: its own title, else its comment, else the nearest describe that carries one.
 * Families in `ignoredFamilies` (fixture labels, message codes, review labels) are not test ids.
 */
export function testIdOf(test, ignoredFamilies = new Set()) {
  const usable = (text) => idsIn(text).filter((id) => !ignoredFamilies.has(idFamily(id)));
  const own = usable(test.title);
  if (own.length) return own[0];
  const fromComment = usable(test.comment);
  if (fromComment.length === 1) return fromComment[0];
  for (let i = test.describes.length - 1; i >= 0; i -= 1) {
    const inherited = usable(test.describes[i]);
    if (inherited.length) return inherited[0];
  }
  return '';
}

// ---------------------------------------------------------------- scope and gates

/** Allowed values of the optional scope field `linesFrom`. */
export const LINES_FROM = ['changed-lines'];

/** Problem with a scope's `linesFrom` field, or undefined when it is absent or allowed. */
export function linesFromError(scope) {
  if (scope.linesFrom === undefined || LINES_FROM.includes(scope.linesFrom)) return undefined;
  return `unknown "linesFrom" ${JSON.stringify(scope.linesFrom)} (allowed: ${LINES_FROM.join(', ')})`;
}

/** True when the scope measures coverage on the story's changed lines (story-lines.mjs writes them). */
export function usesChangedLines(scope) {
  return scope.linesFrom === 'changed-lines';
}

export function loadScope(scopePath) {
  const scope = readJson(scopePath);
  for (const key of ['story', 'tests']) if (!scope[key]) throw new Error(`scope ${scopePath} is missing "${key}"`);
  const problem = linesFromError(scope);
  if (problem) throw new Error(`scope ${scopePath} has ${problem}`);
  return scope;
}

/** Test file globs from a scope entry: strings, or { glob, titleMatch } objects. */
export function scopeTests(scope) {
  const files = new Map();
  for (const [suite, entries] of Object.entries(scope.tests)) {
    for (const entry of entries) {
      const glob = typeof entry === 'string' ? entry : entry.glob;
      const titleMatch = typeof entry === 'string' ? undefined : entry.titleMatch;
      for (const file of expandGlobs([glob])) {
        const existing = files.get(file);
        files.set(file, { file, suite, titleMatch: titleMatch ?? existing?.titleMatch });
      }
    }
  }
  return [...files.values()].sort((a, b) => a.file.localeCompare(b.file));
}

/**
 * The tests of one scope file, restricted by its titleMatch when it has one. A test is in scope when its title,
 * its describe blocks or its own comment (JSDoc or // tags above it) match, or when it carries an id from
 * `storyIds` (the story's active registry ids). The registry, not the titleMatch, decides which ids belong to
 * the story, so a registered id whose test title does not repeat the story prefix is still traced and recorded.
 */
export function scopedTests(entry, storyIds = new Set()) {
  const tests = extractTests(readText(entry.file));
  if (!entry.titleMatch) return tests;
  const pattern = new RegExp(entry.titleMatch);
  return tests.filter((test) => {
    if (pattern.test(test.title) || pattern.test(test.describes.join(' ')) || pattern.test(test.comment)) return true;
    return idsIn([test.title, test.comment, test.describes.join(' ')].join('\n')).some((id) => storyIds.has(id));
  });
}

export function writeGate(cycleDir, result) {
  writeJson(join(cycleDir, 'gates', `${result.gate}.json`), result);
}

export function printGate(result) {
  console.log(`${result.gate} ${result.name}: ${result.status}`);
  for (const [key, value] of Object.entries(result.summary ?? {})) console.log(`  ${key}: ${JSON.stringify(value)}`);
  for (const finding of (result.findings ?? []).slice(0, 40)) console.log(`  - ${finding}`);
  if ((result.findings ?? []).length > 40) console.log(`  ... ${result.findings.length - 40} more in the gate file`);
}

export function requireFlag(flags, name) {
  if (!flags[name] || flags[name] === true) {
    console.error(`missing --${name}`);
    process.exit(2);
  }
  return flags[name];
}
