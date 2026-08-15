import { pushFileTransform } from '../git/gitOperations';
import { AzureAuthError, AzureDevOpsClient } from '../azure/azureClient';
import { buildCreatePrUrl } from '../azure/prLink';
import { parseAzureRepoUrl } from '../core/repoUrl';
import {
  buildCommitMessage,
  buildPrDescription,
  buildPrTitle,
  type DeploymentSpec,
} from '../core/deployment';
import type { ResourcePreset } from '../core/presets';
import { upsertDeploymentIntoValues, listDeployments } from './valuesPatcher';

export interface SubmitPipelineOptions {
  repoUrl: string;
  targetBranch: string;
  valuesPath: string;
  apiVersion: string;
  spec: DeploymentSpec;
  preset: ResourcePreset;
  getPat(): Promise<string | undefined>;
  fetchImpl?: typeof fetch;
}

export interface SubmitResult {
  branch: string;
  createdBranch: boolean;
  changed: boolean;
  /** Pull request id when it could be created or found via the API. */
  prId?: number;
  /** PR page: the pull request itself, or the prefilled creation page. */
  prUrl: string;
  /** True when the PR was opened automatically via the API. */
  prAutoCreated: boolean;
  /** Set when PR automation failed; the submit itself still succeeded. */
  prAuthWarning?: string;
}

export function deploymentBranch(spec: DeploymentSpec): string {
  return `deploy/${spec.name}`;
}

/**
 * End-to-end submit: git clone/patch/commit/push with the workbench's own git
 * credentials, then PR creation — via PAT when configured, otherwise by
 * opening the prefilled PR creation page in the browser.
 */
export async function submitDeployment(options: SubmitPipelineOptions): Promise<SubmitResult> {
  const { spec, preset } = options;
  const branch = deploymentBranch(spec);
  const repoRef = parseAzureRepoUrl(options.repoUrl);

  let updatedExisting = false;
  const push = await pushFileTransform({
    repoUrl: options.repoUrl,
    branch,
    targetBranch: options.targetBranch,
    filePath: options.valuesPath,
    commitMessage: () => buildCommitMessage(spec, updatedExisting),
    transform: (current) => {
      updatedExisting = listDeployments(current ?? '').some((entry) => entry.name === spec.name);
      return upsertDeploymentIntoValues(current ?? '', spec, preset);
    },
  });

  const result: SubmitResult = {
    branch,
    createdBranch: push.createdBranch,
    changed: push.changed,
    prUrl: buildCreatePrUrl(repoRef.webUrl, branch, options.targetBranch),
    prAutoCreated: false,
  };

  const pat = await options.getPat();
  if (!pat) {
    return result;
  }

  try {
    const client = new AzureDevOpsClient({
      repoUrl: options.repoUrl,
      apiVersion: options.apiVersion,
      getPat: options.getPat,
      fetchImpl: options.fetchImpl,
    });

    const active = await client.findPullRequests(branch, 'active');
    if (active[0]) {
      result.prId = active[0].id;
      result.prUrl = active[0].webUrl;
      return result;
    }

    if (push.changed || push.createdBranch) {
      const pr = await client.createPullRequest({
        sourceBranch: branch,
        targetBranch: options.targetBranch,
        title: buildPrTitle(spec),
        description: buildPrDescription(spec, preset),
      });
      result.prId = pr.id;
      result.prUrl = pr.webUrl;
      result.prAutoCreated = true;
    }
  } catch (error) {
    if (error instanceof AzureAuthError) {
      // A bad PAT must not fail the submit — the creation page still works.
      result.prAuthWarning = error.message;
    } else {
      throw error;
    }
  }

  return result;
}
