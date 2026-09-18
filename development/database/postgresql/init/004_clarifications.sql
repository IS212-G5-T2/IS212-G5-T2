-- SPM-39: Coordinator clarification/amendment requests on event requests.
-- Adds coordinator assignment to events, allows the review statuses a
-- clarification request can move an event through, and introduces a
-- clarification/reply thread plus a minimal notifications table.
--
-- No endpoint writes coordinator_id yet (assigning a coordinator is a
-- separate, unticketed feature); it must be populated directly until that
-- ships. See services/backend/HANDOVER.md for details.

ALTER TABLE events
    ADD COLUMN IF NOT EXISTS coordinator_id text,
    ADD COLUMN IF NOT EXISTS coordinator_name text;

-- Status is stored Title_Case so `.toLowerCase()` in EventsService produces
-- exactly the frontend's snake_case EventStatus values (e.g. 'Under_Review'
-- -> 'under_review'); a space would lowercase to 'under review' and break
-- that contract.
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_status_check;
ALTER TABLE events
    ADD CONSTRAINT events_status_check
    CHECK (status IN ('Submitted', 'Under_Review', 'Approved'));

CREATE TABLE IF NOT EXISTS event_comments (
    id uuid PRIMARY KEY,
    event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    parent_id uuid REFERENCES event_comments (id) ON DELETE CASCADE,
    type text NOT NULL CHECK (type IN ('clarification', 'reply')),
    author_id text NOT NULL,
    author_name text NOT NULL,
    author_role text NOT NULL CHECK (author_role IN ('coordinator', 'organiser')),
    message text NOT NULL CHECK (length(btrim(message)) > 0),
    awaiting_reply boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (
        (type = 'clarification' AND parent_id IS NULL) OR
        (type = 'reply' AND parent_id IS NOT NULL)
    ),
    CHECK (type = 'clarification' OR awaiting_reply = false)
);
CREATE INDEX IF NOT EXISTS event_comments_event_created_idx ON event_comments (event_id, created_at);
CREATE INDEX IF NOT EXISTS event_comments_parent_idx ON event_comments (parent_id);

CREATE TABLE IF NOT EXISTS notifications (
    id uuid PRIMARY KEY,
    recipient_id text NOT NULL,
    type text NOT NULL,
    message text NOT NULL,
    related_event_id uuid REFERENCES events (id) ON DELETE CASCADE,
    read boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_recipient_created_idx ON notifications (recipient_id, created_at DESC);
