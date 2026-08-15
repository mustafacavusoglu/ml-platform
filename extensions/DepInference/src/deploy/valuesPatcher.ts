import YAML from 'yaml';
import type { DeploymentSpec } from '../core/deployment';
import type { MigProfile } from '../core/presets';

export interface DeploymentResources {
  cpu?: string;
  memory?: string;
  disk?: string;
  gpu?: MigProfile;
}

export interface DeploymentRecord {
  name: string;
  type?: string;
  experimentId?: string;
  runId?: string;
  schedule?: string;
  image?: string;
  resources?: DeploymentResources;
  /** Keys the extension does not manage are preserved on update. */
  [key: string]: unknown;
}

/** The plain object written for a spec — single source for patching and previews. */
export function deploymentToRecord(
  spec: DeploymentSpec,
  preset: { cpu: string; memory: string; disk: string }
): DeploymentRecord {
  const record: DeploymentRecord = {
    name: spec.name,
    type: spec.type,
    experimentId: spec.experimentId,
    runId: spec.runId,
  };
  if (spec.type === 'batch') {
    record.schedule = spec.schedule;
    record.image = spec.image;
  }
  record.resources = {
    cpu: preset.cpu,
    memory: preset.memory,
    disk: preset.disk,
  };
  if (spec.gpu) {
    record.resources.gpu = spec.gpu;
  }
  return record;
}

/**
 * Upserts the deployment entry for `spec.name` inside the `deployments:` list of
 * a Helm values document. Unrelated top-level keys, comments, and unknown keys
 * inside the matching entry are preserved.
 */
export function upsertDeploymentIntoValues(
  valuesText: string,
  spec: DeploymentSpec,
  preset: { cpu: string; memory: string; disk: string }
): string {
  const doc = valuesText.trim() ? YAML.parseDocument(valuesText) : new YAML.Document();
  if (doc.errors.length > 0) {
    throw new Error(
      `values.yaml could not be parsed: ${doc.errors[0]?.message ?? 'unknown parse error'}`
    );
  }

  let deployments = doc.get('deployments', true);
  if (!deployments || !YAML.isSeq(deployments)) {
    deployments = new YAML.YAMLSeq();
    doc.set('deployments', deployments);
  }

  const record = deploymentToRecord(spec, preset);
  const existing = (deployments as YAML.YAMLSeq).items.find((item): item is YAML.YAMLMap => {
    if (!YAML.isMap(item)) {
      return false;
    }
    const name = item.get('name');
    return typeof name === 'string' && name === spec.name;
  });

  if (existing) {
    for (const [key, value] of Object.entries(record)) {
      existing.set(key, value);
    }
    // Batch-only fields must not linger when a deployment switches to online.
    for (const key of ['schedule', 'image']) {
      if (!(key in record)) {
        existing.delete(key);
      }
    }
  } else {
    (deployments as YAML.YAMLSeq).add(doc.createNode(record));
  }

  return doc.toString({ lineWidth: 120 });
}

/** Tolerant reader used by the deployments tree; returns [] when nothing is there. */
export function listDeployments(valuesText: string | undefined): DeploymentRecord[] {
  if (!valuesText || !valuesText.trim()) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = YAML.parse(valuesText);
  } catch {
    return [];
  }
  const deployments = (parsed as Record<string, unknown> | null)?.deployments;
  if (!Array.isArray(deployments)) {
    return [];
  }
  return deployments.filter(
    (entry): entry is DeploymentRecord =>
      !!entry && typeof entry === 'object' && typeof (entry as DeploymentRecord).name === 'string'
  );
}

/** YAML preview of a single entry, used by the form's live preview. */
export function deploymentPreviewYaml(
  spec: DeploymentSpec,
  preset: { cpu: string; memory: string; disk: string }
): string {
  const record = deploymentToRecord(spec, preset);
  const text = YAML.stringify([record], { lineWidth: 120 });
  return `deployments:\n${text
    .split('\n')
    .map((line) => (line.length > 0 ? `  ${line}` : line))
    .join('\n')}`;
}
