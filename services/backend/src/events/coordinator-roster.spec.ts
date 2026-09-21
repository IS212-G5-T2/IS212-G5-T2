import { describe, expect, it } from 'vitest';
import { COORDINATOR_ROSTER, pickNextCoordinator } from './coordinator-roster.js';

describe('SPM-38 AC5: pickNextCoordinator', () => {
  it('EVE-REV-05-D cycles through the roster in order and wraps around', () => {
    expect(pickNextCoordinator(0)).toEqual(COORDINATOR_ROSTER[0]);
    expect(pickNextCoordinator(1)).toEqual(COORDINATOR_ROSTER[1]);
    expect(pickNextCoordinator(2)).toEqual(COORDINATOR_ROSTER[0]);
    expect(pickNextCoordinator(3)).toEqual(COORDINATOR_ROSTER[1]);
  });
});
