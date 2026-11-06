// Origin attribution for story-owned lines (see ai/docs/test-workflow.md, G5 changed-lines).
// For every line of a file at a revision, the origin is the commit that first introduced that line's content in the
// line's lineage. Each commit is replayed in topological order against its parents, so a line keeps the origin it had
// before the commit unless the commit introduces it. Rules:
//   - the replay diffs use -w (whitespace-insensitive alignment, as git blame -w compares lines), so a line that changes
//     only in whitespace keeps its origin;
//   - renames and copies carry the lineage of the source file (git diff -M -C);
//   - a formatting-only commit (every changed file has the same non-whitespace text before and after) keeps every origin
//     (each new line takes the origin of the old line that holds its first non-whitespace character);
//   - a merge keeps the origin from its first parent, then from its second parent, and attributes only conflict
//     resolutions to the merge itself.
// Dependency-free Node ESM.
import { execFileSync } from 'node:child_process';

const MAX_BUFFER = 512 * 1024 * 1024;
const WS = /\s/;

/** Text with every whitespace character removed. */
export const stripWs = (text) => text.replace(/\s+/g, '');

/** Lines of a text as git counts them: split on newline, with no empty element for a final newline. */
export function splitLines(text) {
  if (text === '') return [];
  const parts = text.split('\n');
  if (parts[parts.length - 1] === '') parts.pop();
  return parts;
}

/**
 * Parses `git diff-tree -p -U0` output into file entries:
 * { kind: modified|added|deleted|renamed|copied, oldPath, newPath, hunks: [{ a, b, c, d, removed: [], added: [] }] }.
 * Paths are 1-based hunk coordinates as git prints them (old a,b; new c,d).
 */
export function parseDiff(patch) {
  const entries = [];
  let current = null;
  let hunk = null;
  for (const line of patch.split('\n')) {
    if (line.startsWith('diff --git ')) {
      current = { kind: 'modified', oldPath: null, newPath: null, hunks: [] };
      entries.push(current);
      hunk = null;
      continue;
    }
    if (!current) continue;
    if (line.startsWith('@@')) {
      const m = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      hunk = { a: Number(m[1]), b: m[2] === undefined ? 1 : Number(m[2]), c: Number(m[3]), d: m[4] === undefined ? 1 : Number(m[4]), removed: [], added: [] };
      current.hunks.push(hunk);
      continue;
    }
    if (hunk) {
      if (line.startsWith('-')) hunk.removed.push(line.slice(1));
      else if (line.startsWith('+')) hunk.added.push(line.slice(1));
      continue;
    }
    const unquote = (value) => value.replace(/\t$/, '');
    if (line.startsWith('rename from ')) { current.kind = 'renamed'; current.oldPath = unquote(line.slice(12)); }
    else if (line.startsWith('rename to ')) current.newPath = unquote(line.slice(10));
    else if (line.startsWith('copy from ')) { current.kind = 'copied'; current.oldPath = unquote(line.slice(10)); }
    else if (line.startsWith('copy to ')) current.newPath = unquote(line.slice(8));
    else if (line.startsWith('new file mode')) current.kind = 'added';
    else if (line.startsWith('deleted file mode')) current.kind = 'deleted';
    else if (line.startsWith('--- ')) current.oldPath = line === '--- /dev/null' ? null : unquote(line.slice(6));
    else if (line.startsWith('+++ ')) current.newPath = line === '+++ /dev/null' ? null : unquote(line.slice(6));
  }
  return entries;
}

/**
 * Maps every line of the new file to its old line (1-based) or 0 when the line is added.
 * `oldLen` is the old line count (0 for a new file). The result length is the new line count.
 */
