export interface MlflowExperiment {
  experimentId: string;
  name: string;
  artifactLocation?: string;
  lifecycleStage?: string;
}

export interface MlflowMetric {
  key: string;
  value: number;
  timestamp: number;
  step: number;
}

export interface MlflowParam {
  key: string;
  value: string;
}

export interface MlflowTag {
  key: string;
  value: string;
}

export interface MlflowRunInfo {
  runId: string;
  experimentId: string;
  status: string;
  startTime?: number;
  endTime?: number;
  runName?: string;
  artifactUri?: string;
  lifecycleStage?: string;
  userName?: string;
}

export interface MlflowRunData {
  metrics: MlflowMetric[];
  params: MlflowParam[];
  tags: MlflowTag[];
}

export interface MlflowRun {
  info: MlflowRunInfo;
  data: MlflowRunData;
}

export interface RawMlflowRun {
  info: {
    run_id?: string;
    runId?: string;
    experiment_id?: string;
    experimentId?: string;
    status?: string;
    start_time?: number | string;
    end_time?: number | string;
    run_name?: string;
    runName?: string;
    artifact_uri?: string;
    lifecycle_stage?: string;
    user_id?: string;
  };
  data?: {
    metrics?: Array<{
      key: string;
      value: number;
      timestamp: number;
      step?: number;
    }>;
    params?: MlflowParam[];
    tags?: MlflowTag[];
  };
}
