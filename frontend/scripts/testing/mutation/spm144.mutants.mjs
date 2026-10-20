export const SUITES = {
  facilities: {
    args: ['run', 'src/features/events/pages/create/EventCreatePage.test.tsx'],
  },
};

const PAGE = 'src/features/events/pages/create/EventCreatePage.tsx';

export const MUTANTS = [
  {
    id: 'SPM144-FE-OPTION-LABEL-VALUE',
    name: 'facility checklist displays submitted values instead of backend labels',
    file: PAGE,
    suites: ['facilities'],
    edits: [[
      'options={facilityOptions.map(({ label }) => label)}',
      'options={facilityOptions.map(({ value }) => value)}',
    ]],
  },
  {
    id: 'SPM144-FE-STALE-DRAFT',
    name: 'unsupported facility value is not rejected before submission',
    file: PAGE,
    suites: ['facilities'],
    edits: [[
      'if (staleFacilities.length)',
      'if (false)',
    ]],
  },
  {
    id: 'SPM144-FE-RETRY-STATE',
    name: 'failed schema load retries automatically instead of waiting for user action',
    file: PAGE,
    suites: ['facilities'],
    edits: [[
      'if (step < 1 || facilityStatus !== "idle") return;',
      'if (step < 1 || facilityStatus === "loaded" || facilityStatus === "loading") return;',
    ]],
  },
  {
    id: 'SPM144-FE-ACCESSIBILITY-LABEL-VALUE',
    name: 'accessibility checklist displays backend values instead of labels',
    file: PAGE,
    suites: ['facilities'],
    edits: [[
      'options={accessibilityOptions.map(({ label }) => label)}',
      'options={accessibilityOptions.map(({ value }) => value)}',
    ]],
  },
  {
    id: 'SPM144-FE-STALE-ACCESSIBILITY',
    name: 'unsupported accessibility value is not rejected before submission',
    file: PAGE,
    suites: ['facilities'],
    edits: [[
      'if (staleAccessibility.length)',
      'if (false)',
    ]],
  },
  {
    id: 'SPM144-FE-ERROR-STATE-GUARD',
    name: 'failed options request blocks progression but permits submission at review',
    file: PAGE,
    suites: ['facilities'],
    edits: [[
      'if (step >= 1 && facilityStatus !== "loaded") return;',
      'if (step >= 1 && facilityStatus !== "loaded" && step < 2) return;',
    ]],
  },
  {
    id: 'SPM144-FE-ERROR-REVIEW-SUBMIT',
    name: 'failed options request permits submission only at review',
    file: PAGE,
    suites: ['facilities'],
    testMappings: [{
      suite: 'facilities',
      file: 'src/features/events/pages/create/EventCreatePage.test.tsx',
      title: 'EVE-FAC-05-F validates stale selections when a draft resumes at review',
    }],
    edits: [[
      'if (step >= 1 && facilityStatus !== "loaded") return;',
      'if (step >= 1 && facilityStatus !== "loaded" && !(step === 2 && facilityStatus === "error")) return;',
    ]],
  },
  {
    id: 'SPM144-FE-ERROR-CONTINUE',
    name: 'failed options request permits Continue only from step one',
    file: PAGE,
    suites: ['facilities'],
    testMappings: [{
      suite: 'facilities',
      file: 'src/features/events/pages/create/EventCreatePage.test.tsx',
      title: 'EVE-FAC-05-E blocks Continue after facility options fail',
    }],
    edits: [[
      'if (step >= 1 && facilityStatus !== "loaded") return;',
      'if (step >= 1 && facilityStatus !== "loaded" && !(step === 1 && facilityStatus === "error")) return;',
    ]],
  },
  {
    id: 'SPM144-FE-REVIEW-STEP-OPTIONS',
    name: 'draft restored at review skips loading current facility and accessibility options',
    file: PAGE,
    suites: ['facilities'],
    edits: [[
      'if (step < 1 || facilityStatus !== "idle") return;',
      'if (step !== 1 || facilityStatus !== "idle") return;',
    ]],
  },
  {
    id: 'SPM144-FE-OPTION-ITEM-SHAPE',
    name: 'malformed backend option items bypass the label/value shape guard',
    file: PAGE,
    suites: ['facilities'],
    edits: [[
      'option && typeof option.label === "string" && typeof option.value === "string"',
      'true',
    ]],
  },
];
