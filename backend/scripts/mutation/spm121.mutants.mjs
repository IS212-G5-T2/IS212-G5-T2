// SPM-121 Update Venue Records mutants, run by run.mjs with --mutants spm121.mutants.mjs.
export const SUITES = {
  unit: {
    args: ['run', 'src/venues/repository/venues.repository.spec.ts', 'src/venues/venues.service.spec.ts'],
  },
  e2e: {
    args: ['run', '--config', './vitest.config.e2e.ts', 'test/venues.e2e-spec.ts'],
    needsEnv: ['DATABASE_URL'],
  },
};

const REPOSITORY = 'src/venues/repository/venues.repository.ts';
const SERVICE = 'src/venues/venues.service.ts';
const UNIT_REPO = 'src/venues/repository/venues.repository.spec.ts';
const UNIT_SVC = 'src/venues/venues.service.spec.ts';
const E2E = 'test/venues.e2e-spec.ts';

export const MUTANTS = [
  {
    id: 'BE-121-01',
    name: 'ownership check removed — any authenticated user can update any venue',
    file: REPOSITORY,
    suites: ['unit', 'e2e'],
    testMappings: [
      { suite: 'unit', file: UNIT_REPO, title: 'VEN-UPD-07-A returns forbidden when the caller is not the venue owner' },
      { suite: 'e2e', file: E2E, title: 'VEN-UPD-07-E2E-A: returns 403 when a second Venue Staff tries to PATCH a venue they do not own' },
    ],
    edits: [[
      '      if (lock.rows[0].owner_user_id !== ownerUserId)\n        return { kind: \'forbidden\' as const };',
      '      // ownership check removed',
    ]],
  },
  {
    id: 'BE-121-02',
    name: 'not-found guard on lock removed — update proceeds even when venue does not exist',
    file: REPOSITORY,
    suites: ['unit'],
    testMappings: [
      { suite: 'unit', file: UNIT_REPO, title: 'VEN-UPD-07-B returns not-found when the venue does not exist' },
    ],
    edits: [[
      '      if (!lock.rows[0]) return { kind: \'not-found\' as const };',
      '      // not-found guard removed',
    ]],
  },
  {
    id: 'BE-121-03',
    name: 'capacityChanged always false — AC9 query never runs regardless of capacity change',
    file: REPOSITORY,
    suites: ['unit', 'e2e'],
    testMappings: [
      { suite: 'unit', file: UNIT_REPO, title: 'VEN-UPD-09-A runs the capacity booking query when capacity changes' },
      { suite: 'e2e', file: E2E, title: 'VEN-UPD-09-E2E-A: lists pending and approved bookings when capacity changes and leaves them intact' },
    ],
    edits: [[
      '      const capacityChanged = lock.rows[0].capacity !== input.capacity;',
      '      const capacityChanged = false;',
    ]],
  },
  {
    id: 'BE-121-04',
    name: 'AC8 overlap query uses zero timing — setup/turnaround time changes never surface affected bookings',
    file: REPOSITORY,
    suites: ['unit', 'e2e'],
    testMappings: [
      { suite: 'unit', file: UNIT_REPO, title: 'VEN-UPD-08-A returns affectedBookings when setup/turnaround causes an overlap' },
      { suite: 'e2e', file: E2E, title: 'VEN-UPD-08-E2E-A: returns affected bookings in affectedBookings when setup/turnaround time changes' },
    ],
    edits: [[
      '        [venueId, input.setupTimeMinutes, input.turnaroundTimeMinutes],',
      '        [venueId, 0, 0],',
    ]],
  },
  {
    id: 'BE-121-05',
    name: 'service forbidden check removed — 403 is never raised for non-owner updates',
    file: SERVICE,
    suites: ['unit'],
    testMappings: [
      { suite: 'unit', file: UNIT_SVC, title: 'VEN-UPD-07-SVC-A returns 403 when the repository says forbidden' },
    ],
    edits: [[
      '    if (result.kind === \'forbidden\')\n      throw new ForbiddenException(\'You can only edit venues you created.\');',
      '    // forbidden check removed',
    ]],
  },
  {
    id: 'BE-121-06',
    name: 'service not-found check removed — 404 is never raised',
    file: SERVICE,
    suites: ['unit'],
    testMappings: [
      { suite: 'unit', file: UNIT_SVC, title: 'VEN-UPD-03-SVC-B returns 404 when the repository says not-found' },
    ],
    edits: [[
      '    if (result.kind === \'not-found\') throw new NotFoundException(\'Venue not found.\');',
      '    // not-found check removed',
    ]],
  },
  {
    id: 'BE-121-07',
    name: 'duplicate constraint check removed — 409 is never raised for a duplicate name+location',
    file: SERVICE,
    suites: ['unit', 'e2e'],
    testMappings: [
      { suite: 'unit', file: UNIT_SVC, title: 'VEN-UPD-04-SVC-A maps the duplicate constraint to 409 with field errors' },
      { suite: 'e2e', file: E2E, title: 'VEN-UPD-04-E2E-A: returns 409 when PATCH would create a duplicate name+location' },
    ],
    edits: [[
      '      result = await this.repository.update(staff.uid, id, input);\n    } catch (error) {\n      if (isDuplicateVenue(error))\n        throw new ConflictException({\n          message: \'A venue with this name and location already exists.\',\n          errors: {\n            name: \'Use a different venue name or location.\',\n            location: \'Use a different venue name or location.\',\n          },\n        });\n      throw error;\n    }',
      '      result = await this.repository.update(staff.uid, id, input);\n    } catch (error) {\n      throw error;\n    }',
    ]],
  },
];
