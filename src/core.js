/**
 * Timeout Race Wrapper
 */

/**
 * Error thrown when a promise does not settle within the specified duration.
 *
 * We use a dedicated subclass rather than a plain Error so callers can
 * distinguish a timeout from a rejection that happened to carry a similar
 * message. The `name` is set to the constructor name so stack traces read
 * naturally and `instanceof` checks are reliable across module boundaries.
 */
export class TimeoutError extends Error {
  constructor(message = 'Operation timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Race a promise against a timeout.
 *
 * Returns a promise that settles the same way as `promise` if `promise`
 * settles within `ms` milliseconds. If it does not, the returned promise
 * rejects with a TimeoutError whose message includes `operation` for context.
 *
 * Design decisions, stated plainly so the tests and the README agree:
 *
 * 1. The timeout is measured against a clock supplied by the caller. By
 *    default this is the global `setTimeout`, but tests inject a fake so
 *    they never depend on wall-clock time. The fake only needs to be a
 *    function taking `(callback, ms)` and returning a handle; `clearTimeout`
 *    must accept that handle. We do not call `Date.now()` anywhere.
 *
 * 2. When the timeout fires first, we reject with TimeoutError. We do NOT
 *    attempt to cancel the underlying promise — JavaScript promises cannot
 *    be cancelled. The original promise continues to run; its eventual
 *    settlement is simply ignored. Callers who need real cancellation should
 *    use AbortController in the wrapped operation.
 *
 * 3. `ms` must be a non-negative finite number. Negative durations, NaN, and
 *    Infinity are rejected synchronously with a TypeError. We chose
 *    synchronous rejection over a thrown error because returning a rejected
 *    promise is the idiomatic way to signal bad arguments from an async
 *    function; it keeps the caller's `.catch` path consistent.
 *
 * 4. If `promise` is null or not a thenable, we reject synchronously with a
 *    TypeError. This catches `undefined` and other non-promise inputs early
 *    rather than producing a timeout that masks the real bug.
 *
 * 5. A `ms` of exactly 0 still arms the timer. Because `setTimeout` fires on
 *    the next tick, a promise that is already settled at call time will win
 *    the race — its `.then` callback runs before the timer. This is the
 *    native behaviour of Promise.race and we rely on it.
 *
 * @param {Promise} promise - The promise to wrap.
 * @param {number} ms - Timeout in milliseconds. Must be non-negative and finite.
 * @param {string} [operation='operation'] - Label for the timeout error message.
 * @param {function} [timerSetTimeout] - Injected `setTimeout` for testability.
 * @param {function} [timerClearTimeout] - Injected `clearTimeout` for testability.
 * @returns {Promise} A promise that rejects on timeout or mirrors `promise`.
 */
export function raceWithTimeout(promise, ms, operation = 'operation', timerSetTimeout = setTimeout, timerClearTimeout = clearTimeout) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) {
    return Promise.reject(new TypeError('ms must be a non-negative finite number'));
  }

  if (promise === null || typeof promise !== 'object' || typeof promise.then !== 'function') {
    return Promise.reject(new TypeError('promise must be a thenable'));
  }

  return new Promise((resolve, reject) => {
    const timer = timerSetTimeout(() => {
      reject(new TimeoutError(`The ${operation} did not complete within ${ms}ms`));
    }, ms);

    Promise.resolve(promise).then(
      (value) => {
        timerClearTimeout(timer);
        resolve(value);
      },
      (reason) => {
        timerClearTimeout(timer);
        reject(reason);
      }
    );
  });
}
