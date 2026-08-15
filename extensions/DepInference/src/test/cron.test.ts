import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCron } from '../core/cron';

test('validateCron accepts common cron expressions', () => {
  assert.equal(validateCron('0 2 * * *').valid, true);
  assert.equal(validateCron('*/5 * * * *').valid, true);
  assert.equal(validateCron('0 0 * * 0').valid, true);
  assert.equal(validateCron('@daily').valid, true);
});

test('validateCron rejects malformed expressions', () => {
  assert.equal(validateCron('').valid, false);
  assert.equal(validateCron('0 2 * *').valid, false);
  assert.equal(validateCron('60 * * * *').valid, false);
  assert.equal(validateCron('@sometimes').valid, false);
});
