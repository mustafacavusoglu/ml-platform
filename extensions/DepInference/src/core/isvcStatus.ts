export type IsvcPhase = 'Pending' | 'Ready' | 'Failed' | 'Unknown';

export interface IsvcCondition {
  type: string;
  status: string;
  reason?: string;
  message?: string;
  lastTransitionTime?: string;
}

export interface IsvcStatusInfo {
  phase: IsvcPhase;
  reason?: string;
  message?: string;
  conditions: IsvcCondition[];
  addressUrl?: string;
}

interface RawCondition {
  type?: string;
  status?: string;
  reason?: string;
  message?: string;
  lastTransitionTime?: string;
}

/** Maps a KServe InferenceService object to a compact status summary. */
export function summarizeInferenceService(raw: unknown): IsvcStatusInfo {
  const status = readRecord(readRecord(raw)?.status);
  const rawConditions = Array.isArray(status?.conditions) ? status.conditions : [];
  const conditions: IsvcCondition[] = [];
  for (const condition of rawConditions) {
    const record = readRecord(condition);
    if (!record || typeof record.type !== 'string') {
      continue;
    }
    const mapped: IsvcCondition = {
      type: record.type,
      status: typeof record.status === 'string' ? record.status : '',
    };
    if (typeof record.reason === 'string') {
      mapped.reason = record.reason;
    }
    if (typeof record.message === 'string') {
      mapped.message = record.message;
    }
    if (typeof record.lastTransitionTime === 'string') {
      mapped.lastTransitionTime = record.lastTransitionTime;
    }
    conditions.push(mapped);
  }

  const addressRecord = readRecord(status?.address);
  const addressUrl =
    typeof addressRecord?.url === 'string' && addressRecord.url
      ? addressRecord.url
      : typeof status?.url === 'string' && status.url
        ? status.url
        : undefined;

  const ready = conditions.find((condition) => condition.type === 'Ready');
  if (!ready) {
    return {
      phase: conditions.length > 0 ? 'Pending' : 'Unknown',
      conditions,
      addressUrl,
    };
  }

  if (ready.status === 'True') {
    return { phase: 'Ready', reason: ready.reason, conditions, addressUrl };
  }

  if (ready.status === 'False') {
    const blocker =
      conditions.find((condition) => condition.status === 'False' && condition.type !== 'Ready') ??
      ready;
    return {
      phase: 'Failed',
      reason: blocker.reason,
      message: blocker.message,
      conditions,
      addressUrl,
    };
  }

  return { phase: 'Pending', reason: ready.reason, conditions, addressUrl };
}

/**
 * Derives the predictor endpoint URL: prefers the address reported by the
 * InferenceService, falls back to the KServe predictor route convention on
 * OpenShift (<name>-<namespace>-predictor.<appsDomain>).
 */
export function derivePredictorUrl(input: {
  name: string;
  namespace?: string;
  appsDomain?: string;
  addressUrl?: string;
}): string | undefined {
  if (input.addressUrl) {
    const normalized = input.addressUrl.trim().replace(/\/+$/, '');
    if (normalized) {
      return normalized;
    }
  }
  if (!input.namespace || !input.appsDomain) {
    return undefined;
  }
  const domain = input.appsDomain.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  return `https://${input.name}-${input.namespace}-predictor.${domain}`;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}