export function alignment(hunks, oldLen) {
  const map = [];
  let nPos = 1;
  let oPos = 1;
  for (const h of hunks) {
    const nStart = h.d > 0 ? h.c : h.c + 1;
    while (nPos < nStart) {
      map.push(oPos);
      nPos += 1;
      oPos += 1;
    }
    for (let i = 0; i < h.d; i += 1) {
      map.push(0);
      nPos += 1;
    }
    oPos += h.b;
  }
  while (oPos <= oldLen) {
    map.push(oPos);
    oPos += 1;
  }
  return map;
}

/**
 * Origins for a whitespace/formatting-only rewrite of one file. Both texts have the same non-whitespace characters in the
 * same order, so the k-th non-whitespace character of the new text is the k-th of the old text. Each new line takes the
 * origin of the old line that holds its first non-whitespace character; blank lines take the previous origin.
 */
export function formatMap(oldText, newText, oldOrigins) {
  const oldLines = splitLines(oldText);
  const oldLineOfChar = [];
  oldLines.forEach((line, index) => {
    for (const ch of line) if (!WS.test(ch)) oldLineOfChar.push(index);
  });
  const out = [];
  let k = 0;
  let previous = null;
  for (const line of splitLines(newText)) {
    let first = -1;
    for (const ch of line) {
      if (!WS.test(ch)) {
        if (first < 0) first = k;
        k += 1;
      }
    }
    if (first < 0) {
      out.push(previous);
    } else {
      previous = oldOrigins[oldLineOfChar[first]];
      out.push(previous);
    }
  }
  const firstKnown = out.find((origin) => origin !== null);
  return out.map((origin) => (origin === null ? firstKnown : origin));
}

/** Reads blobs (`rev:path` specs) in one git process. Missing blobs return null. */
export function readBlobs(git, specs) {
  if (!specs.length) return [];
  const out = execFileSync('git', ['cat-file', '--batch'], { cwd: git.cwd, input: `${specs.join('\n')}\n`, maxBuffer: MAX_BUFFER });
  const results = [];
  let pos = 0;
  for (let i = 0; i < specs.length; i += 1) {
    const eol = out.indexOf(0x0a, pos);
    const header = out.toString('utf8', pos, eol);
    pos = eol + 1;
    const m = header.match(/ blob (\d+)$/);
    if (!m) {
      results.push(null);
      continue;
    }
    const size = Number(m[1]);
    results.push(out.toString('utf8', pos, pos + size));
    pos += size + 1;
  }
  return results;
}

/** Git runner bound to a repository directory. */
export function gitRunner(cwd) {
  const run = (args) => execFileSync('git', ['-c', 'core.quotepath=off', ...args], { cwd, encoding: 'utf8', maxBuffer: MAX_BUFFER });
  run.cwd = cwd;
  return run;
}

/** Diff of one commit against one parent, with rename and copy detection and no context lines. */
/** Diff of one commit against one parent, whitespace-sensitive, with rename and copy detection and no context lines. */
const diffPlain = (git, from, to) => parseDiff(git(['diff-tree', '-r', '-M', '-C', '-U0', '-p', '--no-color', from, to]));
/** Same diff with -w: lines that differ only in whitespace align as unchanged, as git blame -w compares them. */
const diffWords = (git, from, to) => parseDiff(git(['diff-tree', '-r', '-M', '-C', '-w', '-U0', '-p', '--no-color', from, to]));

/**
 * Replays history up to `rev` and returns the per-line origin of every file that exists at `rev`.
 * Result: { files: Map(path -> string[] origin commit per line), stats }.
 * The result is keyed by path at `rev`; a line whose origin cannot be traced is attributed to the merge that brought it in.
 */
