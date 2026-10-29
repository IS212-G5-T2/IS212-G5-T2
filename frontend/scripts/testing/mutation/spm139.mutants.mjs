// SPM-139 frontend mutants, run by run.mjs (`node scripts/testing/mutation/run.mjs --mutants spm139.mutants.mjs`).
// Each edit is [from, to]; `from` must occur exactly once in its file. Each mutant names the test that must go red.
export const SUITES = {
  // The settings form (RegistrationSettingsForm.tsx) and its v2.0 case tests.
  form: { args: ['run', 'src/features/events/pages/detail/registration/RegistrationSettingsForm.test.tsx'] },
  // The pure form rules (registrationSettings.ts) and their tests.
  lib: { args: ['run', 'src/features/events/lib/registrationSettings.test.ts'] },
};

const FORM = 'src/features/events/pages/detail/registration/RegistrationSettingsForm.tsx';
const LIB = 'src/features/events/lib/registrationSettings.ts';
const formTest = 'src/features/events/pages/detail/registration/RegistrationSettingsForm.test.tsx';

export const MUTANTS = [
  { id: 'FM1', name: 'a closing time equal to the opening time accepted by the form (<= written as <)', file: LIB,
    edits: [['if (opensIso && Date.parse(closesIso) <= Date.parse(opensIso)) return SETTINGS_MESSAGES.closeAfterOpen;', 'if (opensIso && Date.parse(closesIso) < Date.parse(opensIso)) return SETTINGS_MESSAGES.closeAfterOpen;']],
    suites: ['form'], testMappings: [{ suite: 'form', file: formTest, title: 'CONFIG-REG-05-B: the form rejects a closing time not after the opening time and keeps the typed values' }] },
  { id: 'FM2', name: 'a closing time after the event start accepted by the form (live start rule disabled)', file: LIB,
    edits: [['return Date.parse(closesIso) > Date.parse(startsAt) ? SETTINGS_MESSAGES.closeOnOrBeforeStart : undefined;', 'return undefined;']],
    suites: ['form'], testMappings: [{ suite: 'form', file: formTest, title: 'CONFIG-REG-06-B: the form refuses a closing time after the event start and keeps the values' }] },
  { id: 'FM3', name: 'a corrected closing time keeps showing the error of the last Save', file: FORM,
    edits: [['    setSavedMessage(null);\n    setErrors({});\n  };', '    setSavedMessage(null);\n  };']],
    suites: ['form'], testMappings: [{ suite: 'form', file: formTest, title: 'CONFIG-REG-05-A: the closing-time error clears when corrected and the save is accepted' }] },
  { id: 'FM4', name: 'surrounding spaces not trimmed from the capacity (" 25 " refused)', file: LIB,
    edits: [['  const trimmed = text.trim();', '  const trimmed = text;']],
    suites: ['form'], testMappings: [{ suite: 'form', file: formTest, title: 'CONFIG-REG-07-A: capacities "25", " 25 " and "1000" are saved as whole numbers' }] },
  { id: 'FM5', name: 'a capacity with trailing letters accepted (parseInt instead of a whole-number check)', file: LIB,
    edits: [['  if (!/^\\d+$/.test(trimmed)) return undefined;', '  if (Number.isNaN(parseInt(trimmed, 10))) return undefined;']],
    suites: ['form'], testMappings: [{ suite: 'form', file: formTest, title: 'CONFIG-REG-07-B: the form refuses a non-whole capacity and keeps the value typed' }] },
  { id: 'FM6', name: 'Reload after a stale save clears the conflict without fetching the settings again', file: FORM,
    edits: [['    setFormError(null);\n    await load();\n  };', '    setFormError(null);\n  };']],
    suites: ['form'], testMappings: [{ suite: 'form', file: formTest, title: 'CONFIG-REG-X-03: Reload after a stale save fetches the settings again and clears the conflict' }] },
  { id: 'FM7', name: 'a save that fails without a server answer shows an empty message', file: FORM,
    edits: [['"Registration settings could not be saved.");', '"");']],
    suites: ['form'], testMappings: [{ suite: 'form', file: formTest, title: 'CONFIG-REG-X-03: a save that fails without a server answer shows the generic message' }] },
];
