import { parseAzureRepoUrl, type AzureRepoRef } from '../core/repoUrl';
import { buildPrUrl, toBranchRef } from './prLink';

export class AzureApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AzureApiError';
    this.status = status;
  }
}

export class AzureAuthError extends AzureApiError {
  constructor(message: string, status: number) {
    super(message, status);
    this.name = 'AzureAuthError';
  }
}

export interface AzurePullRequest {
  id: number;
  status: string;
  title?: string;
  webUrl: string;
}

export interface AzureClientOptions {
  repoUrl: string;
  apiVersion: string;
  getPat(): Promise<string | undefined>;
  fetchImpl?: typeof fetch;
}

interface RawPullRequest {
  pullRequestId?: number;
  pullRequestIdNumber?: number;
  status?: string;
  title?: string;
}

/**
 * Minimal Azure DevOps REST client for pull requests. Git operations go
 * through the local git CLI; this client only adds PR automation for users
 * who configured a PAT.
 */
export class AzureDevOpsClient {
  private readonly ref: AzureRepoRef;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: AzureClientOptions) {
    this.ref = parseAzureRepoUrl(options.repoUrl);
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  get repoWebUrl(): string {
    return this.ref.webUrl;
  }

  async createPullRequest(params: {
    sourceBranch: string;
    targetBranch: string;
    title: string;
    description: string;
  }): Promise<AzurePullRequest> {
    const raw = await this.request(
      `${this.pullRequestsPath()}?api-version=${this.options.apiVersion}`,
      {
        method: 'POST',
        body: JSON.stringify({
          sourceRefName: toBranchRef(params.sourceBranch),
          targetRefName: toBranchRef(params.targetBranch),
          title: params.title,
          description: params.description,
        }),
      }
    );
    const pr = this.toPullRequest(raw);
    if (!pr) {
      throw new AzureApiError('Azure DevOps did not return the created pull request.', 502);
    }
    return pr;
  }

  async findPullRequests(sourceBranch: string, status?: string): Promise<AzurePullRequest[]> {
    const params = new URLSearchParams({
      'searchCriteria.sourceRefName': toBranchRef(sourceBranch),
      'searchCriteria.status': status ?? 'active',
      $top: '5',
      'api-version': this.options.apiVersion,
    });
    const raw = await this.request(`${this.pullRequestsPath()}?${params.toString()}`);
    const values = Array.isArray((raw as { value?: unknown[] }).value)
      ? ((raw as { value: unknown[] }).value as RawPullRequest[])
      : [];
    return values
      .map((entry) => this.toPullRequest(entry))
      .filter((pr): pr is AzurePullRequest => pr !== undefined);
  }

  async getPullRequest(id: number): Promise<AzurePullRequest> {
    const raw = await this.request(
      `${this.pullRequestsPath()}/${id}?api-version=${this.options.apiVersion}`
    );
    const pr = this.toPullRequest(raw);
    if (!pr) {
      throw new AzureApiError(`Pull request ${id} not found.`, 404);
    }
    return pr;
  }

  private pullRequestsPath(): string {
    return `${this.ref.apiBaseUrl}/${this.ref.collection}/${this.ref.project}/_apis/git/pullrequests`;
  }

  private toPullRequest(raw: unknown): AzurePullRequest | undefined {
    const record = raw as RawPullRequest;
    const id = record?.pullRequestId;
    if (typeof id !== 'number') {
      return undefined;
    }
    return {
      id,
      status: record.status ?? 'unknown',
      title: record.title,
      webUrl: buildPrUrl(this.ref.webUrl, id),
    };
  }

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const pat = await this.options.getPat();
    if (!pat) {
      throw new AzureAuthError(
        'No Azure DevOps PAT configured. Run DepInference: Set Azure DevOps PAT.',
        401
      );
    }

    const response = await this.fetchImpl(path, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Basic ${btoa(`:${pat}`)}`,
      },
      signal: AbortSignal.timeout(15_000),
    });

    // Azure DevOps answers with 203 when the PAT is invalid or expired.
    if (response.status === 203 || response.status === 401 || response.status === 403) {
      throw new AzureAuthError(
        `Azure DevOps rejected the PAT (HTTP ${response.status}). Create a new one with Code (Read & Write) scope and run DepInference: Set Azure DevOps PAT.`,
        response.status
      );
    }
    if (!response.ok) {
      const body = await safeText(response);
      throw new AzureApiError(
        `Azure DevOps request failed (HTTP ${response.status}): ${body}`,
        response.status
      );
    }

    try {
      return (await response.json()) as unknown;
    } catch {
      throw new AzureApiError('Azure DevOps returned an unexpected response.', response.status);
    }
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 1000);
  } catch {
    return '';
  }
}
