import type {
  MlflowMetric,
  MlflowRun,
  RawMlflowRun,
} from '../mlflow/types';

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

export function latestMetrics(metrics: MlflowMetric[]): Map<string, MlflowMetric> {
  const latest = new Map<string, MlflowMetric>();
  for (const metric of metrics) {
    const current = latest.get(metric.key);
    if (
      !current ||
      metric.timestamp > current.timestamp ||
      (metric.timestamp === current.timestamp && (metric.step ?? 0) > (current.step ?? 0))
    ) {
      latest.set(metric.key, metric);
    }
  }
  return latest;
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

export interface CompareValue {
  key: string;
  label: string;
  type: 'status' | 'time' | 'duration' | 'number' | 'string';
  values: Map<string, string | number | undefined>;
}

export function buildCompareRows(runs: MlflowRun[]): CompareValue[] {
  const rows = new Map<string, CompareValue>();
  const addRow = (key: string, label: string, type: CompareValue['type']) => {
    if (!rows.has(key)) {
      rows.set(key, { key, label, type, values: new Map() });
    }
    return rows.get(key)!;
  };

  for (const run of runs) {
    const id = run.info.runId;
    addRow('status', 'Status', 'status').values.set(id, run.info.status);
    addRow('start_time', 'Start time', 'time').values.set(
      id,
      run.info.startTime === undefined ? undefined : formatStartTime(run.info.startTime)
    );
    addRow('duration_ms', 'Duration', 'duration').values.set(
      id,
      run.info.startTime === undefined
        ? undefined
        : formatDuration(run.info.startTime, run.info.endTime)
    );
    addRow('user', 'User', 'string').values.set(id, run.info.userName ?? '');
    addRow('lifecycle_stage', 'Lifecycle', 'string').values.set(
      id,
      run.info.lifecycleStage ?? ''
    );

    const latest = latestMetrics(run.data.metrics);
    for (const metric of latest.values()) {
      addRow(`metric:${metric.key}`, metric.key, 'number').values.set(id, metric.value);
    }

    for (const param of run.data.params) {
      addRow(`param:${param.key}`, param.key, 'string').values.set(id, param.value);
    }

    for (const tag of run.data.tags) {
      addRow(`tag:${tag.key}`, tag.key, 'string').values.set(id, tag.value);
    }
  }

  return Array.from(rows.values());
}

export function formatStartTime(millis: number): string {
  const date = new Date(millis);
  return Number.isNaN(date.getTime()) ? String(millis) : date.toISOString();
}

export function formatDuration(startTime: number, endTime?: number): string {
  if (endTime === undefined) {
    return 'running';
  }

  const end = endTime;
  if (end < startTime) {
    return 'running';
  }

  const ms = end - startTime;
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ${seconds % 60}s`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function toCsv(
  runs: MlflowRun[],
  rows: CompareValue[],
  selectedRunIds: ReadonlySet<string>
): string {
  const selectedRuns = runs.filter((run) => selectedRunIds.has(run.info.runId));
  const header = ['Key', ...selectedRuns.map((run) => `${run.info.runName} (${run.info.runId})`)];
  const lines = [header.map(escapeCsvCell).join(',')];

  for (const row of rows) {
    const values = selectedRuns.map((run) => row.values.get(run.info.runId) ?? '');
    lines.push([row.label, ...values].map(escapeCsvCell).join(','));
  }

  return lines.join('\n');
}

function escapeCsvCell(value: string | number): string {
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}
