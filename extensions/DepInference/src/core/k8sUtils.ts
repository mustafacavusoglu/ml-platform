export interface KubernetesSecretKeys {
  username: string;
  password: string;
  serviceUri: string;
}

export interface KubernetesSecretValues {
  username: string;
  password: string;
  serviceUri: string;
}

export function extractSecretValues(
  data: Record<string, string> | undefined,
  keys: KubernetesSecretKeys
): KubernetesSecretValues {
  const username = decodeSecretValue(data?.[keys.username]);
  const password = decodeSecretValue(data?.[keys.password]);
  const serviceUri = decodeSecretValue(data?.[keys.serviceUri]);

  if (!username || !password || !serviceUri) {
    throw new Error(
      `Kubernetes secret is missing required keys: ${keys.username}, ${keys.password}, ${keys.serviceUri}.`
    );
  }

  return { username, password, serviceUri };
}

function decodeSecretValue(value: string | undefined): string {
  if (!value) {
    return '';
  }
  try {
    return Buffer.from(value, 'base64').toString('utf8').trim();
  } catch {
    return value.trim();
  }
}

export function toBasicAuthHeader(username: string, password: string): string {
  return `Basic ${btoa(`${username}:${password}`)}`;
}

export function resolveKubernetesApiUrl(
  override: string | undefined,
  env: Record<string, string | undefined>
): string {
  const explicit = override?.trim().replace(/\/+$/, '');
  if (explicit) {
    return /^https?:\/\//i.test(explicit) ? explicit : `https://${explicit}`;
  }

  const host = env.KUBERNETES_SERVICE_HOST || 'kubernetes.default.svc';
  const port = env.KUBERNETES_SERVICE_PORT_HTTPS || env.KUBERNETES_SERVICE_PORT || '443';
  return `https://${host}:${port}`;
}
