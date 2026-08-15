export interface TrackingUriInput {
  trackingUri?: string;
  namespace?: string;
  appsDomain?: string;
}

export function normalizeTrackingUri(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) {
    return undefined;
  }

  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function resolveTrackingUri(input: TrackingUriInput): string | undefined {
  const explicit = normalizeTrackingUri(input.trackingUri);
  if (explicit) {
    return explicit;
  }

  if (!input.namespace || !input.appsDomain) {
    return undefined;
  }

  const domain = input.appsDomain.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  return `https://mlflow.${input.namespace}.${domain}`;
}
