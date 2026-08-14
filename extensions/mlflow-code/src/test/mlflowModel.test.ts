import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCompareRows,
  formatDuration,
  normalizeRun,
  toCsv,
} from '../core/mlflowModel';
import type { RawMlflowRun } from '../mlflow/types';

test('normalizeRun maps raw MLflow fields and run name tag', () => {
  const raw: RawMlflowRun = {
    info: {
      run_id: 'run-1',
      experiment_id: 'exp-1',
      status: 'FINISHED',
      start_time: '1000',
      end_time: '3000',
      user_id: 'alice',
    },
    data: {
      metrics: [],
      params: [{ key: 'lr', value: '0.01' }],
      tags: [{ key: 'mlflow.runName', value: 'train-v2' }],
    },
  };

  const run = normalizeRun(raw);
  assert.equal(run.info.runId, 'run-1');
  assert.equal(run.info.runName, 'train-v2');
  assert.equal(run.info.startTime, 1000);
  assert.equal(run.info.endTime, 3000);
});

test('latestMetrics keeps the newest timestamp per metric key', () => {
  const run = normalizeRun({
    info: { run_id: 'run-1', experiment_id: 'exp-1', status: 'FINISHED' },
    data: {
      metrics: [
        { key: 'accuracy', value: 0.8, timestamp: 1, step: 1 },
        { key: 'accuracy', value: 0.9, timestamp: 3, step: 2 },
        { key: 'loss', value: 0.2, timestamp: 2, step: 1 },
      ],
      params: [],
      tags: [],
    },
  });

  const rows = buildCompareRows([run]);
  const accuracy = rows.find((row) => row.key === 'metric:accuracy');
  assert.equal(accuracy?.values.get('run-1'), 0.9);
});

test('buildCompareRows unions params, metrics, and tags across runs', () => {
  const runA = normalizeRun({
    info: { run_id: 'a', experiment_id: 'exp-1', status: 'FINISHED' },
    data: {
      metrics: [{ key: 'accuracy', value: 0.9, timestamp: 1, step: 0 }],
      params: [{ key: 'lr', value: '0.01' }],
      tags: [],
    },
  });
  const runB = normalizeRun({
    info: { run_id: 'b', experiment_id: 'exp-1', status: 'FAILED' },
    data: {
      metrics: [{ key: 'loss', value: 0.4, timestamp: 1, step: 0 }],
      params: [{ key: 'lr', value: '0.1' }, { key: 'epochs', value: '5' }],
      tags: [{ key: 'team', value: 'ml' }],
    },
  });

  const rows = buildCompareRows([runA, runB]);
  assert.deepEqual(
    new Set(rows.map((row) => row.key)),
    new Set([
      'status',
      'start_time',
      'duration_ms',
      'user',
      'lifecycle_stage',
      'metric:accuracy',
      'metric:loss',
      'param:lr',
      'param:epochs',
      'tag:team',
    ])
  );
});

test('toCsv escapes quoted values', () => {
  const run = normalizeRun({
    info: { run_id: 'run-1', experiment_id: 'exp-1', status: 'FINISHED' },
    data: {
      metrics: [],
      params: [{ key: 'note', value: 'hello, world' }],
      tags: [],
    },
  });
  const rows = buildCompareRows([run]);
  const csv = toCsv([run], rows, new Set(['run-1']));
  assert.match(csv, /"hello, world"/);
  assert.match(csv, /run-1/);
});

test('formatDuration handles running runs', () => {
  assert.equal(formatDuration(1000), 'running');
  assert.equal(formatDuration(1000, 4000), '3s');
  assert.equal(formatDuration(1000, 61_000), '1m 0s');
});
