import type { MlflowRun, RawMlflowRun } from '../mlflow/types';

function toMillis(value: number | string | undefined): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function normalizeRun(raw: RawMlflowRun): MlflowRun {
  const info = raw.info ?? {};
  const data = raw.data ?? {};
  const metrics = data.metrics ?? [];
  const params = data.params ?? [];
  const tags = data.tags ?? [];
  const tagMap = new Map(tags.map((tag) => [tag.key, tag.value]));
  const runId = info.runId ?? info.run_id ?? '';
  const runName =
    info.run_name ?? info.runName ?? tagMap.get('mlflow.runName') ?? shortRunName(runId);

  return {
    info: {
      runId,
      experimentId: info.experimentId ?? info.experiment_id ?? '',
      status: info.status ?? 'UNKNOWN',
      startTime: toMillis(info.start_time),
      endTime: toMillis(info.end_time),
      runName,
      artifactUri: info.artifact_uri,
      lifecycleStage: info.lifecycle_stage,
      userName: info.user_id,
    },
    data: {
      metrics: metrics.map((metric) => ({ ...metric, step: metric.step ?? 0 })),
      params,
      tags,
    },
  };
}

export function shortRunName(runId: string): string {
  if (!runId) {
    return 'unknown run';
  }
  return runId.length <= 12 ? runId : `${runId.slice(0, 12)}...`;
}

export function formatStartTime(millis: number): string {
  const date = new Date(millis);
  return Number.isNaN(date.getTime()) ? String(millis) : date.toISOString();
}
