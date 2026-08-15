import { validateCron } from './cron';
import {
  describePreset,
  isMigProfile,
  type MigProfile,
  type ResourcePreset,
} from './presets';

export type DeploymentType = 'online' | 'batch';

export interface DeploymentSpec {
  name: string;
  type: DeploymentType;
  experimentId: string;
  experimentName?: string;
  runId: string;
  runName?: string;
  /** Batch only. */
  schedule?: string;
  /** Batch only. */
  image?: string;
  size: string;
  gpu?: MigProfile;
}

export type DeploymentFormErrors = Record<string, string>;

const DNS1123_PATTERN = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;
const IMAGE_PATTERN = /^[a-z0-9][a-z0-9./:_-]*$/;

export function validateDeploymentSpec(
  spec: DeploymentSpec,
  presets: Record<string, ResourcePreset>
): DeploymentFormErrors {
  const errors: DeploymentFormErrors = {};

  if (!spec.name) {
    errors.name = 'Deployment name is required.';
  } else if (!DNS1123_PATTERN.test(spec.name)) {
    errors.name =
      'Use lowercase letters, numbers and "-"; must start and end with a letter or number (max 63 chars).';
  }

  if (spec.type !== 'online' && spec.type !== 'batch') {
    errors.type = 'Choose online or batch.';
  }

  if (!spec.experimentId) {
    errors.experimentId = 'Select an experiment.';
  }
  if (!spec.runId) {
    errors.runId = 'Select a run.';
  }

  if (spec.type === 'batch') {
    if (!spec.schedule) {
      errors.schedule = 'Cron schedule is required for batch deployments.';
    } else {
      const cron = validateCron(spec.schedule);
      if (!cron.valid) {
        errors.schedule = `Invalid cron: ${cron.error}`;
      }
    }
    if (!spec.image) {
      errors.image = 'Scoring image is required for batch deployments.';
    } else if (!IMAGE_PATTERN.test(spec.image)) {
      errors.image = 'Enter a valid image reference, for example registry.local/app:1.0.';
    }
  }

  if (!presets[spec.size]) {
    errors.size = `Unknown resource preset "${spec.size}".`;
  }

  if (spec.gpu !== undefined && !isMigProfile(spec.gpu)) {
    errors.gpu = 'Select a valid MIG profile.';
  }

  return errors;
}

export function buildPrTitle(spec: DeploymentSpec): string {
  return `deploy: ${spec.name} (${spec.type})`;
}

export function buildPrDescription(spec: DeploymentSpec, preset: ResourcePreset): string {
  const lines = [
    'DepInference deployment update',
    '',
    `- **Name:** ${spec.name}`,
    `- **Type:** ${spec.type}`,
    `- **Experiment:** ${spec.experimentName ?? spec.experimentId} (${spec.experimentId})`,
    `- **Run:** ${spec.runName ?? spec.runId} (${spec.runId})`,
  ];
  if (spec.type === 'batch') {
    lines.push(`- **Schedule:** \`${spec.schedule}\``);
    lines.push(`- **Image:** ${spec.image}`);
  }
  lines.push(
    `- **Resources:** ${spec.size} — ${describePreset(preset)} · GPU: ${spec.gpu ?? 'off'}`
  );
  return lines.join('\n');
}

export function buildCommitMessage(spec: DeploymentSpec, updated: boolean): string {
  const verb = updated ? 'update' : 'add';
  return `depinference: ${verb} deployment ${spec.name} (${spec.type})`;
}
