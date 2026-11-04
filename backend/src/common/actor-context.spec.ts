/* SPM-157 AC5: the acting user follows the request through awaited work and ends with it. */
import { describe, expect, it } from 'vitest';
import { currentActorId, runAsActor } from './actor-context.js';

describe('SPM-157 actor context', () => {
  /** AUDIT-HISTORY-05-C: the signed-in user is known in everything the request awaits. */
  it('AUDIT-HISTORY-05-C keeps the actor across awaits and clears it afterwards', async () => {
    expect(currentActorId()).toBeUndefined();
    const seen = await runAsActor('user-1', async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return currentActorId();
    });
    expect(seen).toBe('user-1');
    expect(currentActorId()).toBeUndefined();
  });

  /** AUDIT-HISTORY-05-C: two concurrent requests never see each other's actor. */
  it('AUDIT-HISTORY-05-C isolates concurrent requests', async () => {
    const read = (id: string, delay: number) => runAsActor(id, async () => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return currentActorId();
    });
    await expect(Promise.all([read('a', 5), read('b', 1)])).resolves.toEqual(['a', 'b']);
  });
});
