import assert from 'node:assert/strict';
import test from 'node:test';
import { createDummyExperiment, createDummyRuns } from '../mlflow/dummyData';

test('dummy data creates an experiment and mixed run statuses', () => {
  const experiment = createDummyExperiment('team-a');
  const runs = createDummyRuns();

  assert.equal(experiment.name, 'team-a');
  assert.ok(runs.length >= 5);
  assert.ok(runs.some((run) => run.info.status === 'RUNNING'));
  assert.ok(runs.some((run) => run.info.status === 'FAILED'));
  assert.ok(runs.every((run) => run.data.metrics.length > 0));
});
