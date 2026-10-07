-- Add SPM-123's Event Coordinator Lead role and its one development account to
-- existing local volumes. Fresh volumes get these from 002_seed_data.sql.
-- Idempotent; the Lead never also holds the COORDINATOR role.
INSERT INTO roles (id, name, description) VALUES
    (6, 'COORDINATOR_LEAD', 'Assigns each unassigned event request to an available Event Coordinator based on current workload.')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, resource_id, "create", "read", "update", "delete") VALUES
    (6, 1, false, true, true, false), (6, 2, false, true, false, false)
ON CONFLICT (role_id, resource_id) DO UPDATE SET "create" = EXCLUDED."create", "read" = EXCLUDED."read", "update" = EXCLUDED."update", "delete" = EXCLUDED."delete";

INSERT INTO users (email, display_name, password_hash) VALUES
    ('lead@connectsphere.test', 'Coordinator Lead', crypt('P@55w0rd', gen_salt('bf', 12)))
ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name, is_active = true, updated_at = now();

INSERT INTO user_roles (user_id, role_id)
SELECT users.id, roles.id FROM users JOIN roles ON roles.name = 'COORDINATOR_LEAD'
 WHERE users.email = 'lead@connectsphere.test'
ON CONFLICT (user_id, role_id) DO NOTHING;
