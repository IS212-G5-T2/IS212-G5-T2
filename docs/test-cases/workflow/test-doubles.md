# Test doubles in the test records

The `double` column of each `records/<story>.csv` row says which test doubles a test uses. It is filled by `ai/scripts/test-workflow/test-doubles.mjs` (called from `check-records.mjs`), so it refreshes with the records. It is automatic evidence, not a reviewer's judgement, and a reviewer confirms or corrects it.

## Labels

Each label is the usual meaning in this codebase. Several labels in one test are joined with `+` in this order: `fake`, `mock`, `spy`, `stub`, `dummy`.

| Label | Meaning | Evidence the script looks for |
|---|---|---|
| `none` | Real collaborators only: real modules, real database (E2E and integration suites), real components | No signal below |
| `fake` | A hand-written working stand-in with real behaviour (for example an in-memory repository) | An identifier `fake…` or `Fake…`, or `in-memory` / `InMemory…` |
| `mock` | A replaced function or module whose calls the test asserts on | `vi.fn` / `jest.fn` / `vi.mock` / `jest.mock` together with a call assertion (`toHaveBeenCalled…`, `.mock.calls`, `toHaveBeenLastCalledWith`, …) |
| `spy` | A real method wrapped to observe it (`vi.spyOn` / `jest.spyOn`) | `spyOn(` |
| `stub` | A replaced function or network response that returns canned values and is not asserted on | `vi.fn` without a call assertion; `mockResolvedValue…`, `mockReturnValue…`, `mockImplementation…`; `page.route`, `route.fulfill`, `setupServer`, `msw` |
| `dummy` | A placeholder passed only to satisfy a signature and never meant to be used | A cast of `{}`, `null` or `undefined` (for example `{} as Repo`), or an identifier `dummy…` |

Notes on the rules:

- A `vi.fn` with a call assertion is a `mock`; the same function without one is a `stub`. The assertion alone does not make a double.
- `vi.useFakeTimers()` is not a `fake`. Timers are controlled through the test framework, not a stand-in object.
- Words in test titles and comments are removed before the search, so a title such as "rejects a fake token" does not count.
- A double created in a file-level factory, or in a `beforeEach` with a variable name the test body uses, is attributed to the tests that use that name.
- End-to-end suites must not stub the backend. `E2E-01` (`docs/test-cases/e2e/E2E-01.md`) states the rule: no `page.route`, MSW or fetch stub. Any `stub` label in an E2E record needs a reason.

## Known limits

- The search is text based, not type based. A double shared through a helper in another file is not seen unless the test body or the same file names it.
- A variable name used for a double in one place and a real value in another part of the same file can over-attribute a label. The unit tests in `ai/scripts/test-workflow/test-doubles.test.mjs` pin the expected labels for the main patterns.
- `dummy` is detected from casts and identifiers only. An unused parameter with no cast is not detected.
- The labels are a starting point for the reviewer. Confirm each `double` value before citing it in a Q&A.
