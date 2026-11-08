#!/usr/bin/env node
// Heuristic test-double classifier for the per-test record column `double`.
// Labels: none | fake | mock | spy | stub | dummy, joined with "+" in that order when several apply.
// The rules are in docs/test-cases/workflow/test-doubles.md. The label is automatic evidence only; a reviewer
// confirms it. Evidence is read from code with strings and comments removed (so a title such as "rejects a fake
// token" does not count), from the test body, and from same-file declarations that the body names.
import { extractTests } from './lib.mjs';

export const DOUBLE_ORDER = ['fake', 'mock', 'spy', 'stub', 'dummy'];

const SIGNALS = {
  spy: /\b(?:vi|jest)\.spyOn\(/,
  creator: /\b(?:vi|jest)\.fn\b|\b(?:vi|jest)\.mock\(/,
  assertion: /\b(?:toHaveBeenCalled\w*|toBeCalled\w*|toHaveBeenLastCalledWith|toHaveBeenNthCalledWith)\b|\.mock\.(?:calls|results|lastCall|invocationCallOrder)\b/,
  canned: /\.(?:mockResolvedValue\w*|mockReturnValue\w*|mockImplementation\w*|mockRejectedValue\w*)\(/,
  network: /\bpage\.route\(|\.fulfill\(|\bsetupServer\(|\bhttp\.(?:get|post|put|patch|delete)\(|\bmsw\b/,
  fake: /\bfake(?:[A-Z_]\w*)?\b|\bFake[A-Z]\w*|\bin-?memory\b|\bInMemory\w*/,
  dummy: /\b[Dd]ummy\w*|\{\s*\}\s+as\s|\bnull\s+as\s|\bundefined\s+as\s/,
};
const SIGNAL_NAMES = Object.keys(SIGNALS);

/** Removes comments and string/template literals, so titles and prose never count as evidence. */
export function codeOnly(text) {
  return text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|(['"`])(?:\\.|(?!\1)[^\\\n])*\1/g, ' ');
}

/** Which signals a piece of code shows. `useFakeTimers` is not a fake double: it is excluded by the word boundary. */
export function signalsIn(code) {
  const found = {};
  for (const name of SIGNAL_NAMES) found[name] = SIGNALS[name].test(code);
  return found;
}

const merge = (into, from) => {
  for (const name of SIGNAL_NAMES) into[name] = Boolean(into[name] || from[name]);
  return into;
};

/**
 * Same-file names that create or fake doubles: `const x = vi.fn(...)` on one line, and top-level
 * factories / classes whose block (up to the next column-0 line) does. Maps name -> merged signals.
 */
export function declaredDoubles(text) {
  const lines = text.split('\n');
  const map = new Map();
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const variable = line.match(/^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=/);
    const top = line.match(/^(?:export\s+)?(?:async\s+)?(?:function|const|class)\s+(\w+)/);
    if (!variable && !top) continue;
    const name = (variable ?? top)[1];
    let block = line;
    if (top) {
      for (let j = i + 1; j < lines.length; j += 1) {
        if (/^\S/.test(lines[j]) && !/^[})\]]/.test(lines[j])) break;
        block += `\n${lines[j]}`;
      }
    }
    const signals = signalsIn(codeOnly(block));
    if (!SIGNAL_NAMES.some((n) => signals[n])) continue;
    map.set(name, merge(map.get(name) ?? {}, signals));
  }
  return map;
}

/** Source text of one call site: from its line to the parenthesis that closes it (capped). */
export function callBody(lines, startIndex) {
  let depth = 0;
  let started = false;
  for (let i = startIndex; i < Math.min(lines.length, startIndex + 400); i += 1) {
    for (const ch of lines[i]) {
      if (ch === '(') {
        depth += 1;
        started = true;
      } else if (ch === ')') depth -= 1;
    }
    if (started && depth <= 0) return lines.slice(startIndex, i + 1).join('\n');
  }
  return lines[startIndex] ?? '';
}

/** Turns combined signals into the ordered label. A creator with an assertion is a mock; without one, a stub. */
export function labelOf(signals) {
  const kinds = new Set();
  if (signals.spy) kinds.add('spy');
  if (signals.creator) kinds.add(signals.assertion ? 'mock' : 'stub');
  if (signals.canned || signals.network) kinds.add('stub');
  if (signals.fake) kinds.add('fake');
  if (signals.dummy) kinds.add('dummy');
  if (kinds.has('mock')) kinds.delete('stub');
  const labels = DOUBLE_ORDER.filter((k) => kinds.has(k));
  return labels.length ? labels.join('+') : 'none';
}

/** Map of 1-based test line -> double label for one file's source text. */
export function classifyDoubles(text) {
  const lines = text.split('\n');
  const declared = declaredDoubles(text);
  const result = new Map();
  for (const test of extractTests(text)) {
    const body = codeOnly(callBody(lines, test.line - 1));
    const signals = signalsIn(body);
    for (const [name, names] of declared) {
      if (new RegExp(`\\b${name}\\b`).test(body)) merge(signals, names);
    }
    result.set(test.line, labelOf(signals));
  }
  return result;
}
