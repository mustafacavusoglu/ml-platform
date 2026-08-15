export interface ResourcePreset {
  cpu: string;
  memory: string;
  disk: string;
}

export const MIG_PROFILES = ['1g.20', '2g.20', '4g.40'] as const;
export type MigProfile = (typeof MIG_PROFILES)[number];

export function isMigProfile(value: unknown): value is MigProfile {
  return typeof value === 'string' && (MIG_PROFILES as readonly string[]).includes(value);
}

export const DEFAULT_RESOURCE_PRESETS: Record<string, ResourcePreset> = {
  small: { cpu: '2', memory: '4Gi', disk: '20Gi' },
  medium: { cpu: '4', memory: '8Gi', disk: '20Gi' },
  large: { cpu: '8', memory: '16Gi', disk: '40Gi' },
  xlarge: { cpu: '16', memory: '32Gi', disk: '80Gi' },
};

export const DEFAULT_SIZE = 'medium';

const QUANTITY_PATTERN = /^\d+(?:\.\d+)?(?:Ki|Mi|Gi|Ti)?$/;
const CPU_PATTERN = /^\d+(?:\.\d+)?m?$/;

export function isValidPresetShape(value: unknown): value is ResourcePreset {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.cpu === 'string' &&
    CPU_PATTERN.test(candidate.cpu) &&
    typeof candidate.memory === 'string' &&
    QUANTITY_PATTERN.test(candidate.memory) &&
    typeof candidate.disk === 'string' &&
    QUANTITY_PATTERN.test(candidate.disk)
  );
}

/**
 * Merges user-provided preset overrides (from depinference.resourcePresets)
 * on top of the built-in ones. Invalid overrides are ignored so one bad entry
 * never breaks the form.
 */
export function resolveResourcePresets(
  overrides?: Record<string, unknown>
): Record<string, ResourcePreset> {
  const presets: Record<string, ResourcePreset> = { ...DEFAULT_RESOURCE_PRESETS };
  if (!overrides) {
    return presets;
  }
  for (const [name, value] of Object.entries(overrides)) {
    if (name && isValidPresetShape(value)) {
      presets[name] = value;
    }
  }
  return presets;
}

export function describePreset(preset: ResourcePreset): string {
  return `${preset.cpu} vCPU · ${preset.memory} RAM · ${preset.disk} disk`;
}
