import test from 'node:test';
import assert from 'node:assert/strict';
import { canFastRetry, captureRetryContext, retryCountdownNumber } from '../src/fast-retry.js';

const finishedResult = { state: 'finished', mode: 'time', resultVisible: true };

test('Fast Retry is available only on a visible Time Trial result screen', () => {
  assert.equal(canFastRetry(finishedResult), true);
  assert.equal(canFastRetry({ ...finishedResult, state: 'racing' }), false);
  assert.equal(canFastRetry({ ...finishedResult, state: 'intro' }), false);
  assert.equal(canFastRetry({ ...finishedResult, state: 'countdown' }), false);
  assert.equal(canFastRetry({ ...finishedResult, state: 'menu' }), false);
  assert.equal(canFastRetry({ ...finishedResult, resultVisible: false }), false);
  assert.equal(canFastRetry({ ...finishedResult, mode: 'race' }), false);
});

test('Enter from a focused text-entry control cannot trigger Fast Retry', () => {
  for (const tagName of ['INPUT', 'SELECT', 'TEXTAREA']) {
    assert.equal(canFastRetry({ ...finishedResult, activeElement: { tagName } }), false);
  }
  assert.equal(canFastRetry({ ...finishedResult, activeElement: { tagName: 'DIV', isContentEditable: true } }), false);
  assert.equal(canFastRetry({ ...finishedResult, activeElement: { tagName: 'BUTTON' } }), true);
});

test('retry context retains the resolved race setup and retry countdown starts at 3', () => {
  const context = captureRetryContext({ trackId: 'mountain', vehicleId: 'tempest', paint: '#442233', mode: 'time', difficulty: 'hard', theme: 'night' });
  assert.deepEqual(context, { trackId: 'mountain', vehicleId: 'tempest', paint: '#442233', mode: 'time', difficulty: 'hard', theme: 'night', driftBoostEnabled: false });
  assert.equal(Object.isFrozen(context), true);
  assert.deepEqual([retryCountdownNumber(0), retryCountdownNumber(.99), retryCountdownNumber(1), retryCountdownNumber(2), retryCountdownNumber(3)], [3, 3, 2, 1, 0]);
});
