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
const libTest = 'src/features/events/lib/registrationSettings.test.ts';

const lib = (title) => ({ suite: 'lib', file: libTest, title });

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
    suites: ['form', 'lib'], testMappings: [{ suite: 'form', file: formTest, title: 'CONFIG-REG-07-A: capacities "25", " 25 " and "1000" are saved as whole numbers' },
      lib('CONFIG-REG-07-A: reads %j as %i')] },
  { id: 'FM5', name: 'a capacity with trailing letters accepted (parseInt instead of a whole-number check)', file: LIB,
    edits: [['  if (!/^\\d+$/.test(trimmed)) return undefined;', '  if (Number.isNaN(parseInt(trimmed, 10))) return undefined;']],
    suites: ['form', 'lib'], testMappings: [{ suite: 'form', file: formTest, title: 'CONFIG-REG-07-B: the form refuses a non-whole capacity and keeps the value typed' },
      lib('CONFIG-REG-07-B: refuses %j'),
      lib('CONFIG-REG-07-B: refuses capacity %j with the capacity message')] },
  { id: 'FM6', name: 'Reload after a stale save clears the conflict without fetching the settings again', file: FORM,
    edits: [['    setFormError(null);\n    await load();\n  };', '    setFormError(null);\n  };']],
    suites: ['form'], testMappings: [{ suite: 'form', file: formTest, title: 'CONFIG-REG-X-03: Reload after a stale save fetches the settings again and clears the conflict' }] },
  { id: 'FM7', name: 'a save that fails without a server answer shows an empty message', file: FORM,
    edits: [['"Registration settings could not be saved.");', '"");']],
    suites: ['form'], testMappings: [{ suite: 'form', file: formTest, title: 'CONFIG-REG-X-03: a save that fails without a server answer shows the generic message' }] },

  // ---- The pure rules, judged by their own tests (registrationSettings.test.ts)
  { id: 'FM8', name: 'a Singapore wall-clock value read with a +00:00 offset', file: LIB,
    edits: [['const iso = `${trimmed}:00+08:00`;', 'const iso = `${trimmed}:00+00:00`;']],
    suites: ['lib'], testMappings: [lib('CONFIG-REG-02-B: reads a Singapore wall-clock value as an offset ISO date-time')] },
  { id: 'FM9', name: 'a UTC instant shown as UTC, not as the Singapore wall clock (offset not added)', file: LIB,
    edits: [['new Date(instant + SGT_OFFSET_MS).toISOString()', 'new Date(instant).toISOString()']],
    suites: ['lib'], testMappings: [lib('CONFIG-REG-02-B: shows a UTC instant as the Singapore wall clock')] },
  { id: 'FM10', name: 'text that is not a real date-time accepted (invalid-date check removed)', file: LIB,
    edits: [['return Number.isNaN(Date.parse(iso)) ? undefined : iso;', 'return iso;']],
    suites: ['lib'], testMappings: [lib('CONFIG-REG-02-D: refuses text that is not a date-time')] },
  { id: 'FM11', name: 'an opening time that does not exist gets no date-time error (invalidDatetime branch removed)', file: LIB,
    edits: [['if (values.opens.trim() && !opensIso) errors.registrationOpensAt = SETTINGS_MESSAGES.invalidDatetime;', '']],
    suites: ['lib'], testMappings: [lib('CONFIG-REG-02-D: refuses an opening time that does not exist in the calendar')] },
  { id: 'FM12', name: 'a closing time that does not exist gets no date-time error (invalidDatetime branch removed)', file: LIB,
    edits: [['if (values.closes.trim() && !closesIso) errors.registrationClosesAt = SETTINGS_MESSAGES.invalidDatetime;', '']],
    suites: ['lib'], testMappings: [lib('CONFIG-REG-02-D: refuses a closing time that does not exist in the calendar')] },
  { id: 'FM13', name: 'checkSettingsForm accepts a closing time equal to the opening time (<= written as <)', file: LIB,
    edits: [['if (opensIso && closesIso && Date.parse(closesIso) <= Date.parse(opensIso))', 'if (opensIso && closesIso && Date.parse(closesIso) < Date.parse(opensIso))']],
    suites: ['lib'], testMappings: [lib('CONFIG-REG-05-B: closing %s is refused with its message')] },
  { id: 'FM14', name: 'checkSettingsForm refuses a closing time equal to the event start (> written as >=)', file: LIB,
    edits: [['if (closesIso && !errors.registrationClosesAt && Date.parse(closesIso) > Date.parse(startsAt))', 'if (closesIso && !errors.registrationClosesAt && Date.parse(closesIso) >= Date.parse(startsAt))']],
    suites: ['lib'], testMappings: [lib('CONFIG-REG-06-C: accepts a closing time equal to the event start')] },
  { id: 'FM15', name: 'checkSettingsForm start rule inverted (a closing time before the start refused, after it accepted)', file: LIB,
    edits: [['if (closesIso && !errors.registrationClosesAt && Date.parse(closesIso) > Date.parse(startsAt))', 'if (closesIso && !errors.registrationClosesAt && Date.parse(closesIso) < Date.parse(startsAt))']],
    suites: ['lib'], testMappings: [lib('CONFIG-REG-06-C: accepts 17:59 on the start day'),
      lib('CONFIG-REG-06-C: refuses 18:01 on the start day')] },
  { id: 'FM16', name: 'enabling accepted without its period (completeness check removed)', file: LIB,
    edits: [['  if (values.enabled) {', '  if (false) {']],
    suites: ['lib'], testMappings: [lib('CONFIG-REG-01-E: refuses enabling without an opening time')] },
  { id: 'FM17', name: 'disabling refused without its period (completeness check applied to a disabled event)', file: LIB,
    edits: [['  if (values.enabled) {', '  if (true) {']],
    suites: ['lib'], testMappings: [lib('CONFIG-REG-01-B: accepts disabling without dates')] },
  { id: 'FM18', name: 'the request sent with version 0 instead of the version the form loaded', file: LIB,
    edits: [['{ registrationEnabled: values.enabled, version, capacity }', '{ registrationEnabled: values.enabled, version: 0, capacity }']],
    suites: ['lib'], testMappings: [lib('CONFIG-REG-01-A: builds the request from SET-OK with the loaded version')] },
];
