import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ownedLines } from './story-lines.mjs';

// The origin rule: a line belongs to the story when its origin commit (the commit that first introduced it) is one of
// the story's commits. Blame's last writer is not consulted, so a later commit that rewrites a line does not move it.
test('a line is owned when its origin commit is in the story commit set', () => {
  const origins = new Map([[1, 'approve-c'], [2, 'reconcile-c'], [3, 'other-c'], [4, 'approve-c']]);
  assert.deepEqual(ownedLines(origins, new Set(['approve-c'])), [1, 4]);
});

test('lines whose origin is outside the story commit set are not owned, even when a later story commit rewrote them', () => {
  // Line 2 was rewritten by a commit of this story (its last writer), but its origin is an earlier commit of another story.
  const origins = new Map([[1, 'mine-c'], [2, 'earlier-other-c']]);
  assert.deepEqual(ownedLines(origins, new Set(['mine-c', 'later-mine-c'])), [1]);
});

test('corrected lines are removed from the owned set with their reason in story-line-corrections.json', () => {
  const origins = new Map([[96, 'multi-story-c'], [97, 'multi-story-c'], [98, 'mine-c']]);
  assert.deepEqual(ownedLines(origins, new Set(['multi-story-c', 'mine-c']), new Set([96])), [97, 98]);
});

test('the result is sorted by line number', () => {
  const origins = new Map([[9, 'c'], [3, 'c'], [5, 'c']]);
  assert.deepEqual(ownedLines(origins, new Set(['c'])), [3, 5, 9]);
});
