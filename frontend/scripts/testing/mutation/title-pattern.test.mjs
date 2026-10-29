// Run with: node --test scripts/testing/mutation/title-pattern.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { executedLines, hasPlaceholder, titlePattern } from './title-pattern.mjs';

const matches = (title, name) => new RegExp(titlePattern(title)).test(name);

test('a plain title is an escaped substring pattern', () => {
  assert.equal(hasPlaceholder('CONFIG-REG-07-D: capacity 0 is refused'), false);
  assert.equal(titlePattern('a (b) c.d'), 'a \\(b\\) c\\.d');
});

test('each placeholder kind is recognised', () => {
  for (const token of ['%s', '%j', '%i', '%d', '%o', '%f', '%O', '%p']) assert.equal(hasPlaceholder(`x ${token} y`), true, token);
  assert.equal(hasPlaceholder('100%% sure'), false);
});

test('a placeholder title matches the expanded names and nothing else', () => {
  const title = 'CONFIG-REG-07-C: refuses capacity %j with INVALID_CAPACITY';
  assert.ok(matches(title, 'SPM-139 AC7: the capacity > CONFIG-REG-07-C: refuses capacity "10" with INVALID_CAPACITY'));
  assert.ok(matches(title, 'CONFIG-REG-07-C: refuses capacity null with INVALID_CAPACITY'));
  assert.ok(!matches(title, 'CONFIG-REG-07-C: refuses capacity with INVALID_CAPACITY'));
  assert.ok(!matches(title, 'CONFIG-REG-07-C: refuses capacity 0 with INVALID_CAPACITY, extra'));
  assert.ok(!matches(title, 'XCONFIG-REG-07-C: refuses capacity 0 with INVALID_CAPACITY'));
});

test('literal text is escaped, including regex metacharacters and several placeholders', () => {
  const title = 'CONFIG-REG-05-C: opening %s and closing %s: refused (text) [x]';
  assert.ok(matches(title, 'd > CONFIG-REG-05-C: opening a and closing b: refused (text) [x]'));
  assert.ok(!matches(title, 'd > CONFIG-REG-05-C: opening a and closing b: refused text x'));
});

test('%% is a literal percent sign', () => {
  assert.ok(matches('rate %s%% off', 'rate 5% off'));
  assert.ok(!matches('rate %s%% off', 'rate 5 off'));
});

test('executedLines ignores skipped tests and strips the duration', () => {
  const output = [
    ' ↓ f.spec.ts > s > CONFIG-REG-07-C: refuses capacity 0 with INVALID_CAPACITY',
    ' ✓ f.spec.ts > s > CONFIG-REG-07-C: refuses capacity 0 with INVALID_CAPACITY 2ms',
    ' × f.spec.ts > s > CONFIG-REG-07-C: refuses capacity "10" with INVALID_CAPACITY 1ms',
    ' ✓ f.spec.ts > s > another test 1ms',
  ].join('\n');
  assert.equal(executedLines(output, 'CONFIG-REG-07-C: refuses capacity %j with INVALID_CAPACITY').length, 2);
  assert.equal(executedLines(output, 'CONFIG-REG-07-C: refuses capacity %j with NOPE').length, 0);
  assert.equal(executedLines(output, 'another test').length, 1);
});
