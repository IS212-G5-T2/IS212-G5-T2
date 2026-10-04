import { describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../database/database.service.js';
import { VenuesRepository } from './venues.repository.js';

const venue = {
  id: 'b9c6f700-85b1-4a79-96d8-5f5c3fd616fb',
  name: 'Orchid Hall Test',
  location: 'Test Building Level 3',
  capacity: 120,
  facilities: ['AV System', 'Wi-Fi'],
  accessibility: ['Wheelchair access'],
  layouts: ['Classroom', 'Theatre'],
  operatingHours: '08:00–22:00',
  setupTimeMinutes: 30,
  turnaroundTimeMinutes: 45,
};
const venueInput = {
  name: venue.name,
  location: venue.location,
  capacity: venue.capacity,
  facilities: venue.facilities,
  accessibility: venue.accessibility,
  layouts: venue.layouts,
  operatingHours: venue.operatingHours,
  setupTimeMinutes: venue.setupTimeMinutes,
  turnaroundTimeMinutes: venue.turnaroundTimeMinutes,
};

describe('VenuesRepository', () => {
  // SPM-50 / VEN-CRE-05-A, VEN-CRE-05-B: the venue and all normalized selections are stored together.
  it('inserts a venue and its relationships in one transaction', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            ...venue,
            operating_hours: venue.operatingHours,
            setup_time_minutes: venue.setupTimeMinutes,
            turnaround_time_minutes: venue.turnaroundTimeMinutes,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const transaction = vi.fn(async (work) => work({ query }));
    const repository = new VenuesRepository({
      transaction,
    } as unknown as DatabaseService);

    await expect(repository.create(venueInput)).resolves.toEqual(venue);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]).toEqual([
      expect.stringContaining('INSERT INTO venues'),
      [
        venue.name,
        venue.location,
        venue.capacity,
        venue.operatingHours,
        venue.setupTimeMinutes,
        venue.turnaroundTimeMinutes,
      ],
    ]);
    expect(query.mock.calls[1]).toEqual([
      expect.stringContaining('INSERT INTO venue_accessibility'),
      [venue.id, ['wheelchair-access']],
    ]);
    expect(query.mock.calls[2]).toEqual([
      expect.stringContaining('INSERT INTO venue_facilities'),
      [venue.id, venue.facilities],
    ]);
    expect(query.mock.calls[3]).toEqual([
      expect.stringContaining('INSERT INTO venue_layouts'),
      [venue.id, venue.layouts],
    ]);
  });

  // SPM-50 image follow-up: optional venue media participates in the same atomic creation transaction.
  it('inserts an optional venue image with the venue relationships', async () => {
    const image = {
      name: 'orchid-hall.png',
      type: 'image/png',
      size: 4,
      dataUrl: 'data:image/png;base64,dGVzdA==',
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            ...venue,
            operating_hours: venue.operatingHours,
            setup_time_minutes: venue.setupTimeMinutes,
            turnaround_time_minutes: venue.turnaroundTimeMinutes,
          },
        ],
      })
      .mockResolvedValue({ rows: [] });
    const transaction = vi.fn(async (work) => work({ query }));
    const repository = new VenuesRepository({
      transaction,
    } as unknown as DatabaseService);

    await expect(repository.create({ ...venueInput, image })).resolves.toEqual({
      ...venue,
      image,
    });

    expect(query.mock.calls[4]).toEqual([
      expect.stringContaining('INSERT INTO venue_images'),
      [venue.id, image.name, image.type, image.size, image.dataUrl],
    ]);
  });

  // SPM-50 / AC5 regression: storage failures remain visible to standard error handling.
  it('propagates a database failure', async () => {
    const failure = new Error('database unavailable');
    const transaction = vi.fn().mockRejectedValue(failure);
    const repository = new VenuesRepository({
      transaction,
    } as unknown as DatabaseService);

    await expect(repository.create(venueInput)).rejects.toBe(failure);
  });
});
