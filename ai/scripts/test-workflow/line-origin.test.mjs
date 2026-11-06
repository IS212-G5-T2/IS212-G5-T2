import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { alignment, computeOrigins, formatMap, gitRunner, parseDiff, splitLines } from './line-origin.mjs';

test('parseDiff reads modified, renamed and added files with their hunks', () => {
  const patch = [
    'diff --git a/src/a.ts b/src/a.ts',
    'index 1..2 100644',
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -2 +2,2 @@',
    '-old line',
    '+new line',
    '+extra',
    'diff --git a/old.ts b/new.ts',
    'similarity index 90%',
    'rename from old.ts',
    'rename to new.ts',
    '--- a/old.ts',
    '+++ b/new.ts',
    '@@ -0,0 +1 @@',
    '+--- a dashed line',
    'diff --git a/fresh.ts b/fresh.ts',
    'new file mode 100644',
    '--- /dev/null',
    '+++ b/fresh.ts',
    '@@ -0,0 +1,2 @@',
    '+one',
    '+two',
  ].join('\n');
  const [modified, renamed, added] = parseDiff(patch);
  assert.equal(modified.kind, 'modified');
  assert.equal(modified.oldPath, 'src/a.ts');
  assert.deepEqual(modified.hunks[0], { a: 2, b: 1, c: 2, d: 2, removed: ['old line'], added: ['new line', 'extra'] });
  assert.equal(renamed.kind, 'renamed');
  assert.equal(renamed.oldPath, 'old.ts');
  assert.equal(renamed.newPath, 'new.ts');
  // A removed or added line that starts with "--" is content, not a header, once inside a hunk.
  assert.deepEqual(renamed.hunks[0].added, ['--- a dashed line']);
  assert.equal(added.kind, 'added');
  assert.equal(added.oldPath, null);
  assert.equal(added.newPath, 'fresh.ts');
});

test('alignment maps unchanged, added and deleted lines', () => {
  // old: 1 a, 2 b, 3 c, 4 d, 5 e
  // new: 1 a, 2 X, 3 Y, 4 c, 5 d (line b replaced by X and Y, line e removed)
  const hunks = [{ a: 2, b: 1, c: 2, d: 2, removed: ['b'], added: ['X', 'Y'] }, { a: 5, b: 1, c: 5, d: 0, removed: ['e'], added: [] }];
  assert.deepEqual(alignment(hunks, 5), [1, 0, 0, 3, 4]);
  // Insertion after old line 2 and a pure deletion of old line 1.
  assert.deepEqual(alignment([{ a: 2, b: 0, c: 3, d: 1, removed: [], added: ['N'] }], 3), [1, 2, 0, 3]);
  assert.deepEqual(alignment([{ a: 1, b: 1, c: 0, d: 0, removed: ['a'], added: [] }], 2), [2]);
  // A new file has no old lines.
  assert.deepEqual(alignment([{ a: 0, b: 0, c: 1, d: 2, removed: [], added: ['p', 'q'] }], 0), [0, 0]);
});

test('formatMap carries origins across a formatting-only rewrap', () => {
  const oldText = 'const x = foo(a, b);\nreturn x;\n';
  const newText = 'const x = foo(\n  a,\n  b,\n);\n\nreturn x;\n';
  const origins = formatMap(oldText, newText, ['c1', 'c2']);
  assert.deepEqual(origins, ['c1', 'c1', 'c1', 'c1', 'c1', 'c2'], 'wrapped lines keep c1; the blank line takes the previous origin');
  assert.deepEqual(splitLines('a\nb\n'), ['a', 'b']);
  assert.deepEqual(splitLines('a\nb'), ['a', 'b']);
  assert.deepEqual(splitLines(''), []);
});

// ------------------------------------------------------------------ git integration

function scratchRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'line-origin-'));
  const git = (args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.email', 'test@example.com']);
  git(['config', 'user.name', 'Test']);
  git(['config', 'commit.gpgsign', 'false']);
  const commit = (subject) => {
    git(['add', '-A']);
    git(['commit', '-q', '--allow-empty', '-m', subject]);
    return git(['rev-parse', 'HEAD']).trim();
  };
  const write = (path, text) => {
    mkdirSync(join(dir, path.split('/').slice(0, -1).join('/') || '.'), { recursive: true });
    writeFileSync(join(dir, path), text);
  };
  return { dir, git, commit, write, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('origin follows rename, whitespace and formatting-only commits and keeps merge origins', () => {
  const r = scratchRepo();
  try {
    const names = {};
    const step = (name, path, text) => {
      if (path) r.write(path, text);
      names[name] = r.commit(name);
    };
    step('c1', 'src/a.ts', 'const a = 1;\nfunction f() {\n  return a;\n}\n');
    step('c2', 'src/a.ts', 'const a = 1;\nfunction f() {\n  return a;\n}\nconst b = 2;\n');
    step('c3', 'src/a.ts', 'const a = 1;\nfunction f() {\n    return a;\n}\nconst b = 2;\n');
    r.git(['mv', 'src/a.ts', 'src/renamed.ts']);
    step('c4', 'src/renamed.ts', 'const a = 1;\nfunction f() {\n    return a;\n}\nconst b = 2;\nconst c = 3;\n');
    step('c5', 'src/renamed.ts', 'const a = 1;\nfunction f() {\n    return a;\n}\nconst b =\n  2;\nconst c = 3;\n');
    step('c6', 'src/renamed.ts', 'const a = 1;\nfunction f() {\n    return a + 1;\n}\nconst b =\n  2;\nconst c = 3;\n');
    r.git(['checkout', '-q', '-b', 'side', names.c6]);
    step('side', 'src/renamed.ts', 'const a = 1;\nfunction f() {\n    return a + 1;\n}\nconst b =\n  2;\nconst c = 3;\nconst m = 9;\n');
    r.git(['checkout', '-q', 'main']);
    step('main', 'src/renamed.ts', 'const n = 8;\nconst a = 1;\nfunction f() {\n    return a + 1;\n}\nconst b =\n  2;\nconst c = 3;\n');
    r.git(['merge', '-q', '--no-edit', 'side']);
    const merged = r.git(['rev-parse', 'HEAD']).trim();
    const { files, stats } = computeOrigins(gitRunner(r.dir), 'HEAD');
    const nameOf = (hash) => Object.keys(names).find((name) => names[name] === hash) ?? (hash === merged ? 'merge' : hash);
    const origins = files.get('src/renamed.ts').map(nameOf);
    assert.deepEqual(origins, [
      'main', // const n = 8; added on main
      'c1', // const a = 1;
      'c1', // function f() {
      'c6', // return a + 1; changed by c6 (indentation came from c3, a whitespace-only commit)
      'c1', // }
      'c2', // const b = 2 (wrapped by c5, a formatting-only commit, so c2 keeps it)
      'c2', // 2;
      'c4', // const c = 3; added by the rename commit c4
      'side', // const m = 9; added on the side branch
    ]);
    assert.ok(stats.formattingOnly.includes(names.c3), 'c3 changes only indentation and is skipped for origin');
    assert.ok(stats.formattingOnly.includes(names.c5), 'c5 wraps a line and changes nothing else, so it is skipped for origin');
    assert.ok(!stats.formattingOnly.includes(names.c6), 'c6 changes content and is not formatting-only');
    assert.equal(stats.merges, 1);
  } finally {
    r.cleanup();
  }
});
