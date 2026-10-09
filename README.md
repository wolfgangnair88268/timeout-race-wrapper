# Timeout Race Wrapper

Wraps a promise so that it rejects with a `TimeoutError` if it does not settle within a given number of milliseconds.

## Usage

```js
import { raceWithTimeout, TimeoutError } from 'timeout-race-wrapper';

try {
  const body = await raceWithTimeout(fetch('http://example.com/data'), 5000, 'fetch /data');
} catch (err) {
  if (err instanceof TimeoutError) {
    console.log('gave up waiting');
  } else {
    throw err;
  }
}
```

## Why this exists

Network calls and other async operations sometimes hang forever. A bare
`Promise.race` against `setTimeout` works, but the boilerplate is repetitive
and the error it produces is indistinguishable from an upstream rejection.
This library gives you one function and a dedicated `TimeoutError` subclass
so callers can branch on the cause.

The trade-off: JavaScript promises cannot be cancelled. When the timeout
fires, the underlying operation keeps running — we just stop listening to
it. If you need real cancellation, thread an `AbortController` into the
wrapped operation yourself; this library does not try to do that for you.

## Edge cases

- `ms` must be a non-negative finite number. Negative values, `NaN`, and
  `Infinity` cause the returned promise to reject synchronously with a
  `TypeError`.
- A non-thenable `promise` (including `null` and `undefined`) is rejected
  synchronously with a `TypeError`.
- `ms` of `0` still arms a timer. Because `setTimeout` fires on the next
  tick, a promise that is already settled when `raceWithTimeout` is called
  wins the race. This relies on native `Promise.race` semantics.
- The timer is cleared when the wrapped promise settles first, so no
  dangling timeout callback runs.

## Exports

- `raceWithTimeout(promise, ms, operation?, timerSetTimeout?, timerClearTimeout?)`
- `TimeoutError`

The optional `timerSetTimeout` and `timerClearTimeout` arguments default to
the globals and exist so tests can inject a fake clock.

## Running the tests

```
node --test
```

## Design notes

The window stores values eagerly rather than keeping running aggregates. Running
sums drift with floating point over long streams, and recomputing from a small
buffer is cheap enough that the drift is not worth the speed.

