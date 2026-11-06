# Format for the E2E-NN test cases

Every file in this directory follows this exact structure. It is the house Confluence format,
taken from the existing "End to End Tests" pages (for example `E2E-EVENT-DRAFT-01`, page 36470866),
reconciled with the project's `test-case-generation-prompt.md` template.

One file per journey, named `E2E-NN.md`. **One test case per journey** — not the prompt's five
coverage tiers. An E2E journey already carries its own negatives inside its steps (E2E-05 includes
"EC2 cannot view EC1's event, including by direct URL"), so splitting it into `-A`/`-B`/`-BND`
variants would fragment one journey into fragments that individually prove nothing. Tier suffixes
belong to AC-derived unit and integration cases, which is what that prompt was written for.

---

```markdown
# E2E-NN: <title from the plan> (SPM-aa, SPM-bb, ...)

Cross-role end-to-end test (DRAFT, not executed). <Two or three sentences: what the journey covers,
which roles it crosses, and what makes it E2E rather than cheaper.>

---

### E2E-NN

**Test case details**

| Item | Description |
| --- | --- |
| Test Case ID | E2E-NN |
| Related AC | Every story and AC this journey is evidence for, quoted or closely paraphrased, each prefixed with its key: "SPM-37 AC1/AC2: save an event request as a draft without submitting ...". Take these from the brief's row. Where the brief says `undetermined`, write "No AC: <what is missing>" rather than inventing one. |
| Test Scenario | One paragraph, present tense, naming each role as it acts. This is the journey in prose. |
| Pre-conditions | Numbered. State the stack, the seeded accounts used by name (organiser1, coordinator1, ...), the fixture calls that build the state (`db.scene({...})`, `db.preset("...")`), and `test.use({ as: "..." })`. Be concrete: no "user is ready". |
| Test Steps | Numbered, sequential, each naming the acting role and the observable check. Include the journey's own negative steps. Where the journey asserts a forbidden action, assert it **both through the UI and by direct API call** (SPM-168 AC2). |
| Test Data | Key-value, grouped. Give literal values. Times as offsets from a stated anchor (`isoDateFromNow(30)`, `atUtcHour`), never a bare `Date.now()`. |
| Expected Result | What passing looks like, including the **database effect** — status change, row created or released, notification delivered to the right recipient *and to nobody else* (SPM-168 AC1). Not only UI text. |
| Level | `E2E (Playwright, cross-role).` Then what is already automated and what is not. |
| Test file(s) | Existing specs that cover part of it, with a note of what they do not cover, plus the proposed new file path. |

**Test case results**

| Item | Description |
| --- | --- |
| Actual Result | `Not executed yet.` |
| Pass/Fail | `Not Executed` |
| Test bodies | `Not executed (Playwright spec not written).` |
| Executed By | *(blank)* |
| Date of Execution | *(blank)* |

**Notes (open questions)**

1. Each assumption, each `undetermined` from the brief, and each open question that gates an
   assertion, numbered. Name the SPM-168 question number where one applies. State the assumption the
   case proceeds on, so a reader can see what to re-check once it is answered.
2. Any existing Confluence page that overlaps this journey, by title and page id, and whether this
   case supersedes or complements it.
```

---

## Rules that change what a case says

* **Binding definition of E2E** (SPM-168): real browser → real backend over HTTP → real database,
  nothing mocked between. A step that stubs the API is not E2E. Only external boundaries may be
  faked, plus a deliberate fault injection at a named route.
* **Write boundary expectations from the ACs, never from the code.** Turnaround and hold expiry are
  where AI-written code and AI-written tests are most likely to share a mistake. If an expected
  result can only be derived by reading the implementation, say so in Notes instead.
* **Assert the absence of a notification** where no story says a role is notified, rather than
  asserting silence by omission.
* **No fixed sleeps**, no `waitForTimeout`, no `networkidle`. Waits are assertions or explicit
  response waits.
* **Locators** by role, label or test id. No bare tag, `nth-child`, XPath or tooltip text.
* **Never invent an AC, a status, a notification type or an endpoint.** If the journey needs one that
  does not exist, say so in Notes and mark the affected step as blocked.

## Fixture machinery available (SPM-187, merged)

`test.use({ as: "organiser" | "coordinator" | "lead" | "venue_staff" | "tech_support" |
"safety_officer" | "attendee" })`, or a named account such as `"coordinator2"`.
`pageAs("venue_staff")` for a second signed-in user in one test.
`db.scene({ venues, events, equipment, registrations })`, `db.venue()`, `db.event()`,
`db.equipment()`, `db.preset("withdrawal" | "auditTrail" | "holdExpiry")`.
`freezeClock`/`advanceClock` (**browser only** — the backend keeps real time), and
`calendarDayFromNow`/`isoDateFromNow`/`atUtcHour` for form dates.
`mobile` project on `devices["Pixel 7"]`, matching `*.mobile.playwright.spec.ts`.

**No builders exist** for booking requests, hold requests, change requests, cancellation requests,
safety checks or equipment requests. A case needing one either creates it through the UI or API as
part of the journey, or lists the missing builder as a prerequisite. `status: "Confirmed"` sets only
the status; it does not add the SPM-135 readiness rows.
