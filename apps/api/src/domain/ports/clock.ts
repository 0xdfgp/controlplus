/**
 * The source of time for the domain.
 *
 * The domain never reads the system clock directly. Time arrives here, so a
 * test can hold it still and an invariant that depends on ordering is testable
 * without sleeping.
 */
export interface Clock {
  now(): Date;
}
