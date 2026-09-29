import { test } from 'node:test';
import assert from 'node:assert/strict';
import { raceWithTimeout, TimeoutError } from '../src/index.js';

/**
 * A minimal fake timer. It stores scheduled callbacks keyed by handle and
 * exposes `fire(handle)` so tests can trigger timeouts deterministically
 * without waiting on real time. `clearTimeout` removes a handle so firing
 * it later is a no-op.
 */
function makeFakeTimers() {
  const scheduled = new Map();
  let nextHandle = 1;
  return {
    setTimeout(callback, ms) {
      const handle = nextHandle++;
      scheduled.set(handle, callback);
      return handle;
    },
    clearTimeout(handle) {
      scheduled.delete(handle);
    },
    fire(handle) {
      const cb = scheduled.get(handle);
      if (cb) {
        scheduled.delete(handle);
        cb();
      }
    },
    pending() {
      return scheduled.size;
    },
  };
}

test('resolves with the value when the promise settles in time', async () => {
  const result = await raceWithTimeout(Promise.resolve(42), 1000);
  assert.equal(result, 42);
});

test('rejects with the original reason when the promise rejects in time', async () => {
  const cause = new Error('upstream');
  await assert.rejects(
    () => raceWithTimeout(Promise.reject(cause), 1000),
    (err) => err === cause
  );
});

test('rejects with TimeoutError when the timer fires first', async () => {
  const timers = makeFakeTimers();
  let settle;
  const pending = new Promise((r) => { settle = r; });

  const wrapped = raceWithTimeout(pending, 100, 'download', timers.setTimeout, timers.clearTimeout);
  assert.equal(timers.pending(), 1);

  timers.fire(1);

  await assert.rejects(wrapped, (err) => {
    assert.ok(err instanceof TimeoutError);
    assert.match(err.message, /download/);
    assert.match(err.message, /100ms/);
    return true;
  });

  // Settling the original promise after timeout must not cause an unhandled
  // rejection or change the outcome.
  settle('late');
  await Promise.resolve();
});

test('clears the timer when the promise resolves first', async () => {
  const timers = makeFakeTimers();
  const wrapped = raceWithTimeout(Promise.resolve('ok'), 100, 'op', timers.setTimeout, timers.clearTimeout);
  const result = await wrapped;
  assert.equal(result, 'ok');
  assert.equal(timers.pending(), 0);
});

test('clears the timer when the promise rejects first', async () => {
  const timers = makeFakeTimers();
  const wrapped = raceWithTimeout(Promise.reject(new Error('boom')), 100, 'op', timers.setTimeout, timers.clearTimeout);
  await assert.rejects(wrapped, /boom/);
  assert.equal(timers.pending(), 0);
});

test('TimeoutError has the correct name', () => {
  const err = new TimeoutError();
  assert.equal(err.name, 'TimeoutError');
  assert.ok(err instanceof Error);
});

test('TimeoutError uses a default message when none is given', () => {
  const err = new TimeoutError();
  assert.equal(err.message, 'Operation timed out');
});

test('rejects synchronously with TypeError for negative ms', async () => {
  await assert.rejects(
    () => raceWithTimeout(Promise.resolve(1), -1),
    (err) => err instanceof TypeError && /non-negative/.test(err.message)
  );
});

test('rejects synchronously with TypeError for NaN ms', async () => {
  await assert.rejects(
    () => raceWithTimeout(Promise.resolve(1), NaN),
    (err) => err instanceof TypeError
  );
});

test('rejects synchronously with TypeError for Infinity ms', async () => {
  await assert.rejects(
    () => raceWithTimeout(Promise.resolve(1), Infinity),
    (err) => err instanceof TypeError
  );
});

test('rejects synchronously with TypeError when promise is null', async () => {
  await assert.rejects(
    () => raceWithTimeout(null, 100),
    (err) => err instanceof TypeError && /thenable/.test(err.message)
  );
});

test('rejects synchronously with TypeError when promise is undefined', async () => {
  await assert.rejects(
    () => raceWithTimeout(undefined, 100),
    (err) => err instanceof TypeError
  );
});

test('accepts a thenable that is not a native Promise', async () => {
  const thenable = { then: (resolve) => resolve('thenable-value') };
  const result = await raceWithTimeout(thenable, 1000);
  assert.equal(result, 'thenable-value');
});

test('ms of zero lets an already-resolved promise win', async () => {
  const timers = makeFakeTimers();
  const result = await raceWithTimeout(Promise.resolve('fast'), 0, 'op', timers.setTimeout, timers.clearTimeout);
  assert.equal(result, 'fast');
  assert.equal(timers.pending(), 0);
});

test('uses the operation label in the timeout message', async () => {
  const timers = makeFakeTimers();
  const pending = new Promise(() => {});
  const wrapped = raceWithTimeout(pending, 50, 'file-upload', timers.setTimeout, timers.clearTimeout);
  timers.fire(1);
  await assert.rejects(wrapped, (err) => /file-upload/.test(err.message));
});
