// SPM-156 frontend mutants, run by run.mjs:
//   node scripts/testing/mutation/run.mjs --mutants spm156.mutants.mjs
// Each edit is [from, to]; `from` must occur exactly once in the file (the runner reports MISAPPLIED otherwise).
// Every mutant names the exact tests that must go red (testMappings); the runner checks each title exists.
// Groups: H* change history labels and visibility (EVENT-UPDATE-07-C/D/E); O* option lists in the three event
// forms and the shared hook (EVENT-UPDATE-08-B/C/D); L1 the stacked field notes (EVENT-UPDATE-08-E).
export const SUITES = {
  spm156: {
    args: [
      "run",
      "src/features/events/pages/detail/planning/PlanningUpdateForm.test.tsx",
      "src/features/events/pages/detail/planning/ChangeHistoryList.test.tsx",
      "src/features/events/pages/detail/planning/FlaggedChangeReview.test.tsx",
      "src/features/events/pages/detail/EventDetailPage.planning.test.tsx",
      "src/features/events/pages/change-requests/RequestChangeForm.test.tsx",
      "src/features/events/pages/edit/EventEditForm.test.tsx",
      "src/features/venues/api/venue-options-api.test.ts",
      "src/utils/planning.test.ts",
    ],
  },
};

const suites = ["spm156"];
const tm = (file, title) => ({ suite: "spm156", file, title });

const PLANNING = "src/utils/planning.ts";
const HISTORY =
  "src/features/events/pages/detail/planning/ChangeHistoryList.tsx";
const DETAIL = "src/features/events/pages/detail/EventDetailPage.tsx";
const UPDATE =
  "src/features/events/pages/detail/planning/PlanningUpdateForm.tsx";
const REQUEST =
  "src/features/events/pages/change-requests/RequestChangeForm.tsx";
const EDIT = "src/features/events/pages/edit/EventEditForm.tsx";
const OPTIONS = "src/features/venues/api/venue-options-api.ts";
const REVIEW =
  "src/features/events/pages/detail/planning/FlaggedChangeReview.tsx";

const PLANNING_TEST = "src/utils/planning.test.ts";
const HISTORY_TEST =
  "src/features/events/pages/detail/planning/ChangeHistoryList.test.tsx";
const DETAIL_TEST =
  "src/features/events/pages/detail/EventDetailPage.planning.test.tsx";
const UPDATE_TEST =
  "src/features/events/pages/detail/planning/PlanningUpdateForm.test.tsx";
const REQUEST_TEST =
  "src/features/events/pages/change-requests/RequestChangeForm.test.tsx";
const EDIT_TEST = "src/features/events/pages/edit/EventEditForm.test.tsx";
const OPTIONS_TEST = "src/features/venues/api/venue-options-api.test.ts";
const REVIEW_TEST =
  "src/features/events/pages/detail/planning/FlaggedChangeReview.test.tsx";

const STATIC_IMPORT = [
  'import { ROOM_LAYOUT_OPTIONS } from "@/features/venues/lib/venueOptions";',
  'import { ROOM_LAYOUT_OPTIONS, FACILITY_OPTIONS, ACCESSIBILITY_OPTIONS } from "@/features/venues/lib/venueOptions";',
];

