/* SPM-157 AC5: the acting user follows the request through awaited work and ends with it. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentActorId, runAsActor } from './actor-context.js';

describe('SPM-157 actor context', () => {
  // Fake timers: the waits below only move work to a later turn of the event loop, so no real time passes.
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Traceability: Jira 157 AC5 (matrix 39813204)
  /** AUDIT-HISTORY-05-C: the signed-in user is known in everything the request awaits. */
  it('AUDIT-HISTORY-05-C keeps the actor across awaits and clears it afterwards', async () => {
    expect(currentActorId()).toBeUndefined();
    const pending = runAsActor('user-1', async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return currentActorId();
    });
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBe('user-1');
    expect(currentActorId()).toBeUndefined();
  });

  // Traceability: Jira 157 AC5 (matrix 39813204)
  /** AUDIT-HISTORY-05-C: two concurrent requests never see each other's actor. */
  it('AUDIT-HISTORY-05-C isolates concurrent requests', async () => {
    const read = (id: string, delay: number) => runAsActor(id, async () => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return currentActorId();
    });
    // 'b' resumes first, while 'a' is still waiting, so each read happens with the other request in flight.
    const both = Promise.all([read('a', 5), read('b', 1)]);
    await vi.advanceTimersByTimeAsync(5);
    await expect(both).resolves.toEqual(['a', 'b']);
  });
});
