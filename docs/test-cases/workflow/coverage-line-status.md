# Coverage line status

Every uncovered line of an in-scope source file needs a row here (gate G5). Lines covered only by an end-to-end run are classified COVERED-BY-E2E automatically and need no row.

| Status | Meaning | Note required |
|---|---|---|
| COVERED-BY-E2E | Only an end-to-end test runs it; a unit or integration test is still preferred | Name the e2e test |
| ADD-TEST | A test will be added this cycle | Test id |
| UNREACHABLE | No valid input can execute it | Why |
| LOW-VALUE | Reachable, but only logging or trivial; no test added | Why |
| OPEN | Not yet decided; counts as a gap in the metrics | What is undecided |

| File | Lines | Status | Note |
|---|---|---|---|
| backend/src/events/status/arrangements.reader.ts | 43 | UNREACHABLE | NoSafetyRecordSource is still registered in app.module.ts but nothing injects it: SAFETY_OUTCOME_SOURCE now points at EventSafetyCheckSource. The class is dead code; remove it in a follow-up. |
| backend/src/events/status/status.service.ts | 121, 161, 383 | OPEN | Locked re-check that the coordinator is still assigned, after the row lock. The pre-check refuses first, so it only fires if the coordinator is reassigned between the pre-check and the lock. A deterministic test needs the CONFIRM-EVENT-04-B pattern (hold the row lock, reassign, commit). Mutants M7b, M8b, M9b are flagged equivalent only because no such test exists. |
| backend/src/events/status/status.service.ts | 450 | UNREACHABLE | Body used when the guarded UPDATE finds no Planning row. The UPDATE runs under FOR UPDATE after the status was re-read as Planning, so it cannot match no row (the same argument as mutant M11). Defensive. |
| backend/src/events/events.controller.ts | 21 | OPEN | Existing code from another story (not in SPM-94's diff against origin/dev; no uncovered line is in a changed hunk). The SPM-94 suites do not exercise it. OPEN until the owning story's suite is added to this scope or a test is written. |
| backend/src/events/events.service.ts | 61, 64, 65, 66, 67, 69, 70, 71, 283, 293, 297, 298, 299, 300, 301, 309, 314, 321, 322, 323, 324, 327, 328, 332, 333, 334, 335, 338, 339, 342, 351, 361, 380, 384, 415, 416, 425, 426, 430, 431, 439, 457, 458, 459, 463, 464 | OPEN | Existing code from another story (not in SPM-94's diff against origin/dev; no uncovered line is in a changed hunk). The SPM-94 suites do not exercise it. OPEN until the owning story's suite is added to this scope or a test is written. |
| frontend/src/features/events/pages/detail/EventDetailPage.tsx | 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 101, 102, 103, 117, 165, 188, 194, 195, 196, 200, 201, 210, 229, 239, 260, 272, 276, 280, 283, 289, 293, 297, 300, 326, 330, 340, 356, 357, 358, 409, 410, 424, 425, 446, 447, 448, 449, 450, 451, 453, 457, 459, 461, 462, 463, 464, 466, 471, 472, 473, 475, 476, 477, 478, 479, 480, 481, 483, 487, 522, 537, 541, 569, 582, 598, 599, 600, 647, 655, 691, 730, 738 | OPEN | Existing code from another story (not in SPM-94's diff against origin/dev; no uncovered line is in a changed hunk). The SPM-94 suites do not exercise it. OPEN until the owning story's suite is added to this scope or a test is written. |
| frontend/src/store/useAppStore.ts | 26, 27, 28, 30, 31, 32, 118, 122, 131, 132, 156, 157, 161, 163, 169, 171, 176, 177, 178, 188, 189, 190, 192, 212, 213, 216, 217, 219, 224, 226, 229, 232, 237, 238, 240, 242, 263, 270, 272, 278, 285, 287, 290, 291, 292, 302, 304, 308, 314, 315, 316, 317, 318, 319, 320, 327, 328, 336, 347, 349, 354, 368, 369, 378, 379, 381, 384, 385, 386, 392, 404, 410, 411, 420, 421, 423, 426, 427, 439, 442, 443, 445, 457, 460, 463, 467, 468, 471, 474, 480, 483, 484, 487, 489, 497, 499, 500, 502, 506, 507, 511, 514, 518, 519, 520, 522, 524, 526, 527, 529, 534, 535, 536, 537, 538, 540, 543, 558, 559, 560, 561, 562, 563, 569, 570, 575, 576, 581, 582, 584, 590, 596 | OPEN | Existing code from another story (not in SPM-94's diff against origin/dev; no uncovered line is in a changed hunk). The SPM-94 suites do not exercise it. OPEN until the owning story's suite is added to this scope or a test is written. |
