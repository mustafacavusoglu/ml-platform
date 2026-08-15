import type { MlflowExperiment, MlflowRun } from '../mlflow/types';

export function createDummyExperiment(name: string): MlflowExperiment {
  return {
    experimentId: '101',
    name,
    artifactLocation: 's3://dummy-bucket/mlflow/101',
    lifecycleStage: 'active',
  };
}

export function createDummyExperiments(): MlflowExperiment[] {
  return [
    {
      experimentId: '101',
      name: 'fraud-detection',
      artifactLocation: 's3://dummy-bucket/mlflow/101',
      lifecycleStage: 'active',
    },
    {
      experimentId: '102',
      name: 'churn-model',
      artifactLocation: 's3://dummy-bucket/mlflow/102',
      lifecycleStage: 'active',
    },
    {
      experimentId: '103',
      name: 'recommender',
      artifactLocation: 's3://dummy-bucket/mlflow/103',
      lifecycleStage: 'active',
    },
  ];
}

export function createDummyRuns(experimentId: string): MlflowRun[] {
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  const suffix = experimentId || '0';

  return [
    {
      info: {
        runId: `dummy-run-a-${suffix}`,
        experimentId,
        status: 'FINISHED',
        startTime: now - 3 * hour,
        endTime: now - 2 * hour,
        runName: 'xgboost-v1',
        artifactUri: `s3://dummy-bucket/mlflow/${experimentId}/a`,
        lifecycleStage: 'active',
        userName: 'alice',
      },
      data: {
        metrics: [
          { key: 'accuracy', value: 0.91, timestamp: 1, step: 2 },
          { key: 'f1', value: 0.89, timestamp: 1, step: 2 },
        ],
        params: [
          { key: 'model', value: 'xgboost' },
          { key: 'max_depth', value: '6' },
        ],
        tags: [{ key: 'dataset', value: 'train-v2' }],
      },
    },
    {
      info: {
        runId: `dummy-run-b-${suffix}`,
        experimentId,
        status: 'FINISHED',
        startTime: now - 5 * hour,
        endTime: now - 4 * hour,
        runName: 'baseline-lgbm',
        artifactUri: `s3://dummy-bucket/mlflow/${experimentId}/b`,
        lifecycleStage: 'active',
        userName: 'bob',
      },
      data: {
        metrics: [
          { key: 'accuracy', value: 0.87, timestamp: 1, step: 1 },
          { key: 'f1', value: 0.85, timestamp: 1, step: 1 },
        ],
        params: [
          { key: 'model', value: 'lightgbm' },
          { key: 'learning_rate', value: '0.05' },
        ],
        tags: [{ key: 'dataset', value: 'train-v1' }],
      },
    },
    {
      info: {
        runId: `dummy-run-c-${suffix}`,
        experimentId,
        status: 'RUNNING',
        startTime: now - 20 * 60_000,
        endTime: undefined,
        runName: 'tuning-v3',
        artifactUri: `s3://dummy-bucket/mlflow/${experimentId}/c`,
        lifecycleStage: 'active',
        userName: 'alice',
      },
      data: {
        metrics: [{ key: 'accuracy', value: 0.83, timestamp: 1, step: 1 }],
        params: [{ key: 'model', value: 'xgboost' }],
        tags: [],
      },
    },
  ];
}
