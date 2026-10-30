// SPM-52 frontend mutants (Search and Filter Venues), run by run.mjs:
//   node scripts/testing/mutation/run.mjs --mutants spm52.mutants.mjs
// Each edit is [from, to]; `from` must occur exactly once in the file (the runner reports MISAPPLIED otherwise).
// Every mutant that is not equivalent names the exact tests that must go red (testMappings); the runner
// checks each title exists and reports which mapped tests failed, so a kill lists only real failures.
// The set has four groups:
//   M1-M8   rules found by the first Test Code Review (search, capacity, holds, end time, accessibility mapping)
//   F2-F9   findings from the Requirement and Code Quality reviews (invalid capacity applied, one-time pre-fill,
//           clear-all keeping facilities, card fields, hold boundary, event attendance)
//   P1-P12  Test Code Review cycle-05 probes, kept as tracked mutants (page raw criteria, live re-check
//           timer, layout filter, capacity 0, availability filter, pre-fill of layout, clear-all date range,
//           singular count, timer cap, no-match text, half-entered range)
// F10 is EQUIVALENT: an invalid date range dropped or kept gives identical results (see its entry).
export const SUITES = {
  spm52: {
    args: [
      'run',
      'src/features/venues/lib/venueSearch.test.ts',
      'src/features/venues/pages/catalogue/VenuesPage.test.tsx',
      'src/features/venues/pages/catalogue/VenueCard.test.tsx',
    ],
  },
};

const SEARCH = 'src/features/venues/lib/venueSearch.ts';
const PAGE = 'src/features/venues/pages/catalogue/VenuesPage.tsx';
const CARD = 'src/features/venues/pages/catalogue/VenueCard.tsx';
const suites = ['spm52'];

const SEARCH_TEST = 'src/features/venues/lib/venueSearch.test.ts';
const PAGE_TEST = 'src/features/venues/pages/catalogue/VenuesPage.test.tsx';
const CARD_TEST = 'src/features/venues/pages/catalogue/VenueCard.test.tsx';

const tm = (file, title) => ({ suite: 'spm52', file, title });

