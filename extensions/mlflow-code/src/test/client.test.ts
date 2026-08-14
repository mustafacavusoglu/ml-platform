import assert from 'node:assert/strict';
import test from 'node:test';
import { MlflowClient, type MlflowClientConfig } from '../mlflow/client';

const config: MlflowClientConfig = {
  trackingUri: 'http://mlflow.test',
  namespace: 'team-a',
  maxResults: 10,
};

test('MlflowClient lists runs for the namespace experiment', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const auth = {
    getHeaders: async () => ({ Cookie: 'openshift-session-token=test-token' }),
  };

  (globalThis as { fetch: typeof fetch }).fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });
    if (url.includes('/api/2.0/mlflow/experiments/get-by-name')) {
      return jsonResponse({
        experiment: {
          experiment_id: 'exp-1',
          name: 'team-a',
          artifact_location: 's3://bucket/team-a',
        },
      });
    }
    if (url.endsWith('/api/2.0/mlflow/runs/search')) {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        experiment_ids?: string[];
        max_results?: number;
      };
      assert.deepEqual(body.experiment_ids, ['exp-1']);
      assert.equal(body.max_results, 10);
      return jsonResponse({
        runs: [
          {
            info: {
              run_id: 'run-1',
              experiment_id: 'exp-1',
              status: 'FINISHED',
              start_time: 1000,
              end_time: 2000,
            },
            data: {
              metrics: [{ key: 'accuracy', value: 0.9, timestamp: 1, step: 0 }],
              params: [{ key: 'lr', value: '0.01' }],
              tags: [],
            },
          },
        ],
      });
    }
    return jsonResponse({}, 404);
  };

  try {
    const client = new MlflowClient(config, auth);
    const result = await client.listExperimentRuns();
    assert.equal(result.experiment.experimentId, 'exp-1');
    assert.equal(result.runs.length, 1);
    assert.equal(result.runs[0].info.runId, 'run-1');
    assert.equal(result.runs[0].info.status, 'FINISHED');
    assert.equal(
      (calls[0].init?.headers as Record<string, string> | undefined)?.Cookie,
      'openshift-session-token=test-token'
    );
  } finally {
    (globalThis as { fetch: typeof fetch }).fetch = originalFetch;
  }
});

test('MlflowClient throws a typed error for authentication failures', async () => {
  const originalFetch = globalThis.fetch;
  (globalThis as { fetch: typeof fetch }).fetch = async () =>
    jsonResponse({ error: 'unauthorized' }, 401);

  try {
    const client = new MlflowClient(config, {
      getHeaders: async () => ({}),
    });
    await assert.rejects(
      client.listExperimentRuns(),
      (error: Error) => error.name === 'MlflowAuthError'
    );
  } finally {
    (globalThis as { fetch: typeof fetch }).fetch = originalFetch;
  }
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
