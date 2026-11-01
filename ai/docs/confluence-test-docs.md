# Confluence Test-Case Documentation

How every story's test cases are written up in Confluence (space **SP**). The team standard is the **SPM-80 style** (Coordinator Updates Availability), not the older SPM-54 heading/section style. Current reference pages: COOR-AVAIL-03 (case page, SPM-80), the SPM-88 matrix "Request Approval and Rejection Notifications Matrix" and its case page DECISION-NOTIFY-01.

Where this fits:

- [`test-generation`](../../.agents/skills/test-generation/SKILL.md) writes the tests; [`test-workflow.md`](test-workflow.md) keeps the repo records and gates. G1 compares test IDs in code with the registry and this Confluence matrix, so the matrix must list every PRIMARY ID.
- This file is how the matrix and case pages look. Write or update them in the same piece of work that adds, renames, retires or re-runs tests, once the user has approved the Confluence change.

## 1. Rules

1. **Every automated test has an ID and a case.** No untagged or undocumented tests. The ID appears in the test name (`it("DECISION-NOTIFY-01-A: ...")`) and in a case table.
2. **Document under the owning story.** A test that exercises another story's behaviour is documented on that story's pages (add a note there), not on the current ticket's.
3. **Expected results come from the AC**, the case or a stated decision, never from what the code happens to do.
4. **Describe fixtures honestly.** A unit test whose current user is a fixture is "a unit test of this feature in isolation; the current user is a fixture, not a live login". Do not write "authenticated (mocked)". Integration cases say they sign in through the real login route.
5. **Report only observed results.** Actual Result and Pass/Fail cite the test cycle that produced them (e.g. `cycle-14`); a case not yet run is `Not Executed`.
6. **Matrix pages are live docs.** Edits are visible immediately; the API may report `status: "draft"`, but there is no publish step.

## 2. Location

```
Unit Tests/ Functional tests            (folder)
└── <EPIC key> <epic name>              (folder)
    └── <STORY key> <story summary>     (folder)
        ├── <story summary> Matrix      (live doc)
        └── <story summary> Test Cases  (folder)
            ├── <PREFIX>-01             (page, one per AC)
            ├── <PREFIX>-02
            └── ...
```

`<PREFIX>` is a short story-specific code, e.g. `COOR-AVAIL` (SPM-80), `DECISION-NOTIFY` (SPM-88). Check the registry and Confluence that it is unused.

## 3. Case IDs

`<PREFIX>-<AC number, two digits>-<suffix>`, e.g. `DECISION-NOTIFY-05-BND-2`.

| Suffix | Use |
|---|---|
| `A`, `B`, `C`, ... | Main scenarios for the AC |
| `SEC-n` | Security: another user, wrong role, no session |
| `BND-n` | Boundary values and edge input |
| `STATE-n` | Negative state transitions (repeat or invalid action) |
| `CONC-n` | Concurrency |
| `INT-n` | Integration of components across a boundary |
| `VIEWPORT-n` | Layout at a specific screen size |

IDs added during review that are not tied to a planned case are SUPPORTING IDs: register them under their parent AC (`test-workflow.md`) and note them as pending PO approval in the matrix scope notes until approved. A retired ID is never reused.

## 4. Matrix page

Title `<story summary> Matrix`. One table, one row per AC, nothing above it (no confidence or execution-status preamble):

| **Ticket ID** | **Acceptance Criteria** | **Test Case ID** | **Related Code Module** |
| --- | --- | --- | --- |
| [SPM-88 — Request Approval and Rejection Notifications](https://is212-g5-t2.atlassian.net/browse/SPM-88) | AC1: When a Coordinator approves or rejects my event request, I receive one in-app notification ... | [DECISION-NOTIFY-01-A](https://is212-g5-t2.atlassian.net/wiki/spaces/SP/pages/37388321/DECISION-NOTIFY-01#A) [DECISION-NOTIFY-01-B](...#B) ... | backend/src/events/events.service.ts backend/src/events/review/event-rejections.controller.ts |

- **Ticket ID:** Jira link, text `<KEY> — <summary>`.
- **Acceptance Criteria:** `ACn:` plus the current Jira wording. When an AC is amended, update the text and add a scope note.
- **Test Case ID:** every case for the AC, each linked to its heading anchor on the case page (`.../<PREFIX>-0n#A`, `#SEC-1`).
- **Related Code Module:** the production source files that implement the AC, not spec or test files.

Below the table, *italic* scope notes: which story owns what (e.g. "moved from SPM-123 AC9"), PO/user decisions with who and when, retired case IDs, SUPPORTING IDs awaiting approval, and anything deliberately out of scope.

## 5. Case page

Title `<PREFIX>-0n` (one page per AC). It starts with one *italic* intro line:

*Story: SPM-88 — Request Approval and Rejection Notifications. This page covers AC1: <AC wording>. <Which cases are backend unit, integration (real API and PostgreSQL), or frontend, and how users/sessions are set up.>*

Then, for each case, a heading `# <full case ID>` followed by one two-column `Item | Description` table with these 13 rows in this order:

| Item | Description |
| --- | --- |
| Test Case ID | `DECISION-NOTIFY-01-A` |
| Test Scenario | One sentence starting "Verify ..." (or "Security — ...", "Negative (state) — ..."), ending with the AC in brackets: `(AC1)` |
| Pre-conditions | Numbered: database/fixtures, who is signed in and how, data that must exist |
| Test Steps | Numbered actions, with API routes or UI controls in code format |
| Test Data | The concrete inputs |
| Expected Result | Observable outcomes separated by ` • `: status codes, stored state, what is shown, and what stays unchanged after a refusal |
| Actual Result | `Pass, cycle-NN (<date>).` plus timezones where the cycle ran several; `Not executed yet.` before a run |
| Pass/Fail/Not Executed/Blocked | One of those four words |
| Remarks | `Automated coverage: <spec file>. Exact test: it("<exact test name>").` Then related earlier cases, contract notes, mutants it kills, and a dated `Changed <date> (<cycle/reason>): ...` note for every later change |
| Created By\* | Person who wrote the case |
| Date of Creation\* | e.g. 29 Oct 2026 |
| Executed By\* | e.g. `Ei Chaw Zin (automated test cycle)` |
| Date of Execution\* | Date of the cycle in Actual Result |

Markdown pipe tables render as Confluence tables when written through the Atlassian tools.

## 6. Keeping it current

- **New tests:** add the case table, link it in the matrix row, register the ID.
- **Changed tests:** update Expected Result and the exact `it(...)` name; add a `Changed <date>` note to Remarks.
- **Retired tests:** remove the case from the matrix row, list it as retired in the scope notes, and keep the ID out of use.
- **After a review cycle:** update Actual Result, Pass/Fail, Executed By and Date of Execution for every case the cycle ran.
- **AC amendments:** update the matrix AC text and record the decision (who, when, conflict ID) in the scope notes.
