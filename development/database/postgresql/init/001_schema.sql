CREATE TABLE IF NOT EXISTS app_health_checks (
    id bigserial PRIMARY KEY,
    checked_at timestamptz NOT NULL DEFAULT now(),
    source text NOT NULL DEFAULT 'local-dev'
);

INSERT INTO app_health_checks (source)
SELECT 'compose-init'
WHERE NOT EXISTS (
    SELECT 1
    FROM app_health_checks
    WHERE source = 'compose-init'
);
