CREATE TABLE IF NOT EXISTS roles (
    id integer PRIMARY KEY,
    name text NOT NULL UNIQUE,
    description text NOT NULL
);

CREATE TABLE IF NOT EXISTS resources (
    id integer PRIMARY KEY,
    name text NOT NULL UNIQUE,
    description text NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id integer NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
    resource_id integer NOT NULL REFERENCES resources (id) ON DELETE CASCADE,
    "create" boolean NOT NULL DEFAULT false,
    "read" boolean NOT NULL DEFAULT false,
    "update" boolean NOT NULL DEFAULT false,
    "delete" boolean NOT NULL DEFAULT false,
    PRIMARY KEY (role_id, resource_id)
);

INSERT INTO roles (id, name, description)
VALUES
    (1, 'ORGANISER', 'Creates and manages event requests, including drafts and change requests, and views relevant event and registration information.'),
    (2, 'COORDINATOR', 'Reviews and coordinates events, manages approvals, venue bookings, equipment requirements, and event changes.'),
    (3, 'VENUE_STAFF', 'Manages venue-related information and reviews venue booking requests, including approving or rejecting bookings.'),
    (4, 'TECH_SUPPORT', 'Manages equipment-related requests, checks equipment availability, and handles equipment reservations for events.'),
    (5, 'ATTENDEE', 'Views appropriate event information, registers for events, checks registration status, and withdraws registrations.')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description;

INSERT INTO resources (id, name, description)
VALUES
    (1, 'Event', 'Represents an event and its core information, including event details, requirements, organiser, assigned coordinator, and current status.'),
    (2, 'Event Review', 'Represents the coordinator-side review of a submitted event, including clarification requests and approval or rejection decisions.'),
    (3, 'Event Change Request', 'Represents a request by an organiser to change important information of an already-submitted event and the subsequent processing of that request.'),
    (4, 'Venue', 'Represents a physical venue and its relatively static information, such as location, capacity, facilities, accessibility, layouts, and operating information.'),
    (5, 'Venue Unavailability', 'Represents manually recorded periods when a venue cannot be used, such as maintenance or closure. Venue availability itself is derived from these periods together with existing bookings.'),
    (6, 'Venue Booking', 'Represents the reservation/request to use a particular venue for an event during a specified period, including its pending, approved, or rejected state.'),
    (7, 'Equipment Request', 'Represents the equipment requirements requested for an event, including equipment type, quantity, and technical requirements.'),
    (8, 'Equipment Reservation', 'Represents equipment allocated or reserved for a particular event and time period.'),
    (9, 'Attendee Registration', 'Represents an attendee''s registration for an event, including their registration status and withdrawal.'),
    (10, 'Notification', 'Represents a notification delivered to a user about relevant event-related activity, such as approvals, changes, bookings, or cancellations.')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, resource_id, "create", "read", "update", "delete")
VALUES
    (1, 1, true, true, true, false), (2, 1, false, true, true, false), (3, 1, false, true, false, false), (4, 1, false, true, false, false), (5, 1, false, true, false, false),
    (1, 2, false, true, false, false), (2, 2, true, true, true, false), (1, 3, true, true, false, false), (2, 3, false, true, true, false), (2, 4, false, true, false, false),
    (3, 4, true, true, true, false), (2, 5, false, true, false, false), (3, 5, true, true, true, true), (2, 6, true, true, true, false), (3, 6, false, true, true, false),
    (2, 7, true, true, true, false), (4, 7, false, true, true, false), (2, 8, false, true, false, false), (4, 8, true, true, true, true), (1, 9, false, true, false, false),
    (2, 9, false, true, false, false), (5, 9, true, true, false, true), (1, 10, false, true, false, false), (2, 10, false, true, false, false), (3, 10, false, true, false, false),
    (4, 10, false, true, false, false), (5, 10, false, true, false, false)
ON CONFLICT (role_id, resource_id) DO UPDATE SET
    "create" = EXCLUDED."create", "read" = EXCLUDED."read", "update" = EXCLUDED."update", "delete" = EXCLUDED."delete";
