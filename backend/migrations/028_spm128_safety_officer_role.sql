-- SPM-128: add SAFETY_OFFICER role and grant read access on events.
-- Idempotent; safe to run on an existing database.

INSERT INTO roles (id, name, description)
VALUES (7, 'SAFETY_OFFICER', 'Reviews safety arrangements for events that require a safety check before they can proceed.')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, resource_id, "create", "read", "update", "delete")
VALUES (7, 1, false, true, false, false)
ON CONFLICT (role_id, resource_id) DO UPDATE
  SET "create" = EXCLUDED."create",
      "read"   = EXCLUDED."read",
      "update" = EXCLUDED."update",
      "delete" = EXCLUDED."delete";
