/*
 * Injectable time source. Registration windows make time a business input, so
 * services read it from here and tests freeze it instead of using the wall clock.
 */
export interface Clock {
  now(): Date;
}

export const CLOCK = Symbol('CLOCK');

export const systemClock: Clock = { now: () => new Date() };
