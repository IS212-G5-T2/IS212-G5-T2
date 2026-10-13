-- Additional SPM-51 local venues for catalogue and availability demos.
-- Safe to rerun: fixed UUIDs and ON CONFLICT preserve existing edits.
BEGIN;

CREATE TEMP TABLE spm51_seed_venues (
    id uuid PRIMARY KEY,
    owner_email text NOT NULL,
    name varchar(200) NOT NULL,
    location varchar(300) NOT NULL,
    capacity integer NOT NULL,
    operating_information varchar(200) NOT NULL,
    operating_days varchar(9)[] NOT NULL,
    operating_start_time time NOT NULL,
    operating_end_time time NOT NULL,
    setup_time_minutes integer NOT NULL,
    turnaround_time_minutes integer NOT NULL,
    facilities text[] NOT NULL,
    layouts text[] NOT NULL,
    accessibility text[] NOT NULL
) ON COMMIT DROP;

INSERT INTO spm51_seed_venues VALUES
('00000000-0000-4000-8000-000000000301', 'venue_staff1@connectsphere.test', 'Sample Birch Lecture Hall', 'North Campus, Block A', 180, 'Lecture hall with tiered seating.', ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday']::varchar[], '07:00','22:00',30,45, ARRAY['AV System','Projector','Wi-Fi'], ARRAY['Theatre','Seminar Room'], ARRAY['wheelchair-access','accessible-restrooms']),
('00000000-0000-4000-8000-000000000302', 'venue_staff2@connectsphere.test', 'Sample Maple Meeting Studio', 'North Campus, Block B', 16, 'Compact room for small-group meetings.', ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday']::varchar[], '08:30','18:00',0,15, ARRAY['Whiteboard','Wired network'], ARRAY['Boardroom','Hollow square'], ARRAY['elevator-access']),
('00000000-0000-4000-8000-000000000303', 'venue_staff3@connectsphere.test', 'Sample Harbor Ballroom', 'Riverside Centre, Level 3', 450, 'Flexible ballroom for receptions and banquets.', ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']::varchar[], '10:00','23:00',60,60, ARRAY['Catering','Stage','AV System'], ARRAY['Banquet','Cabaret','Standing'], ARRAY['wheelchair-access','accessible-restrooms','hearing-loop']),
('00000000-0000-4000-8000-000000000304', 'venue_staff1@connectsphere.test', 'Sample Skybridge Auditorium', 'Innovation Tower, Level 1', 900, 'Large auditorium with stage and control booth.', ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']::varchar[], '08:00','22:30',90,60, ARRAY['Stage','AV System','Lectern','Video conferencing'], ARRAY['Theatre'], ARRAY['wheelchair-access','accessible-restrooms','hearing-loop','elevator-access']),
('00000000-0000-4000-8000-000000000305', 'venue_staff2@connectsphere.test', 'Sample Fern Training Room', 'West Wing, Level 2', 36, 'Training room with movable tables.', ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday']::varchar[], '08:00','20:00',20,20, ARRAY['Projector','Whiteboard','Wi-Fi'], ARRAY['Classroom','U-shape'], ARRAY['wheelchair-access']),
('00000000-0000-4000-8000-000000000306', 'venue_staff3@connectsphere.test', 'Sample Orchard Gallery', 'Arts Quarter, Ground Floor', 110, 'Bright gallery for showcases and exhibitions.', ARRAY['Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']::varchar[], '09:00','21:00',45,30, ARRAY['Power outlets','Wi-Fi','AV System'], ARRAY['Standing','Theatre'], ARRAY['wheelchair-access','accessible-restrooms']),
('00000000-0000-4000-8000-000000000307', 'venue_staff1@connectsphere.test', 'Sample Cedar Boardroom', 'Central Campus, Block C', 12, 'Executive boardroom with video meeting support.', ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday']::varchar[], '08:00','19:00',10,15, ARRAY['Video conferencing','Wired network','Whiteboard'], ARRAY['Boardroom'], ARRAY['elevator-access','hearing-loop']),
('00000000-0000-4000-8000-000000000308', 'venue_staff2@connectsphere.test', 'Sample Lagoon Event Lawn', 'Lakeside Campus, Outdoor', 1200, 'Open-air lawn for large community gatherings.', ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']::varchar[], '07:00','21:00',120,90, ARRAY['Power outlets','Stage','Parking'], ARRAY['Standing'], ARRAY['wheelchair-access']),
('00000000-0000-4000-8000-000000000309', 'venue_staff3@connectsphere.test', 'Sample Juniper Seminar Room', 'South Campus, Block D', 48, 'Seminar space with presentation facilities.', ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday']::varchar[], '09:00','18:00',15,15, ARRAY['Projector','Wi-Fi','Lectern'], ARRAY['Seminar Room','Classroom'], ARRAY['accessible-restrooms','elevator-access']),
('00000000-0000-4000-8000-000000000310', 'venue_staff1@connectsphere.test', 'Sample Palm Dining Hall', 'Residence Commons, Level 1', 260, 'Dining hall suitable for catered events.', ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']::varchar[], '07:00','22:00',45,75, ARRAY['Catering','Power outlets'], ARRAY['Banquet','Cabaret'], ARRAY['wheelchair-access','accessible-restrooms']),
('00000000-0000-4000-8000-000000000311', 'venue_staff2@connectsphere.test', 'Sample Summit Collaboration Hub', 'Technology Park, Level 5', 72, 'Collaborative space with hybrid meeting equipment.', ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']::varchar[], '08:00','23:00',20,30, ARRAY['Video conferencing','Wi-Fi','AV System'], ARRAY['U-shape','Hollow square','Boardroom'], ARRAY['wheelchair-access','hearing-loop']),
('00000000-0000-4000-8000-000000000312', 'venue_staff3@connectsphere.test', 'Sample Coral Workshop Lab', 'Engineering Block, Level 2', 28, 'Workshop room for practical team activities.', ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday']::varchar[], '08:30','17:30',30,30, ARRAY['Power outlets','Whiteboard'], ARRAY['Classroom','U-shape'], ARRAY['accessible-restrooms']),
('00000000-0000-4000-8000-000000000313', 'venue_staff1@connectsphere.test', 'Sample Meadow Conference Centre', 'Garden District, Building 4', 320, 'Conference venue with adjacent breakout rooms.', ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']::varchar[], '07:30','22:00',60,60, ARRAY['Catering','AV System','Wi-Fi','Parking'], ARRAY['Theatre','Classroom','Banquet'], ARRAY['wheelchair-access','accessible-restrooms','elevator-access']),
('00000000-0000-4000-8000-000000000314', 'venue_staff2@connectsphere.test', 'Sample Lantern Black Box', 'Performing Arts Centre, Studio 2', 95, 'Adaptable performance and rehearsal space.', ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']::varchar[], '10:00','23:30',75,45, ARRAY['Stage','AV System','Power outlets'], ARRAY['Theatre','Standing'], ARRAY['wheelchair-access','hearing-loop']),
('00000000-0000-4000-8000-000000000315', 'venue_staff3@connectsphere.test', 'Sample Pebble Interview Suite', 'Central Campus, Block E', 8, 'Quiet suite for interviews and private discussions.', ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday']::varchar[], '08:00','18:00',5,10, ARRAY['Wired network','Video conferencing'], ARRAY['Boardroom'], ARRAY['elevator-access']),
('00000000-0000-4000-8000-000000000316', 'venue_staff1@connectsphere.test', 'Sample Rainforest Atrium', 'Library Building, Ground Floor', 500, 'Indoor atrium for fairs and public programmes.', ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']::varchar[], '08:00','21:00',60,45, ARRAY['Power outlets','Wi-Fi','Catering'], ARRAY['Standing','Cabaret'], ARRAY['wheelchair-access','accessible-restrooms']),
('00000000-0000-4000-8000-000000000317', 'venue_staff2@connectsphere.test', 'Sample Crescent Lecture Theatre', 'East Campus, Block F', 140, 'Lecture theatre with hearing assistance.', ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday']::varchar[], '07:30','20:00',30,30, ARRAY['AV System','Lectern','Wired network'], ARRAY['Theatre'], ARRAY['hearing-loop','elevator-access']),
('00000000-0000-4000-8000-000000000318', 'venue_staff3@connectsphere.test', 'Sample Driftwood Beach Pavilion', 'Coastal Campus, Pavilion 1', 210, 'Covered pavilion for daytime and evening events.', ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']::varchar[], '08:00','22:00',45,45, ARRAY['Catering','Parking','Power outlets'], ARRAY['Banquet','Standing'], ARRAY['wheelchair-access']),
('00000000-0000-4000-8000-000000000319', 'venue_staff1@connectsphere.test', 'Sample Skyline Rooftop Terrace', 'Innovation Tower, Rooftop', 130, 'Outdoor terrace for receptions and networking.', ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']::varchar[], '12:00','23:00',45,60, ARRAY['Catering','AV System'], ARRAY['Cocktail','Standing'], ARRAY['elevator-access']),
('00000000-0000-4000-8000-000000000320', 'venue_staff2@connectsphere.test', 'Sample Willow Quiet Room', 'Wellbeing Centre, Level 1', 20, 'Low-stimulation room for small inclusive sessions.', ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday']::varchar[], '09:00','17:00',10,20, ARRAY['Wi-Fi','Whiteboard'], ARRAY['Seminar Room','Boardroom'], ARRAY['wheelchair-access','accessible-restrooms']),
('00000000-0000-4000-8000-000000000321', 'venue_staff3@connectsphere.test', 'Sample Granite Expo Hall', 'Trade Centre, Hall 2', 1600, 'High-capacity hall for expos and conventions.', ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']::varchar[], '06:00','23:00',120,120, ARRAY['Stage','AV System','Power outlets','Parking'], ARRAY['Exhibition','Standing'], ARRAY['wheelchair-access','accessible-restrooms','elevator-access']),
('00000000-0000-4000-8000-000000000322', 'venue_staff1@connectsphere.test', 'Sample Poppy Music Room', 'Arts Quarter, Basement 1', 75, 'Rehearsal room with sound and lighting controls.', ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']::varchar[], '10:00','23:30',30,60, ARRAY['AV System','Power outlets'], ARRAY['Standing','Theatre'], ARRAY['wheelchair-access']),
('00000000-0000-4000-8000-000000000323', 'venue_staff2@connectsphere.test', 'Sample Cypress Training Suite', 'West Wing, Level 4', 64, 'Divisible suite for parallel training sessions.', ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday']::varchar[], '07:00','21:00',30,30, ARRAY['Projector','Wi-Fi','Whiteboard'], ARRAY['Classroom','Cabaret','U-shape'], ARRAY['wheelchair-access','accessible-restrooms','hearing-loop']),
('00000000-0000-4000-8000-000000000324', 'venue_staff3@connectsphere.test', 'Sample Tidal Waterfront Room', 'Harbour Centre, Level 2', 105, 'Waterfront event room with flexible seating.', ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']::varchar[], '09:00','22:00',20,40, ARRAY['Catering','Video conferencing','Wi-Fi'], ARRAY['Banquet','Boardroom','Cabaret'], ARRAY['wheelchair-access','elevator-access']);

INSERT INTO venues (
    id, owner_user_id, name, location, capacity, operating_information,
    operating_days, operating_start_time, operating_end_time,
    setup_time_minutes, turnaround_time_minutes
)
SELECT seed.id, owner.id, seed.name, seed.location, seed.capacity,
    seed.operating_information, seed.operating_days, seed.operating_start_time,
    seed.operating_end_time, seed.setup_time_minutes, seed.turnaround_time_minutes
FROM spm51_seed_venues seed
JOIN users owner ON owner.email = seed.owner_email
ON CONFLICT DO NOTHING;

INSERT INTO venue_facilities (venue_id, facility_id)
SELECT seed.id, facility.id
FROM spm51_seed_venues seed
JOIN venues venue ON venue.id = seed.id
CROSS JOIN LATERAL unnest(seed.facilities) AS requested(name)
JOIN facilities facility ON facility.name = requested.name
ON CONFLICT DO NOTHING;

INSERT INTO venue_layouts (venue_id, layout_id)
SELECT seed.id, layout.id
FROM spm51_seed_venues seed
JOIN venues venue ON venue.id = seed.id
CROSS JOIN LATERAL unnest(seed.layouts) AS requested(name)
JOIN room_layouts layout ON layout.name = requested.name
ON CONFLICT DO NOTHING;

INSERT INTO venue_accessibility (venue_id, accessibility_id)
SELECT seed.id, feature.id
FROM spm51_seed_venues seed
JOIN venues venue ON venue.id = seed.id
CROSS JOIN LATERAL unnest(seed.accessibility) AS requested(id)
JOIN accessibility_features feature ON feature.id = requested.id
ON CONFLICT DO NOTHING;

COMMIT;
