import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyDoubles, codeOnly, labelOf, signalsIn } from './test-doubles.mjs';

const labelsOf = (source) => [...classifyDoubles(source).values()];

test('a test with no double is labelled none', () => {
  assert.deepEqual(labelsOf(`describe('x', () => {\n  it('adds numbers', () => {\n    expect(1 + 1).toBe(2);\n  });\n});\n`), ['none']);
});

test('words in titles and comments are not evidence', () => {
  const source = [
    `it('rejects a fake token and a dummy value', () => {`,
    `  // a stub would go here`,
    `  expect(sum(1, 2)).toBe(3);`,
    `});`,
  ].join('\n');
  assert.deepEqual(labelsOf(source), ['none']);
});

test('vi.fn with a call assertion is a mock', () => {
  const source = [
    `it('notifies once', () => {`,
    `  const notify = vi.fn();`,
    `  run(notify);`,
    `  expect(notify).toHaveBeenCalledTimes(1);`,
    `});`,
  ].join('\n');
  assert.deepEqual(labelsOf(source), ['mock']);
});

test('vi.fn with canned values and no call assertion is a stub', () => {
  const source = [
    `it('shows the name', async () => {`,
    `  const load = vi.fn().mockResolvedValue({ name: 'A' });`,
    `  expect(await load()).toEqual({ name: 'A' });`,
    `});`,
  ].join('\n');
  assert.deepEqual(labelsOf(source), ['stub']);
});

test('a file-level factory that creates vi.fn is attributed to the tests that call it', () => {
  const source = [
    `function makeRepo() {`,
    `  return { save: vi.fn(async () => 1) };`,
    `}`,
    `it('saves once', async () => {`,
    `  const repo = makeRepo();`,
    `  await repo.save();`,
    `  expect(repo.save).toHaveBeenCalledTimes(1);`,
    `});`,
    `it('returns the value', () => {`,
    `  expect(1).toBe(1);`,
    `});`,
  ].join('\n');
  assert.deepEqual(labelsOf(source), ['mock', 'none']);
});

test('a hand-written fake is labelled fake, and fake timers are not', () => {
  const source = [
    `const fakeRepo = { rows: [] };`,
    `it('reads from the fake', () => {`,
    `  vi.useFakeTimers();`,
    `  expect(fakeRepo.rows).toEqual([]);`,
    `});`,
  ].join('\n');
  assert.deepEqual(labelsOf(source), ['fake']);
});

test('spyOn is a spy, and several kinds join in order', () => {
  const source = [
    `it('wraps and fakes', () => {`,
    `  const spy = vi.spyOn(clock, 'now');`,
    `  const fakeStore = { items: [] };`,
    `  run(fakeStore);`,
    `  expect(spy).toHaveBeenCalled();`,
    `});`,
  ].join('\n');
  // spyOn wraps a real method, so it is a spy; the assertion alone does not make a mock.
  assert.deepEqual(labelsOf(source), ['fake+spy']);
  assert.equal(labelOf({ creator: true, assertion: true }), 'mock');
});

test('network stubs in end-to-end tests are stubs', () => {
  const source = [
    `it('shows an error', async () => {`,
    `  await page.route('**/api/events', (route) => route.fulfill({ status: 500 }));`,
    `  await expect(page.getByText('Failed')).toBeVisible();`,
    `});`,
  ].join('\n');
  assert.deepEqual(labelsOf(source), ['stub']);
});

test('a cast to a placeholder value is a dummy', () => {
  const source = [
    `it('ignores the repository', () => {`,
    `  const service = new Service({} as Repo);`,
    `  expect(service.name()).toBe('svc');`,
    `});`,
  ].join('\n');
  assert.deepEqual(labelsOf(source), ['dummy']);
});

test('codeOnly removes strings and comments but keeps code', () => {
  assert.equal(codeOnly(`const a = 'fake'; // mock\nb()`).replace(/\s+/g, ' ').trim(), 'const a = ; b()');
});

test('signalsIn reports each signal on its own', () => {
  const s = signalsIn('vi.fn(); expect(x).toHaveBeenCalled();');
  assert.equal(s.creator, true);
  assert.equal(s.assertion, true);
  assert.equal(s.fake, false);
});
