// SPM-63 frontend mutants, run by run.mjs:  node scripts/testing/mutation/run.mjs --mutants spm63.mutants.mjs
// Each edit is [from, to]; `from` must occur exactly once in the file (the runner reports MISAPPLIED otherwise).
// IDs M15 to M17 and M20 match the task prompt's list; X* are extra mutants added while reviewing the suite.
export const SUITES = {
  // The SPM-63 specs only (helpers, components, the report page and the event-list link).
  spm63: {
    args: [
      'run',
      'src/utils/registrationReport.test.ts',
      'src/components/registrations',
      'src/pages/RegistrationReportPage.test.tsx',
      'src/pages/EventListPage.registrations.test.tsx',
    ],
  },
};

const HOOK = 'src/components/registrations/useRegistrationReport.ts';
const UTIL = 'src/utils/registrationReport.ts';
const PAGE = 'src/pages/RegistrationReportPage.tsx';
const TABLE = 'src/components/registrations/ReportTable.tsx';
const LIST = 'src/pages/EventListPage.tsx';
const suites = ['spm63'];

export const MUTANTS = [
  { id: 'M15', name: 'polling appends rows instead of replacing them', file: HOOK, suites,
    edits: [['if (active) setState({ status: "ready", report });', 'if (active) setState((prev) => (prev.status === "ready" ? { status: "ready", report: { ...report, registrations: [...prev.report.registrations, ...report.registrations] } } : { status: "ready", report }));']] },
  { id: 'M16', name: 'interval not cleared on unmount', file: HOOK, suites,
    edits: [['    return stop;\n  }, [eventId, attempt]);', '    return () => {\n      active = false;\n    };\n  }, [eventId, attempt]);']] },
  { id: 'M17', name: 'a late response for the previous event is applied', file: HOOK, suites,
    edits: [['if (active) setState({ status: "ready", report });', 'setState({ status: "ready", report });']] },
  { id: 'M20', name: 'count wording always plural', file: UTIL, suites,
    edits: [['${count === 1 ? "Attendee" : "Attendees"}', '${"Attendees"}']] },
  { id: 'X1', name: 'poll interval 15 s (over the 10 s limit)', file: UTIL, suites,
    edits: [['REPORT_POLL_INTERVAL_MS = 5_000', 'REPORT_POLL_INTERVAL_MS = 15_000']] },
  { id: 'X2', name: 'a 403 while polling does not clear the rows', file: HOOK, suites,
    edits: [['          stop();\n          setState({ status: "forbidden" });', '          stop();']] },
  { id: 'X3', name: 'a 403 while polling does not stop polling', file: HOOK, suites,
    edits: [['          stop();\n          setState({ status: "forbidden" });', '          setState({ status: "forbidden" });']] },
  { id: 'X4', name: 'a 401 does not end the session', file: HOOK, suites,
    edits: [['          useAppStore.setState({ isAuthenticated: false });\n        } else if (first)', '        } else if (first)']] },
  { id: 'X5', name: 'overlapping requests allowed (in-flight guard removed)', file: HOOK, suites,
    edits: [['      if (inFlight) return;\n', '']] },
  { id: 'X6', name: 'the interval of the previous event is not cleared', file: HOOK, suites,
    edits: [['      active = false;\n      clearInterval(timer);', '      active = false;']] },
  { id: 'X7', name: 'report not refetched when the event changes', file: HOOK, suites,
    edits: [['  }, [eventId, attempt]);', '  }, [attempt]);']] },
  { id: 'X8', name: 'dates formatted in UTC instead of Asia/Singapore', file: UTIL, suites,
    edits: [['  timeZone: "Asia/Singapore",', '  timeZone: "UTC",']] },
  { id: 'X9', name: 'download saved under a client-invented filename', file: UTIL, suites,
    edits: [['filenameFromDisposition(response.headers.get("Content-Disposition")) ?? `${eventId}_registrations.${format}`', '`${eventId}_registrations.${format}`']] },
  { id: 'X10', name: 'download request sent without the session cookie', file: UTIL, suites,
    edits: [['      credentials: "include",\n      signal: AbortSignal.timeout(30_000),', '      signal: AbortSignal.timeout(30_000),']] },
  { id: 'X11', name: 'object URL never revoked', file: UTIL, suites,
    edits: [['  URL.revokeObjectURL(url);\n', '']] },
  { id: 'X12', name: 'export buttons not disabled while downloading (CSV)', file: PAGE, suites,
    edits: [['<Button variant="secondary" disabled={downloading !== null} onClick={() => void exportAs("csv")}>', '<Button variant="secondary" onClick={() => void exportAs("csv")}>']] },
  { id: 'X13', name: 'Export as PDF asks for csv', file: PAGE, suites,
    edits: [['onClick={() => void exportAs("pdf")}', 'onClick={() => void exportAs("csv")}']] },
  { id: 'X14', name: 'the link is offered to everyone', file: LIST, suites,
    edits: [['{canViewRegistrationReport(currentUser, e) && (', '{true && (']] },
  { id: 'X15', name: 'coordinator link compared with the organiser column', file: UTIL, suites,
    edits: [['event.coordinatorId !== undefined && event.coordinatorId === user.id', 'event.organiserId !== undefined && event.organiserId === user.id']] },
  { id: 'X16', name: 'attendee names rendered as HTML', file: TABLE, suites,
    edits: [['<td className="px-4 py-2 text-gray-900 dark:text-gray-100">{row.fullName}</td>', '<td className="px-4 py-2 text-gray-900 dark:text-gray-100" dangerouslySetInnerHTML={{ __html: row.fullName }} />']] },
  { id: 'X17', name: 'SGT suffix dropped from displayed dates', file: UTIL, suites,
    edits: [[':${part("minute")} SGT`;', ':${part("minute")}`;']] },
  { id: 'X18', name: 'spots line always plural', file: UTIL, suites,
    edits: [['${spots === 1 ? "spot" : "spots"}', '${"spots"}']] },
  { id: 'X19', name: 'a failed export is swallowed', file: PAGE, suites,
    edits: [['      setExportError(error instanceof Error ? error.message : "The export failed. Please try again.");', '      void error;']] },
  { id: 'X20', name: 'empty state text changed', file: UTIL, suites,
    edits: [['empty: "No registrations yet",', 'empty: "Nothing here",']] },
  { id: 'X21', name: 'first-load failure not retryable', file: PAGE, suites,
    edits: [['<Button variant="secondary" onClick={retry}>', '<Button variant="secondary" onClick={() => undefined}>']] },
];
