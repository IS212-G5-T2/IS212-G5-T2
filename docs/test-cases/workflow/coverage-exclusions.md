# Coverage exclusions

Two kinds of row. Both need a reason, or gate G5 blocks.

- `file`: a source file in a story's scope that no coverage run measures (for example a types-only file). It is removed from the measured set.
- `ignore-comment`: documents a coverage ignore comment (`/* v8 ignore */`, `/* istanbul ignore */`, `/* c8 ignore */`) in a scope source file. The file stays measured; the row gives the same reason as the comment. G5 blocks on an ignore comment with no row here.

See `ai/docs/test-workflow.md` section 7 (G5).

| File | Kind | Reason |
|---|---|---|
