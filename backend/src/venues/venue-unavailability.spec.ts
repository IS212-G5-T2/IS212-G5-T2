import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../auth/models/auth.models.js';
import { RbacRepository } from '../auth/authorization/rbac.repository.js';
import { validateUnavailability as validateWithClock } from './dto/venue-unavailability.js';
import { VenuesRepository } from './venues.repository.js';
import { VenuesService } from './venues.service.js';

const venueId = '00000000-0000-4000-8000-000000000122';
const periodId = '00000000-0000-4000-8000-000000000123';
const staff: AuthenticatedUser = { uid: 'staff', roles: ['VENUE_STAFF'] };
const fixedNow = new Date('2030-01-10T12:00:00.000Z');
const validateUnavailability = (value: unknown, now = fixedNow) =>
  validateWithClock(value, now);
const input = {
  start: '2030-01-12T11:00:00.000Z',
  end: '2030-01-12T13:00:00.000Z',
  reason: 'Air-conditioning inspection',
};

describe('SPM-122 venue unavailable periods', () => {
  // VEN-UNAVAIL-01-A and 02-A: valid times and a free-text reason are retained.
  it('accepts a valid interval and an operational reason outside the Jira examples', () => {
    // Act and assert exact normalized values.
    expect(validateUnavailability(input)).toEqual({
      start: new Date(input.start),
      end: new Date(input.end),
      reason: input.reason,
    });
  });

  // VEN-UNAVAIL-01-B: reversed and equal intervals cannot be saved.
  it.each(['2030-01-12T10:59:00.000Z', input.start])(
    'rejects an end at or before the start (%s)',
    (end) => {
      // Act and assert the field-level error.
      expect(() => validateUnavailability({ ...input, end })).toThrow(
        BadRequestException,
      );
      expect(() => validateUnavailability({ ...input, end })).toThrow(
        /Check the unavailable period/,
      );
    },
  );

  // SPM-122 AC1/04: a blockout must still affect the venue when it is saved.
  it('rejects an interval that has ended, but accepts one already in progress', () => {
    // Arrange a fixed server clock and intervals on both sides of the end boundary.
    const now = new Date('2030-01-12T12:00:00.000Z');
    const active = { ...input, start: '2030-01-12T11:00:00.000Z' };

    // Act and assert an end at or before now is rejected, while an active end is valid.
    for (const end of ['2030-01-12T11:59:59.000Z', now.toISOString()]) {
      try {
        validateUnavailability({ ...active, end }, now);
        throw new Error('Expected validation to fail');
      } catch (error) {
        expect((error as BadRequestException).getResponse()).toMatchObject({
          errors: { end: 'End date and time must be in the future.' },
        });
      }
    }
    expect(validateUnavailability(active, now)).toMatchObject({
      start: new Date(active.start),
      end: new Date(active.end),
    });
  });

  // VEN-UNAVAIL-01-B: a syntactically valid but nonexistent calendar day is invalid.
  it('rejects a nonexistent date instead of silently moving it into March', () => {
    // Act and assert that a normalized February 30 cannot reach persistence.
    try {
      validateUnavailability({ ...input, start: '2030-02-30T11:00:00.000Z', end: '2030-03-04T11:00:00.000Z' });
      throw new Error('Expected validation to fail');
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toMatchObject({
        errors: { start: 'Enter a valid date and time with a time zone.' },
      });
    }
  });

  // VEN-UNAVAIL-01-B: malformed or missing timestamps cannot create an interval.
  it.each([null, [], { ...input, start: 123 }, { ...input, end: '2030-01-12T13:00' }, { ...input, end: '2030-01-12T25:00:00.000Z' }])(
    'rejects a malformed unavailable-period request (%j)', (body) => {
      // Act and assert field errors instead of silently accepting server-coerced values.
      expect(() => validateUnavailability(body)).toThrow(BadRequestException);
    },
  );

  // VEN-UNAVAIL-02-A/B: free text is normalized and bounded without changing valid wording.
  it('trims a valid reason and rejects an overlong one', () => {
    // Act and assert the persisted reason has no incidental surrounding whitespace.
    expect(validateUnavailability({ ...input, reason: '  Safety inspection  ' }).reason).toBe('Safety inspection');
    try {
      validateUnavailability({ ...input, reason: 'x'.repeat(501) });
      throw new Error('Expected validation to fail');
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toMatchObject({
        errors: { reason: 'Use 500 characters or fewer.' },
      });
    }
  });

  // VEN-UNAVAIL-02-B: empty and whitespace-only reasons are invalid.
  it.each(['', '   '])('rejects a missing reason (%j)', (reason) => {
    // Act and assert the reason field is identified.
    try {
      validateUnavailability({ ...input, reason });
      throw new Error('Expected validation to fail');
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toMatchObject({
        errors: { reason: 'A reason is required.' },
      });
    }
  });

  const markUnavailable = vi.fn();
  const endUnavailable = vi.fn();
  const hasPermission = vi.fn().mockResolvedValue(true);
  const service = new VenuesService(
    { markUnavailable, endUnavailable } as unknown as VenuesRepository,
    { hasPermission } as unknown as RbacRepository,
    { now: () => fixedNow },
  );

  // VEN-UNAVAIL-04-SEC-1: only a verified Venue Staff identity can write.
  it('rejects unauthenticated and non-staff callers before persistence', async () => {
    // Arrange: permissions alone are not a substitute for the staff role.
    markUnavailable.mockClear();
    await expect(
      service.markUnavailable(undefined, venueId, input),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      service.markUnavailable(
        { uid: 'coord', roles: ['COORDINATOR'] },
        venueId,
        input,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(markUnavailable).not.toHaveBeenCalled();
  });

  // VEN-UNAVAIL-04-SEC-1: the Venue update permission is required in addition to the role.
  it('rejects staff without Venue update permission', async () => {
    // Arrange a role-bearing user whose current permission check fails.
    markUnavailable.mockClear();
    hasPermission.mockResolvedValueOnce(false);

    // Act and assert no persistence call follows the denied permission.
    await expect(service.markUnavailable(staff, venueId, input)).rejects.toBeInstanceOf(ForbiddenException);
    expect(markUnavailable).not.toHaveBeenCalled();
  });

  // VEN-UNAVAIL-04-A: an invalid or absent venue cannot receive a period.
  it('rejects invalid and missing venues instead of reporting a saved period', async () => {
    // Arrange a valid staff identity and an absent repository record.
    markUnavailable.mockClear();
    markUnavailable.mockResolvedValueOnce(undefined);

    // Act and assert both input and persistence-level not-found paths.
    await expect(service.markUnavailable(staff, 'not-a-uuid', input)).rejects.toMatchObject({ status: 404 });
    await expect(service.markUnavailable(staff, venueId, input)).rejects.toMatchObject({ status: 404 });
    expect(markUnavailable).toHaveBeenCalledOnce();
  });

  // VEN-UNAVAIL-04-A/06-A: the staff action forwards a validated period and affected result.
  it('saves a period even when the repository reports existing affected bookings', async () => {
    // Arrange: an affected booking exists already.
    const result = {
      period: {
        id: periodId,
        start: input.start,
        end: input.end,
        reason: input.reason,
      },
      affectedBookings: [{ id: 'booking', eventName: 'Event' }],
    };
    markUnavailable.mockResolvedValueOnce(result);
    // Act and assert no booking is changed by the service.
    await expect(service.markUnavailable(staff, venueId, input)).resolves.toBe(
      result,
    );
    expect(markUnavailable).toHaveBeenCalledWith(venueId, {
      start: new Date(input.start),
      end: new Date(input.end),
      reason: input.reason,
    });
  });

  // VEN-UNAVAIL-05-A/B: early ending targets one period under the selected venue.
  it('ends one active unavailable period without passing a bulk venue update', async () => {
    // Arrange and act through the public service.
    const period = {
      id: periodId,
      start: input.start,
      end: input.end,
      reason: input.reason,
    };
    endUnavailable.mockResolvedValueOnce(period);
    await expect(
      service.endUnavailable(staff, venueId, periodId),
    ).resolves.toEqual({ period });
    expect(endUnavailable).toHaveBeenCalledWith(venueId, periodId);
  });

  // VEN-UNAVAIL-05-A: a missing period cannot be reported as reactivated.
  it('rejects malformed and absent early-end targets', async () => {
    // Arrange a repository that cannot find an active selected period.
    endUnavailable.mockClear();
    endUnavailable.mockResolvedValueOnce(undefined);

    // Act and assert no success response for either invalid target.
    await expect(service.endUnavailable(staff, venueId, 'bad-id')).rejects.toMatchObject({ status: 404 });
    await expect(service.endUnavailable(staff, venueId, periodId)).rejects.toMatchObject({ status: 404 });
    expect(endUnavailable).toHaveBeenCalledOnce();
  });
});
