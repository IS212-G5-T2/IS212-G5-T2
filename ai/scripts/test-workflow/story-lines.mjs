#!/usr/bin/env node
// Story-owned production lines for G5. Usage:
//   node ai/scripts/test-workflow/story-lines.mjs --scope <scope.json> --cycle <dir>
// Commit set: every non-merge commit reachable from HEAD whose subject contains the story key (for example SPM-38).
// A line is owned by the story when `git blame -w -M -C -C HEAD` says its last writer is in that commit set.
// Writes <cycle>/changed-lines.json ({ story, commits, files: { file: [line, ...] } }). coverage-scope.mjs reads it and
// measures the story's floors on owned lines only, so shared code written by other stories does not count.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, WORKFLOW_DIR, abs, expandGlobs, isTestFile, loadScope, parseArgs, readText, writeText } from "./lib.mjs";
import { expandLines } from "./coverage-scope.mjs";

const git = (args) => execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

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

/** Final line number -> commit that last wrote it, from `git blame --porcelain`. */
export function blameFile(file) {
  const out = git(['blame', '--porcelain', '-w', '-M', '-C', '-C', 'HEAD', '--', file]);
  const byLine = new Map();
  for (const line of out.split('\n')) {
    const header = line.match(/^([0-9a-f]{40}) \d+ (\d+)/);
    if (header) byLine.set(Number(header[2]), header[1]);
  }
  return byLine;
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
  // Corrections: lines that blame traces to this story but whose behaviour belongs to another story (with the reason).
  const corrections = JSON.parse(readText(join(WORKFLOW_DIR, 'story-line-corrections.json'))).filter((c) => c.story === scope.story);
  const files = {};
  for (const file of sources) {
    const removed = new Set(corrections.filter((c) => c.file === file).flatMap((c) => [...expandLines(c.lines)]));
    const owned = [...blameFile(file)].filter(([line, hash]) => commits.has(hash) && !removed.has(line)).map(([line]) => line).sort((a, b) => a - b);
    files[file] = owned;
  }
  const total = Object.values(files).reduce((sum, lines) => sum + lines.length, 0);
  writeText(join(flags.cycle, 'changed-lines.json'), `${JSON.stringify({ story: scope.story, commits: [...commits], corrections, files }, null, 2)}\n`);
  console.log(`${scope.story}: ${commits.size} commit(s), ${total} owned line(s) across ${sources.length} file(s)`);
}

main();
