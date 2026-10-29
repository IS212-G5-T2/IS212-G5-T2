// SPM-83 backend mutants (reject a request with a clear reason), run by the backend runner:
//   node scripts/mutation/run.mjs --mutants spm83.mutants.mjs            # every mutant
// Each edit is [from, to]; `from` must occur exactly once in the file (the runner reports MISAPPLIED otherwise).
// BE-83-01 and the RB mutants come from the SPM-150 cycle-01 test review (review/mutation). Each names the
// behaviour it breaks in the reject path of EventsService.reject.
export const SUITES = {
  rejection: { args: ['run', 'src/events/review/events.reject.spec.ts'] },
};

const SERVICE = 'src/events/events.service.ts';

export const MUTANTS = [{
  id: 'BE-83-01',
  name: 'non-string rejection reasons receive a fabricated valid reason',
  file: SERVICE,
  suites: ['rejection'],
  testMappings: [{
    suite: 'rejection', file: 'src/events/review/events.reject.spec.ts',
    title: 'SPM-83 rejects non-string rejection reason',
  }],
  edits: [[
    "const raw = typeof reason === 'string' ? reason : '';",
    "const raw = typeof reason === 'string' ? reason : 'fabricated valid rejection reason';",
  ]],
}, {
  id: 'RB1',
  name: 'the reason is validated inside the transaction, after the SELECT ... FOR UPDATE (EVENT-REJECT-03-B to 03-F)',
  file: SERVICE,
  suites: ['rejection'],
  edits: [[
    "    const reason = EventsService.validateRejectionReason(\n      typeof data?.reason === 'string' ? data.reason : '',\n    );\n    return this.database.transaction(async (client) => {\n      const selected = await client.query(\n        'SELECT * FROM events WHERE id = $1 FOR UPDATE',\n        [id],\n      );",
    "    return this.database.transaction(async (client) => {\n      const selected = await client.query(\n        'SELECT * FROM events WHERE id = $1 FOR UPDATE',\n        [id],\n      );\n      const reason = EventsService.validateRejectionReason(\n        typeof data?.reason === 'string' ? data.reason : '',\n      );",
  ]],
}, {
  id: 'RB2',
  name: 'reject() drops the malformed-id guard, so a malformed id reaches SQL (EVENT-REJECT-03-G)',
  file: SERVICE,
  suites: ['rejection'],
  edits: [["    this.eventId(id);\n    const data = body as Record<string, unknown> | null;", "    const data = body as Record<string, unknown> | null;"]],
}, {
  id: 'RB6',
  name: 'the assigned-coordinator check is removed from reject(): any coordinator can reject (EVENT-REJECT-04-B)',
  file: SERVICE,
  suites: ['rejection'],
  edits: [[
    "      if (event.coordinator_id !== coordinator.uid)\n        throw new ForbiddenException(\n          'Only the assigned coordinator can reject this request.',\n        );\n      const updated = await client.query(\n        `UPDATE events\n           SET status = 'Rejected',",
    "      const updated = await client.query(\n        `UPDATE events\n           SET status = 'Rejected',",
  ]],
},
  {
    id: 'BE-83-02',
    name: 'the reject refusal reverts to the assignment sentence (EVENT-REJECT-04-B, SC-SPM83-01)',
    file: SERVICE,
    suites: ['rejection'],
    edits: [["'Only the assigned coordinator can reject this request.',", "'This request is assigned to another coordinator.',"]],
  },
  {
    id: 'BE-83-03',
    name: 'a 501-character reason is accepted: the 500-character maximum is dropped (EVENT-REJECT-03-D)',
    file: SERVICE,
    suites: ['rejection'],
    edits: [['      trimmed.length > 500 ||\n', '']],
  },
];
