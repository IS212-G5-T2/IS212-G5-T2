import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildRows, belongsToOtherStory, resultOf, titleRegExp, validate } from './check-records.mjs';

test('titleRegExp matches the titles an it.each call site expands to', () => {
  assert.ok(titleRegExp('refuses %s with 403').test('refuses an Attendee (ATT-01) with 403'));
  assert.ok(titleRegExp('a single failure: $name').test('a single failure: no venue'));
  assert.ok(titleRegExp('exact title (A)').test('exact title (A)'));
  assert.ok(!titleRegExp('exact title').test('exact title and more'));
  assert.ok(titleRegExp('Q1-007 ${field} accepts length %s').test('Q1-007 name accepts length 0'));
  assert.ok(titleRegExp('Q1-008 ${field} rejects length ${limit + 1}').test('Q1-008 name rejects length 201'));
  assert.ok(titleRegExp("event\\'s neighbours").test("event's neighbours"));
  assert.ok(!titleRegExp("event\\'s neighbours").test('events neighbours'));
});

test('resultOf: PASS needs every matched test to pass, FAIL on any failure, NOT RUN when unmatched', () => {
  const results = new Map([['a.ts', [{ title: 'x 1', status: 'passed' }, { title: 'x 2', status: 'failed' }, { title: 'y', status: 'passed' }]]]);
  assert.equal(resultOf({ file: 'a.ts', title: 'y' }, results), 'PASS');
  assert.equal(resultOf({ file: 'a.ts', title: 'x %s' }, results), 'FAIL');
  assert.equal(resultOf({ file: 'a.ts', title: 'missing' }, results), 'NOT RUN');
  assert.equal(resultOf({ file: 'b.ts', title: 'y' }, results), 'NOT RUN');
});

const good = () => ({
  test_id: 'S-01', file: 'a.spec.ts', line: '1', title: 'S-01 does x', ac: 'AC1', tier: 'Happy', tier_status: 'Present', level: 'Unit',
  oracle_class: 'SPEC', assumption_ref: '', kills: 'mutants:be/unit(3)', explained: 'Yes', comment_present: 'Yes', deterministic: 'Yes', result: 'PASS',
});
const ctx = { registryRows: [{ id: 'S-01' }], mutantIds: new Set(['M1']) };

test('a complete record passes validation', () => {
  const out = validate([good()], ctx);
  assert.deepEqual(out.findings, []);
  assert.equal(out.counts.withRegisteredId, 1);
  assert.equal(out.counts.passed, 1);
});

test('blank judgement fields and a missing id, ac or kills link are each reported once with a count', () => {
  const bad = { ...good(), test_id: '', ac: '', kills: '', tier: '', oracle_class: '', explained: '' };
  const text = validate([bad, bad], ctx).findings.join('\n');
  assert.match(text, /2 record\(s\): a test has no registered test id/);
  assert.match(text, /a test has no parent AC/);
  assert.match(text, /a test has no kills link/);
  assert.match(text, /a test has no tier from the allowed list/);
  assert.match(text, /a test has no oracle_class/);
  assert.match(text, /a test has no explained value/);
});

test('CODE-DERIVED and UNTRACEABLE oracles are blockers; ASSUMED needs an assumption_ref', () => {
  const rows = [{ ...good(), oracle_class: 'CODE-DERIVED' }, { ...good(), oracle_class: 'UNTRACEABLE' }, { ...good(), oracle_class: 'ASSUMED' }];
  const text = validate(rows, ctx).findings.join('\n');
  assert.match(text, /oracle_class CODE-DERIVED is a blocker/);
  assert.match(text, /oracle_class UNTRACEABLE is a blocker/);
  assert.match(text, /an ASSUMED test has no assumption_ref/);
});

test('an unexplained test must have a comment; a named mutant must exist', () => {
  const rows = [{ ...good(), explained: 'No', comment_present: 'No' }, { ...good(), kills: 'M9' }];
  const text = validate(rows, ctx).findings.join('\n');
  assert.match(text, /an unexplained test has no comment/);
  assert.match(text, /a test names a mutant that does not exist/);
});

test('an id that is not in the registry is reported as such, not as missing', () => {
  const out = validate([{ ...good(), test_id: 'OTHER-01' }], ctx);
  assert.match(out.findings.join('\n'), /carries an id that is not in the registry/);
});

test('a test whose id is registered to another story is not checked against this story\u0027s records', () => {
  const foreign = new Set(['VEN-HOLD-05-A']);
  assert.equal(belongsToOtherStory('VEN-HOLD-05-A', foreign), true);
  assert.equal(belongsToOtherStory('S-01', foreign), false);
  assert.equal(belongsToOtherStory('', foreign), false);
  assert.equal(belongsToOtherStory('S-01'), false);
});

test('buildRows skips a scoped test whose id is registered to another story and keeps it otherwise', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'check-records-'));
  try {
    const file = join(dir, 'sample.test.mjs');
    writeFileSync(file, [
      "import { test } from 'node:test';",
      "test('S-01 belongs to this story', () => {});",
      "test('OTHER-05 belongs to another story', () => {});",
      '',
    ].join('\n'));
    const scope = { tests: { unit: [file] } };
    const base = { registryRows: [{ id: 'S-01', parent_ac: 'AC1' }, { id: 'OTHER-05', parent_ac: 'AC9' }], runDir: join(dir, 'cycle-1', 'run') };

    const withForeign = await buildRows(scope, [], { ...base, foreignIds: new Set(['OTHER-05']) });
    assert.deepEqual(withForeign.map((row) => row.test_id), ['S-01']);

    const withoutForeign = await buildRows(scope, [], base);
    assert.deepEqual(withoutForeign.map((row) => row.test_id), ['S-01', 'OTHER-05']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
