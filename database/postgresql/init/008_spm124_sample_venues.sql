-- Local development samples for SPM-124. Apply after the SPM-50 venue schema
-- and SPM-124 schedule table. Safe to rerun without replacing staff records.
DO $$
BEGIN
    INSERT INTO venues (
        id, owner_user_id, name, location, capacity, operating_information,
        operating_days, operating_start_time, operating_end_time,
        setup_time_minutes, turnaround_time_minutes
    )
    SELECT
        '00000000-0000-4000-8000-000000000124'::uuid, u.id,
        'Sample Orchid Hall', 'Main Building, Level 2', 120,
        'Local development sample venue.',
        ARRAY['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']::varchar[],
        '08:00'::time, '22:00'::time, 30, 45
    FROM users u WHERE u.email = 'venue_staff1@connectsphere.test'
    ON CONFLICT DO NOTHING;

    INSERT INTO venues (
        id, owner_user_id, name, location, capacity, operating_information,
        operating_days, operating_start_time, operating_end_time,
        setup_time_minutes, turnaround_time_minutes
    )
    SELECT
        '00000000-0000-4000-8000-000000000125'::uuid, u.id,
        'Sample Cedar Studio', 'West Wing, Level 1', 40,
        'Local development sample venue.',
        ARRAY['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']::varchar[],
        '09:00'::time, '19:00'::time, 15, 20
    FROM users u WHERE u.email = 'venue_staff1@connectsphere.test'
    ON CONFLICT DO NOTHING;

    INSERT INTO venue_facilities (venue_id, facility_id)
    SELECT v.id, f.id FROM venues v CROSS JOIN facilities f
    WHERE v.id = '00000000-0000-4000-8000-000000000124'::uuid
      AND v.name = 'Sample Orchid Hall' AND v.location = 'Main Building, Level 2'
      AND f.name IN ('AV System', 'Wi-Fi')
    ON CONFLICT DO NOTHING;

    INSERT INTO venue_facilities (venue_id, facility_id)
    SELECT v.id, f.id FROM venues v CROSS JOIN facilities f
    WHERE v.id = '00000000-0000-4000-8000-000000000125'::uuid
      AND v.name = 'Sample Cedar Studio' AND v.location = 'West Wing, Level 1'
      AND f.name IN ('Projector', 'Whiteboard')
    ON CONFLICT DO NOTHING;

    INSERT INTO venue_layouts (venue_id, layout_id)
    SELECT v.id, l.id FROM venues v CROSS JOIN room_layouts l
    WHERE v.id = '00000000-0000-4000-8000-000000000124'::uuid
      AND v.name = 'Sample Orchid Hall' AND v.location = 'Main Building, Level 2'
      AND l.name IN ('Theatre', 'Banquet')
    ON CONFLICT DO NOTHING;

    INSERT INTO venue_layouts (venue_id, layout_id)
    SELECT v.id, l.id FROM venues v CROSS JOIN room_layouts l
    WHERE v.id = '00000000-0000-4000-8000-000000000125'::uuid
      AND v.name = 'Sample Cedar Studio' AND v.location = 'West Wing, Level 1'
      AND l.name IN ('Classroom', 'Boardroom')
    ON CONFLICT DO NOTHING;

    INSERT INTO venue_accessibility (venue_id, accessibility_id)
    SELECT v.id, a.id FROM venues v CROSS JOIN accessibility_features a
    WHERE v.id = '00000000-0000-4000-8000-000000000124'::uuid
      AND v.name = 'Sample Orchid Hall' AND v.location = 'Main Building, Level 2'
      AND a.id IN ('wheelchair-access', 'accessible-restrooms')
    ON CONFLICT DO NOTHING;

    INSERT INTO venue_accessibility (venue_id, accessibility_id)
    SELECT v.id, a.id FROM venues v CROSS JOIN accessibility_features a
    WHERE v.id = '00000000-0000-4000-8000-000000000125'::uuid
      AND v.name = 'Sample Cedar Studio' AND v.location = 'West Wing, Level 1'
      AND a.id = 'wheelchair-access'
    ON CONFLICT DO NOTHING;

    -- Small local illustrations exercise the same data URL image field that
    -- SPM-50 venue records use, without replacing staff-uploaded images.
    INSERT INTO venue_images (venue_id, file_name, mime_type, byte_size, data_url)
    SELECT v.id, sample.file_name, 'image/svg+xml',
        octet_length(sample.svg),
        'data:image/svg+xml;base64,' ||
            replace(encode(convert_to(sample.svg, 'UTF8'), 'base64'), E'\n', '')
    FROM (VALUES
        (
            '00000000-0000-4000-8000-000000000124'::uuid,
            'Sample Orchid Hall', 'Main Building, Level 2',
            'sample-orchid-hall.svg',
            $svg$<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400"><defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="#e9d5ff"/><stop offset="1" stop-color="#fdf4ff"/></linearGradient></defs><rect width="800" height="400" fill="url(#g)"/><rect x="95" y="60" width="610" height="280" rx="18" fill="#7c3aed"/><rect x="115" y="82" width="570" height="236" rx="10" fill="#faf5ff"/><path d="M115 265h570v53H115z" fill="#ddd6fe"/><path d="M170 245h460v20H170z" fill="#a78bfa"/><path d="M205 170h390v76H205z" fill="#c4b5fd"/><path d="M250 120h300v35H250z" fill="#8b5cf6"/><circle cx="190" cy="120" r="16" fill="#fbbf24"/><circle cx="610" cy="120" r="16" fill="#fbbf24"/></svg>$svg$
        ),
        (
            '00000000-0000-4000-8000-000000000125'::uuid,
            'Sample Cedar Studio', 'West Wing, Level 1',
            'sample-cedar-studio.svg',
            $svg$<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400"><defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="#d1fae5"/><stop offset="1" stop-color="#f0fdf4"/></linearGradient></defs><rect width="800" height="400" fill="url(#g)"/><rect x="75" y="65" width="650" height="270" rx="16" fill="#065f46"/><rect x="95" y="85" width="610" height="230" rx="8" fill="#ecfdf5"/><rect x="170" y="118" width="460" height="105" rx="5" fill="#a7f3d0"/><rect x="190" y="138" width="420" height="65" fill="#047857"/><path d="M145 278h510" stroke="#34d399" stroke-width="18"/><path d="M230 240v75m170-75v75m170-75v75" stroke="#064e3b" stroke-width="18"/><circle cx="400" cy="160" r="18" fill="#fbbf24"/></svg>$svg$
        )
    ) AS sample(venue_id, expected_name, expected_location, file_name, svg)
    JOIN venues v ON v.id = sample.venue_id
        AND v.name = sample.expected_name
        AND v.location = sample.expected_location
    ON CONFLICT (venue_id) DO NOTHING;

    -- Give one sample a visible current status and reason. On an existing
    -- volume, rerunning this file preserves the originally seeded period.
    INSERT INTO venue_bookings (id, venue_id, start_at, end_at, status, reason)
    SELECT '00000000-0000-4000-8000-000000000126'::uuid, v.id,
        now() - interval '1 day', now() + interval '6 days', 'blocked',
        'Audio system maintenance'
    FROM venues v
    WHERE v.id = '00000000-0000-4000-8000-000000000125'::uuid
      AND v.name = 'Sample Cedar Studio' AND v.location = 'West Wing, Level 1'
    ON CONFLICT (id) DO NOTHING;
END $$;