export const MUTANTS = [
  // ---- history labels and visibility (DoD 4, 5) ----
  {
    id: "H1",
    name: "a direct update is labelled with its review status",
    file: PLANNING,
    suites,
    edits: [
      [
        '  if (entry.kind === "direct_update") return "Updated directly";',
        '  if (entry.kind === "direct_update") return entry.status;',
      ],
    ],
    testMappings: [
      tm(
        PLANNING_TEST,
        "EVENT-UPDATE-07-C names direct updates and review outcomes",
      ),
      tm(
        HISTORY_TEST,
        "EVENT-UPDATE-07-C labels direct updates and reviewed changes differently",
      ),
    ],
  },
  {
    id: "H2",
    name: "an approved change request is labelled with its review status",
    file: PLANNING,
    suites,
    edits: [
      [
        '  if (entry.kind === "change_request") return "Change request approved";',
        '  if (entry.kind === "change_request") return entry.status;',
      ],
    ],
    testMappings: [
      tm(PLANNING_TEST, "EVENT-UPDATE-07-E names an approved change request"),
      tm(
        HISTORY_TEST,
        "EVENT-UPDATE-07-E labels an approved change request with who asked and who approved",
      ),
    ],
  },
  {
    id: "H3",
    name: 'the per-field note calls a direct update "confirmed"',
    file: PLANNING,
    suites,
    edits: [
      [
        '  if (entry.kind === "direct_update") return "Last changed";',
        '  if (entry.kind === "direct_update") return "Last change confirmed";',
      ],
    ],
    testMappings: [
      tm(
        PLANNING_TEST,
        "EVENT-UPDATE-07-C words the per-field note for direct and reviewed changes",
      ),
      tm(
        UPDATE_TEST,
        "EVENT-UPDATE-07-C describes a direct update as changed, not confirmed",
      ),
    ],
  },
  {
    id: "H4",
    name: "the per-field note for a change request omits who asked",
    file: PLANNING,
    suites,
    edits: [
      [
        '    return entry.proposedBy ? `Last changed by ${entry.proposedBy}\'s change request, approved` : "Last changed by a change request, approved";',
        '    return "Last changed by a change request, approved";',
      ],
    ],
    testMappings: [
      tm(
        UPDATE_TEST,
        "EVENT-UPDATE-07-E describes a field changed by an approved change request",
      ),
    ],
  },
  {
    id: "H5",
    name: "the history list omits the organiser who requested the change",
    file: HISTORY,
    suites,
    edits: [
      [
        "              ? ` (requested by ${entry.proposedBy})`",
        '              ? ""',
      ],
    ],
    testMappings: [
      tm(
        HISTORY_TEST,
        "EVENT-UPDATE-07-E labels an approved change request with who asked and who approved",
      ),
    ],
  },
  {
    id: "H6",
    name: "the organiser never sees the change history card",
    file: DETAIL,
    suites,
    edits: [
      [
        '        changeHistory.length > 0 && (\n          <Card className="mb-6">',
        '        changeHistory.length < 0 && (\n          <Card className="mb-6">',
      ],
    ],
    testMappings: [
      tm(
        DETAIL_TEST,
        "EVENT-UPDATE-07-D shows the owning organiser the change history with direct updates",
      ),
    ],
  },
  {
    id: "H7",
    name: "the change history is not refreshed by the planning poll",
    file: DETAIL,
    suites,
    edits: [
      [
        "        loadPlanning();\n        loadHistory();\n      }\n    }, PLANNING_REFRESH_MS);",
        "        loadPlanning();\n      }\n    }, PLANNING_REFRESH_MS);",
      ],
    ],
    testMappings: [
      tm(
        DETAIL_TEST,
        "EVENT-UPDATE-07-D refreshes the organiser's change history with the planning poll",
      ),
    ],
  },
  {
    id: "H8",
    name: "the coordinator editing the event sees the history twice",
    file: DETAIL,
    suites,
    edits: [
      [
        "        !(isPlanningCoordinator && !planningView.readOnly && !isCancelled) &&",
        "        true &&",
      ],
    ],
    testMappings: [
      tm(
        DETAIL_TEST,
        "EVENT-UPDATE-07-D shows the coordinator the change history on a read-only event, and only once while editing",
      ),
    ],
  },
  {
    id: "H9",
    name: "the review panel no longer shows the change history",
    file: REVIEW,
    suites,
    edits: [
      ["        <ChangeHistoryList history={history} />", "        {null}"],
    ],
    testMappings: [
      tm(
        REVIEW_TEST,
        "EVENT-FLAG-05-A shows each resolved change with values, coordinator, timestamp and status",
      ),
    ],
  },
  // ---- the shared options hook (FU 1) ----
  {
    id: "O1",
    name: "options are read from the wrong endpoint",
    file: OPTIONS,
    suites,
    edits: [
      [
        '  const result = await api<Partial<VenueOptions>>("/venues/options");',
        '  const result = await api<Partial<VenueOptions>>("/venues");',
      ],
    ],
    testMappings: [
      tm(
        OPTIONS_TEST,
        "EVENT-UPDATE-08-D reads the options from the venue schema endpoint",
      ),
    ],
  },
  {
    id: "O2",
    name: 'a malformed options reply is accepted (killed by the EVENT-UPDATE-08-D "rejects a response with %s" table; no exact mapping because its titles are generated)',
    file: OPTIONS,
    suites,
    edits: [
      [
        "  if (!isOptionList(result?.facilities) || !isOptionList(result?.accessibility))\n    throw new Error(VENUE_OPTIONS_INVALID);",
        "",
      ],
    ],
  },
  {
    id: "O3",
    name: "a stale failure from an earlier request replaces the loaded options",
    file: OPTIONS,
    suites,
    edits: [
      [
        "      .catch((error: unknown) => {\n        if (active)",
        "      .catch((error: unknown) => {\n        if (true)",
      ],
    ],
    testMappings: [
      tm(
        OPTIONS_TEST,
        "EVENT-UPDATE-08-D ignores a stale failure that arrives after a retry",
      ),
    ],
  },
  {
    id: "O3b",
    name: "a stale reply from an earlier request overwrites the newer options",
    file: OPTIONS,
    suites,
    edits: [
      [
        '        if (active)\n          setState({\n            status: "loaded",',
        '        if (true)\n          setState({\n            status: "loaded",',
      ],
    ],
    testMappings: [
      tm(
        OPTIONS_TEST,
        "EVENT-UPDATE-08-D ignores a stale reply that arrives after a retry",
      ),
    ],
  },
  // ---- Update Event Information (FU 1, 2) ----
  {
    id: "O4",
    name: "Update Event Information offers its own built-in lists instead of the loaded ones",
    file: UPDATE,
    suites,
    edits: [
      STATIC_IMPORT,
      [
        "  const supported = { facilities: options.facilities, accessibility: options.accessibility };",
        "  const supported = { facilities: [...FACILITY_OPTIONS], accessibility: [...ACCESSIBILITY_OPTIONS] };",
      ],
    ],
    testMappings: [
      tm(
        UPDATE_TEST,
        "EVENT-UPDATE-08-D offers exactly the loaded lists, not built-in ones",
      ),
    ],
  },
  {
    id: "O5",
    name: "Update Event Information passes a retired stored value to the list",
    file: UPDATE,
    suites,
    edits: [
      [
        "        values={values[key].filter((value) => supported[key].includes(value))}",
        "        values={values[key]}",
      ],
    ],
    testMappings: [
      tm(
        UPDATE_TEST,
        "EVENT-UPDATE-08-C drops a retired value when the list is edited back to the same visible choices",
      ),
    ],
  },
  {
    id: "O6",
    name: "Update Event Information does not filter an edited list before sending; EQUIVALENT: CheckboxGroup is given the filtered values and builds every toggled list from them, so an edited list never contains a value outside the loaded options and filtering it again before sending changes nothing",
    file: UPDATE,
    suites,
    equivalent: true,
    edits: [
      [
        "      if (!sameSet(values[key], baseline[key])) patch[key] = values[key].filter((v) => supported[key].includes(v));",
        "      if (!sameSet(values[key], baseline[key])) patch[key] = values[key];",
      ],
    ],
  },
  {
    id: "O5x",
    name: "Update Event Information keeps and sends a retired stored value (both filters removed)",
    file: UPDATE,
    suites,
    edits: [
      [
        "        values={values[key].filter((value) => supported[key].includes(value))}",
        "        values={values[key]}",
      ],
      [
        "      if (!sameSet(values[key], baseline[key])) patch[key] = values[key].filter((v) => supported[key].includes(v));",
        "      if (!sameSet(values[key], baseline[key])) patch[key] = values[key];",
      ],
    ],
    testMappings: [
      tm(
        UPDATE_TEST,
        "EVENT-UPDATE-08-C hides a retired stored value and drops it only when the list is edited",
      ),
    ],
  },
  {
    id: "O7",
    name: "Update Event Information sends a list the coordinator did not touch",
    file: UPDATE,
    suites,
    edits: [
      [
        "      if (!sameSet(values[key], baseline[key])) patch[key] = values[key].filter((v) => supported[key].includes(v));",
        "      patch[key] = values[key].filter((v) => supported[key].includes(v));",
      ],
    ],
    testMappings: [
      tm(
        UPDATE_TEST,
        "EVENT-UPDATE-08-C hides a retired stored value and drops it only when the list is edited",
      ),
    ],
  },
  {
    id: "O8",
    name: "Update Event Information lets the lists change before the options load",
    file: UPDATE,
    suites,
    edits: [
      [
        '        disabled={locked(key) || options.status !== "loaded"}',
        "        disabled={locked(key)}",
      ],
    ],
    testMappings: [
      tm(
        UPDATE_TEST,
        "EVENT-UPDATE-08-D disables the lists while options load or after a failure, with a retry",
      ),
    ],
  },
  {
    id: "L1",
    name: "a field error is pulled up over the last-change note",
    file: UPDATE,
    suites,
    edits: [
      [
        '          <p role="alert" className="text-xs text-danger-600">\n            {alert}',
        '          <p role="alert" className="-mt-3 text-xs text-danger-600">\n            {alert}',
      ],
    ],
    testMappings: [
      tm(
        UPDATE_TEST,
        "EVENT-UPDATE-08-E stacks a list error and the last-change note under the field",
      ),
    ],
  },
  // ---- Request a Change (FU 1, 2) ----
  {
    id: "O9",
    name: "Request a Change offers its own built-in lists instead of the loaded ones",
    file: REQUEST,
    suites,
    edits: [
      STATIC_IMPORT,
      [
        "            options={options[key]}",
        '            options={key === "facilities" ? [...FACILITY_OPTIONS] : [...ACCESSIBILITY_OPTIONS]}',
      ],
    ],
    testMappings: [
      tm(
        REQUEST_TEST,
        "EVENT-UPDATE-08-D offers exactly the loaded lists, not built-in ones",
      ),
    ],
  },
  {
    id: "O10",
    name: "Request a Change passes a retired stored value to the list",
    file: REQUEST,
    suites,
    edits: [
      [
        "            values={values[key].filter((v) => options[key].includes(v))}",
        "            values={values[key]}",
      ],
    ],
    testMappings: [
      tm(
        REQUEST_TEST,
        "EVENT-UPDATE-08-C drops a retired value when the list is edited back to the same visible choices",
      ),
    ],
  },
  {
    id: "O11",
    name: "Request a Change does not filter an edited list before sending; EQUIVALENT: CheckboxGroup is given the filtered values and builds every toggled list from them, so an edited list never contains a value outside the loaded options and filtering it again before sending changes nothing",
    file: REQUEST,
    suites,
    equivalent: true,
    edits: [
      [
        "    if (!sameSet(values[key], baseline[key])) changes[key] = values[key].filter((v) => supported[key].includes(v));",
        "    if (!sameSet(values[key], baseline[key])) changes[key] = values[key];",
      ],
    ],
  },
  {
    id: "O10x",
    name: "Request a Change keeps and sends a retired stored value (both filters removed)",
    file: REQUEST,
    suites,
    edits: [
      [
        "            values={values[key].filter((v) => options[key].includes(v))}",
        "            values={values[key]}",
      ],
      [
        "    if (!sameSet(values[key], baseline[key])) changes[key] = values[key].filter((v) => supported[key].includes(v));",
        "    if (!sameSet(values[key], baseline[key])) changes[key] = values[key];",
      ],
    ],
    testMappings: [
      tm(
        REQUEST_TEST,
        "EVENT-UPDATE-08-C hides retired values, offers current ones and drops retired values from an edited list",
      ),
    ],
  },
  {
    id: "O12",
    name: "Request a Change lets the lists change before the options load",
    file: REQUEST,
    suites,
    edits: [
      [
        '            disabled={options.status !== "loaded"}',
        "            disabled={false}",
      ],
    ],
    testMappings: [
      tm(
        REQUEST_TEST,
        "EVENT-UPDATE-08-D disables the lists while loading and offers a retry after a failure",
      ),
    ],
  },
  // ---- Edit Event (FU 1, 2) ----
  {
    id: "O13",
    name: "Edit Event offers its own built-in lists instead of the loaded ones",
    file: EDIT,
    suites,
    edits: [
      STATIC_IMPORT,
      [
        "            options={options.facilities}",
        "            options={[...FACILITY_OPTIONS]}",
      ],
      [
        "            options={options.accessibility}",
        "            options={[...ACCESSIBILITY_OPTIONS]}",
      ],
    ],
    testMappings: [
      tm(
        EDIT_TEST,
        "EVENT-UPDATE-08-D offers exactly the loaded lists, not built-in ones",
      ),
    ],
  },
  {
    id: "O14",
    name: "Edit Event keeps retired stored values",
    file: EDIT,
    suites,
    edits: [
      [
        '    options.status === "loaded" ? list.filter((value) => options[key].includes(value)) : list;',
        "    list;",
      ],
    ],
    testMappings: [
      tm(
        EDIT_TEST,
        "EVENT-UPDATE-08-C hides retired values and saves only current ones",
      ),
    ],
  },
  {
    id: "O15",
    name: "Edit Event wipes the stored lists when the options fail to load",
    file: EDIT,
    suites,
    edits: [
      [
        '    options.status === "loaded" ? list.filter((value) => options[key].includes(value)) : list;',
        "    list.filter((value) => options[key].includes(value));",
      ],
    ],
    testMappings: [
      tm(
        EDIT_TEST,
        "EVENT-UPDATE-08-D shows the load error and keeps stored values when options fail",
      ),
    ],
  },
  {
    id: "O16",
    name: "Edit Event lets the lists change while the options load",
    file: EDIT,
    suites,
    edits: [
      [
        '            values={supportedOnly("facilities", facilities)}\n            disabled={options.status !== "loaded"}',
        '            values={supportedOnly("facilities", facilities)}\n            disabled={options.status === "error"}',
      ],
      [
        '            values={supportedOnly("accessibility", accessibility)}\n            disabled={options.status !== "loaded"}',
        '            values={supportedOnly("accessibility", accessibility)}\n            disabled={options.status === "error"}',
      ],
    ],
    testMappings: [
      tm(
        EDIT_TEST,
        "EVENT-UPDATE-08-D disables both lists while the options load",
      ),
    ],
  },
];
