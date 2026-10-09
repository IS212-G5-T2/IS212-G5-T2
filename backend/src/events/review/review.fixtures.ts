import type { AuthenticatedUser } from '../../auth/types/auth.models.js';

export const VALID_UUID = '00000000-0000-4000-8000-000000000036';

export function coordinator(uid = 'coordinator-1'): AuthenticatedUser {
  return { uid, roles: ['COORDINATOR'] };
}

export function organiser(uid = 'current-user'): AuthenticatedUser {
  return { uid, roles: ['ORGANISER'] };
}

export function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_UUID,
    organiser_id: 'organiser-9',
    organiser_name: 'Organiser Nine',
    event_name: 'Welcome Evening',
    purpose: 'Community building',
    description: 'A welcome event for new members.',
    coordinator_id: 'coordinator-1',
    coordinator_name: 'Coordinator One',
    start_date_time: new Date('2026-10-01T09:00:00.000Z'),
    end_date_time: new Date('2026-10-01T10:00:00.000Z'),
    expected_attendance: 80,
    preferred_room_layout: 'Banquet',
    required_facilities: [],
    accessibility_needs: [],
    attachments: [],
    equipment_needs: '',
    status: 'Submitted',
    rejection_reason: null,
    created_at: new Date('2026-09-13T00:00:00.000Z'),
    updated_at: new Date('2026-09-14T00:00:00.000Z'),
    ...overrides,
  };
}
