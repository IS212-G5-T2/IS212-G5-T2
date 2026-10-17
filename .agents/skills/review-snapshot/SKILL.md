---
name: review-snapshot
description: Capture and compare a stable Git review snapshot before or after delegated code review. Use when reviewers need a reproducible target covering staged, unstaged, and untracked inputs.
---

# Review snapshot

Use this skill when preparing a repository snapshot for a reviewer or deciding whether a later change invalidates that snapshot. The Orchestrator retains authority over stage transitions and review invalidation.

1. From the repository root, record the full `git rev-parse HEAD`, current branch, and complete `git status --short --branch --untracked-files=all` output.
2. Record the review scope as explicit paths. Include relevant source, tests, configuration, instructions, and generated evidence; include untracked files that a reviewer will inspect.
3. Capture `git diff --binary -- <paths>` and `git diff --cached --binary -- <paths>` for the scoped paths. Hash both outputs (for example, with `shasum -a 256`) and hash each scoped untracked file's contents. Record the path list with the hashes so rename, deletion, and path changes are visible.
4. Give the reviewer the HEAD, branch, status, scoped paths, and fingerprints as `target_snapshot`. Preserve the manifest with the assignment or in ignored `ai/runtime/` when a report file is assigned.
5. Before accepting a review result, compare the current HEAD, status, paths, and fingerprints with its target. If any review input changed during review, treat that result as stale and request review against a newly captured snapshot.

Follow `ai/docs/sub-agents.md` for the shared snapshot contract. A snapshot identifies review inputs; it does not prove a gate passed or decide which gates the Orchestrator must run.
