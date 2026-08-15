/** Browser URL of the Azure DevOps "create pull request" page, prefilled with both refs. */
export function buildCreatePrUrl(
  repoWebUrl: string,
  sourceBranch: string,
  targetBranch: string
): string {
  const params = new URLSearchParams({
    sourceRef: sourceBranch,
    targetRef: targetBranch,
  });
  return `${repoWebUrl.replace(/\/+$/, '')}/pullrequestcreate?${params.toString()}`;
}

/** Stable browser URL of an existing pull request. */
export function buildPrUrl(repoWebUrl: string, prId: number): string {
  return `${repoWebUrl.replace(/\/+$/, '')}/pullrequest/${prId}`;
}

export function toBranchRef(branch: string): string {
  return `refs/heads/${branch}`;
}
