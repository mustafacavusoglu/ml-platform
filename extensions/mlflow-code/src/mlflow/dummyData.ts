import type {
  MlflowExperiment,
  MlflowMetric,
  MlflowRun,
} from './types';

export function createDummyExperiment(namespace: string): MlflowExperiment {
  return {
    experimentId: 'dummy-experiment',
    name: namespace,
    artifactLocation: 's3://dummy-bucket/mlflow',
    lifecycleStage: 'active',
  };
}

export function createDummyRuns(): MlflowRun[] {
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  const minute = 60 * 1000;

  return [
    {
      info: {
        runId: 'dummy-run-xgb-001',
        experimentId: 'dummy-experiment',
        status: 'FINISHED',
        startTime: now - 3 * hour,
        endTime: now - 2 * hour,
        runName: 'xgboost-v1',
        artifactUri: 's3://dummy-bucket/mlflow/dummy-run-xgb-001',
        lifecycleStage: 'active',
        userName: 'alice',
      },
      data: {
        metrics: metricRows([
          ['accuracy', 0.9, 1],
          ['accuracy', 0.91, 2],
          ['f1', 0.89, 2],
          ['auc', 0.95, 2],
          ['loss', 0.18, 2],
        ]),
        params: [
          { key: 'model', value: 'xgboost' },
          { key: 'max_depth', value: '6' },
          { key: 'learning_rate', value: '0.1' },
          { key: 'n_estimators', value: '300' },
        ],
        tags: [
          { key: 'dataset', value: 'train-v2' },
          { key: 'stage', value: 'candidate' },
          { key: 'owner', value: 'ml-platform' },
        ],
      },
    },
    {
      info: {
        runId: 'dummy-run-lgbm-002',
        experimentId: 'dummy-experiment',
        status: 'RUNNING',
        startTime: now - 30 * minute,
        endTime: undefined,
        runName: 'tuning-v2',
        artifactUri: 's3://dummy-bucket/mlflow/dummy-run-lgbm-002',
        lifecycleStage: 'active',
        userName: 'bob',
      },
      data: {
        metrics: metricRows([
          ['accuracy', 0.87, 1],
          ['accuracy', 0.88, 2],
          ['f1', 0.85, 2],
          ['loss', 0.24, 2],
        ]),
        params: [
          { key: 'model', value: 'lightgbm' },
          { key: 'max_depth', value: '4' },
          { key: 'learning_rate', value: '0.05' },
          { key: 'n_estimators', value: '500' },
        ],
        tags: [
          { key: 'dataset', value: 'train-v2' },
          { key: 'stage', value: 'experiment' },
          { key: 'owner', value: 'bob' },
        ],
      },
    },
    {
      info: {
        runId: 'dummy-run-knn-003',
        experimentId: 'dummy-experiment',
        status: 'FINISHED',
        startTime: now - 5 * hour,
        endTime: now - 4 * hour,
        runName: 'baseline-knn',
        artifactUri: 's3://dummy-bucket/mlflow/dummy-run-knn-003',
        lifecycleStage: 'active',
        userName: 'alice',
      },
      data: {
        metrics: metricRows([
          ['accuracy', 0.84, 1],
          ['f1', 0.82, 1],
          ['auc', 0.88, 1],
          ['loss', 0.31, 1],
        ]),
        params: [
          { key: 'model', value: 'knn' },
          { key: 'k', value: '7' },
          { key: 'scaler', value: 'standard' },
        ],
        tags: [
          { key: 'dataset', value: 'train-v1' },
          { key: 'stage', value: 'baseline' },
        ],
      },
    },
    {
      info: {
        runId: 'dummy-run-xgb-004',
        experimentId: 'dummy-experiment',
        status: 'FAILED',
        startTime: now - 7 * hour,
        endTime: now - 6 * hour,
        runName: 'xgboost-failed',
        artifactUri: 's3://dummy-bucket/mlflow/dummy-run-xgb-004',
        lifecycleStage: 'active',
        userName: 'bob',
      },
      data: {
        metrics: metricRows([
          ['accuracy', 0.72, 1],
          ['loss', 0.52, 1],
        ]),
        params: [
          { key: 'model', value: 'xgboost' },
          { key: 'max_depth', value: '12' },
          { key: 'learning_rate', value: '0.3' },
        ],
        tags: [
          { key: 'dataset', value: 'train-v2' },
          { key: 'failure_reason', value: 'out_of_memory' },
        ],
      },
    },
    {
      info: {
        runId: 'dummy-run-rf-005',
        experimentId: 'dummy-experiment',
        status: 'KILLED',
        startTime: now - 9 * hour,
        endTime: now - 8 * hour,
        runName: 'random-forest-abort',
        artifactUri: 's3://dummy-bucket/mlflow/dummy-run-rf-005',
        lifecycleStage: 'active',
        userName: 'carol',
      },
      data: {
        metrics: metricRows([
          ['accuracy', 0.79, 1],
          ['f1', 0.76, 1],
        ]),
        params: [
          { key: 'model', value: 'random_forest' },
          { key: 'n_estimators', value: '100' },
          { key: 'max_depth', value: '8' },
        ],
        tags: [
          { key: 'dataset', value: 'train-v1' },
          { key: 'stage', value: 'aborted' },
        ],
      },
    },
  ];
}

function metricRows(rows: Array<[string, number, number]>): MlflowMetric[] {
  return rows.map(([key, value, step], index) => ({
    key,
    value,
    timestamp: 1_700_000_000_000 + index,
    step,
  }));
}
