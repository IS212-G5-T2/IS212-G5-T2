import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventsService } from '../events.service.js';
import { DatabaseService } from '../../database/database.service.js';
import { coordinator, organiser } from '../review/review.fixtures.js';

/**
 * SPM-65 AC7 (REVIEW-CHANGE-07-D, matrix 28016830: "events.service.ts (organiser notification types)"): the organiser
 * reads the decision on their change request, approved or denied, in their notification feed, and the decision
 * notices are not part of a coordinator's feed. Only the two SPM-65 types are asserted, so other stories can add
 * types to either feed without changing this test.
 */
const SPM65_DECISION_TYPES = ['change_request_approved', 'change_request_denied'];

const database = { query: vi.fn(), transaction: vi.fn() };
let service: EventsService;

beforeEach(async () => {
  vi.resetAllMocks();
  database.query.mockResolvedValue({ rows: [] });
  const module = await Test.createTestingModule({
    providers: [EventsService, { provide: DatabaseService, useValue: database }],
  }).compile();
  service = module.get(EventsService);
});

/** The notification types the feed query was asked for. */
const requestedTypes = () => database.query.mock.calls[0][1][1] as string[];

describe('SPM-65 change request decision notices in the notification feeds', () => {
  // Traceability: Jira 65 AC7 (matrix 28016830)
  /** REVIEW-CHANGE-07-D: the organiser's feed asks for both decision notices. Kills: the organiser branch of notificationTypesFor dropping them. */
  it("REVIEW-CHANGE-07-D includes the change request decisions in the organiser's feed", async () => {
    await service.notifications(organiser('org-1'));
    expect(database.query.mock.calls[0][1][0]).toBe('org-1');
    expect(requestedTypes()).toEqual(expect.arrayContaining(SPM65_DECISION_TYPES));
  });

  // Traceability: Jira 65 AC7 (matrix 28016830)
  /** REVIEW-CHANGE-07-D: a coordinator-only user is not sent the organiser's decision notices. Kills: the decisions leaking into every feed. */
  it("REVIEW-CHANGE-07-D leaves the change request decisions out of a coordinator's feed", async () => {
    await service.notifications(coordinator('coord-1'));
    for (const type of SPM65_DECISION_TYPES) expect(requestedTypes()).not.toContain(type);
  });
});
