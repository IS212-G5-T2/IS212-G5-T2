// SPM-121 Update Venue Records frontend mutants, run by run.mjs with --mutants spm121.mutants.mjs.
export const SUITES = {
  spm121: {
    args: [
      'run',
      'src/features/venues/pages/edit/VenueEditPage.test.tsx',
      'src/features/venues/pages/records/detail/VenueRecordDetailPage.test.tsx',
      'src/store/useAppStore.venues.test.ts',
    ],
  },
};

const PAGE = 'src/features/venues/pages/edit/VenueEditPage.tsx';
const DETAIL = 'src/features/venues/pages/records/detail/VenueRecordDetailPage.tsx';
const STORE = 'src/store/useAppStore.ts';
const suites = ['spm121'];

export const MUTANTS = [
  {
    id: 'FE-121-01',
    name: 'load error alert never shown — load failure is silently swallowed',
    file: PAGE,
    suites,
    testMappings: [{ suite: 'spm121', file: 'src/features/venues/pages/edit/VenueEditPage.test.tsx', title: 'VEN-UPD-01-UI-B shows an error when venue load fails' }],
    edits: [['  if (loadError) return <p role="alert" className="p-6 text-danger-600">Venue not found or could not be loaded.</p>;', '  if (false) return <p role="alert" className="p-6 text-danger-600">Venue not found or could not be loaded.</p>;']],
  },
  {
    id: 'FE-121-02',
    name: 'success alert never shown after update',
    file: PAGE,
    suites,
    testMappings: [{ suite: 'spm121', file: 'src/features/venues/pages/edit/VenueEditPage.test.tsx', title: 'VEN-UPD-05-UI-A calls PATCH and shows success message after submission' }],
    edits: [['      {successMessage && (', '      {false && (']],
  },
  {
    id: 'FE-121-03',
    name: 'capacity bookings list never rendered',
    file: PAGE,
    suites,
    testMappings: [{ suite: 'spm121', file: 'src/features/venues/pages/edit/VenueEditPage.test.tsx', title: 'VEN-UPD-09-UI-A shows affected capacity bookings when returned from server' }],
    edits: [['          {capacityBookings.length > 0 && (', '          {false && (']],
  },
  {
    id: 'FE-121-04',
    name: 'validation skipped — required fields not checked before advancing to step 2',
    file: PAGE,
    suites,
    testMappings: [{ suite: 'spm121', file: 'src/features/venues/pages/edit/VenueEditPage.test.tsx', title: 'VEN-UPD-03-UI-A shows a field-specific error when %s is cleared before Continue' }],
    edits: [["      if (!values[field].trim()) next[field] = `${labels[field]} is required.`;", '      // validation removed']],
  },
  {
    id: 'FE-121-05',
    name: 'store uses GET instead of PATCH — update call never mutates',
    file: STORE,
    suites,
    testMappings: [{ suite: 'spm121', file: 'src/store/useAppStore.venues.test.ts', title: 'VEN-UPD-05-STORE-A calls PATCH /venues/:id and returns message with booking lists' }],
    edits: [['      method: "PATCH",', '      method: "GET",']],
  },
  {
    id: 'FE-121-06',
    name: 'store does not pass through capacityBookings — always returns empty list',
    file: STORE,
    suites,
    testMappings: [{ suite: 'spm121', file: 'src/store/useAppStore.venues.test.ts', title: 'VEN-UPD-09-STORE-A passes through capacityBookings returned by the server' }],
    edits: [['return { message: result.message, affectedBookings: result.affectedBookings, capacityBookings: result.capacityBookings };', 'return { message: result.message, affectedBookings: result.affectedBookings, capacityBookings: [] };']],
  },
  {
    id: 'FE-121-07',
    name: 'image replacement ignored — the first uploaded image is kept when a second one is chosen',
    file: PAGE,
    suites,
    testMappings: [{ suite: 'spm121', file: 'src/features/venues/pages/edit/VenueEditPage.test.tsx', title: 'VEN-UPD-02-C-UI replaces image A with image B, saves it and shows B after reopening' }],
    edits: [['      setImage({ name: uploaded.name, type: uploaded.type, size: uploaded.size, dataUrl: uploaded.dataUrl });', '      setImage((old) => old ?? { name: uploaded.name, type: uploaded.type, size: uploaded.size, dataUrl: uploaded.dataUrl });']],
  },
  {
    id: 'FE-121-08',
    name: 'prefill drops the stored operating information — the field opens blank',
    file: PAGE,
    suites,
    testMappings: [{ suite: 'spm121', file: 'src/features/venues/pages/edit/VenueEditPage.test.tsx', title: 'VEN-UPD-01-UI-A pre-fills the form with current venue values after load' }],
    edits: [['          operatingInformation: venue.operatingInformation,', '          operatingInformation: "",']],
  },
  {
    id: 'FE-121-09',
    name: 'Edit Venue link shown to every Venue Staff member, not only the venue owner',
    file: DETAIL,
    suites,
    testMappings: [{ suite: 'spm121', file: 'src/features/venues/pages/records/detail/VenueRecordDetailPage.test.tsx', title: 'VEN-UPD-07-A Edit Venue button is visible to the owner and hidden from another Venue Staff' }],
    edits: [['            {hasRole(user, "venue_staff") && venue.ownerId === user?.id && (', '            {hasRole(user, "venue_staff") && (']],
  },
];
