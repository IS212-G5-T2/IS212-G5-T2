# E2E Test Case Generation Brief (SPM-168)

Project-specific input for `test-case-generation-prompt.md`, which turns acceptance criteria into test case specifications (see the pipeline at the top of `test-code-generation-guide.md`). This brief does not replace that prompt and does not contain the 30 test cases. It supplies what the generic prompt cannot know: which stories each journey crosses, which sources outrank which, which rules change what a test case says, and the exact formats the output must match.

Feed the generator this whole file together with the E2E test plan. Generate the 30 specifications for `E2E-01` to `E2E-30`.

Prepared 2026-11-06. Every claim below was read from a named source in section 1. Where a value could not be determined it says `undetermined` and section 9 says why. Nothing here is guessed.

---

## 1. Sources and ranking

When sources disagree, the higher one wins for expected results. Record the disagreement in the case; do not resolve it silently.

| Rank | Source | Use it for |
|---|---|---|
| 1 | E2E test plan, Claude Docs artifact `https://claude.ai/artifact/CpSe1vDz3vRTWH44yUCdeB` (project `5fb44855-7b9e-4acb-a772-37080e202924`, dated 2026-11-04). Read with the Claude Docs tools, not a web fetch. | Journey steps, expected results, priorities, Trace lines. SPM-168 says it "outranks this ticket and the code". It exists in no repository yet (SPM-188 will commit it). |
| 2 | Jira SPM-168 (description, and its single comment 10142). | Binding definition of E2E, AC1 to AC6, non-goals, the 10 open questions. Comment 10142 archives the original description and is the only surviving record of the lost 110-flow manual suite. |
| 3 | The other SPM stories and the Confluence matrices (Confluence is authoritative for test cases, root `AGENTS.md`). | Acceptance criteria per story. A Confluence phrase search is unreliable in this space; zero hits proves nothing. Open pages. |
| 4 | The repository: `docs/test-cases/workflow/test-id-registry.md`, `docs/test-cases/ConnectSphere-E2E-Test-Suite.md`, the Playwright specs under `frontend/src/**/*.playwright.spec.ts`, `ai/docs/confluence-test-docs.md`, `ai/docs/test-workflow.md`. | Existing IDs, provenance, existing coverage, house format. |

Numbering used in this brief:

- `Q1` to `Q10` are the open questions in the order they appear in the SPM-168 description. SPM-190 lists the same ten but swaps 9 and 10 (SPM-190 puts registration wording at 9 and preparation-versus-confirmation at 10). The E2E plan has its own eight questions with different numbers again. Use the SPM-168 numbering in every case and write the question out in words the first time.
- `R<n>` is flow n of the recovered 31-flow `docs/test-cases/ConnectSphere-E2E-Test-Suite.md`.
- `L<n>` is flow n of the lost 110-flow suite, as quoted in SPM-168 comment 10142. Those numbers do not match `R<n>` (SPM-188 shows four collisions). Never write a bare flow number.
- `A<n>.<m>` is bullet m (counted in order, by this brief) of original acceptance criterion n in comment 10142 (for example `A5.4` is "a registered attendee can withdraw").

---

## 2. The rules that change what a test case says

State each as a rule in the generated case. A case that breaks one is rejected.

### 2.1 The binding definition of E2E

> A test that drives the real frontend UI in a real browser, through the real backend over HTTP, to a real database, with no layer mocked, stubbed, or intercepted in between.

- A spec with `page.route`, MSW, a `fetch` stub or any interception is not E2E, whatever its folder or filename. The only permitted exception is a deliberate fault injected at an external boundary, named in the case (AC4).
- A test that never reaches the backend is not E2E.
- Folder and filename never determine classification. Contents do. The 54 `backend/test/*.e2e-spec.ts` suites are integration tests (no browser); they are evidence, not E2E.

### 2.2 Non-goals: do not generate these as E2E

Single-role single-feature CRUD (a Venue Staff member creates a venue; Technical Support creates equipment), anything that never reaches the backend (empty login fields showing client-side validation), single-screen form validation, list filtering and sorting, not-found messages, "page reachable for every role" checks. If a journey in the plan reduces to one of these, say so in Remarks and stop. Do not pad it.

### 2.3 AC1: assert the database effect

Every case states the stored effect, not only UI text: the status change, the row created or released, and a notification delivered to the right recipient and to nobody else. Name the non-recipients. Where the plan or an open question leaves recipients undecided (Q7), assert the absence and record the assumption.

### 2.4 AC2: every forbidden action, twice

For every forbidden action the case has two steps: the attempt through the UI (control absent, route guarded) and the same attempt by direct API call or direct URL as that user, asserting the refusal (status code and error code from the spec, or `ASSUMPTION`) and that nothing changed in the database. Include the unauthenticated case. A hidden button is not an access control.

### 2.5 AC3 and AC4: isolation and determinism

- Fresh disposable database per test. The fixture does the reset; the case lists only what it builds.
- Fixtures through builders. No fixed-id seeded rows, no reliance on another test's leftovers or on row order.
- No fixed sleeps. No `waitForTimeout`, no `networkidle`. Waits are assertions or explicit response waits.
- Inject the clock; never compute from `Date.now()` inside a test. See the limit in section 8.2: the clock helper controls the browser only.
- Fake only external boundaries (email) or inject a named fault. Never the frontend, backend or database.
- Locators by role, label or test id. No bare tag, `nth-child`, XPath, or tooltip text.
- Two accounts of one role at the same time (EC1 and EC2) need `pageAs(...)`, not a logout in the same page.

### 2.6 Write boundary expectations from the ACs, never from the code

The plan says this twice and it is the most important rule in this brief. Turnaround, setup, hold expiry and capacity are where AI-written code and AI-written tests are most likely to share a mistake: an agent's `<=` versus `<` defect passed CI because its own test repeated it. For every boundary:

1. Work the expected value out by hand from the AC or the plan and write it as a literal with the arithmetic (`10:00 - 30 min = 09:30`; `12:00 + 45 min = 12:45`).
2. Never read the conflict query, the expiry processor or a service method to decide `<` versus `<=`.
3. Test both directions: the value that must trigger and the value one minute short that must not.
4. Make paired fields differ (setup 30, turnaround 45) so a swap is visible.
5. If the AC and the plan do not fix the boundary, it is an open question (section 6). Record the assumption; do not pick the code's behaviour.

### 2.7 Open questions: record, name, do not choose silently

Where an expected result depends on one of the ten questions in section 6, the case must:

- name the question (`Q1 setup/turnaround boundary`),
- state the assumed behaviour in a numbered assumption `[Sn]` in the case's Pre-Generation Checkpoint, following the `[Sn]` convention already used in `docs/specs/SPM-155-test-cases.md`,
- put the assumption in a named constant at the top of the eventual spec (SPM-190 and SPM-191 require this), so a changed answer is a one-line edit,
- set Remarks to `Blocked by Q<n>` and say whether the case may run before the answer arrives.

A story note that already states a position is evidence, not an answer. Section 6 lists those positions. Several are team decisions (story owner, PO deputy), not customer answers, and the questions remain open in SPM-168.

Priority check: the questions that gate P0 assertions are Q1 (E2E-09), Q4 (E2E-13), Q5 (E2E-28), Q7 on E2E-05, Q9 (E2E-01, E2E-18) and Q10 (E2E-21). Q2 (SO rejection) gates E2E-20, which is P1; do not describe it as P0-gating. A P0 case that asserts at the wrong instant passes vacuously.

---

## 3. Facts found while preparing this brief that change cases

Each is a conflict between sources or a gap. Carry it into the affected case as a recorded assumption or conflict; do not smooth it over.

