import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deploymentPreviewYaml,
  listDeployments,
  upsertDeploymentIntoValues,
} from '../deploy/valuesPatcher';
import type { DeploymentSpec } from '../core/deployment';

const PRESET = { cpu: '2', memory: '4Gi', disk: '20Gi' };

function makeSpec(overrides: Partial<DeploymentSpec> = {}): DeploymentSpec {
  return {
    name: 'fraud-detector',
    type: 'online',
    experimentId: '101',
    runId: 'run-a',
    size: 'small',
    gpu: undefined,
    ...overrides,
  };
}

test('upsertDeploymentIntoValues adds a new deployment and preserves unrelated keys', () => {
  const input = 'chart:\n  release: demo\n';
  const output = upsertDeploymentIntoValues(input, makeSpec(), PRESET);
  assert.match(output, /chart:\n/);
  assert.equal(listDeployments(output)[0]?.name, 'fraud-detector');
});

test('upsertDeploymentIntoValues updates an existing deployment in place', () => {
  const spec = makeSpec();
  const first = upsertDeploymentIntoValues('', spec, PRESET);
  const second = upsertDeploymentIntoValues(first, { ...spec, runId: 'run-b' }, PRESET);
  const deployments = listDeployments(second);
  assert.equal(deployments.length, 1);
  assert.equal(deployments[0]?.runId, 'run-b');
});

test('deploymentPreviewYaml returns the deployment list shape', () => {
  const yaml = deploymentPreviewYaml(makeSpec(), PRESET);
  assert.match(yaml, /^deployments:\n/);
  assert.match(yaml, /name: fraud-detector/);
});

test('deployment resources omit the redundant size field and include MIG when GPU is enabled', () => {
  const output = upsertDeploymentIntoValues('', makeSpec({ gpu: '1g.20' }), PRESET);
  assert.doesNotMatch(output, /size:/);
  assert.match(output, /gpu: 1g\.20/);
});
