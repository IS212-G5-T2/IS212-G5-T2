---
name: module-organization
description: Review or plan file placement for new or materially changed backend modules and frontend features in this repository. Use when evaluating module boundaries, cohesion, or where code and tests belong.
---

# Module and feature organization

Apply this guidance to new or materially changed areas. Follow scoped `AGENTS.md` rules first. Treat layouts as defaults that should fit module size; do not create empty folders or flag existing code for lacking a folder without an assigned restructuring requirement.

## Backend

Keep each NestJS domain in `backend/src/<module>/`. Read [backend module layout](references/backend-module-layout.md) when placing backend files, reviewing a backend module, or planning an authorized backend reorganization. It covers the module internals, migration and fresh-schema pairing, backend E2E placement, mutation artifacts, and the direct CI workflow convention.

## Frontend

Prefer feature-oriented grouping for new or substantially reorganized UI: keep a feature's pages, components, hooks, API adapters, and feature types together. Within a feature, group files by independently routed or independently evolving user workflow when that workflow owns more than one file. A workflow folder keeps its page, tests, fixtures, hooks, and local components together; retain a flat feature folder when splitting would only isolate one simple file. Keep truly shared UI primitives in `components/ui/`, cross-feature integrations in `lib/`, and app-wide Zustand state in `store/`; feature-only state belongs with that feature. Keep tests beside the source as required by repository conventions.

For this Vite app, a gradual shape could be:

```text
src/
  app/                    bootstrap, routes, global providers
  features/<feature>/     pages, components, hooks, api, types, colocated tests
  components/ui/          reusable design primitives
  lib/                    shared clients and integrations
  store/                  genuinely app-wide state
```

This is a recommendation, not a React-mandated tree. It applies the feature-folder guidance in the [Redux style guide](https://redux.js.org/style-guide/#structure-files-as-feature-folders-with-single-file-logic) to this Zustand app; React itself supports composing and separating components as they grow ([React component guidance](https://react.dev/learn/your-first-component#nesting-and-organizing-components)). When work involves frontend placement or a page migration, read [frontend page groups](references/frontend-page-groups.md). Use its ownership map to group touched files by feature. Treat a crowded page layout as known debt, not a finding against every file; avoid a broad migration as incidental cleanup.

## Review result

Report misplaced files only when placement obscures ownership, increases coupling, duplicates shared concepts, or conflicts with a stated boundary. Recommend the smallest move that restores cohesion; do not treat this example tree as acceptance criteria.
