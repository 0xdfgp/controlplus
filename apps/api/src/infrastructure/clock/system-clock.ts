import type { Clock } from '../../domain/ports/clock.ts';

/** The real clock. The only place the system time is read. */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