1. **There is no `Preparation` event status.** The implemented statuses are Submitted, Approved, Rejected, Planning, Confirmed, Completed, Cancelled (recovered doc "Key Business Rules"; SPM-48 AC2). The plan's lifecycle says "Preparation". Story evidence: Approved moves to Planning on the first venue request (SPM-148 AC1); Confirm requires approved venue bookings, reserved equipment and Safety Officer approval (SPM-135 AC1, AC2). Map the plan's "preparation" to Planning with its readiness conditions and say so in the case. This is the substance of Q9.
2. **SPM-38 AC5 ("assignment is done in round robin") is superseded** by SPM-123 (the Lead assigns from an unassigned queue). Do not assert round robin. SPM-38 AC4 (a coordinator cannot access another coordinator's request) is still live.
3. **SPM-181 "Event Change Notification (Attendee)" is Cancelled.** No live story notifies attendees of a reschedule or venue change, so the plan's E2E-24 expectation that registered attendees are notified has no story behind it (Q7).
4. **Notification stories say the Organiser is not notified** for hold decisions (SPM-165), hold expiry (SPM-134), equipment decisions (SPM-172) and cancellation requests (SPM-171 notifies the Coordinator only). Booking decisions notify the Coordinator only (SPM-137).
5. **Hold expiry is 336 hours (14 days) from Venue Staff approval; the reminder is 48 hours before expiry** (SPM-132 AC6, SPM-159 AC3/AC4, SPM-134 AC1). SPM-159 and SPM-134 mark these as team-proposed or story-owner decisions; SPM-168 still lists the reminder lead time as Q4. The expired notice can arrive up to about a minute after expiry because the processor runs every 60 seconds by default (`TENTATIVE_HOLD_EXPIRY_INTERVAL_MS`; the browser harness sets 1000).
6. **Active holds block competing requests outright** in the stories (SPM-56 AC4, SPM-51 AC7, SPM-159 AC7). The plan says "blocked or warned (per customer rule)" (Q8). Expired holds do not block, including at the exact expiry instant (SPM-56 AC5; SPM-133 AC2 "at or after").
7. **Touching endpoints:** SPM-56's notes read occupied periods as half-open `[start, end)`, so touching is not an overlap, consistent with SPM-125 AC4 for unavailable periods. The same note says the endpoint rule "is not explicitly fixed ... and needs team/PO confirmation before being treated as customer policy". SC-SPM159-06 (story owner, 2026-10-28) accepts the exclusive predicate. That is the assumption to record for Q1; it is not the customer's answer.
8. **Rejection reason length (Q3).** SPM-83 AC3 says only "a reason", no length. The application enforces 10 to 500 characters, at least 3 words, real words; the archived original said 1 to 2000. Unless a case is about the length rule, use a reason that satisfies every candidate rule (for example 12 to 40 characters, four real words) so the case does not depend on Q3. The same applies to Safety Officer reasons (SPM-130 AC2) and change-request denial reasons (SPM-65 AC5).
9. **The plan and the stories disagree in these places.** The plan wins for expected results (rank 1) but the case must record the story text:
   - [C1] E2E-09: the plan says a conflicting request "is flagged before it reaches VS". SPM-54 AC2 says the coordinator cannot submit it.
   - [C2] E2E-12: the plan says the EC completes the required action and the hold becomes a booking. SPM-132 AC9 has Venue Staff convert it.
   - [C3] E2E-17: the plan says "not fully available". SPM-172 states a request is decided as a whole (Reserved or Cannot Provide, no partial).
   - [C4] E2E-16: the plan says "damaged or in maintenance" units. SPM-111 AC6 lists maintenance statuses Active, Under Maintenance, Retired; "damaged" is not one.
   - [C5] E2E-21: the plan says the next attendee "is blocked with a clear message". SPM-138 AC1 offers the waiting list instead. Assert the plan's block on direct registration and the story's waitlist offer, and record both.
   - E2E-26: see section 9, U2. This one may make the journey unrunnable as written.
10. **Fourteen legacy Confluence pages named `E2E-<AREA>-NN` already exist** (for example `E2E-LIFECYCLE-01`, `E2E-COORD-QUEUE-01`; apparently from the cancelled SPM-151, since one cites `SC-SPM151-01`; the newer ones are marked draft and not executed). They are not in the registry and use a different, single-case layout. They are prior art and a naming hazard: the new IDs are exactly `E2E-` plus two digits, and no new ID may reuse an `<AREA>` name. Their page ids are cited in the table where they overlap a journey.
11. **Do not count `E2E-` strings in this file as registration.** `grep -rn -oE 'E2E-[0-9]{2}' docs/` is the SPM-188 acceptance check and currently returns nothing. This file contains such strings, so the grep becomes non-zero without any ID being registered. Check the registry itself, not the grep.

---

## 4. Resolving the plan's Trace shorthand

The plan's Trace lines name Week 4 core features (`CF ...`) and Week 7 changes (`W7-n`). They are not story keys. This section resolves them. Parent epics are from Jira's `parent` field; the story assignment per feature is the mapping this brief makes, from story summaries and ACs. Cancelled stories are excluded.

### 4.1 Week 7 changes

| Shorthand | Customer change | Stories |
|---|---|---|
| W7-1 | Per-venue setup and turnaround in availability and conflict checks | SPM-50 (AC2, AC5), SPM-51 (AC8, AC9), SPM-54 (AC2), SPM-56 (AC3 and notes), SPM-121 (AC2, AC8), SPM-125 (AC8) |
| W7-2 | Venue unavailable after booking | SPM-122, SPM-125, SPM-54 (AC5, AC6), SPM-48 (AC9), SPM-97 (AC3) |
| W7-3 | Multiple venues per event | SPM-54 (AC7 to AC11), SPM-159 (AC10), SPM-85 (AC7, AC8), SPM-135 (venue removal and summary rows in the registry) |
| W7-4 | Tentative holds expire | Epic SPM-127: SPM-159, SPM-132, SPM-133, SPM-134, plus SPM-165 (hold decision notice) |
| W7-5 | Event Coordinator Lead | SPM-123, SPM-47, SPM-46, SPM-48, SPM-77, SPM-80 (epic SPM-14) |
| W7-6 | Safety Officer check | Epic SPM-126: SPM-129, SPM-130, SPM-131; SPM-128 (login), SPM-135 (confirm gate), SPM-48 (AC6, AC7) |

### 4.2 Week 4 core features

| Shorthand | Stories |
|---|---|
| CF Draft | SPM-37 |
| CF Request Creation | SPM-36 |
| CF Review and Approval | SPM-38, SPM-39, SPM-40, SPM-83, SPM-88 (notice) |
| CF Assignment | SPM-123, SPM-47, SPM-46, SPM-77, SPM-80 |
| CF Status | SPM-48, SPM-94, SPM-95, SPM-148, SPM-135, SPM-153, SPM-136, SPM-155 (epic SPM-15), SPM-157 (history) |
| CF Info Mgmt | SPM-49, SPM-85, SPM-97 (epic SPM-16) |
| CF Search, Suitability, Catalogue | SPM-52 (search and filter), SPM-54 AC1 (suitability), SPM-124 and SPM-50, SPM-121 (catalogue) |
| CF Calendar | SPM-51, SPM-124 AC6, SPM-125 AC2 |
| CF Booking Request | SPM-54, SPM-159 |
| CF Booking Approval | SPM-55, SPM-137 (notice), SPM-132 |
| CF Conflict Detection | SPM-56, SPM-51 AC7 to AC9 |
| CF Equipment Request | SPM-57 |
| CF Availability, Reservation | SPM-58 (SPM-59, SPM-60, SPM-112, SPM-113 are cancelled), SPM-111, SPM-117, SPM-118, SPM-119 (records) |
| CF Registration | SPM-61, SPM-62, SPM-63, SPM-99, SPM-120, SPM-138, SPM-139 (epic SPM-27) |
| CF Change Requests | SPM-64, SPM-65 (epic SPM-28), SPM-155 for cancellation requests |
| CF Notifications | Epic SPM-29: SPM-77, SPM-88, SPM-137, SPM-165, SPM-134, SPM-172, SPM-171, SPM-162, SPM-177 |
| CF Auth | SPM-30 to SPM-34, SPM-128 (login and landing page); role restrictions are spread across SPM-38 AC4, SPM-47 AC9, SPM-55 AC1, SPM-63 AC5, SPM-121 AC7, SPM-123 AC10, SPM-128 AC4, SPM-157 AC9 |

The Trace lines use about two dozen `CF` labels, some of them halves of one feature ("Booking Request, Approval"). Two generic labels also appear: `CF Booking` (E2E-19) means Booking Request plus Booking Approval, and `CF Equipment` (E2E-19) means Equipment Request plus Availability, Reservation. No Jira story is titled "Catalogue" or "Calendar"; those two rows are this brief's reading of SPM-124, SPM-50, SPM-121 and SPM-51, and are the weakest mappings here.

---

## 5. The 28 journeys in scope: story, AC, coverage, provenance, blockers

**Scope narrowed to 28 on 2026-11-06 by the story owner.** `E2E-24` and `E2E-26` are excluded because the
product does not implement what they assert — established from the code, not from the absence of an
acceptance criterion. Their rows are kept below, marked `EXCLUDED`, with the code evidence.

**The IDs are not renumbered.** `E2E-01` … `E2E-30` are cited by SPM-168, SPM-191, SPM-192 and the E2E
test plan; renumbering to 01–28 would invalidate every one of those references. So there are 28 tests to
write, numbered within the original 30, with two gaps. Do not generate a case for an `EXCLUDED` row.

The nine P0s are unaffected: both exclusions are P1. SPM-192's P1 count drops from 21 to 19.

Cell conventions: an AC list reads `SPM-nn ACa, ACb`. `undetermined [Un]` is explained in section 9. `Conflict [Cn]` means a plan-versus-story disagreement listed in section 3, point 9.

"Existing coverage" separates three things: Playwright specs that are genuinely E2E (listed first; all are partial, none is a full cover); registry ID families and backend integration suites, which are evidence at a lower level and not E2E; and the legacy Confluence draft pages (section 3, point 10). Registry IDs that a spec cites but the registry does not hold are noted as such. Counts are as of the `dev` state SPM-168 verified on 2026-11-05 plus the SPM-134 hold-expiry spec.

| E2E ID | Title | Flow group | Priority | SPM stories | ACs | Existing coverage | Provenance | Blocked by |
|---|---|---|---|---|---|---|---|---|
| E2E-01 | Golden path, single venue | A | P0 | SPM-36, 37, 123, 77, 40, 88, 148, 50, 52, 51, 54, 55, 56, 57, 58, 137, 172, 129, 130, 131, 135, 139, 61, 94, 97 | SPM-36 AC1-7; SPM-37 AC1, AC3; SPM-123 AC1, AC2, AC5; SPM-77 AC1-3; SPM-40 AC2-4; SPM-88 AC1, AC4; SPM-148 AC1; SPM-50 AC2; SPM-52 AC3, AC4; SPM-51 AC2, AC8; SPM-54 AC2-4; SPM-55 AC2, AC4; SPM-56 AC3; SPM-137 AC1; SPM-57 AC5, AC6, AC9; SPM-58 AC3, AC6; SPM-172 AC1; SPM-129 AC1, AC5; SPM-130 AC1; SPM-131 AC1; SPM-135 AC1, AC4, AC5; SPM-139 AC1-4; SPM-61 AC3-5; SPM-94 AC1-3; SPM-97 AC2 | Partial: `EventDetailPage.approve.playwright.spec.ts` (submit, assign over API, approve, EO notice; 3 of 7 roles). Not covered: VS, TSS, SO, attendee, queue UI, venue, equipment, confirm, registration, occupied-window calendar. Backend: `events-approve`, `events-assign`, `lead-assignment`, `events-confirm` suites; families EVENT-APPROVE, ASSIGN-NOTIFY, CONFIRM-EVENT. Confluence draft `E2E-LIFECYCLE-01` (33849430), `E2E-VENUE-BOOKING-01` (33554524) | R6, R8, R10, R12, R19, R23, R26; L79, L80, L81, L107, L108; A3, A5, A6, A7, A8 | Q7 (EO notice at assignment), Q9 (preparation vs confirmation), Q10 (registration text) |
| E2E-02 | Draft handling | A | P1 | SPM-37, 36, 48, 123, 94, 95 | SPM-37 AC1-7; SPM-36 AC3-6; SPM-48 AC3 (drafts not in coordinator queue); SPM-123 AC1, AC2 (queue holds submitted requests; Lead invisibility: undetermined [U3b]); SPM-94 AC1; SPM-95 AC5 note (drafts shown separately) | Partial, genuinely E2E: `EventCreatePage.playwright.spec.ts` (resume with data intact, failed save and retry using one permitted scoped 503, locked submitted request). Not covered: drafts invisible to Lead and ECs; submit with mandatory fields missing blocked. `drafts.e2e-spec.ts`; families EVE-DRF, EVE-CRE. Not E2E and not to be counted: `EventCreatePage.attachments.playwright.spec.ts` (`page.route`). Confluence draft `E2E-EVENT-DRAFT-01` (36470866); the spec cites `Q2-021`, not in the registry | R6; L24, L25, L20, L21 (the last two are single-screen validation, a non-goal); A3.1 | none |
| E2E-03 | Clarification loop | A | P1 | SPM-39, 40, 88, 148, 177 | SPM-39 AC1-5; SPM-177 (request notifies the Organiser; reply and resolve notify the other party; wording in its description); SPM-40 AC3; SPM-88 AC1; SPM-148 AC7. Organiser "amends and resubmits": undetermined [U3] | none. Backend: `clarifications.e2e-spec.ts`; families REQ-CLAR, CLARIFY-NOTIF. Confluence draft `E2E-CLARIFY-01` (36503669) | R29, R30; A9.3 | none |
| E2E-04 | Rejection | A | P1 | SPM-83, 88, 48, 157 | SPM-83 AC1-4; SPM-88 AC1, AC3, AC4; SPM-48 AC2; SPM-157 AC1, AC8. Negative "no venue booking can be raised for the rejected event": undetermined [U4] (SPM-57 AC8 forbids equipment requests for a rejected event; no AC forbids a venue booking) | none (`EventDetailPage.approve` only asserts the Reject control is absent after approval). Backend: `events-approve.e2e-spec.ts`; families EVENT-REJECT, DECISION-NOTIFY. Confluence draft `E2E-EVENT-REJECT-01` (33620103) | R11; L36, L38, L38b (the last two are proposed additions); A3.5 | Q3 (reason length) |
| E2E-05 | Unassigned queue and assignment | B | P0 | SPM-123, 77, 47, 48, 38 | SPM-123 AC1-3, AC5, AC8, AC10; SPM-77 AC1-3, AC5; SPM-47 AC1, AC9; SPM-48 AC1, AC3; SPM-38 AC4 (EC2 cannot view EC1's event). Do not use SPM-38 AC5 | none (the one spec that assigns does so over `POST /api/lead/queue/:id/assign`, never through `/lead/queue`). Backend: `lead-assignment.e2e-spec.ts`, `events-assign.e2e-spec.ts`; families LEAD-ASN, ASSIGN-NOTIFY, MONITOR-QUEUE. Confluence draft `E2E-COORD-QUEUE-01` (36438146) | R8; L29 (proposed addition), L31, L37, L108; A3.2, A2.2 | Q7 (is the EO notified on assignment?) |
| E2E-06 | Reassignment mid-planning | B | P1 | SPM-47, 46, 54, 55, 57, 137, 172, 157, 48 | SPM-47 AC1, AC3, AC5, AC6, AC8; SPM-46 AC1-4; SPM-54 AC4; SPM-55 AC2; SPM-137 AC6 (decision notice goes to the coordinator assigned at decision time); SPM-172 AC6; SPM-157 AC7; SPM-48 AC1 | none (`/lead/reassign` has no browser test). Backend: `lead-assignment.e2e-spec.ts`; family LEAD-REASN. Confluence draft `E2E-COORD-QUEUE-01` covers assignment only | R9; L37; A3.3 | Q7 (EO notified on reassignment?) |
| E2E-07 | Search and suitability | C | P1 | SPM-52, 54, 51, 144 | SPM-52 AC1-4, AC6, AC8; SPM-54 AC1; SPM-51 AC4, AC7. Capacity boundary: SPM-52 AC2 filters by minimum capacity, so equal passes and +1 fails; derive from that wording, not from the query | none. Backend: `events-facilities.e2e-spec.ts`, `venues.e2e-spec.ts`; families VEN-SRCH, EVE-FAC. Confluence draft `E2E-VENUE-BOOKING-01` (33554524) | L52, L53, L54; R19 (booking half only) | none |
| E2E-08 | VS rejects, EC re-books | C | P1 | SPM-55, 54, 137, 148 | SPM-55 AC1-4; SPM-54 AC3, AC4; SPM-137 AC1-3, AC5; SPM-148 AC3 | none. Backend: `venue-booking-decision-notifications.e2e-spec.ts`, `venues-booking-requests.e2e-spec.ts`; families VEN-REV, VENUE-BOOK-NOTIF. Confluence draft `E2E-VENUE-BOOKING-02` (33620119) | R19, R20; L57; A6.4 | none |
| E2E-09 | Setup and turnaround boundaries | C | P0 for one case, P1 for the rest. Which case is P0: undetermined [U1] | SPM-50, 56, 51, 54, 55, 52, 125, 121 | SPM-50 AC2, AC5; SPM-56 AC1-3 and its notes; SPM-51 AC8, AC9; SPM-54 AC2 [C1]; SPM-55 AC2; SPM-52 AC3; SPM-125 AC4 (analogous boundary for unavailability). Table rows 2 to 6 follow from SPM-56 AC3; row 1 is Q1 | none in the browser. The only browser-created venue zeroes both fields (`VenueUnavailabilityPanel.playwright.spec.ts`). Backend: `venues-booking-requests.e2e-spec.ts`; `VEN-REV-02-B` (two PostgreSQL tests: overlap refusal; setup/turnaround/venue boundaries), `VEN-CONF-03-A/B/BND-1/VAR-1`, `VEN-CONF-05-BND-1` | L59 (ordinary overlap only; setup and turnaround postdate it). Otherwise no surviving equivalent | Q1 (first table row, P0) |
| E2E-10 | Changing setup or turnaround flags bookings | C | P1 | SPM-121, 125, 51, 157 | SPM-121 AC2, AC8; SPM-125 AC8; SPM-51 AC9; SPM-157 AC2. What "flagged" persists as: undetermined [U10] | none. Backend: `venue-impact.e2e-spec.ts`, `venues.e2e-spec.ts`; families VEN-IMPACT, VEN-UPD-08 (including `VEN-UPD-08-B-E2E`, turnaround overlap) | No surviving equivalent | none (choose a clash that overlaps by more than a minute so the case does not touch Q1) |
| E2E-11 | Confirmed booking blocks a competing request | C | P1 | SPM-56, 55, 54, 51, 137 | SPM-56 AC1-3, AC6; SPM-55 AC2, AC6; SPM-54 AC2; SPM-51 AC7; SPM-137 AC7 (a conflicting decision produces no notification). "EC2 is told why": undetermined [U5] | none. Backend: `venues-booking-requests.e2e-spec.ts`; families VEN-CONF-01, VEN-CONF-02, `VEN-REV-02-B` | L59; R19 | none |
| E2E-12 | Hold converted before expiry | D | P1 | SPM-159, 132, 56, 51, 165, 134 | SPM-159 AC1-7, AC9; SPM-132 AC3, AC5, AC9, AC12 [C2]; SPM-56 AC4; SPM-51 AC2, AC3, AC7; SPM-165 AC1-3; SPM-134 AC3 | none. Backend: `events-approved-hold.e2e-spec.ts`, `tentative-hold-decision-notifications.e2e-spec.ts`; families VEN-HOLD, VEN-HOLD-DEC, VENUE-HOLD-NOTIF | L58 | Q8 (block versus warn) |
| E2E-13 | Hold expires | D | P0 | SPM-133, 134, 132, 159, 56, 51, 48, 54 | SPM-133 AC1-6; SPM-134 AC1, AC2, AC4, AC5, AC9, AC10; SPM-132 AC6, AC9; SPM-159 AC3; SPM-56 AC5 (expired hold does not block, including the exact instant); SPM-51 AC10; SPM-48 AC8; SPM-54 AC11 (event no longer counts a venue). T-1 minute action succeeds and T+1 refused: SPM-132 AC9, SPM-133 AC4 | Partial, genuinely E2E: `BookingsPage.hold-expiry.playwright.spec.ts` (`HOLD-EXP-NOTIF-06-INT-1`, `-INT-2`: reminder, expired and released notices; registered). Not covered: venue frees up at expiry, event stops counting a venue, another EC can book, T-1/T+1 boundary. Backend: `tentative-hold-expiry.e2e-spec.ts`; families VEN-HOLD-EXP, HOLD-EXP-NOTIF | No surviving equivalent (L58 requests and activates a hold only; "hold-expiry warnings" appear in comment 10142 as a requirement gap, not a flow) | Q4 (reminder lead time; SPM-134 AC1 says 48 hours, story-owner decision) |
| E2E-14 | Maintenance block on a booked venue | E | P0 | SPM-122, 125, 54, 52, 48, 97, 157, 55 | SPM-122 AC1, AC2, AC4, AC6-8; SPM-125 AC2-7; SPM-54 AC5, AC6; SPM-52 AC3; SPM-48 AC9; SPM-97 AC3; SPM-157 AC2. Variants: setup/turnaround window only (SPM-125 AC4 fixes the exact-end boundary), one room of a multi-venue event (SPM-54 AC7-9), no affected bookings (SPM-125 AC6), new request into a blocked period refused (SPM-125 AC3) | Partial, genuinely E2E: `VenueUnavailabilityPanel.playwright.spec.ts` (only the no-affected-bookings variant). It cites `VEN-UNAVAIL-01-A/03-A/04-A/06-A`, which are not in the registry. Backend: `venue-impact.e2e-spec.ts`; family VEN-IMPACT. Confluence draft `E2E-VENUE-UNAVAIL-01` (36438126) | R21; L50; A6.5 | none |
| E2E-15 | Main hall plus 3 breakout rooms | F | P1 | SPM-54, 55, 56, 159, 129, 135, 85 | SPM-54 AC7-11; SPM-55 AC2, AC3; SPM-56 AC1-3; SPM-85 AC7, AC8; SPM-129 AC2, AC3 (the Safety Officer sees the event's venue and arrangements; "sees every venue": undetermined [U9]) | none. Backend: `events-venue-removal.e2e-spec.ts`, `events-venue-summary.e2e-spec.ts`; families VENUE-REMOVE, VENUE-SUMMARY (registered under SPM-135) | L60 (single booking cancel). Otherwise no surviving equivalent | none |
| E2E-16 | Reservation reduces availability for overlapping events | G | P1 | SPM-57, 58, 111, 118, 119, 136, 172 | SPM-57 AC3, AC5, AC6; SPM-58 AC2-6, AC10; SPM-136 AC5; SPM-111 AC6 and SPM-119 AC4 for units not counted [C4]; SPM-172 AC1 | none (`EquipmentCreatePage.playwright.spec.ts` creates inventory only). Backend: `equipment-availability.e2e-spec.ts`; family EQUIP-REQUEST; SPM-58 test IDs are being aligned by SPM-197 (In Review), so there is no stable SPM-58 family yet. Confluence draft `E2E-EQUIP-AUDIT-01` (36372554) | R23; L65; A7.3 | none |
| E2E-17 | Equipment not available | G | P1 | SPM-58, 172, 57, 135, 129 | SPM-58 AC8-10, AC12; SPM-172 AC1-3, AC5, AC7 [C3]; SPM-57 AC10 (a submitted request can only be updated); SPM-135 AC1; SPM-129 AC1 | none. Backend: `equipment-request-decision-notifications.e2e-spec.ts`; family EQUIP-REQ-NOTIF | R24; A7.4 | none |
| E2E-18 | Safety gate enforced | H | P0 | SPM-129, 130, 131, 135, 128, 148 | SPM-129 AC1, AC6; SPM-130 AC1; SPM-131 AC3; SPM-135 AC1-3, AC6; SPM-128 AC4. UI and API for both negatives (AC2). "Preparation": see section 3, point 1 | none (`/safety/events` has no browser test). Backend: `safety-officer.e2e-spec.ts`, `events-confirm-safety-source.e2e-spec.ts`; families SAFETY-QUEUE, SAFETY-DECISION, SAFETY-SOURCE, CONFIRM-EVENT | R25, R26; L79, L77 | Q9 (preparation vs confirmation) |
| E2E-19 | SO requests changes | H | P1 | SPM-130, 131, 129, 65, 58, 55, 157, 48 | SPM-130 AC3-5; SPM-131 AC1, AC2, AC4, AC6; SPM-129 AC5; SPM-58 AC11; SPM-157 AC1; SPM-48 AC6, AC7. Run twice, venue-side then equipment-side | none. Backend: `events-safety-feedback.e2e-spec.ts`, `events-safety-invalidation.e2e-spec.ts`; families SAFETY-FEEDBACK, SAFETY-STALE | R25; L78 (partly covered inside the changes-requested test); L77 | none |
| E2E-20 | SO rejects | H | P1 | SPM-130, 131, 48 | SPM-130 AC2, AC4, AC5; SPM-131 AC1, AC2, AC5 and its note (PO deferred the rejection outcome; the story's position is: returns to planning, blocks until a new approval, reviews all arrangements, does not cancel); SPM-48 AC7. EO notified of the rejection: undetermined [U7] | none. Backend: `safety-officer.e2e-spec.ts` | L76 | Q2 (terminal or revisable; may merge into E2E-19) |
| E2E-21 | Register, capacity, withdraw | I | P0 for registering; P1 for the rest | SPM-139, 61, 62, 63, 99, 120, 138, 135 | SPM-139 AC1-4, AC6-8; SPM-61 AC1-5; SPM-62 AC1-3; SPM-63 AC1-3; SPM-99 AC2; SPM-120 AC1-6; SPM-138 AC1-3, AC9, AC10 [C5] | Partial, genuinely E2E: `EventDetailPage.withdraw.playwright.spec.ts` (withdraw from a full event, freed spot, reload, re-register; on a preset, not a builder; it cites `WITHDRAW-EVENT-REG-CAP-01`, not in the registry). It misses the P0 half: plain first-time registration on a non-full event, fill to capacity, EO/EC lists, the three negatives. Backend: `registrations.e2e-spec.ts`, `registrations.withdraw.e2e-spec.ts`; families WITHDRAW-EVENT-REG, JOIN-WAITLIST, CONFIG-REG. Confluence drafts `E2E-REGISTRATION-01` (33620135), `E2E-REG-WITHDRAW-01` (36372574) | R12, R13, R14, R15, R27; L82, L83, L89-L93 (waitlist; proposed addition); A5.1-A5.5 | Q10 (exact success text and Registered/Withdrawn/Waitlisted labels) |
| E2E-22 | Ordinary edit | J | P1 | SPM-49, 85, 64, 97, 157 | SPM-49 AC2, AC3, AC5, AC6; SPM-85 AC1, AC2 (no review when nothing conflicts); SPM-97 AC4, AC5; SPM-157 AC1. Which actor and path the plan means: undetermined [U6] | none (`EventEditPage.playwright.spec.ts` was the scaffold that could not fail and has been pruned). Backend: `events-planning` suites; families EVENT-UPDATE, EVENT-FLAG | R7; L39, L40, L41, L42 | none |
| E2E-23 | Attendance beyond venue capacity | J | P1 | SPM-64, 65, 85, 54, 52, 55, 129, 139 | SPM-64 AC1, AC3, AC7; SPM-65 AC1-4, AC7-9; SPM-85 AC1-3, AC5, AC6; SPM-54 AC1; SPM-52 AC2; SPM-55 AC2; SPM-139 AC3. "Registration capacity updated": undetermined [U8] | none. Backend: `change-request-review.e2e-spec.ts`; families REQ-CHANGE, REVIEW-CHANGE. Confluence draft `E2E-CHANGE-REQ-01` (33554508) covers a description change only | R16; L42, L98, L102; A4.1, A4.2 | Q6 (safety re-check on attendance change) |
| ~~E2E-24~~ | ~~Reschedule date or time~~ (EXCLUDED) | J | ~~P1~~ | — | — | — | — | **EXCLUDED 2026-11-06.** No attendee-facing event-change notification exists. The backend's full set of notification types carries nothing that could deliver one (approval, rejection, coordinator_*, venue_booking_*, tentative_hold_*, equipment_request_*, cancellation_request_*, change_request_approved, clarification*, safety, venue, equipment), and SPM-181 "Event Change Notification (Attendee)" is Cancelled. NOTE the cost: the reschedule itself, the venue and equipment re-check and the three-view consistency assertion ARE supported by the product and are lost with this row. E2E-25 overlaps only the turnaround half. Reinstate a reduced E2E-24 without the attendee notification if that coverage is wanted. |
| E2E-25 | Extension into the next booking's turnaround | J | P1 | SPM-85, 65, 56, 64, 51 | SPM-85 AC1-3, AC5, AC6; SPM-65 AC3, AC9; SPM-56 AC3; SPM-64 AC1; SPM-51 AC8, AC9. Choose an overlap of more than a minute so the case does not touch Q1 | none. Backend: `change-request-review.e2e-spec.ts`; family EVENT-FLAG | L42 (generic flagged change). Turnaround postdates it, so otherwise no surviving equivalent | none |
| ~~E2E-26~~ | ~~Equipment added after confirmation~~ (EXCLUDED) | J | ~~P1~~ | — | — | — | — | **EXCLUDED 2026-11-06.** The product refuses the journey's central step. `backend/src/equipment/requests/equipment-requests.repository.ts` guards it at lines 117, 282 and 391, each returning `{ kind: 'event-confirmed' }` when `event_status === 'Confirmed'`. That is a deliberate product rule enforced at three call sites, not an oversight, and no code path adds equipment to a Confirmed event. Reinstate only if the customer asks for the feature to be built. |
| E2E-27 | Change request declined | J | P1 | SPM-65, 64, 157 | SPM-65 AC3, AC5, AC6, AC10, AC11; SPM-64 AC4, AC5; SPM-157 AC1. Organiser notice with the reason is covered by registered tests `REVIEW-CHANGE-05-D` and `REVIEW-CHANGE-07-D` but is not worded in an SPM-65 AC; confirm against matrix 28016830 | none. Backend: `change-request-review.e2e-spec.ts`; family REVIEW-CHANGE | L101, L102; R16 (approve path only) | none (use a reason that satisfies Q3's candidate rules) |
| E2E-28 | Cancel a confirmed multi-venue event | K | P0 | SPM-136, 155, 162, 171, 138, 58, 54, 65, 157 | SPM-136 AC1-7, AC9; SPM-155 AC1-5; SPM-162 AC1-4; SPM-171 AC1-3; SPM-138 AC12; SPM-58 AC6; SPM-54 AC9, AC10; SPM-65 AC11; SPM-157 AC2-4. VS and TSS notification on cancellation: undetermined [U7] | none. Backend: `events-cancel.e2e-spec.ts` (clock injected in-process); families CANCEL-EVENT, CANCEL-REQUEST, CANCEL-OUTCOME, CANCEL-REQ-NOTIF, JOIN-WAITLIST. Confluence draft `E2E-EVENT-CONFIRM-01` (36503689) | R17; L106; A4.3, A4.4 | Q5 (who may cancel, and the request statuses) |
| E2E-29 | Role and relationship access matrix | L | P0 for a reduced set. Which set: undetermined [U1] | SPM-30-34, 128, 38, 47, 55, 63, 94, 95, 97, 99, 121, 123, 129, 157; SPM-168 AC2 | SPM-38 AC4; SPM-47 AC9; SPM-55 AC1; SPM-63 AC5; SPM-95 AC6; SPM-97 AC4; SPM-121 AC7; SPM-123 AC10; SPM-128 AC4; SPM-129 AC6; SPM-157 AC9. Plan rows with no story AC: VS approving event requests, SO editing bookings, the unauthenticated case. Their rule comes from SPM-168 AC2 and the plan; recorded as undetermined [U4b] | none. Route guards are unit-tested in jsdom (`RouteAccess.test.tsx`), which cannot prove server enforcement. Backend: `auth.e2e-spec.ts`. | R5, R28, R4 (protected pages after logout); L14, L15, L27, L37, L48, L72, L109; A2.1-A2.4 | none |
| E2E-30 | Mobile viewport smoke | L | P1 | SPM-36, 37, 61, 97, 99 (the EO and Attendee steps of E2E-01) | The EO and Attendee steps' ACs as in E2E-01 (SPM-36 AC1-7; SPM-37 AC1; SPM-61 AC3-5; SPM-97 AC2). No story states a mobile layout requirement: undetermined [U11]; the plan cites a Week 1 design requirement | Partial, genuinely E2E: `EventCreatePage.playwright.spec.ts` (EO steps at 390 x 844, imperative `setViewportSize`). The `NotificationBell` and `VenueScheduleCalendar` viewport specs use `page.route` and do not count. No device-profile spec yet | No surviving equivalent (neither manual suite has a viewport flow) | none |

---

## 6. The ten open questions, and what the stories already say

Use these as the `[Sn]` assumptions. "On record" is evidence a story or register holds; none of it is a customer answer unless stated.

| Q | Question (SPM-168 wording) | Gates | On record in the repository or Jira | Assumption to record if no answer has arrived |
|---|---|---|---|---|
| Q1 | Is a booking whose setup starts exactly when the previous booking's turnaround ends allowed? Decides `<` versus `<=` | E2E-09 (P0), row 1 of the AC1 boundary table | SPM-56 note (half-open `[start, end)`, flagged as needing team/PO confirmation); SC-SPM159-06 (story owner, 2026-10-28); SPM-125 AC4 for unavailability | Back-to-back allowed: B starting 13:15 against A ending 12:45 is not a conflict. Rows 2 to 6 do not depend on Q1 |
| Q2 | Safety Officer rejection: terminal or revisable? | E2E-20; may merge with E2E-19 | SPM-131 AC5 and note: returns to planning, blocks preparation until a new approval, reviews all arrangements, does not cancel; "confirm with the PO" | Revisable, per SPM-131. Do not describe the event as terminal |
| Q3 | Rejection reason length: 1 to 2000 or 10 to 500 characters, 3 words, real words? | E2E-04 (and any case with a reason) | SPM-83 AC3 states no length | Use a reason valid under both; do not test the length rule here |
| Q4 | How long before expiry is the coordinator warned? | E2E-13 (P0) | SPM-134 AC1: 48 hours, one reminder (story-owner refinement, 2026-11-04) | 48 hours |
| Q5 | Who may cancel: organiser, assigned coordinator or Lead? What are the cancellation-request statuses? | E2E-28 (P0) | SPM-136 AC1 (assigned Coordinator); SPM-155 (Organiser requests, assigned Coordinator accepts or declines; statuses pending, accepted, declined); the Lead has no cancel right in any story | Organiser requests, assigned Coordinator decides or cancels directly; the Lead and other coordinators are refused (assert via UI and API) |
| Q6 | Must a change to attendance, date or venue require a new safety check? | E2E-23, E2E-24 (E2E-26 in the plan's wording) | SPM-65 AC8: approving any change to an event with a safety check resets it and returns the event to Awaiting Safety Check | Reset on every approved change (SPM-65 AC8). SPM-168 says "yes" for attendance or date is a product change, not a test change; flag it, do not absorb it |
| Q7 | Is the organiser notified on assignment and reassignment? Are attendees notified of a reschedule or venue change? | E2E-05 (P0), E2E-06, E2E-24; also E2E-01 | SPM-77 AC1 and SPM-47 AC8 name only coordinators; SPM-181 (attendee change notice) is Cancelled | Neither is notified; assert the absence of an Organiser notification at assignment and of an attendee notification on reschedule |
| Q8 | Does a tentative hold block a competing request outright, or only warn? | E2E-12 | SPM-56 AC4, SPM-51 AC7, SPM-159 AC7 block outright | Blocks outright |
| Q9 | Preparation versus confirmation: ratify that they are separate steps | E2E-01, E2E-18 (both P0) | Section 3, point 1: no Preparation status exists; Confirm is gated on three readiness conditions (SPM-135 AC1, AC2) | Planning, then Confirmed via the Confirm Event action once approved venue bookings, reserved equipment and Safety Officer approval all exist |
| Q10 | Exact expected text for registration success and the Registered/Withdrawn/Waitlisted wording | E2E-21 (P0) | The recovered doc quotes message codes MSG-01, MSG-02, MSG-05, MSG-11 (success) but not the wording; SPM-61 AC4 "a confirmation message" | Assert the message code or the status label read from the AC, not a copied sentence; record each literal as an assumption |

One question is outside the ten and affects E2E-20: whether the Organiser is notified of a Safety Officer rejection (the plan says "if your customer says so"). Record it as `[U7]`.

---

## 7. Output formats the generated cases must match

### 7.1 One case per journey, and sub-cases

The ID of the journey is `E2E-NN`, two digits, no area name. House convention for a sub-case is `<ID>-<suffix>` (`ai/docs/confluence-test-docs.md` section 3).

- Write one case per journey with numbered steps. Variants the plan lists (E2E-14, E2E-19, E2E-03) are separate numbered step groups inside the one case.
- Split a journey into suffixed sub-cases only where the plan attaches a different priority to part of it: E2E-09 (one P0 case, the rest P1), E2E-21 (register is P0, the rest P1) and E2E-29 (a reduced P0 set). Use `E2E-09-A` to `-F` in the plan's table order, `E2E-21-A` for registering and `-B`... for the rest, and one suffix per role-and-action row for E2E-29. Each sub-case ID is registered as SUPPORTING under the same parent. Which suffix is the P0 is for the story owner to set (section 9, U1); the generator marks it `P0 (proposed)` and does not decide.

### 7.2 Registry rows (`docs/test-cases/workflow/test-id-registry.md`)

The file's header states the rules: `PRIMARY` ids are rows of the Confluence matrix; `SUPPORTING` ids group tests under a parent AC; a test may not carry an id that is absent from the registry. The row has exactly these columns:

```
| ID | Type | Story | Parent AC | Source | Owning test file | Approved | Status |
```

A real PRIMARY row:

```
| HOLD-EXP-NOTIF-06-INT-1 | PRIMARY | SPM-134 | AC6 | Jira SPM-134 AC6 (refined 4 Nov 2026); Confluence matrix 41582744 | frontend/src/features/bookings/pages/requests/BookingsPage.hold-expiry.playwright.spec.ts | approved by story owner chaw678, 2026-11-04 | Active |
```

A real SUPPORTING row that is awaiting approval:

```
| CONFIRM-EVENT-SUP-01 | SUPPORTING | SPM-135 | AC5 | Derived: %s: a %s event is refused with 422 EVENT_NOT_CONFIRMABLE and stays %s | backend/test/events-confirm.e2e-spec.ts | pending (story owner) | Pending approval |
```

For an `E2E-NN` id with no Confluence case page yet, fill the columns as follows. These are this brief's recommendation; the story owner approves them.

| Column | Value |
|---|---|
| ID | `E2E-NN` (or `E2E-NN-<suffix>` per 7.1) |
| Type | `SUPPORTING`. `PRIMARY` means a row of a Confluence matrix, and SPM-168 has none. Change to `PRIMARY` in the same piece of work that creates the matrix and case page. |
| Story | `SPM-168`. The registry has one story per row; the stories the journey crosses go in Source. |
| Parent AC | `AC1` (every one of the 30 tests exists and asserts the database effect). `AC1, AC2` for E2E-29. |
| Source | `E2E test plan E2E-NN (Claude Docs artifact CpSe1vDz3vRTWH44yUCdeB, 4 Nov 2026); crosses SPM-..., SPM-...; no Confluence case page yet`. After SPM-188 commits the plan, cite its `docs/` path instead. |
| Owning test file | The spec path. For a spec that does not exist yet write `to be created (SPM-191)` or `(SPM-192)`. G1 reports an id without a test as a gap until the spec lands, and that is the correct signal. |
| Approved | `pending (proposed 2026-11-06, story owner)` until the story owner approves. Never write an approval the owner has not given. |
| Status | `Pending approval`, then `Active` once approved. |

A new row for the plan's IDs must not reuse any `E2E-<AREA>-NN` name (section 3, point 10).

### 7.3 Test-case document

The house format is the Confluence layout in `ai/docs/confluence-test-docs.md` section 5, seen on page `41353389` (`HOLD-EXP-NOTIF-06`). Each case is a heading `# <full case ID>` followed by one two-column `Item | Description` table with exactly these 13 rows in this order. The Week 4 template the plan specifies (ID, scenario, pre-conditions and seed data, steps, data, expected result, then a per-run execution record) is the same shape; the first six rows are the template and the remaining seven are the execution record plus remarks.

| Item | What goes in it for an E2E case |
|---|---|
| Test Case ID | `E2E-NN` |
| Test Scenario | One sentence starting `Verify ...` (or `Security - ...`, `Negative (state) - ...`), ending with the stories and ACs in brackets, for example `(SPM-123 AC1, AC5; SPM-77 AC1)`. This is the traceability the Week 13 random trace needs |
| Pre-conditions | Numbered. Database state built through builders (the venue with its setup and turnaround, the event at status X, the equipment pool of N), who is signed in and how (`test.use({ as: ... })`, `pageAs(...)`), the clock setup, the assumed answers `[Sn]`. State that the database is reset per test. Say honestly that these are real-browser, real-backend, real-database cases |
| Test Steps | Numbered actions with the route or the control in code format. Interleave database or API verification steps with the UI steps. For each forbidden action, one UI step and one API step (2.4) |
| Test Data | The literals: names, times, quantities, the venue's 30 and 45 minutes. Differ paired fields |
| Expected Result | Observable outcomes separated by ` • `: status codes, stored state, what is shown, who is notified and who is not, and what stays unchanged after a refusal. Arithmetic shown for every boundary |
| Actual Result | `Not executed yet.` Never anything else before a real run |
| Pass/Fail/Not Executed/Blocked | `Not Executed`, or `Blocked` with the question in Remarks. Never `Pass` or `Fail` before a real run |
| Remarks | `Automated coverage: <spec file, or "none yet; planned file ...">.` Then `Trace: <the plan's Trace line verbatim>`, `Resolved stories: ...`, `Provenance: <R/L/A reference, or "no surviving equivalent">`, `Blocked by: Q<n> ...`, the `[Sn]` assumptions, any plan-versus-story conflict (section 3, point 9), and `Existing coverage: ...` |
| Created By\* | The person who owns the case; follow `docs/specs/SPM-155-test-cases.md` (`<owner> (Claude-assisted)`). Take the name from the user; do not invent one |
| Date of Creation\* | The date the case is generated, for example `6 Nov 2026` |
| Executed By\* | Left blank until a real run |
| Date of Execution\* | Left blank until a real run |

Execution fields: the request for this brief says `Actual Result` and `Pass/Fail` stay empty until a real run. The house rule (`confluence-test-docs.md` rule 5 and section 5) writes `Not executed yet.` and `Not Executed` in those cells, which assert no result. Use the house wording, because a blank breaks the four-word status column and G1's record checks, unless the story owner prefers literal blanks.

Each document starts, as the SPM-155 test-case document does, with a Pre-Generation Checkpoint: confidence tier, missing inputs, and the `[Sn]` assumptions table. Add one column, `Question`, naming the Q number each assumption stands in for. Confidence for a case that depends on an unanswered P0 question is at most Medium.

Do not fabricate: Actual Result, Pass/Fail, Executed By and the execution date describe a real run, and a generated case has not had one.

---

## 8. The fixture machinery already in place (SPM-187, PR #124, merged)

Point the generator at this so it does not invent a setup. PR #124 reports state MERGED; the files below were read from `test/SPM-187-e2e-foundation`.

### 8.1 What exists

- **Per-test reset.** Every spec imports `test` and `expect` from `frontend/e2e/fixtures.ts`. An automatic fixture resets the disposable database to reference data before each test. SPM-168 AC3 requires the reset to enumerate tables from the database catalogue; `reset-test-database.mjs` was not re-read for this brief. `workers: 1` is a correctness requirement.
- **Builders and scenes** (`backend/scripts/testing/browser-fixtures.mjs`, exposed as the `db` fixture): `db.venue()`, `db.event()`, `db.equipment()`, and `db.scene({ venues, events, equipment, registrations })`. Example: `db.scene({ venues: { hall: { setupMinutes: 30, turnaroundMinutes: 45 } }, events: { main: { status: "Approved", venue: "hall" } } })`. Presets via `db.preset("withdrawal" | "auditTrail" | "holdExpiry")`.
- **Sign-in.** No UI login. `test.use({ as: "coordinator" })` starts the test signed in. `as` takes a role (`organiser`, `coordinator`, `lead`, `venue_staff`, `tech_support`, `safety_officer`, `attendee`; each maps to its `...1` account) or one of the 20 seeded accounts (for example `"coordinator2"`, `"organiser2"`). `pageAs("coordinator2")` returns a second, separately signed-in browser context for the same test. Only `LoginPage.playwright.spec.ts` types into the login form.
- **Clock and dates.** `frontend/e2e/clock.ts`: `freezeClock(page, iso)`, `advanceClock(page, ms)`, `browserNow(page)`. `frontend/e2e/dates.ts`: `calendarDayFromNow`, `isoDateFromNow`, `atUtcHour`. The comments there name E2E-13 and E2E-09 as their intended users.
- **Device project.** `playwright.config.ts` has a `mobile` project on `devices["Pixel 7"]` that matches `*.mobile.playwright.spec.ts`. E2E-30 must be a `*.mobile.playwright.spec.ts` file and must not call `setViewportSize`.
- **Harness.** `cd backend && TEST_DATABASE_URL=<disposable db> npm run test:browser [-- <spec path>]`. It refuses a database without the disposable-test marker and starts the backend with `TENTATIVE_HOLD_EXPIRY_INTERVAL_MS=1000`. Trace, screenshot and video are kept on failure. `retries: 0` on purpose.
- **Type gate.** `npm run typecheck:e2e`.

### 8.2 Limits the case must not paper over

- **The clock helper controls the browser only.** Its own header says the backend keeps real time. Hold expiry is decided by the server's processor, so E2E-13 cannot move the server's "now" with `advanceClock`. A case must seed the hold's expiry relative to real now (as the `holdExpiry` preset does: 47 hours, a minute ago, 10 days) and use the 1-second processor interval, or say plainly that the case needs a server-side clock that does not exist. Do not write a case that claims to advance server time through the browser clock. The plan's "T-1 minute succeeds, T+1 minute refused" boundary needs this settled before it can be asserted; record it as an assumption.
- **Builders insert rows directly in SQL.** They do not cover booking requests, hold requests, change requests, cancellation requests, safety checks or equipment requests. A case that needs them either creates them through the UI or API as part of the journey (the E2E point), or lists the missing builder as a prerequisite for the implementer. Do not assume a builder.
- **`status: "Confirmed"` sets the status only.** It does not add the SPM-135 readiness rows (approved venue booking, `equipment_confirmed_at`, an approved safety check). Only the `withdrawal` preset adds them. An event that must be confirmable needs those rows.
- **Builder dates use the real `Date.now()` at seeding.** Express times in cases as offsets from a stated anchor and keep the literal arithmetic in the case. For the E2E-09 table use fixed clock times on a stated future day, as the plan does (10:00, 12:00, 13:15).
- **Default accounts:** organiser1, coordinator1, lead, venue_staff1, tech_support1, safety_officer1, attendee1. The default event is organised by organiser1 and assigned to coordinator1. A second EC, EO or VS means naming the account (`coordinator2`, `organiser2`, `venue_staff2`).
- **Nothing in `frontend/e2e/` is on this working branch** (only gitignored `.auth` files are present untracked). Read the files from `dev` or `test/SPM-187-e2e-foundation`.

---

## 9. What could not be determined, and why

Each `undetermined` marker in section 5 points here. Do not fill these in. Raise them with the story owner; where a case must be generated now, mark it `Blocked` and record the gap as an assumption.

| Ref | Where | What is missing, and why it could not be determined |
|---|---|---|
| U1 | E2E-09 priority; E2E-29 priority | The plan says "P0 for one case" and "P0 for a reduced set" without naming the case or the set. SPM-168, SPM-191 and SPM-192 do not name them either. Choosing one would be a guess. The only evidence is that E2E-09 row 1 is blocked by Q1 and rows 2 to 6 are not |
| U2 | E2E-26 | The plan has TSS check and reserve equipment after confirmation. SPM-58 AC12 lets Technical Support update a request only until the event is Confirmed, and SPM-172 AC7 says a decision on a request for a Confirmed event is refused. No AC defines how equipment is added to a Confirmed event. The journey may be unrunnable as written. This is not one of the ten questions and should become one |
| U3 | E2E-03 | The plan has the Organiser "amend and resubmit". SPM-37 AC7 locks a submitted request against draft editing, SPM-39 covers a reply, and SPM-64 covers change requests. No AC defines an amend-and-resubmit action. Also, an "Under review" status appears in the plan's lifecycle and in one test-case document, but not in the implemented status set. U3b: no AC states that drafts are invisible to the Lead (E2E-02); it follows only from the Lead's queue holding submitted requests |
| U4 | E2E-04 | No AC forbids a venue booking request for a rejected event. SPM-57 AC8 forbids equipment requests for rejected or cancelled events, and SPM-148 AC1 moves only Approved events to Planning. The negative in the plan has no AC behind it for venues. U4b: for E2E-29, no AC covers "VS approving event requests", "SO editing bookings" or the unauthenticated case |
| U5 | E2E-11 | The plan says EC2 "is told why". SPM-56 AC2 shows the conflict alert to Venue Staff at approval, and SPM-137 AC7 says a conflicting decision creates no notification. No AC tells EC2 |
| U6 | E2E-22 | The plan's "without re-review" is satisfied by a Coordinator's direct edit (SPM-49 AC3, AC5) but an Organiser's change request always goes to Coordinator review (SPM-64 AC3, SPM-65). The plan does not say which actor |
| U7 | E2E-20, E2E-28 | No AC says the Organiser is notified of a Safety Officer rejection, and none says Venue Staff or Technical Support are notified when an event is cancelled (SPM-162 and SPM-138 AC12 cover the Organiser, the Coordinator and waitlisted attendees; SPM-172 puts reservation release out of scope). Both are plan expectations with no story. Not covered by the ten questions |
| U8 | E2E-23, E2E-24 | No AC ties an attendance change to the registration capacity (SPM-139 AC3 sets capacity separately), and none says the old slot is released on a reschedule. Attendee notification has only the cancelled SPM-181 |
| U9 | E2E-15 | The plan says "the safety check sees every venue". SPM-129 AC2 and AC3 show the Safety Officer the venue capacity, layout and arrangements; none says "every venue" of a multi-venue event |
| U10 | E2E-10 | What "flagged" is stored as. SPM-121 AC8 and SPM-125 AC8 define a list shown after save and a coordinator notice; SPM-157 AC2 mentions bookings "returned for review". No AC fixes a persisted flag |
| U11 | E2E-30 | No story states a mobile or responsive requirement. The only source is the plan's reference to a Week 1 design requirement (the Week 1 briefing itself is not in the repository). |

Also not verified:

- The ACs in section 5 are read from Jira story descriptions as of 2026-11-06. The Confluence matrices that map each AC to test IDs and code modules were not opened except page `41353389`; the registry's Source column cites their ids. For SPM-58 the registry has no story family (SPM-197 is realigning it), so no SPM-58 test IDs are cited.
- The source for "Existing coverage" at the Playwright level is the 2026-11-05 E2E audit (a local file outside the repository), the SPM-168 description, and a read of the spec headers. The audit counts E2E-13 as None; SPM-168 counts it Partial because of the SPM-134 spec. This brief follows SPM-168.
- The count of backend integration suites is 52 in the audit and 54 in SPM-168. Neither was recounted.
- Whether the G1 id check (`ai/scripts/test-workflow`) accepts the `E2E-NN` shape was not run.
- No Confluence matrix or case page exists for SPM-168 (not found by title search, which is unreliable). If one exists, `Type` becomes `PRIMARY`.
