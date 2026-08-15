import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveProjectName } from '../core/project';

test('deriveProjectName strips the final workbench segment', () => {
  assert.equal(deriveProjectName('proj-demo-fraud-mustafa'), 'proj-demo-fraud');
  assert.equal(deriveProjectName('baklava-ai'), 'baklava');
});

test('deriveProjectName returns undefined when there is nothing to derive', () => {
  assert.equal(deriveProjectName(undefined), undefined);
  assert.equal(deriveProjectName('   '), undefined);
  assert.equal(deriveProjectName('single'), undefined);
});