export const MUTANTS = [
  // ---- Review mutants expected to be killed (M1 to M8) ----
  { id: 'M1', name: 'name search only; the location is no longer matched (AC1)', file: SEARCH, suites,
    edits: [['    !venue.name.toLocaleLowerCase().includes(query) &&\n    !venue.location.toLocaleLowerCase().includes(query)\n  ) {', '    !venue.name.toLocaleLowerCase().includes(query)\n  ) {']],
    testMappings: [
      tm(SEARCH_TEST, 'VEN-SRCH-01-B matches a partial location ignoring case and surrounding spaces'),
    ] },
  { id: 'M2', name: 'case-sensitive name and location match (AC1)', file: SEARCH, suites,
    edits: [['  const query = criteria.query.trim().toLocaleLowerCase();', '  const query = criteria.query.trim();']],
    testMappings: [
      tm(SEARCH_TEST, 'VEN-SRCH-01-A matches a partial name regardless of letter case'),
      tm(SEARCH_TEST, 'VEN-SRCH-01-B matches a partial location ignoring case and surrounding spaces'),
      tm(PAGE_TEST, 'VEN-SRCH-01-D narrows the cards by a partial, case-insensitive name'),
    ] },
  { id: 'M3', name: 'prefix match (startsWith) instead of partial match for name and location (AC1)', file: SEARCH, suites,
    edits: [
      ['!venue.name.toLocaleLowerCase().includes(query)', '!venue.name.toLocaleLowerCase().startsWith(query)'],
      ['!venue.location.toLocaleLowerCase().includes(query)', '!venue.location.toLocaleLowerCase().startsWith(query)'],
    ],
    testMappings: [
      tm(SEARCH_TEST, 'VEN-SRCH-01-A matches a partial name regardless of letter case'),
      tm(SEARCH_TEST, 'VEN-SRCH-01-B matches a partial location ignoring case and surrounding spaces'),
      tm(PAGE_TEST, 'VEN-SRCH-01-D narrows the cards by a partial, case-insensitive name'),
    ] },
  { id: 'M4', name: 'minimum capacity uses < instead of <=, so a venue at exactly the minimum is dropped (AC2)', file: SEARCH, suites,
    edits: [['if (criteria.minCapacity && venue.capacity < Number(criteria.minCapacity)) return false;', 'if (criteria.minCapacity && venue.capacity <= Number(criteria.minCapacity)) return false;']],
    testMappings: [
      tm(SEARCH_TEST, 'VEN-SRCH-02-A includes a venue whose capacity equals the minimum and excludes smaller venues'),
      tm(SEARCH_TEST, 'VEN-SRCH-02-E combines capacity, layout, facilities and accessibility with AND semantics'),
      tm(PAGE_TEST, 'VEN-SRCH-02-F shows only venues that match every selected capacity, layout, facility and accessibility criterion'),
    ] },
  { id: 'M5', name: 'facilities and accessibility use some instead of every, so any one selected feature matches (AC2)', file: SEARCH, suites,
    edits: [
      ['criteria.facilities.every(', 'criteria.facilities.some('],
      ['criteria.accessibility.every(', 'criteria.accessibility.some('],
    ],
    testMappings: [
      tm(SEARCH_TEST, 'VEN-SRCH-02-C requires every selected facility'),
      tm(SEARCH_TEST, 'VEN-SRCH-02-D requires every selected accessibility feature'),
      tm(SEARCH_TEST, 'VEN-SRCH-02-E combines capacity, layout, facilities and accessibility with AND semantics'),
      tm(PAGE_TEST, 'VEN-SRCH-02-F shows only venues that match every selected capacity, layout, facility and accessibility criterion'),
    ] },
  { id: 'M6', name: 'hold filter dropped: expired tentative holds block the venue (AC3, SPM-51 rule)', file: SEARCH, suites,
    edits: [['reservation.status === "booked" || Date.parse(reservation.holdExpiresAt) > now,', 'true,']],
    testMappings: [
      tm(SEARCH_TEST, 'VEN-SRCH-03-E ignores expired tentative holds and respects active holds'),
    ] },
  { id: 'M6b', name: 'booked short-circuit dropped: booked reservations are filtered by hold expiry (AC3, SPM-51 rule)', file: SEARCH, suites,
    edits: [['reservation.status === "booked" || Date.parse(reservation.holdExpiresAt) > now,', 'Date.parse(reservation.holdExpiresAt) > now,']],
    testMappings: [
      tm(PAGE_TEST, 'VEN-SRCH-03-G hides venues busy in the requested range, including buffer time'),
    ] },
  { id: 'M7', name: 'end accepted when equal to start: the check uses >= (AC5)', file: SEARCH, suites,
    edits: [['!(parseRequestTime(criteria.end) > parseRequestTime(criteria.start))', '!(parseRequestTime(criteria.end) >= parseRequestTime(criteria.start))']],
    testMappings: [
      tm(SEARCH_TEST, 'VEN-SRCH-05-B reports an end time that is not after the start time'),
      tm(PAGE_TEST, 'VEN-SRCH-05-F reports an end time not after the start time and does not apply the range'),
    ] },
  // M8 retargeted 2026-10-29 (SPM-156): the event-to-venue label mapping was removed once both use the
  // venue-schema list, so the mutant now drops the event's accessibility needs from the criteria.
  { id: 'M8', name: 'event accessibility needs not carried into the search criteria (AC4)', file: SEARCH, suites,
    edits: [['    accessibility: [...requirements.accessibility],', '    accessibility: [],']],
    testMappings: [
      tm(SEARCH_TEST, 'VEN-SRCH-04-A maps the event requirements, attendance, times and accessibility labels into search criteria'),
      tm(PAGE_TEST, 'VEN-SRCH-04-D starts the filters from the event and lists only venues that suit it and are free'),
    ] },

  // ---- Review mutants (killed by the named tests) ----
  { id: 'F2', name: 'invalid minimum capacity is kept and applied (AC5)', file: SEARCH, suites,
    edits: [['    minCapacity: errors.minCapacity ? "" : criteria.minCapacity.trim(),', '    minCapacity: criteria.minCapacity.trim(),']],
    testMappings: [
      tm(SEARCH_TEST, 'VEN-SRCH-05-I does not apply a non-whole capacity entry that would otherwise filter venues'),
    ] },
  { id: 'F4', name: 'event pre-fill moved to a one-time useState initialiser (AC4)', file: PAGE, suites,
    edits: [
      ['  const [criteria, setCriteria] = useState<VenueSearchCriteria>(EMPTY_VENUE_SEARCH);', '  const [criteria, setCriteria] = useState<VenueSearchCriteria>(() => {\n    const initial = events.find((event) => event.id === eventId);\n    return initial ? criteriaFromEvent(initial) : EMPTY_VENUE_SEARCH;\n  });'],
      ['  if (selectedEvent && selectedEvent.id !== prefilledEventId) {\n    setPrefilledEventId(selectedEvent.id);\n    setCriteria(criteriaFromEvent(selectedEvent));\n  }\n', ''],
    ],
    testMappings: [
      tm(PAGE_TEST, 'VEN-SRCH-04-H pre-fills the filters when the event finishes loading after the page opens'),
    ] },
  { id: 'F5', name: 'clear-all keeps the selected facilities (AC7)', file: PAGE, suites,
    edits: [['onClick={() => setCriteria(EMPTY_VENUE_SEARCH)}', 'onClick={() => setCriteria({ ...EMPTY_VENUE_SEARCH, facilities: criteria.facilities })}']],
    testMappings: [
      tm(PAGE_TEST, 'VEN-SRCH-07-B clears the event-derived facility and accessibility criteria as well'),
    ] },
  { id: 'F7a', name: 'result card no longer shows the venue location (AC6)', file: CARD, suites,
    edits: [['<p className="text-sm text-gray-500 dark:text-gray-400">{venue.location}</p>', '<p className="text-sm text-gray-500 dark:text-gray-400"></p>']],
    testMappings: [
      tm(CARD_TEST, "VEN-SRCH-06-G shows the venue's location and capacity on its card"),
    ] },
  { id: 'F7b', name: 'result card no longer shows the venue capacity (AC6)', file: CARD, suites,
    edits: [['Capacity: {venue.capacity}</p>', 'Capacity: </p>']],
    testMappings: [
      tm(CARD_TEST, "VEN-SRCH-06-G shows the venue's location and capacity on its card"),
    ] },
  { id: 'F8', name: 'hold expiry uses >= now, so a hold expiring this instant still blocks (AC3)', file: SEARCH, suites,
    edits: [['Date.parse(reservation.holdExpiresAt) > now', 'Date.parse(reservation.holdExpiresAt) >= now']],
    testMappings: [
      tm(SEARCH_TEST, 'VEN-SRCH-03-J treats a hold expiring exactly at the search time as expired, and one a millisecond later as active'),
      tm(PAGE_TEST, 'VEN-SRCH-03-I re-judges a venue when its tentative hold expires while the page is open'),
    ] },
  { id: 'F9', name: 'event attendance replaced by the event venue-requirements minimum capacity (AC4)', file: SEARCH, suites,
    edits: [['minCapacity: String(event.expectedAttendance),', 'minCapacity: String(event.venueRequirements.minCapacity),']],
    testMappings: [
      tm(SEARCH_TEST, 'VEN-SRCH-04-I uses the expected attendance as the minimum capacity'),
    ] },

  // ---- Equivalent mutant ----
  { id: 'F10', name: 'invalid date range kept in the criteria (AC5); EQUIVALENT: checkVenueAvailability returns no conflicts when start >= end or a bound is not a valid time, and matchesVenueSearch applies the range only when both bounds are set, so the results are identical to dropping it', file: SEARCH, suites, equivalent: true,
    edits: [
      ['    start: dateInvalid ? "" : criteria.start,', '    start: criteria.start,'],
      ['    end: dateInvalid ? "" : criteria.end,', '    end: criteria.end,'],
    ] },

  // ---- Test Code Review cycle-05 probes (tracked; each kill mapping names the tests that fail under it) ----
  { id: 'P1', name: 'page filters with the raw criteria, so an invalid capacity is applied on the page (AC5, SC-003)', file: PAGE, suites,
    edits: [['() => applyVenueSearch(venues, criteria, searchTime),', '() => venues.filter((venue) => matchesVenueSearch(venue, criteria, searchTime)),']],
    testMappings: [
      tm(PAGE_TEST, 'VEN-SRCH-05-E reports an invalid minimum capacity and keeps the results unfiltered by it'),
      tm(PAGE_TEST, 'VEN-SRCH-05-J reports every non-whole or non-positive capacity entry and keeps the results unfiltered by it'),
    ] },
  { id: 'P2', name: 'live re-check arms the timer for the latest hold expiry instead of the earliest (AC3, SC-004)', file: PAGE, suites,
    edits: [['.sort((left, right) => left - right)[0];', '.sort((left, right) => right - left)[0];']],
    testMappings: [
      tm(PAGE_TEST, 'VEN-SRCH-03-I re-judges a venue when its tentative hold expires while the page is open'),
    ] },
  { id: 'P3', name: 'live re-check timer does nothing (AC3, SC-004)', file: PAGE, suites,
    edits: [['() => setSearchTime(Date.now()),', '() => {},']],
    testMappings: [
      tm(PAGE_TEST, 'VEN-SRCH-03-I re-judges a venue when its tentative hold expires while the page is open'),
    ] },
  { id: 'P4', name: 'layout filter dropped (AC2)', file: SEARCH, suites,
    edits: [['  if (criteria.layout && !venue.layouts.includes(criteria.layout)) return false;\n', '']],
    testMappings: [
      tm(SEARCH_TEST, 'VEN-SRCH-02-B keeps only venues that offer the selected room layout'),
    ] },
  { id: 'P5', name: 'capacity 0 accepted as a valid minimum (AC5)', file: SEARCH, suites,
    edits: [['Number(capacity) > 0', 'Number(capacity) >= 0']],
    testMappings: [
      tm(SEARCH_TEST, 'VEN-SRCH-05-A reports a minimum capacity that is not a positive whole number'),
      tm(PAGE_TEST, 'VEN-SRCH-05-J reports every non-whole or non-positive capacity entry and keeps the results unfiltered by it'),
    ] },
  { id: 'P6', name: 'date and time availability filter never applied (AC3)', file: SEARCH, suites,
    edits: [['if (criteria.start && criteria.end && !isFreeFor(', 'if (false && !isFreeFor(']],
    testMappings: [
      tm(SEARCH_TEST, 'VEN-SRCH-03-C hides a venue when the requested period overlaps a buffer by one minute'),
      tm(SEARCH_TEST, 'VEN-SRCH-03-D hides a venue during one of its unavailable periods'),
      tm(SEARCH_TEST, 'VEN-SRCH-03-E ignores expired tentative holds and respects active holds'),
      tm(SEARCH_TEST, 'VEN-SRCH-03-J treats a hold expiring exactly at the search time as expired, and one a millisecond later as active'),
      tm(SEARCH_TEST, 'VEN-SRCH-04-C excludes a suitable venue that is busy during the event'),
      tm(PAGE_TEST, 'VEN-SRCH-03-G hides venues busy in the requested range, including buffer time'),
      tm(PAGE_TEST, 'VEN-SRCH-03-I re-judges a venue when its tentative hold expires while the page is open'),
      tm(PAGE_TEST, 'VEN-SRCH-03-K caps the re-check timer for a hold more than 24.8 days away'),
      tm(PAGE_TEST, 'VEN-SRCH-04-D starts the filters from the event and lists only venues that suit it and are free'),
      tm(PAGE_TEST, 'VEN-SRCH-05-H still applies a valid date range while the minimum capacity is invalid'),
    ] },
  { id: 'P7', name: 'event layout not pre-filled (AC4)', file: SEARCH, suites,
    edits: [['    layout: requirements.layout,', '    layout: "",']],
    testMappings: [
      tm(SEARCH_TEST, 'VEN-SRCH-04-A maps the event requirements, attendance, times and accessibility labels into search criteria'),
      tm(PAGE_TEST, 'VEN-SRCH-04-D starts the filters from the event and lists only venues that suit it and are free'),
    ] },
  { id: 'P8', name: 'clear-all keeps the date range (AC7)', file: PAGE, suites,
    edits: [['onClick={() => setCriteria(EMPTY_VENUE_SEARCH)}', 'onClick={() => setCriteria({ ...EMPTY_VENUE_SEARCH, start: criteria.start, end: criteria.end })}']],
    testMappings: [
      tm(PAGE_TEST, 'VEN-SRCH-07-A clears all search and filter criteria in one step'),
    ] },
  { id: 'P9', name: 'count uses the singular form for zero matches (AC6)', file: PAGE, suites,
    edits: [['results.length === 1 ? "venue matches"', 'results.length <= 1 ? "venue matches"']],
    testMappings: [
      tm(PAGE_TEST, 'VEN-SRCH-06-I updates the count and the visible cards together when the criteria stop matching'),
      tm(PAGE_TEST, 'VEN-SRCH-08-A explains that no venue matches and suggests adjusting the filters'),
    ] },
  { id: 'P10', name: 'timer delay cap removed, so a hold more than 24.8 days away arms an overflowing timer (SC-004)', file: PAGE, suites,
    edits: [['Math.min(nextExpiry - searchTime, 2_147_000_000)', 'nextExpiry - searchTime']],
    testMappings: [
      tm(PAGE_TEST, 'VEN-SRCH-03-K caps the re-check timer for a hold more than 24.8 days away'),
    ] },
  { id: 'P11', name: 'no-match suggestion text removed (AC8)', file: PAGE, suites,
    edits: [['Try adjusting or clearing some of your filters to see more venues.', '']],
    testMappings: [
      tm(PAGE_TEST, 'VEN-SRCH-08-A explains that no venue matches and suggests adjusting the filters'),
    ] },
  { id: 'P12', name: 'half-entered date range accepted without an error (AC5)', file: SEARCH, suites,
    edits: [['  if (hasStart && !hasEnd) {\n    errors.end = "Enter an end date and time to filter by availability.";\n  } else if', '  if']],
    testMappings: [
      tm(SEARCH_TEST, 'VEN-SRCH-05-C reports the missing bound of a half-entered date range'),
      tm(PAGE_TEST, 'VEN-SRCH-05-F reports an end time not after the start time and does not apply the range'),
    ] },
];
