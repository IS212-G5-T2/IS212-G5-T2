import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

const repository = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const component = process.cwd();
const componentPath = relative(repository, component).split(sep).join('/');
const base = baseCommit();
const sourceFiles = git([
  'diff', '--name-only', '--diff-filter=A', `${base}...HEAD`, '--', `${componentPath}/src`,
]).split('\n').filter((file) => /\.(ts|tsx)$/.test(file) && !/\.(test|spec)\.(ts|tsx)$/.test(file));

if (!sourceFiles.length) {
  console.log('No newly created runtime source files require coverage verification.');
  process.exit(0);
}

const summary = JSON.parse(readFileSync(resolve(component, 'coverage/coverage-summary.json'), 'utf8'));
const failures = [];
for (const file of sourceFiles) {
  const report = summary[resolve(repository, file)];
  if (!report) failures.push(`${file}: absent from coverage report`);
  else for (const metric of ['lines', 'statements', 'functions', 'branches']) if (report[metric].pct !== 100) failures.push(`${file}: ${metric} ${report[metric].pct}%`);
}

if (failures.length) {
  console.error(`New runtime files must be 100% covered relative to ${base}:\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
  process.exit(1);
}
console.log(`All newly created runtime source files are 100% covered relative to ${base}.`);

/** Executes Git from the repository root. */
function git(args) { return execFileSync('git', args, { cwd: repository, encoding: 'utf8' }).trim(); }

/** Resolves the pull-request base locally or in GitHub Actions. */
function baseCommit() {
  if (process.env.GITHUB_BASE_SHA) return process.env.GITHUB_BASE_SHA;
  for (const candidate of ['origin/dev', 'dev', 'HEAD^']) {
    try { return git(['merge-base', 'HEAD', candidate]); } catch { /* try the next available ref */ }
  }
  throw new Error('Unable to determine the coverage comparison base.');
}
