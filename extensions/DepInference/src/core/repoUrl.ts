export interface AzureRepoRef {
  /** API and web base, for example https://tfs.company.local or https://tfs.company.local/tfs */
  apiBaseUrl: string;
  /** Collection (on-prem) or organization (cloud) name. */
  collection: string;
  project: string;
  repo: string;
  /** Browser URL of the repository. */
  webUrl: string;
}

/**
 * Parses the Azure DevOps repository URL forms a workbench typically has configured:
 * - https://tfs.company.local/DefaultCollection/Project/_git/Repo
 * - https://tfs.company.local/tfs/DefaultCollection/Project/_git/Repo
 * - https://dev.azure.com/org/Project/_git/Repo
 * - https://org.visualstudio.com/Project/_git/Repo
 * - git@ssh.dev.azure.com:v3/org/Project/Repo
 * - git@tfs.company.local:22/DefaultCollection/Project/_git/Repo
 *
 * Credentials embedded in the URL are ignored; authentication is handled separately.
 */
export function parseAzureRepoUrl(input: string): AzureRepoRef {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Azure DevOps repo URL is empty. Set depinference.azure.repoUrl.');
  }

  const url = toHttpsUrl(trimmed);
  const segments = url.pathname
    .split('/')
    .map((segment) => decodeURIComponent(segment))
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.replace(/\.git$/, ''));
  if (segments.length === 0) {
    throw new Error(
      `Could not find a project and repository in "${trimmed}". Expected .../Project/_git/Repo.`
    );
  }

  const gitIndex = segments.indexOf('_git');
  let collection: string | undefined;
  let project: string | undefined;
  let repo: string | undefined;
  let baseSegments: string[];

  if (gitIndex >= 0) {
    repo = segments[gitIndex + 1];
    project = segments[gitIndex - 1];
    collection = segments[gitIndex - 2];
    baseSegments = segments.slice(0, Math.max(gitIndex - 2, 0));
  } else {
    repo = segments[segments.length - 1];
    project = segments[segments.length - 2];
    collection = segments[segments.length - 3];
    baseSegments = segments.slice(0, Math.max(segments.length - 3, 0));
  }

  if (!project || !repo) {
    throw new Error(
      `Could not find a project and repository in "${trimmed}". Expected .../Project/_git/Repo.`
    );
  }

  let apiBaseUrl = `${url.protocol}//${url.host}`;
  if (baseSegments.length > 0) {
    apiBaseUrl += `/${baseSegments.join('/')}`;
  }

  if (!collection) {
    // https://org.visualstudio.com/Project/_git/Repo carries the org in the host.
    const visualStudio = /^(.+)\.visualstudio\.com$/i.exec(url.hostname);
    if (!visualStudio) {
      throw new Error(
        `Could not find a collection/organization in "${trimmed}". Expected .../Collection/Project/_git/Repo.`
      );
    }
    collection = visualStudio[1];
    apiBaseUrl = 'https://dev.azure.com';
  }

  return {
    apiBaseUrl,
    collection,
    project,
    repo,
    webUrl: `${apiBaseUrl}/${collection}/${project}/_git/${repo}`,
  };
}

function toHttpsUrl(trimmed: string): URL {
  if (/^git@/i.test(trimmed)) {
    // SCP-like syntax: git@host[:port]/path
    const separator = trimmed.indexOf(':');
    if (separator < 0) {
      throw new Error(`Unsupported SSH URL "${trimmed}".`);
    }
    const host = trimmed.slice(0, separator).replace(/^git@/i, '');
    const path = trimmed
      .slice(separator + 1)
      .replace(/^\d+\//, '')
      .replace(/^\/+/, '');
    return new URL(`https://${host}/${path.replace(/^v3\//i, '')}`);
  }

  if (/^ssh:\/\//i.test(trimmed)) {
    const parsed = new URL(trimmed);
    return new URL(`https://${parsed.hostname}${parsed.pathname.replace(/^\/v3\//i, '/')}`);
  }

  try {
    return new URL(trimmed);
  } catch {
    throw new Error(`Invalid Azure DevOps repo URL "${trimmed}".`);
  }
}
