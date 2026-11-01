const PAGE = 'src/features/events/pages/safety/SafetyCheckQueuePage.tsx';
const COORDINATOR = 'src/features/events/pages/detail/planning/SafetyCheckChangesNeeded.tsx';
const TEST = 'src/features/events/pages/safety/SafetyCheckQueuePage.test.tsx';
const MODAL_TEST = 'src/components/ui/Modal.test.tsx';
const COORDINATOR_TEST = 'src/features/events/pages/detail/planning/SafetyCheckChangesNeeded.test.tsx';
const test = (title) => ({ suite: 'unit', file: TEST, title });

export const SUITES = {
  unit: { args: ['run', TEST, MODAL_TEST, COORDINATOR_TEST] },
};

export const MUTANTS = [
  {
    id: 'S130-FE-01',
    name: 'the page submits rejection or changes-needed decisions without required text (SAFETY-DECISION-04)',
    file: PAGE,
    suites: ['unit'],
    edits: [['if (decision === "changes_needed" && blankChangeIndex !== -1) {', 'if (false) {']],
    testMappings: [test('SAFETY-DECISION-04 validates every change row before submitting any')],
  },
  {
    id: 'S130-FE-02',
    name: 'the page hides confirmation after a successful safety decision (SAFETY-DECISION-05)',
    file: PAGE,
    suites: ['unit'],
    edits: [['setModal({ type: "confirmation", message: "Your safety decision has been submitted." });', 'setModal(null);']],
    testMappings: [
      test('SAFETY-DECISION-01 approves an arrangement and confirms the decision'),
      test('SAFETY-DECISION-02 rejects with its reason and confirms the decision'),
      test('SAFETY-DECISION-03 requests changes with a description and confirms the decision'),
      test('SAFETY-DECISION-05 confirms the %s decision'),
    ],
  },
  {
    id: 'S130-FE-03',
    name: 'the reject action bypasses the required-feedback modal (SAFETY-DECISION-02)',
    file: PAGE,
    suites: ['unit'],
    edits: [['onClick={() => openFeedbackModal("rejected")}', 'onClick={() => void respond("rejected")}']],
    testMappings: [test('SAFETY-DECISION-02 opens rejection feedback only after the reject action')],
  },
  {
    id: 'S130-FE-04',
    name: 'approval includes feedback from a previous decision modal (SAFETY-DECISION-01)',
    file: PAGE,
    suites: ['unit'],
    edits: [[
      'const payload = decision === "approved" ? { decision }\n        : decision === "rejected" ? { decision, reason: feedback }\n          : { decision, changes: changeRows.map((row) => row.text) };',
      'const payload = { decision, reason: feedback };',
    ]],
    testMappings: [
      test('SAFETY-DECISION-01 approves an arrangement and confirms the decision'),
      test('SAFETY-DECISION-02 discards a rejection draft on %s before direct approval'),
    ],
  },
  {
    id: 'S130-FE-05',
    name: 'cancelled feedback draft appears in the next decision modal (SAFETY-DECISION-02/03)',
    file: PAGE,
    suites: ['unit'],
    edits: [
      ['function closeFeedbackModal() {\n    if (submittingRef.current) return;\n    setModal(null);\n    setReason("");\n    setChangeRows([]);', 'function closeFeedbackModal() {\n    if (submittingRef.current) return;\n    setModal(null);'],
      ['function openFeedbackModal(decision: FeedbackDecision) {\n    setError(null);\n    setReason("");\n    setChangeRows(decision === "changes_needed" ? [{ id: nextChangeId.current++, text: "" }] : []);', 'function openFeedbackModal(decision: FeedbackDecision) {\n    setError(null);'],
    ],
    testMappings: [
      test('SAFETY-DECISION-02 discards a rejection draft on %s before direct approval'),
      test('SAFETY-DECISION-03 starts with one row and discards added rows on cancel'),
    ],
  },
  {
    id: 'S130-FE-06',
    name: 'two same-turn submit actions send duplicate decisions (SAFETY-DECISION-03)',
    file: PAGE,
    suites: ['unit'],
    edits: [['if (submittingRef.current) return;\n    const feedback', 'if (false) return;\n    const feedback']],
    testMappings: [test('SAFETY-DECISION-03 disables duplicate submission and pending dismissal')],
  },
  {
    id: 'S130-FE-07',
    name: 'a pending decision can be dismissed before the server responds (SAFETY-DECISION-03)',
    file: PAGE,
    suites: ['unit'],
    edits: [['function closeFeedbackModal() {\n    if (submittingRef.current) return;', 'function closeFeedbackModal() {\n    if (false) return;']],
    testMappings: [test('SAFETY-DECISION-03 disables duplicate submission and pending dismissal')],
  },
  {
    id: 'S130-FE-08',
    name: 'a controlled input loses focus whenever the parent changes onClose (SAFETY-DECISION-02)',
    file: 'src/components/ui/Modal.tsx',
    suites: ['unit'],
    edits: [['  }, [open]);\n\n  useEffect(() => {\n    if (!open) return;\n    const onKey', '  }, [open, onClose]);\n\n  useEffect(() => {\n    if (!open) return;\n    const onKey']],
    testMappings: [{ suite: 'unit', file: MODAL_TEST, title: 'SAFETY-DECISION-02 keeps feedback focus during controlled typing and cleans up the current Escape listener' }],
  },
  {
    id: 'S130-FE-09',
    name: 'a removed change row still appears in the submitted payload (SAFETY-DECISION-03)',
    file: PAGE,
    suites: ['unit'],
    edits: [['setChangeRows((rows) => rows.filter((item) => item.id !== row.id));', 'setChangeRows((rows) => rows);']],
    testMappings: [test('SAFETY-DECISION-03 submits every remaining change row separately')],
  },
  {
    id: 'S130-FE-10',
    name: 'multiple change rows are collapsed into one free-text reason (SAFETY-DECISION-03)',
    file: PAGE,
    suites: ['unit'],
    edits: [[
      ': { decision, changes: changeRows.map((row) => row.text) };',
      ': { decision, reason: changeRows.map((row) => row.text).join("\\n") };',
    ]],
    testMappings: [test('SAFETY-DECISION-03 submits every remaining change row separately')],
  },
  {
    id: 'S130-FE-11',
    name: 'the last change row cannot be removed while other rows remain (SAFETY-DECISION-03)',
    file: PAGE,
    suites: ['unit'],
    edits: [[
      'setChangeRows((rows) => rows.filter((item) => item.id !== row.id));',
      'setChangeRows((rows) => rows[rows.length - 1]?.id === row.id ? rows : rows.filter((item) => item.id !== row.id));',
    ]],
    testMappings: [test('SAFETY-DECISION-03 removes the last change row and submits the remaining rows')],
  },
  {
    id: 'S130-FE-12',
    name: 'the coordinator total omits one unresolved feedback item (SAFETY-DECISION-03)',
    file: COORDINATOR,
    suites: ['unit'],
    edits: [['const totalCount = feedback.length;', 'const totalCount = Math.max(0, feedback.length - 1);']],
    testMappings: [{ suite: 'unit', file: COORDINATOR_TEST, title: 'SAFETY-DECISION-03 counts three change rows and resolves the selected item' }],
  },
  {
    id: 'S130-FE-13',
    name: 'the coordinator enables re-request with unresolved feedback (SAFETY-DECISION-03)',
    file: COORDINATOR,
    suites: ['unit'],
    edits: [['const allResolved = resolvedCount === totalCount;', 'const allResolved = resolvedCount > 0 || resolvedCount === totalCount;']],
    testMappings: [{ suite: 'unit', file: COORDINATOR_TEST, title: 'SAFETY-DECISION-03 counts three change rows and resolves the selected item' }],
  },
  {
    id: 'S130-FE-14',
    name: 'rejection can be submitted without its mandatory reason (SAFETY-DECISION-02/04)',
    file: PAGE,
    suites: ['unit'],
    edits: [[
      'if (decision === "rejected" && !feedback) {\n      setError("Enter a reason for rejection.");\n      return;\n    }',
      'if (false) {\n      setError("Enter a reason for rejection.");\n      return;\n    }',
    ]],
    testMappings: [test('SAFETY-DECISION-04 blocks blank feedback for %s')],
  },
  {
    id: 'S130-FE-15',
    name: 'the sole required change row can be removed (SAFETY-DECISION-03)',
    file: PAGE,
    suites: ['unit'],
    edits: [['disabled={submitting || changeRows.length === 1}', 'disabled={submitting}']],
    testMappings: [test('SAFETY-DECISION-03 starts with one row and discards added rows on cancel')],
  },
];
