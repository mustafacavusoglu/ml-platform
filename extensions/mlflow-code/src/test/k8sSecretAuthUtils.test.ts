import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractSecretValues,
  resolveKubernetesApiUrl,
  toBasicAuthHeader,
} from '../mlflow/k8sSecretAuthUtils';

test('extractSecretValues decodes Kubernetes secret fields', () => {
  const values = extractSecretValues(
    {
      username: btoa('mlflow'),
      password: btoa('password'),
      service_uri: btoa('http://mlflow:5000'),
    },
    { username: 'username', password: 'password', serviceUri: 'service_uri' }
  );

  assert.deepEqual(values, {
    username: 'mlflow',
    password: 'password',
    serviceUri: 'http://mlflow:5000',
  });
});

test('toBasicAuthHeader creates a Basic authorization value', () => {
  assert.equal(toBasicAuthHeader('mlflow', 'password'), `Basic ${btoa('mlflow:password')}`);
});

test('resolveKubernetesApiUrl prefers an override and falls back to service env', () => {
  assert.equal(
    resolveKubernetesApiUrl('https://api.custom.example', {}),
    'https://api.custom.example'
  );
  assert.equal(
    resolveKubernetesApiUrl(undefined, {
      KUBERNETES_SERVICE_HOST: 'kubernetes.default.svc',
      KUBERNETES_SERVICE_PORT_HTTPS: '443',
    }),
    'https://kubernetes.default.svc:443'
  );
});
