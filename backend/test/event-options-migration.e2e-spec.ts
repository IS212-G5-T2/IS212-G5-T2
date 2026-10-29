import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/*
 * SPM-156 follow-up: migration 027 retires event facility and accessibility values the
 * venue schema no longer has (EVENT-UPDATE-08-A, 08-SEC-1). Real PostgreSQL; needs
 * DATABASE_URL (or TEST_DATABASE_URL) with database/postgresql/init 001 to 027 applied.
 * The suite applies backend/migrations/001_event_drafts.sql itself so drafts are covered.
 */

const database = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!database && process.env.CI)
  throw new Error(
    'SPM-156 migration tests must run in CI: set TEST_DATABASE_URL or DATABASE_URL.',
  );

const migration = () =>
  readFile(
    new URL(
      '../migrations/027_spm156_retire_legacy_event_options.sql',
      import.meta.url,
    ),
    'utf8',
  );

describe.skipIf(!database)(
  'SPM-156 migration 027: retired event options (e2e)',
  () => {
    let pool: pg.Pool;
    const eventIds: string[] = [];
    const draftIds: string[] = [];

    beforeAll(async () => {
      pool = new pg.Pool({ connectionString: database });
      await pool.query(
        await readFile(
          new URL('../migrations/001_event_drafts.sql', import.meta.url),
          'utf8',
        ),
      );
    });

    afterAll(async () => {
      if (draftIds.length)
        await pool.query(
          'DELETE FROM event_drafts WHERE id = ANY($1::uuid[])',
          [draftIds],
        );
      if (eventIds.length)
        await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [
          eventIds,
        ]);
      await pool.end();
    });

    async function insertEvent(accessibility: string[], facilities: string[]) {
      const id = randomUUID();
      eventIds.push(id);
      await pool.query(
        `INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name, purpose, description,
         start_date_time, end_date_time, expected_attendance, preferred_room_layout, required_facilities,
         accessibility_needs, equipment_needs, status, submission_key)
       VALUES ($1,'org-156','Organiser','org@example.test','Retired Options Evening','Purpose','Description',
               '2031-05-01T10:00:00Z','2031-05-01T12:00:00Z',40,'Classroom',$2,$3,'None','Planning',$4)`,
        [id, facilities, accessibility, randomUUID()],
      );
      return id;
    }

    /** EVENT-UPDATE-08-A: renamed, removed and de-duplicated in events, change requests and drafts; current values kept. */
    it('EVENT-UPDATE-08-A rewrites retired values in events, change requests and drafts, keeping order', async () => {
      const eventId = await insertEvent(
        [
          'Wheelchair ramps',
          'Hearing loop',
          'Quiet room',
          'Wheelchair access',
          'Step-free access',
        ],
        [
          'PA System',
          'Projector',
          'Sink access',
          'AV System',
          'First aid station',
        ],
      );
      const current = await insertEvent(['Hearing loop'], ['Wi-Fi']);
      const requestId = randomUUID();
      await pool.query(
        `INSERT INTO event_change_requests (id, event_id, requested_by_id, requested_by, changes, status)
       VALUES ($1,$2,'org-156','Organiser',$3::jsonb,'Pending')`,
        [
          requestId,
          eventId,
          JSON.stringify([
            {
              field: 'description',
              originalValue: 'Description',
              proposedValue: 'Wheelchair ramps talk',
            },
            {
              field: 'accessibility',
              originalValue: ['Wheelchair ramps', 'Hearing loop'],
              proposedValue: ['Step-free access', 'Quiet room'],
            },
            {
              field: 'facilities',
              originalValue: ['PA System'],
              proposedValue: ['Sink access', 'Wi-Fi'],
            },
          ]),
        ],
      );
      const draftId = randomUUID();
      draftIds.push(draftId);
      await pool.query(
        `INSERT INTO event_drafts (id, organiser_id, fields) VALUES ($1,'org-156',$2::jsonb)`,
        [
          draftId,
          JSON.stringify({
            name: 'Draft',
            accessibility: ['Wheelchair ramps', 'Elevator access'],
            facilities: ['First aid station', 'Catering'],
          }),
        ],
      );

      await pool.query(await migration());

      const event = await pool.query(
        'SELECT id, accessibility_needs, required_facilities FROM events WHERE id = ANY($1::uuid[])',
        [[eventId, current]],
      );
      const byId = Object.fromEntries(event.rows.map((row) => [row.id, row]));
      expect(byId[eventId].accessibility_needs).toEqual([
        'Wheelchair access',
        'Hearing loop',
      ]);
      expect(byId[eventId].required_facilities).toEqual([
        'AV System',
        'Projector',
      ]);
      // Rows with only current values are left as they were.
      expect(byId[current].accessibility_needs).toEqual(['Hearing loop']);
      expect(byId[current].required_facilities).toEqual(['Wi-Fi']);

      const request = await pool.query(
        'SELECT changes FROM event_change_requests WHERE id = $1',
        [requestId],
      );
      expect(request.rows[0].changes).toEqual([
        // Free text is never touched.
        {
          field: 'description',
          originalValue: 'Description',
          proposedValue: 'Wheelchair ramps talk',
        },
        {
          field: 'accessibility',
          originalValue: ['Wheelchair access', 'Hearing loop'],
          proposedValue: ['Wheelchair access'],
        },
        {
          field: 'facilities',
          originalValue: ['AV System'],
          proposedValue: ['Wi-Fi'],
        },
      ]);

      const draft = await pool.query(
        'SELECT fields FROM event_drafts WHERE id = $1',
        [draftId],
      );
      expect(draft.rows[0].fields).toEqual({
        name: 'Draft',
        accessibility: ['Wheelchair access', 'Elevator access'],
        facilities: ['Catering'],
      });
    });

    /** EVENT-UPDATE-08-SEC-1: running the migration again changes nothing. */
    it('EVENT-UPDATE-08-SEC-1 is idempotent', async () => {
      const eventId = await insertEvent(['Wheelchair ramps'], ['PA System']);
      await pool.query(await migration());
      const first = await pool.query(
        'SELECT accessibility_needs, required_facilities, updated_at FROM events WHERE id = $1',
        [eventId],
      );
      await pool.query(await migration());
      const second = await pool.query(
        'SELECT accessibility_needs, required_facilities, updated_at FROM events WHERE id = $1',
        [eventId],
      );
      expect(second.rows[0]).toEqual(first.rows[0]);
      expect(first.rows[0].accessibility_needs).toEqual(['Wheelchair access']);
      expect(first.rows[0].required_facilities).toEqual(['AV System']);
    });

    /**
     * EVENT-UPDATE-08-A: only active reference options are kept; drafts that were already
     * submitted, the change request audit log and change history keep what was stored then.
     */
    it('EVENT-UPDATE-08-A keeps only active options and leaves submitted drafts, audit and history unchanged', async () => {
      const tag = randomUUID().slice(0, 8);
      const inactiveFacility = `Retired stage ${tag}`;
      const inactiveFeature = `Retired ramp ${tag}`;
      await pool.query(
        `INSERT INTO facilities (name, category, is_active) VALUES ($1, 'Test', false)`,
        [inactiveFacility],
      );
      await pool.query(
        `INSERT INTO accessibility_features (id, label, is_active) VALUES ($1, $2, false)`,
        [`spm156-${tag}`, inactiveFeature],
      );
      try {
        const eventId = await insertEvent(
          [inactiveFeature, 'Hearing loop'],
          [inactiveFacility, 'Projector'],
        );
        const submittedDraft = randomUUID();
        draftIds.push(submittedDraft);
        const draftFields = {
          name: 'Submitted',
          accessibility: ['Wheelchair ramps'],
          facilities: ['PA System'],
        };
        await pool.query(
          `INSERT INTO event_drafts (id, organiser_id, fields, status, event_id)
           VALUES ($1,'org-156',$2::jsonb,'Submitted',$3)`,
          [submittedDraft, JSON.stringify(draftFields), eventId],
        );
        const requestId = randomUUID();
        const auditChanges = [
          {
            field: 'accessibility',
            originalValue: ['Wheelchair ramps'],
            proposedValue: ['Step-free access'],
          },
        ];
        await pool.query(
          `INSERT INTO event_change_requests (id, event_id, requested_by_id, requested_by, changes, status)
           VALUES ($1,$2,'org-156','Organiser',$3::jsonb,'Pending')`,
          [requestId, eventId, JSON.stringify(auditChanges)],
        );
        await pool.query(
          `INSERT INTO event_change_request_audit
             (id, change_request_id, event_id, outcome, changes, requested_by_id, requested_by, decided_by, decided_at)
           VALUES ($1,$2,$3,'Approved',$4::jsonb,'org-156','Organiser','Coordinator',now())`,
          [randomUUID(), requestId, eventId, JSON.stringify(auditChanges)],
        );
        await pool.query(
          `INSERT INTO event_flagged_changes
             (id, event_id, kind, field, original_value, proposed_value, status, proposed_by, proposed_by_id, resolved_by, resolved_by_id, resolved_at)
           VALUES ($1,$2,'direct_update','accessibility','["Wheelchair ramps"]'::jsonb,'["PA System"]'::jsonb,'Applied','Coordinator','coord-156','Coordinator','coord-156',now())`,
          [randomUUID(), eventId],
        );

        await pool.query(await migration());

        const event = await pool.query(
          'SELECT accessibility_needs, required_facilities FROM events WHERE id = $1',
          [eventId],
        );
        expect(event.rows[0]).toEqual({
          accessibility_needs: ['Hearing loop'],
          required_facilities: ['Projector'],
        });
        const draft = await pool.query(
          'SELECT fields FROM event_drafts WHERE id = $1',
          [submittedDraft],
        );
        expect(draft.rows[0].fields).toEqual(draftFields);
        const audit = await pool.query(
          'SELECT changes FROM event_change_request_audit WHERE change_request_id = $1',
          [requestId],
        );
        expect(audit.rows[0].changes).toEqual(auditChanges);
        const history = await pool.query(
          'SELECT original_value, proposed_value FROM event_flagged_changes WHERE event_id = $1',
          [eventId],
        );
        expect(history.rows).toEqual([
          {
            original_value: ['Wheelchair ramps'],
            proposed_value: ['PA System'],
          },
        ]);
      } finally {
        await pool.query('DELETE FROM facilities WHERE name = $1', [
          inactiveFacility,
        ]);
        await pool.query(
          'DELETE FROM accessibility_features WHERE label = $1',
          [inactiveFeature],
        );
      }
    });
  },
);