export function computeOrigins(git, rev = 'HEAD') {
  const order = git(['rev-list', '--parents', '--topo-order', '--reverse', rev]).split('\n').filter(Boolean).map((line) => line.split(' '));
  const states = new Map();
  const stats = { commits: order.length, merges: 0, formattingOnly: [] };
  let last = null;

  for (const [hash, ...parents] of order) {
    last = hash;
    let next;
    if (parents.length === 0) {
      next = new Map();
      const entries = parseDiff(git(['diff-tree', '--root', '-r', '-M', '-C', '-w', '-U0', '-p', '--no-color', hash]));
      for (const entry of entries) if (entry.newPath) next.set(entry.newPath, alignment(entry.hunks, 0).map(() => hash));
    } else if (parents.length === 1) {
      const result = applyCommit(git, states, hash, parents[0]);
      next = result.next;
      if (result.formattingOnly) stats.formattingOnly.push(hash);
    } else {
      stats.merges += 1;
      next = applyMerge(git, states, hash, parents[0], parents[1]);
    }
    states.set(hash, next);
  }
  return { files: states.get(last), stats, states };
}

function applyCommit(git, states, hash, parent) {
  const before = states.get(parent);
  const plain = diffPlain(git, parent, hash);
  const words = diffWords(git, parent, hash);
  // A formatting-only commit changes only whitespace or line wrapping in the files it modifies or renames.
  let formattingOnly = plain.some((entry) => entry.hunks.length > 0) && plain.every((entry) => entry.kind === 'modified' || entry.kind === 'renamed');
  let texts = [];
  if (formattingOnly) {
    texts = readBlobs(git, plain.flatMap((entry) => [`${parent}:${entry.oldPath}`, `${hash}:${entry.newPath}`]));
    formattingOnly = plain.every((entry, i) => (texts[2 * i] ?? '') !== '' && stripWs(texts[2 * i] ?? '') === stripWs(texts[2 * i + 1] ?? ''));
  }
  const next = new Map(before);
  const deletions = [];
  const sets = [];
  plain.forEach((entry, i) => {
    if (entry.kind === 'deleted') {
      deletions.push(entry.oldPath);
      return;
    }
    const base = entry.oldPath ? before.get(entry.oldPath) : undefined;
    let origins;
    if (formattingOnly && base) {
      origins = formatMap(texts[2 * i], texts[2 * i + 1], base);
    } else {
      // Whitespace-only files are absent from the -w diff: their hunks are empty and every line keeps its origin.
      const hunks = words.find((w) => w.oldPath === entry.oldPath && w.newPath === entry.newPath)?.hunks ?? [];
      const map = alignment(hunks, base ? base.length : 0);
      origins = map.map((oldLine) => (oldLine ? base[oldLine - 1] : hash));
    }
    if (entry.kind === 'renamed') deletions.push(entry.oldPath);
    sets.push([entry.newPath, origins]);
  });
  for (const path of deletions) next.delete(path);
  for (const [path, origins] of sets) next.set(path, origins);
  return { next, formattingOnly };
}

function applyMerge(git, states, hash, first, second) {
  const before = states.get(first);
  const other = states.get(second);
  const entries = diffWords(git, first, hash);
  const fromSecond = diffWords(git, second, hash);
  const next = new Map(before);
  for (const entry of entries) {
    if (entry.kind === 'deleted') {
      next.delete(entry.oldPath);
      continue;
    }
    const base = entry.oldPath ? before.get(entry.oldPath) : undefined;
    const map = alignment(entry.hunks, base ? base.length : 0);
    // The second parent's copy of the file: a diff against it when the merge changed the file on that side too; otherwise
    // the merge result equals that parent's file and every line maps to itself.
    const twin = fromSecond.find((candidate) => candidate.newPath === entry.newPath && candidate.kind !== 'deleted');
    const twinBase = twin ? other.get(twin.oldPath) : other.get(entry.newPath);
    const twinMap = twin
      ? alignment(twin.hunks, twinBase ? twinBase.length : 0)
      : twinBase ? twinBase.map((_, index) => index + 1) : null;
    const origins = map.map((oldLine, index) => {
      if (oldLine) return base[oldLine - 1];
      if (twinMap && twinMap[index] && twinBase) return twinBase[twinMap[index] - 1];
      return hash;
    });
    if (entry.kind === 'renamed') next.delete(entry.oldPath);
    next.set(entry.newPath, origins);
  }
  return next;
}
