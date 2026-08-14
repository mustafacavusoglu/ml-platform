import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeTrackingUri, resolveTrackingUri } from '../core/urls';

test('normalizeTrackingUri trims and adds a protocol', () => {
  assert.equal(normalizeTrackingUri('  http://mlflow.example/  '), 'http://mlflow.example');
  assert.equal(normalizeTrackingUri('mlflow.example'), 'https://mlflow.example');
  assert.equal(normalizeTrackingUri(''), undefined);
});

test('resolveTrackingUri prefers an explicit tracking URI', () => {
  assert.equal(
    resolveTrackingUri({
      trackingUri: 'http://localhost:5000',
      namespace: 'team-a',
      appsDomain: 'apps.example.com',
    }),
    'http://localhost:5000'
  );
});

test('resolveTrackingUri derives the MLflow route from namespace and apps domain', () => {
  assert.equal(
    resolveTrackingUri({
      namespace: 'team-a',
      appsDomain: 'https://apps.example.com/',
    }),
    'https://mlflow.team-a.apps.example.com'
  );
});

test('resolveTrackingUri returns undefined when required values are missing', () => {
  assert.equal(resolveTrackingUri({}), undefined);
  assert.equal(resolveTrackingUri({ namespace: 'team-a' }), undefined);
});
