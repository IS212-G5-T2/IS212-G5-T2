#!/usr/bin/env node
// Story-owned production lines for G5. Usage:
//   node ai/scripts/test-workflow/story-lines.mjs --scope <scope.json> --cycle <dir>
// Commit set: every non-merge commit reachable from HEAD whose subject contains the story key (for example SPM-38).
// Origin rule: a line is owned by the story when the commit that FIRST introduced the line's content (its origin, see
// line-origin.mjs) is in the commit set. Each HEAD line has exactly one origin, so a line is never counted for a story
// because a later commit rewrote it. Whitespace-only and formatting-only commits do not introduce content and keep origins.
// Writes <cycle>/changed-lines.json ({ story, rule, commits, files: { file: [line, ...] } }). coverage-scope.mjs reads it and
// measures the story's floors on owned lines only, so shared code written by other stories does not count.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, WORKFLOW_DIR, abs, expandGlobs, isMain, isTestFile, loadScope, parseArgs, readText, writeText } from "./lib.mjs";
import { expandLines } from "./coverage-scope.mjs";
import { computeOrigins, gitRunner } from "./line-origin.mjs";

const git = gitRunner(REPO_ROOT);

export function storyCommits(story) {
  const key = new RegExp(`\\b${story}\\b`);
  return new Set(
    git(['log', '--no-merges', '--format=%H%x09%s', 'HEAD'])
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split('\t'))
      .filter(([, subject]) => key.test(subject ?? ''))
      .map(([hash]) => hash),
  );
}

/** Lines of one file whose origin commit is in the story's commit set and that the story does not exclude (corrections). */
export function ownedLines(originByLine, commits, removed = new Set()) {
  return [...originByLine].filter(([line, hash]) => commits.has(hash) && !removed.has(line)).map(([line]) => line).sort((a, b) => a - b);
}

/**
 * Final line number -> origin commit for every file in `files`, from one replay of history up to HEAD (line-origin.mjs).
 * Returns { origins: Map(file -> Map(line -> commit)), stats }.
 */
export function originsFor(files) {
  const { files: byPath, stats } = computeOrigins(git, 'HEAD');
  const origins = new Map();
  for (const file of files) {
    const lines = byPath.get(file);
    if (!lines) continue;
    origins.set(file, new Map(lines.map((commit, index) => [index + 1, commit])));
  }
  return { origins, stats };
}

function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  if (!flags.scope || !flags.cycle) {
    console.error('usage: story-lines.mjs --scope <scope.json> --cycle <dir>');
    process.exit(2);
  }
  const scope = loadScope(flags.scope);
  const commits = storyCommits(scope.story);
  const sources = expandGlobs(Object.values(scope.sources ?? {}).flat()).filter((file) => !isTestFile(file) && !file.endsWith('.d.ts') && existsSync(abs(file)));
  // Corrections: lines whose origin is in this story's commit set but whose behaviour belongs to another story (with the reason).
  const corrections = JSON.parse(readText(join(WORKFLOW_DIR, 'story-line-corrections.json'))).filter((c) => c.story === scope.story);
  const { origins, stats } = originsFor(sources);
  const files = {};
  for (const file of sources) {
    const removed = new Set(corrections.filter((c) => c.file === file).flatMap((c) => [...expandLines(c.lines)]));
    const byLine = origins.get(file) ?? new Map();
    const owned = ownedLines(byLine, commits, removed);
    files[file] = owned;
  }
  const total = Object.values(files).reduce((sum, lines) => sum + lines.length, 0);
  const payload = {
    story: scope.story,
    rule: 'origin: the commit that first introduced the line content is in the story commit set (line-origin.mjs)',
    commits: [...commits],
    formattingOnlyCommits: stats.formattingOnly,
    corrections,
    files,
  };
  writeText(join(flags.cycle, 'changed-lines.json'), `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`${scope.story}: ${commits.size} commit(s), ${total} owned line(s) across ${sources.length} file(s); ${stats.formattingOnly.length} formatting-only commit(s) skipped for origin`);
}

if (isMain(import.meta.url)) main();
