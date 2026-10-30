export const SUITES = {
  reviewRepository: {
    args: ['run', 'src/venues/repository/venues.repository.spec.ts'],
  },
  reviewService: {
    args: ['run', 'src/venues/venues.service.spec.ts'],
  },
  reviewController: {
    args: ['run', 'src/venues/venues.controller.spec.ts'],
  },
};

const REPOSITORY = 'src/venues/repository/venues.repository.ts';
const REPOSITORY_SPEC = 'backend/src/venues/repository/venues.repository.spec.ts';

export const MUTANTS = [
  {
    id: 'VEN-REV-M01',
    name: 'rejection guard refuses only approved requests, so cancelled, rejected and released requests are overwritten',
    file: REPOSITORY,
    suites: ['reviewRepository'],
    edits: [
      [
        "if (locked.booking.status !== 'pending')",
        "if (locked.booking.status === 'approved')",
      ],
    ],
  },
  {
    id: 'VEN-REV-M02',
    name: 'approval conflict uses <= at the approved booking start boundary',
    file: REPOSITORY,
    suites: ['reviewRepository'],
    kills: [
      `${REPOSITORY_SPEC} :: SPM-55 AC2 refuses approval when an approved booking or blockout overlaps the slot`,
    ],
    edits: [
      [
        "b.id <> $6::uuid\n              AND ((b.status = 'approved' AND\n                (b.request_kind <> 'tentative_hold' OR b.hold_expires_at IS NULL\n                  OR b.hold_expires_at > $7::timestamptz)) OR\n                (b.status = 'pending' AND\n                  (b.hold_expires_at > $7::timestamptz OR\n                   (b.request_kind <> 'tentative_hold' AND EXISTS (\n                    SELECT 1 FROM venue_booking_requests r\n                     WHERE r.event_id = b.event_id AND r.venue_id = b.venue_id\n                   )))))\n              AND b.start_at - make_interval(mins => $4::int)\n                    < $3::timestamptz",
        "b.id <> $6::uuid\n              AND ((b.status = 'approved' AND\n                (b.request_kind <> 'tentative_hold' OR b.hold_expires_at IS NULL\n                  OR b.hold_expires_at > $7::timestamptz)) OR\n                (b.status = 'pending' AND\n                  (b.hold_expires_at > $7::timestamptz OR\n                   (b.request_kind <> 'tentative_hold' AND EXISTS (\n                    SELECT 1 FROM venue_booking_requests r\n                     WHERE r.event_id = b.event_id AND r.venue_id = b.venue_id\n                   )))))\n              AND b.start_at - make_interval(mins => $4::int)\n                    <= $3::timestamptz",
      ],
    ],
  },
  {
    id: 'VEN-REV-M03',
    name: 'approval conflict pads an approved booking start with turnaround minutes instead of setup minutes',
    file: REPOSITORY,
    suites: ['reviewRepository'],
    kills: [
      `${REPOSITORY_SPEC} :: SPM-55 AC2 refuses approval when an approved booking or blockout overlaps the slot`,
    ],
    edits: [
      [
        "b.id <> $6::uuid\n              AND ((b.status = 'approved' AND\n                (b.request_kind <> 'tentative_hold' OR b.hold_expires_at IS NULL\n                  OR b.hold_expires_at > $7::timestamptz)) OR\n                (b.status = 'pending' AND\n                  (b.hold_expires_at > $7::timestamptz OR\n                   (b.request_kind <> 'tentative_hold' AND EXISTS (\n                    SELECT 1 FROM venue_booking_requests r\n                     WHERE r.event_id = b.event_id AND r.venue_id = b.venue_id\n                   )))))\n              AND b.start_at - make_interval(mins => $4::int)",
        "b.id <> $6::uuid\n              AND ((b.status = 'approved' AND\n                (b.request_kind <> 'tentative_hold' OR b.hold_expires_at IS NULL\n                  OR b.hold_expires_at > $7::timestamptz)) OR\n                (b.status = 'pending' AND\n                  (b.hold_expires_at > $7::timestamptz OR\n                   (b.request_kind <> 'tentative_hold' AND EXISTS (\n                    SELECT 1 FROM venue_booking_requests r\n                     WHERE r.event_id = b.event_id AND r.venue_id = b.venue_id\n                   )))))\n              AND b.start_at - make_interval(mins => $5::int)",
      ],
    ],
  },
  {
    id: 'VEN-REV-M04',
    name: 'approval audit insert drops the action value, so the column count no longer matches',
    file: REPOSITORY,
    suites: ['reviewRepository'],
    kills: [
      `${REPOSITORY_SPEC} :: approves a pending request and writes the audit row with the actor`,
    ],
    edits: [
      ["VALUES ($1::uuid, $2::uuid, 'approved')", 'VALUES ($1::uuid, $2::uuid)'],
    ],
  },
  {
    id: 'VEN-REV-M05',
    name: 'the staff list status filter drops approved and rejected requests, so decided bookings vanish from the list',
    file: REPOSITORY,
    suites: ['reviewRepository'],
    kills: [
      `${REPOSITORY_SPEC} :: SPM-55 AC1 lists pending/approved/rejected requests for owned venues ordered by event start`,
    ],
    edits: [
      [
        "WHERE v.owner_user_id::text = $1::text AND b.status IN ('pending', 'approved', 'rejected')",
        "WHERE v.owner_user_id::text = $1::text AND b.status IN ('pending')",
      ],
    ],
  },
  {
    id: 'VEN-REV-M09',
    name: 'the Venue update permission is not checked before the pending list and decisions',
    file: 'src/venues/venues.service.ts',
    suites: ['reviewService'],
    edits: [
      [
        "!(await this.rbac.hasPermission('VENUE_STAFF', 'Venue', 'update'))",
        'false',
      ],
    ],
  },
  {
    id: 'VEN-REV-M10',
    name: 'the rejection reason is stored without trimming surrounding whitespace',
    file: 'src/venues/venues.service.ts',
    suites: ['reviewService'],
    edits: [
      [
        "const trimmed = typeof reason === 'string' ? reason.trim() : '';",
        "const trimmed = typeof reason === 'string' ? reason : '';",
      ],
    ],
  },
  {
    id: 'VEN-REV-M11',
    name: 'the rejection reason limit accepts one character more than 1000',
    file: 'src/venues/venues.service.ts',
    suites: ['reviewService'],
    edits: [
      [
        'if (trimmed.length > REJECTION_REASON_MAX_LENGTH)',
        'if (trimmed.length > REJECTION_REASON_MAX_LENGTH + 1)',
      ],
    ],
  },
  {
    id: 'VEN-REV-M12',
    name: 'the reject route drops the submitted body, so the reason never reaches the service',
    file: 'src/venues/venues.controller.ts',
    suites: ['reviewController'],
    edits: [
      [
        'return this.venues.rejectVenueBooking(\n      request[CURRENT_USER_REQUEST_KEY],\n      bookingId,\n      body,',
        'return this.venues.rejectVenueBooking(\n      request[CURRENT_USER_REQUEST_KEY],\n      bookingId,\n      undefined,',
      ],
    ],
  },
  {
    id: 'VEN-REV-M14',
    name: 'the ownership lookup receives the staff id and the booking id in swapped order (P01)',
    file: REPOSITORY,
    suites: ['reviewRepository'],
    kills: [
      `${REPOSITORY_SPEC} :: approves a pending request and writes the audit row with the actor`,
      `${REPOSITORY_SPEC} :: SPM-55 AC3 AC5 rejects a pending request, storing the reason and an audit row`,
    ],
    edits: [
      [
        '      [bookingId, staffId],\n    );\n    const venueId = owned.rows[0]?.venue_id;',
        '      [staffId, bookingId],\n    );\n    const venueId = owned.rows[0]?.venue_id;',
      ],
    ],
  },
  {
    id: 'VEN-REV-M15',
    name: 'the approval UPDATE receives the staff id instead of the booking id (P02)',
    file: REPOSITORY,
    suites: ['reviewRepository'],
    kills: [
      `${REPOSITORY_SPEC} :: approves a pending request and writes the audit row with the actor`,
    ],
    edits: [
      [
        "request_kind, hold_expires_at`,\n        [\n          bookingId,\n          new Date(this.clock.now().getTime() + 14 * 24 * 60 * 60 * 1000),",
        "request_kind, hold_expires_at`,\n        [\n          staffId,\n          new Date(this.clock.now().getTime() + 14 * 24 * 60 * 60 * 1000),",
      ],
    ],
  },
  {
    id: 'VEN-REV-M16',
    name: 'the approval UPDATE WHERE clause also matches every booking (P03)',
    file: REPOSITORY,
    suites: ['reviewRepository'],
    kills: [
      `${REPOSITORY_SPEC} :: approves a pending request and writes the audit row with the actor`,
    ],
    edits: [
      [
        "ELSE hold_expires_at\n                END\n          WHERE id = $1::uuid",
        "ELSE hold_expires_at\n                END\n          WHERE id = id OR id = $1::uuid",
      ],
    ],
  },
  {
    id: 'VEN-REV-M17',
    name: 'the approval audit insert runs on the pool instead of the transaction client, outside the transaction (P05)',
    file: REPOSITORY,
    suites: ['reviewRepository'],
    kills: [
      `${REPOSITORY_SPEC} :: approves a pending request and writes the audit row with the actor`,
    ],
    edits: [
      [
        "await client.query(\n        `INSERT INTO booking_review_log (booking_id, actor_user_id, action)\n         VALUES ($1::uuid, $2::uuid, 'approved')`",
        "await this.database.query(\n        `INSERT INTO booking_review_log (booking_id, actor_user_id, action)\n         VALUES ($1::uuid, $2::uuid, 'approved')`",
      ],
    ],
  },
  {
    id: 'VEN-REV-M18',
    name: 'the rejection UPDATE WHERE clause also matches every booking',
    file: REPOSITORY,
    suites: ['reviewRepository'],
    kills: [
      `${REPOSITORY_SPEC} :: SPM-55 AC3 AC5 rejects a pending request, storing the reason and an audit row`,
    ],
    edits: [
      [
        "SET status = 'rejected', rejection_reason = $2\n          WHERE id = $1::uuid",
        "SET status = 'rejected', rejection_reason = $2\n          WHERE id = id OR id = $1::uuid",
      ],
    ],
  },
  {
    id: 'VEN-REV-M19',
    name: 'the rejection UPDATE writes the approved status instead of the rejected status',
    file: REPOSITORY,
    suites: ['reviewRepository'],
    kills: [
      `${REPOSITORY_SPEC} :: SPM-55 AC3 AC5 rejects a pending request, storing the reason and an audit row`,
    ],
    edits: [
      [
        "SET status = 'rejected', rejection_reason = $2",
        "SET status = 'approved', rejection_reason = $2",
      ],
    ],
  },
  {
    id: 'VEN-REV-M20',
    name: 'the rejection UPDATE stores the reason without changing the booking status',
    file: REPOSITORY,
    suites: ['reviewRepository'],
    kills: [
      `${REPOSITORY_SPEC} :: SPM-55 AC3 AC5 rejects a pending request, storing the reason and an audit row`,
    ],
    edits: [
      ["SET status = 'rejected', rejection_reason = $2", 'SET rejection_reason = $2'],
    ],
  },
  {
    id: 'VEN-REV-M21',
    name: 'the rejection audit insert runs on the pool instead of the transaction client, outside the transaction',
    file: REPOSITORY,
    suites: ['reviewRepository'],
    kills: [
      `${REPOSITORY_SPEC} :: SPM-55 AC3 AC5 rejects a pending request, storing the reason and an audit row`,
    ],
    edits: [
      [
        "await client.query(\n        `INSERT INTO booking_review_log (booking_id, actor_user_id, action, reason)",
        "await this.database.query(\n        `INSERT INTO booking_review_log (booking_id, actor_user_id, action, reason)",
      ],
    ],
  },
  {
    id: 'VEN-REV-M22',
    name: 'the rejection UPDATE runs on the pool instead of the transaction client, outside the transaction',
    file: REPOSITORY,
    suites: ['reviewRepository'],
    kills: [
      `${REPOSITORY_SPEC} :: SPM-55 AC3 AC5 rejects a pending request, storing the reason and an audit row`,
    ],
    edits: [
      [
        "const updated = await client.query<BookingDecisionRow>(\n        `UPDATE venue_bookings SET status = 'rejected'",
        "const updated = await this.database.query<BookingDecisionRow>(\n        `UPDATE venue_bookings SET status = 'rejected'",
      ],
    ],
  },
  {
    id: 'VEN-REV-M23',
    name: 'the rejection runs without a database transaction, so its statements autocommit separately',
    file: REPOSITORY,
    suites: ['reviewRepository'],
    kills: [
      `${REPOSITORY_SPEC} :: SPM-55 AC3 AC5 rejects a pending request, storing the reason and an audit row`,
    ],
    edits: [
      [
        "return this.database.transaction(async (client) => {\n      const locked = await this.lockOwnedBooking(client, staffId, bookingId);\n      if (!locked) return { kind: 'not-found' as const };\n      if (locked.booking.status !== 'pending')",
        "return (async (client) => {\n      const locked = await this.lockOwnedBooking(client, staffId, bookingId);\n      if (!locked) return { kind: 'not-found' as const };\n      if (locked.booking.status !== 'pending')",
      ],
      [
        "      };\n    });\n  }\n\n  /**\n   * Locks the venue",
        "      };\n    })(this.database);\n  }\n\n  /**\n   * Locks the venue",
      ],
    ],
  },
  {
    id: 'VEN-REV-M24',
    name: "the ownership lookup accepts any booking id, so a staff member can decide another venue's booking",
    file: REPOSITORY,
    suites: ['reviewRepository'],
    kills: [
      `${REPOSITORY_SPEC} :: approves a pending request and writes the audit row with the actor`,
      `${REPOSITORY_SPEC} :: SPM-55 AC3 AC5 rejects a pending request, storing the reason and an audit row`,
    ],
    edits: [
      [
        'WHERE b.id = $1::uuid AND v.owner_user_id::text = $2::text',
        'WHERE $1::uuid IS NOT NULL AND v.owner_user_id::text = $2::text',
      ],
    ],
  },
  {
    id: 'VEN-REV-M25',
    name: 'the approval blockout check drops the venue predicate, so approval ignores venue blockouts',
    file: REPOSITORY,
    suites: ['reviewRepository'],
    kills: [
      `${REPOSITORY_SPEC} :: SPM-55 AC2 refuses approval when an approved booking or blockout overlaps the slot`,
    ],
    edits: [
      [
        "      }\n\n      const conflict = await client.query<{ reason: string }>(\n        `SELECT reason FROM (\n           SELECT COALESCE(reason, 'Venue unavailable') AS reason\n             FROM venue_bookings\n            WHERE venue_id = $1::uuid AND status = 'blocked'",
        "      }\n\n      const conflict = await client.query<{ reason: string }>(\n        `SELECT reason FROM (\n           SELECT COALESCE(reason, 'Venue unavailable') AS reason\n             FROM venue_bookings\n            WHERE false AND venue_id = $1::uuid AND status = 'blocked'",
      ],
    ],
  },
  {
    id: 'VEN-REV-M26',
    name: 'the coordinator list drops the stored rejection reason from its projection',
    file: REPOSITORY,
    suites: ['reviewRepository'],
    kills: [
      `${REPOSITORY_SPEC} :: SPM-55 AC4 returns the rejection reason for coordinator bookings`,
    ],
    edits: [
      [
        "b.special_request, b.created_at,\n              b.rejection_reason,\n",
        "b.special_request, b.created_at,\n",
      ],
    ],
  },
  {
    id: 'VEN-REV-M27',
    name: "the ownership lookup WHERE clause also matches any booking with a pending status",
    file: REPOSITORY,
    suites: ['reviewRepository'],
    kills: [
      `${REPOSITORY_SPEC} :: approves a pending request and writes the audit row with the actor`,
      `${REPOSITORY_SPEC} :: SPM-55 AC3 AC5 rejects a pending request, storing the reason and an audit row`,
    ],
    edits: [
      [
        "v.owner_user_id::text = $2::text`,",
        "v.owner_user_id::text = $2::text OR b.status = 'pending'`,",
      ],
    ],
  },
  {
    id: 'VEN-REV-M28',
    name: 'the staff list status filter also includes cancelled requests',
    file: REPOSITORY,
    suites: ['reviewRepository'],
    kills: [
      `${REPOSITORY_SPEC} :: SPM-55 AC1 lists pending/approved/rejected requests for owned venues ordered by event start`,
    ],
    edits: [
      [
        "WHERE v.owner_user_id::text = $1::text AND b.status IN ('pending', 'approved', 'rejected')\n        ORDER BY b.start_at ASC, b.id`",
        "WHERE v.owner_user_id::text = $1::text AND b.status IN ('pending', 'approved', 'rejected', 'cancelled')\n        ORDER BY b.start_at ASC, b.id`",
      ],
    ],
  },
  {
    id: 'VEN-REV-M29',
    name: 'the coordinator list joins the staff user on the coordinator id instead of the venue owner',
    file: REPOSITORY,
    suites: ['reviewRepository'],
    kills: [
      `${REPOSITORY_SPEC} :: SPM-55 AC4 returns the rejection reason for coordinator bookings`,
    ],
    edits: [
      [
        'JOIN users u ON u.id = v.owner_user_id',
        'JOIN users u ON u.id::text = e.coordinator_id',
      ],
    ],
  },
  {
    id: 'VEN-REV-M30',
    name: 'the ownership lookup joins venues on true, so the owner check no longer ties the booking to its venue',
    file: REPOSITORY,
    suites: ['reviewRepository'],
    kills: [
      `${REPOSITORY_SPEC} :: approves a pending request and writes the audit row with the actor`,
      `${REPOSITORY_SPEC} :: SPM-55 AC3 AC5 rejects a pending request, storing the reason and an audit row`,
    ],
    edits: [
      [
        'SELECT b.venue_id FROM venue_bookings b\n         JOIN venues v ON v.id = b.venue_id',
        'SELECT b.venue_id FROM venue_bookings b\n         JOIN venues v ON true',
      ],
    ],
  },
  {
    id: 'VEN-REV-M31',
    name: 'the pending list joins venues on true, so any Venue Staff member sees every pending request',
    file: REPOSITORY,
    suites: ['reviewRepository'],
    kills: [
      `${REPOSITORY_SPEC} :: SPM-55 AC1 lists pending/approved/rejected requests for owned venues ordered by event start`,
    ],
    edits: [
      [
        'FROM venue_bookings b\n         JOIN venues v ON v.id = b.venue_id\n         JOIN events e ON e.id = b.event_id\n         JOIN users coordinator_user',
        'FROM venue_bookings b\n         JOIN venues v ON true\n         JOIN events e ON e.id = b.event_id\n         JOIN users coordinator_user',
      ],
    ],
  },
  {
    id: 'VEN-REV-M32',
    name: 'the pending list names the venue owner as the coordinator instead of the event coordinator',
    file: REPOSITORY,
    suites: ['reviewRepository'],
    kills: [
      `${REPOSITORY_SPEC} :: SPM-55 AC1 lists pending/approved/rejected requests for owned venues ordered by event start`,
    ],
    edits: [
      [
        'JOIN users coordinator_user ON coordinator_user.id::text = e.coordinator_id',
        'JOIN users coordinator_user ON coordinator_user.id::text = v.owner_user_id::text',
      ],
    ],
  },
  // retired: the pending list no longer joins venue booking requests (it reads venue_bookings directly on dev too), so this mutant has no target.
  // {
  // id: 'VEN-REV-M33',
  // name: 'the pending list drops the request-to-venue match, so special requests from other venues can attach',
  // file: REPOSITORY,
  // suites: ['reviewRepository'],
  // kills: [
  // `${REPOSITORY_SPEC} :: SPM-55 AC1 lists pending/approved/rejected requests for owned venues ordered by event start`,
  // ],
  // edits: [
  // [
  // 'LEFT JOIN venue_booking_requests r ON r.event_id = b.event_id AND r.venue_id = b.venue_id\n        WHERE v.owner_user_id::text',
  // 'LEFT JOIN venue_booking_requests r ON r.event_id = b.event_id\n        WHERE v.owner_user_id::text',
  // ],
  // ],
  // },
  {
    id: 'VEN-REV-M34',
    name: "the Venue Staff gate checks the read permission instead of the Venue update permission",
    file: 'src/venues/venues.service.ts',
    suites: ['reviewService'],
    kills: [
      `backend/src/venues/venues.service.spec.ts :: SPM-55 AC1 lists pending requests for Venue Staff and rejects other callers before any query`,
    ],
    edits: [
      [
        "this.rbac.hasPermission('VENUE_STAFF', 'Venue', 'update')",
        "this.rbac.hasPermission('VENUE_STAFF', 'Venue', 'read')",
      ],
    ],
  },
  {
    id: 'VEN-REV-M35',
    name: 'the venue row lock targets every other venue instead of the booking venue',
    file: REPOSITORY,
    suites: ['reviewRepository'],
    kills: [
      `${REPOSITORY_SPEC} :: approves a pending request and writes the audit row with the actor`,
      `${REPOSITORY_SPEC} :: SPM-55 AC3 AC5 rejects a pending request, storing the reason and an audit row`,
    ],
    edits: [
      [
        'FROM venues\n        WHERE id = $1::uuid FOR UPDATE',
        'FROM venues\n        WHERE id <> $1::uuid FOR UPDATE',
      ],
    ],
  },
  {
    id: 'VEN-REV-M36',
    name: 'the booking row lock targets every other booking instead of the decided booking',
    file: REPOSITORY,
    suites: ['reviewRepository'],
    kills: [
      `${REPOSITORY_SPEC} :: approves a pending request and writes the audit row with the actor`,
      `${REPOSITORY_SPEC} :: SPM-55 AC3 AC5 rejects a pending request, storing the reason and an audit row`,
    ],
    edits: [
      [
        'WHERE b.id = $1::uuid FOR UPDATE OF b',
        'WHERE b.id <> $1::uuid FOR UPDATE OF b',
      ],
    ],
  },
  {
    id: 'VEN-REV-M37',
    name: 'the approved-booking conflict check ignores the venue and compares bookings from every venue',
    file: REPOSITORY,
    suites: ['reviewRepository'],
    kills: [
      `${REPOSITORY_SPEC} :: SPM-55 AC2 refuses approval when an approved booking or blockout overlaps the slot`,
    ],
    edits: [
      [
        "WHERE b.venue_id = $1::uuid AND b.id <> $6::uuid",
        "WHERE b.venue_id IS NOT NULL AND b.id <> $6::uuid",
      ],
    ],
  },
  {
    id: 'VEN-REV-M38',
    name: 'the pending list drops the owner filter, so any Venue Staff member sees every venue request',
    file: REPOSITORY,
    suites: ['reviewRepository'],
    kills: [
      `${REPOSITORY_SPEC} :: SPM-55 AC1 lists pending/approved/rejected requests for owned venues ordered by event start`,
    ],
    edits: [
      [
        "WHERE v.owner_user_id::text = $1::text AND b.status IN ('pending', 'approved', 'rejected')",
        "WHERE b.status IN ('pending', 'approved', 'rejected')",
      ],
    ],
  },
  {
    id: 'VEN-REV-M43',
    name: 'a failed audit insert is swallowed on approval and rejection, so the decision reports success without a review-log row or rollback',
    file: REPOSITORY,
    suites: ['reviewRepository'],
    kills: [
      `${REPOSITORY_SPEC} :: SPM-55 AC5 rolls back and rejects the approval when the audit insert fails`,
      `${REPOSITORY_SPEC} :: SPM-55 AC5 rolls back and rejects the rejection when the audit insert fails`,
    ],
    edits: [
      [
        "      await client.query(\n        `INSERT INTO booking_review_log (booking_id, actor_user_id, action)\n         VALUES ($1::uuid, $2::uuid, 'approved')`,\n        [bookingId, staffId],\n      );",
        "      try {\n        await client.query(\n          `INSERT INTO booking_review_log (booking_id, actor_user_id, action)\n           VALUES ($1::uuid, $2::uuid, 'approved')`,\n          [bookingId, staffId],\n        );\n      } catch {\n        // Mutant: the audit failure is ignored.\n      }",
      ],
      [
        "      await client.query(\n        `INSERT INTO booking_review_log (booking_id, actor_user_id, action, reason)\n         VALUES ($1::uuid, $2::uuid, 'rejected', $3)`,\n        [bookingId, staffId, reason],\n      );",
        "      try {\n        await client.query(\n          `INSERT INTO booking_review_log (booking_id, actor_user_id, action, reason)\n           VALUES ($1::uuid, $2::uuid, 'rejected', $3)`,\n          [bookingId, staffId, reason],\n        );\n      } catch {\n        // Mutant: the audit failure is ignored.\n      }",
      ],
    ],
  },
];
