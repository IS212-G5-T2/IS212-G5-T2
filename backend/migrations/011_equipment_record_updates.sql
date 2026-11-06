-- SPM-118: allow Technical Support to update equipment records and audit those changes.
BEGIN;

ALTER TABLE equipment_audit_trail
    DROP CONSTRAINT IF EXISTS equipment_audit_trail_change_type_check;
ALTER TABLE equipment_audit_trail
    ADD CONSTRAINT equipment_audit_trail_change_type_check
    CHECK (change_type IN ('Marked unavailable', 'Reactivated', 'Equipment record updated'));

UPDATE role_permissions permission
SET "update" = true
FROM roles role, resources resource
WHERE permission.role_id = role.id
  AND permission.resource_id = resource.id
  AND role.name = 'TECH_SUPPORT'
  AND resource.name = 'Equipment';

COMMIT;
