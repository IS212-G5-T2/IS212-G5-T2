# Fixture prerequisites for the 28 E2E journeys

Gaps between what the cases in this directory need and what the SPM-187 fixture layer provides.
Found while writing the cases, and verified against the source on
`origin/test/SPM-168-Automated-E2E-suite-for-ConnectSphere` (PR #124, merged) — not inferred.

**Read this before SPM-191 or SPM-192.** Each item either blocks a case or makes it slower and more
brittle than the plan assumes. None is a defect in SPM-187: they are things the 28 journeys need that
stage 1 to 3 did not have to build.

---

## 1. `buildVenue` cannot set facilities, layouts or accessibility

The whole option surface is:

```js
buildVenue(db, { name, location, capacity, setupMinutes, turnaroundMinutes, ownerEmail })
```

The venue schema has `venue_facilities`, `venue_layouts` and `venue_accessibility` join tables, and
`GET /api/venues/options` serves the catalogues, so **the data model supports this and only the
builder does not**.

**Blocks E2E-07 outright.** That journey *is* suitability: attendance at −1, exactly and +1, a missing
facility, an unsupported layout, unmet accessibility. It cannot express its own pre-conditions.

Also needed by **E2E-01 (P0)**, and cited by E2E-10, E2E-15, E2E-18, E2E-22, E2E-23.

Either add three options to `buildVenue` (writing the join rows from the catalogues by name, as
`demo_seed.sql` already does) or those seven cases build venues through the UI — slow, and fragile for
a test whose subject is the search result.

## 2. No database-read helper

The fixture layer writes state but cannot read it back. Every case therefore asserts its "database
effect" through an authenticated API read, which is noted in all 28 files.

That is defensible for an E2E test — the API is part of the system under test — but it means an
assertion cannot distinguish "the row is wrong" from "the endpoint that reports it is wrong". Where a
journey's whole point is a persisted side effect (E2E-28's released bookings and reservations,
E2E-14's flagged-not-deleted booking), a direct read would be stronger.

## 3. `buildEvent` gaps

* **No time of day.** `startInDays` and `durationHours` only, so an event always starts at the seeding
  moment's time. **E2E-25 needs explicit `startAt`/`endAt`**, and E2E-09's boundary table wants fixed
  clock times (10:00, 12:00, 13:15) on a stated future day.
* **Cannot build an unassigned event.** `coordinatorEmail` defaults to a coordinator, so the Lead's
  unassigned queue (E2E-05, P0) has no fixture for its central precondition.
* **`status: "Confirmed"` sets only the status.** It does not add the SPM-135 readiness rows (approved
  venue booking, `equipment_confirmed_at`, approved safety check). Only the `withdrawal` preset adds
  them, so a Confirmed event built any other way is not actually confirmable. Affects E2E-23.

## 4. No builders for request-shaped state

Nothing builds a venue booking request, a tentative hold request, a change request, a cancellation
request, a safety check or an equipment request. E2E-15, 16, 17, 18, 19, 20, 23 and 28 therefore
create that state through the product.

For a journey test this is arguably correct — creating the booking *is* the journey. But it makes
those cases much longer than the plan's descriptions imply, and a failure in setup is
indistinguishable from a failure in the assertion.

## 5. `pageAs` does not carry the device profile

```js
browser.newContext({ baseURL, locale, timezoneId, viewport, storageState })
```

**Viewport only** — not `hasTouch`, `isMobile`, `userAgent` or `deviceScaleFactor`. So a second user
opened with `pageAs` under the `mobile` project gets a phone-sized window with a desktop user agent
and no touch.

This matters because it fails silently: a "works on mobile" assertion can pass in a context that is
not mobile. **E2E-30 works around it** by running the Organiser and Attendee as two test bodies with
`test.use({ as })` rather than one body with `pageAs`.

A probe during the SPM-187 review reported that `pageAs` *did* inherit the profile. That was wrong;
the source above is definitive.

## 6. The clock helper cannot move server time

`clock.ts` controls the browser only — its own header says so, and the backend keeps real time. Hold
expiry is decided by the server's processor, so **E2E-13 (P0) cannot assert the plan's "T−1 minute
succeeds, T+1 minute refused" boundary**. It seeds expiry relative to real now against the 1-second
processor interval instead.

The backend has an injectable `CLOCK` token, so a server-side test clock is buildable. Until it
exists, no case may claim to advance server time through the browser clock. E2E-13 does use
`advanceClock` for one page-local label flip, explicitly labelled UI-only and paired with a check that
the server status did not change.

---

## Decisions that would clear assumptions across many cases

1. **Refusal status codes.** No AC fixes the HTTP status for any refused call, so every such assertion
   across all 28 cases is marked ASSUMPTION. One ruling (401 unauthenticated, 403 forbidden, 404 to
   hide existence) would pin them all.
2. **Which booking of a clashing pair is "the affected one"** (E2E-10). No AC says. The case asserts
   only a non-empty subset.
3. **Whether Venue Staff and Technical Support are notified on cancellation** (E2E-28). The plan says
   yes; no story or notification type supports it, so the case asserts their absence. A decision flips
   two assertions.
4. **Which case of E2E-09 and which rows of E2E-29 are P0.** The plan says "P0 for one case" and "P0
   for a reduced set" and never names either. **A required status check cannot be defined until this
   is answered** — it is the one open item that blocks SPM-168 AC5 rather than a single assertion.
